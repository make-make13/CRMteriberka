/**
 * Backend-хранилище и управление визуальными DOCX-шаблонами договора БМ.
 *
 * Маршруты (все требуют Bearer-токен):
 *
 *   GET  /api/docx-templates/bm/:mode/status
 *        JSON-статус: есть ли active/draft, дата изменения, список архивов.
 *
 *   GET  /api/docx-templates/bm/:mode/download
 *        Скачать активный шаблон (mode = print | signed).
 *
 *   POST /api/docx-templates/bm/:mode/upload
 *        Загрузить .docx как draft. Тело — raw binary (DOCX-файл),
 *        Content-Type: application/octet-stream. Валидирует перед сохранением.
 *
 *   POST /api/docx-templates/bm/:mode/test
 *        Тест-генерация: draft (или active, если нет draft),
 *        реальные данные первого БМ-договора из БД → PDF.
 *        ?output=json (default) — JSON {ok, pages, …}.
 *        ?output=pdf             — PDF-файл (attachment).
 *
 *   POST /api/docx-templates/bm/:mode/activate
 *        draft → active, старый active → archive/mode_<ISO>.docx.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Архитектура хранилища:
 *
 *   createBmTemplateStorage(storageRoot) возвращает набор функций,
 *   привязанных к конкретной директории. Это позволяет тестам использовать
 *   изолированный scratch-каталог, не затрагивая реальный storage.
 *
 *   Сервер использует дефолтный инстанс:
 *     ${ROOT}/storage/docx-templates/bm/…
 *   или переопределяет через env-переменную BM_DOCX_TEMPLATE_STORAGE_ROOT.
 *
 *   Тест создаёт собственный инстанс:
 *     createBmTemplateStorage('scratch/test-docx-template-storage')
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * НЕ заменяет generateBmContractDocx() / bmDocxBuilder.ts.
 * UI-кнопка и endpoint /api/bm-docx/contract/:id не затронуты.
 */
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { PDFDocument } from '@pdfme/pdf-lib';

import { localDb } from './localDatabase';
import type { Contract, Client, Organization } from '../src/types';
import { prepareContractDataFromContract } from '../src/utils/contractDocumentData';
import { generateBmContractFromTemplate } from '../src/utils/docx/bmTemplateContractGenerator';
import { docxToPdf } from '../src/utils/docx/docxToPdf';

// ---------------------------------------------------------------------------
// Корень проекта
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Типы (не зависят от storage root)
// ---------------------------------------------------------------------------

export type TemplateMode = 'print' | 'signed';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  foundPlaceholders: string[];
  missingPlaceholders: string[];
}

export interface TestGenerationResult {
  ok: boolean;
  mode: TemplateMode;
  which: 'draft' | 'active';
  templatePath: string;
  contractNumber: string;
  pages: number;
  docxBytes: number;
  pdfBytes: number;
  generatedAt: string;
  error?: string;
}

export interface ArchiveEntry {
  name: string;
  path: string;
  sizeBytes: number;
  mtime: Date;
}

// ---------------------------------------------------------------------------
// Валидация (stateless — не зависит от storage root)
// ---------------------------------------------------------------------------

/** Плейсхолдеры, обязательные в любом шаблоне (print и signed). */
export const REQUIRED_PLACEHOLDERS = [
  'contract_header',
  'sign_date',
  'client_name',
  'room_number',
  'room_category',
  'date_in',
  'date_out',
  'total',
  'total_words',
] as const;

/**
 * Проверяет DOCX-буфер:
 * 1. ZIP-корректность (открывается PizZip).
 * 2. Наличие word/document.xml.
 * 3. Docxtemplater рендерит шаблон без синтаксических ошибок.
 * 4. Все обязательные {placeholder} присутствуют в XML.
 *
 * NOTE: Word может разбивать тег вида {contract_header} на несколько <w:r> runs,
 * поэтому поиск по сырому XML-тексту ненадёжен. Вместо этого плейсхолдеры
 * собираются через nullGetter docxtemplater — он сам обходит все runs и передаёт
 * имя тега в part.value. Это работает независимо от того, разбит тег или нет.
 */
export async function validateDocxBuffer(buffer: Buffer): Promise<ValidationResult> {
  const errors: string[] = [];
  const foundPlaceholders: string[] = [];
  const missingPlaceholders: string[] = [];

  // 1. ZIP-корректность
  try {
    new PizZip(buffer);
  } catch {
    return {
      valid: false,
      errors: ['Невалидный DOCX: не удалось открыть как ZIP-архив'],
      foundPlaceholders: [],
      missingPlaceholders: [...REQUIRED_PLACEHOLDERS],
    };
  }

  // 2. word/document.xml
  const zipForCheck = new PizZip(buffer);
  if (!zipForCheck.file('word/document.xml')) {
    return {
      valid: false,
      errors: ['Невалидный DOCX: отсутствует word/document.xml'],
      foundPlaceholders: [],
      missingPlaceholders: [...REQUIRED_PLACEHOLDERS],
    };
  }

  // 3. Синтаксис тегов + сбор найденных плейсхолдеров.
  //    nullGetter вызывается для каждого {тега}, не найденного в data.
  //    При render({}) data пустой, поэтому nullGetter сработает для каждого тега —
  //    это позволяет собрать полный список без ложных ошибок о «пропущенных» данных.
  //    Word-шаблоны с {тегом}, разбитым на несколько <w:r>, обрабатываются корректно:
  //    docxtemplater склеивает runs внутри абзаца перед вызовом nullGetter.
  const foundTagNames = new Set<string>();
  let syntaxOk = true;

  try {
    const testDoc = new Docxtemplater(new PizZip(buffer), {
      paragraphLoop: true,
      linebreaks: true,
      nullGetter: (part: any) => {
        // part.module присутствует у loop/condition-тегов; нас интересуют только plain-теги
        if (typeof part?.value === 'string' && part.value) {
          foundTagNames.add(part.value);
        }
        return '';
      },
    });
    testDoc.render({});
  } catch (e: any) {
    syntaxOk = false;
    const msg = e?.properties?.errors?.map((x: any) => x?.message).join('; ')
      || e?.message || String(e);
    errors.push(`Ошибка синтаксиса docxtemplater: ${msg}`);
  }

  // 4. Обязательные плейсхолдеры — проверяем по тегам, собранным docxtemplater.
  //    Если синтаксис сломан, docxtemplater мог прерваться до обхода всех тегов,
  //    поэтому пропускаем проверку плейсхолдеров — причина уже указана в ошибке.
  if (syntaxOk) {
    for (const tag of REQUIRED_PLACEHOLDERS) {
      if (foundTagNames.has(tag)) {
        foundPlaceholders.push(tag);
      } else {
        missingPlaceholders.push(tag);
        errors.push(`Отсутствует обязательный плейсхолдер: {${tag}}`);
      }
    }
  }

  return { valid: errors.length === 0, errors, foundPlaceholders, missingPlaceholders };
}

// ---------------------------------------------------------------------------
// Factory: createBmTemplateStorage
// ---------------------------------------------------------------------------

/**
 * Создаёт инстанс хранилища, привязанный к конкретному storageRoot.
 *
 * Структура внутри storageRoot:
 *   bm/active/   — активные шаблоны (print.docx, signed.docx)
 *   bm/drafts/   — черновики (загруженные, но не активированные)
 *   bm/archive/  — архивные копии прежних active с ISO-таймстампом в имени
 *
 * storageRoot может быть абсолютным или относительным путём от корня проекта.
 *
 * @example Сервер (дефолт):
 *   createBmTemplateStorage('storage/docx-templates')
 *
 * @example Тест:
 *   createBmTemplateStorage('scratch/test-docx-template-storage')
 */
export function createBmTemplateStorage(storageRoot: string) {
  const root = path.isAbsolute(storageRoot)
    ? storageRoot
    : path.resolve(ROOT, storageRoot);

  const STORAGE_PATHS = {
    root,
    bm: path.join(root, 'bm'),
    active: path.join(root, 'bm', 'active'),
    drafts: path.join(root, 'bm', 'drafts'),
    archive: path.join(root, 'bm', 'archive'),
  };

  // ── Путевые хелперы ──────────────────────────────────────────────────────

  function getActivePath(mode: TemplateMode): string {
    return path.join(STORAGE_PATHS.active, `${mode}.docx`);
  }

  function getDraftPath(mode: TemplateMode): string {
    return path.join(STORAGE_PATHS.drafts, `${mode}.docx`);
  }

  /** Создаёт все нужные поддиректории, если их нет. */
  function ensureStorageDirs(): void {
    for (const dir of Object.values(STORAGE_PATHS)) {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    }
  }

  // ── Операции с хранилищем ────────────────────────────────────────────────

  /**
   * Сохраняет буфер как draft/{mode}.docx.
   * Валидирует ДО записи — при ошибке файл не записывается.
   */
  async function putDraft(
    mode: TemplateMode,
    buffer: Buffer,
  ): Promise<ValidationResult> {
    ensureStorageDirs();
    const validation = await validateDocxBuffer(buffer);
    if (!validation.valid) return validation;
    fs.writeFileSync(getDraftPath(mode), buffer);
    return validation;
  }

  /**
   * draft → active, старый active → archive/{mode}_{ISO}.docx.
   * Возвращает пути нового active и заархивированного (null если не было).
   */
  function activateTemplate(mode: TemplateMode): {
    activatedPath: string;
    archivedPath: string | null;
  } {
    ensureStorageDirs();

    const draftFile = getDraftPath(mode);
    if (!fs.existsSync(draftFile)) {
      throw new Error(`Черновик не найден: ${draftFile}`);
    }

    const activeFile = getActivePath(mode);
    let archivedPath: string | null = null;

    if (fs.existsSync(activeFile)) {
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      archivedPath = path.join(STORAGE_PATHS.archive, `${mode}_${ts}.docx`);
      fs.renameSync(activeFile, archivedPath);
    }

    fs.renameSync(draftFile, activeFile);
    return { activatedPath: activeFile, archivedPath };
  }

  /** Список архивных файлов для mode (новые первые). */
  function listArchive(mode: TemplateMode): ArchiveEntry[] {
    ensureStorageDirs();
    const prefix = `${mode}_`;
    return fs.readdirSync(STORAGE_PATHS.archive)
      .filter(f => f.startsWith(prefix) && f.endsWith('.docx'))
      .map(f => {
        const p = path.join(STORAGE_PATHS.archive, f);
        const stat = fs.statSync(p);
        return { name: f, path: p, sizeBytes: stat.size, mtime: stat.mtime };
      })
      .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
  }

  // ── Тест-генерация ───────────────────────────────────────────────────────

  /**
   * Тест-генерирует PDF из draft или active шаблона с реальными данными БМ-договора.
   * Предпочитает draft; если draft нет — берёт active.
   */
  async function testGenerateFromStorage(
    mode: TemplateMode,
  ): Promise<TestGenerationResult & { pdfBuffer?: Buffer }> {
    const draftFile = getDraftPath(mode);
    const activeFile = getActivePath(mode);

    let which: 'draft' | 'active';
    let templatePath: string;

    if (fs.existsSync(draftFile)) {
      which = 'draft';
      templatePath = draftFile;
    } else if (fs.existsSync(activeFile)) {
      which = 'active';
      templatePath = activeFile;
    } else {
      return {
        ok: false, mode, which: 'draft', templatePath: draftFile,
        contractNumber: '', pages: 0, docxBytes: 0, pdfBytes: 0,
        generatedAt: new Date().toISOString(),
        error: `Нет ни draft, ни active шаблона для mode=${mode}`,
      };
    }

    // Находим первый БМ-договор в локальной БД
    const list = localDb.listContracts<Contract>() as Contract[];
    const contract = list.find(c => (c as any).baseType === 'chunga-changa') ?? null;
    if (!contract) {
      return {
        ok: false, mode, which, templatePath,
        contractNumber: '', pages: 0, docxBytes: 0, pdfBytes: 0,
        generatedAt: new Date().toISOString(),
        error: 'Не найден БМ-договор в базе данных',
      };
    }

    const client = localDb.getClientById<Client>(
      String((contract as any).clientId || ''),
    ) as Client | null;
    if (!client) {
      return {
        ok: false, mode, which, templatePath,
        contractNumber: String((contract as any).number || (contract as any).id),
        pages: 0, docxBytes: 0, pdfBytes: 0,
        generatedAt: new Date().toISOString(),
        error: 'Клиент не найден в базе данных',
      };
    }

    const org = (localDb.getOrganization<Organization>('company_details') || {}) as Partial<Organization>;
    const contractNumber = String((contract as any).number || (contract as any).id);
    const contractData = prepareContractDataFromContract(contract, client);

    try {
      // Рендерим шаблон один раз → DOCX (быстро, без LibreOffice)
      const docxBuffer = await generateBmContractFromTemplate(contractData, org, {
        output: 'docx', templatePath,
      });
      // Конвертируем DOCX → PDF один раз (один запуск LibreOffice вместо двух)
      const pdfBuffer = await docxToPdf(docxBuffer);
      const pdfDoc = await PDFDocument.load(pdfBuffer);

      return {
        ok: true, mode, which, templatePath, contractNumber,
        pages: pdfDoc.getPageCount(),
        docxBytes: docxBuffer.byteLength,
        pdfBytes: pdfBuffer.byteLength,
        generatedAt: new Date().toISOString(),
        pdfBuffer,
      };
    } catch (e: any) {
      return {
        ok: false, mode, which, templatePath, contractNumber,
        pages: 0, docxBytes: 0, pdfBytes: 0,
        generatedAt: new Date().toISOString(),
        error: e?.message || String(e),
      };
    }
  }

  return {
    STORAGE_PATHS,
    getActivePath,
    getDraftPath,
    ensureStorageDirs,
    putDraft,
    activateTemplate,
    listArchive,
    testGenerateFromStorage,
  };
}

// ---------------------------------------------------------------------------
// Дефолтный инстанс для HTTP-маршрутов
// ---------------------------------------------------------------------------

/**
 * Storage root для сервера:
 *   - BM_DOCX_TEMPLATE_STORAGE_ROOT env (абсолютный или relative к ROOT)
 *   - иначе: storage/docx-templates
 *
 * Значение читается один раз при загрузке модуля — типичный сценарий для сервера,
 * где env задаётся до запуска Node.js.
 */
const SERVER_STORAGE_ROOT = (() => {
  const env = process.env.BM_DOCX_TEMPLATE_STORAGE_ROOT;
  if (!env) return path.join(ROOT, 'storage', 'docx-templates');
  return path.isAbsolute(env) ? env : path.resolve(ROOT, env);
})();

const serverStorage = createBmTemplateStorage(SERVER_STORAGE_ROOT);

// ---------------------------------------------------------------------------
// HTTP-маршруты
// ---------------------------------------------------------------------------

function parseMode(raw: unknown): TemplateMode | null {
  const v = String(raw ?? '').toLowerCase();
  if (v === 'print' || v === 'signed') return v;
  return null;
}

function asErr(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function contentDispositionAttachment(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, '_');
  const encoded = encodeURIComponent(filename).replace(/'/g, '%27');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

export function registerBmDocxTemplateRoutes(
  app: express.Express,
  requireAuth: express.RequestHandler,
): void {
  const {
    ensureStorageDirs,
    getActivePath,
    getDraftPath,
    putDraft,
    activateTemplate,
    listArchive,
    testGenerateFromStorage,
    STORAGE_PATHS,
  } = serverStorage;

  ensureStorageDirs();

  // ── GET /status ────────────────────────────────────────────────────────────
  app.get('/api/docx-templates/bm/:mode/status', requireAuth, (req, res) => {
    const mode = parseMode(req.params.mode);
    if (!mode) return res.status(400).json({ error: 'mode must be print or signed' });

    const fileStat = (p: string) => {
      if (!fs.existsSync(p)) return null;
      const s = fs.statSync(p);
      return { exists: true, sizeBytes: s.size, mtime: s.mtime.toISOString() };
    };

    res.json({
      mode,
      storageRoot: STORAGE_PATHS.root,
      active: fileStat(getActivePath(mode)),
      draft: fileStat(getDraftPath(mode)),
      archive: listArchive(mode).map(a => ({
        name: a.name,
        sizeBytes: a.sizeBytes,
        mtime: a.mtime.toISOString(),
      })),
      requiredPlaceholders: REQUIRED_PLACEHOLDERS,
    });
  });

  // ── GET /download ──────────────────────────────────────────────────────────
  app.get('/api/docx-templates/bm/:mode/download', requireAuth, (req, res) => {
    const mode = parseMode(req.params.mode);
    if (!mode) return res.status(400).json({ error: 'mode must be print or signed' });

    const activeFile = getActivePath(mode);
    if (!fs.existsSync(activeFile)) {
      return res.status(404).json({ error: `Активный шаблон не найден: mode=${mode}` });
    }

    const filename = `bm_contract_template_${mode}.docx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', contentDispositionAttachment(filename));
    res.sendFile(activeFile);
  });

  // ── POST /upload ───────────────────────────────────────────────────────────
  const rawBody = express.raw({
    type: [
      'application/octet-stream',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/zip',
    ],
    limit: '10mb',
  });

  app.post('/api/docx-templates/bm/:mode/upload', requireAuth, rawBody, async (req, res) => {
    try {
      const mode = parseMode(req.params.mode);
      if (!mode) return res.status(400).json({ error: 'mode must be print or signed' });

      const buf = req.body as Buffer;
      if (!Buffer.isBuffer(buf) || buf.length === 0) {
        return res.status(400).json({ error: 'Тело запроса пустое или не является бинарным буфером' });
      }
      if (buf[0] !== 0x50 || buf[1] !== 0x4B) {
        return res.status(400).json({ error: 'Файл не является DOCX (неверная ZIP-сигнатура)' });
      }

      const validation = await putDraft(mode, buf);
      if (!validation.valid) {
        return res.status(422).json({ ok: false, error: 'Шаблон не прошёл валидацию', validation });
      }

      const draftStat = fs.statSync(getDraftPath(mode));
      res.json({
        ok: true, mode,
        draftPath: getDraftPath(mode),
        sizeBytes: draftStat.size,
        validation,
        message: `Draft сохранён. Для активации: POST /api/docx-templates/bm/${mode}/activate`,
      });
    } catch (e) {
      console.error('[bm-template-storage] upload error:', e);
      res.status(500).json({ error: asErr(e) });
    }
  });

  // ── POST /test ─────────────────────────────────────────────────────────────
  app.post('/api/docx-templates/bm/:mode/test', requireAuth, async (req, res) => {
    try {
      const mode = parseMode(req.params.mode);
      if (!mode) return res.status(400).json({ error: 'mode must be print or signed' });

      const outputFmt = String(req.query.output ?? 'json').toLowerCase();
      const result = await testGenerateFromStorage(mode);

      if (!result.ok) {
        return res.status(500).json({ ok: false, error: result.error });
      }

      if (outputFmt === 'pdf' && result.pdfBuffer) {
        const filename = `bm_template_test_${mode}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', contentDispositionAttachment(filename));
        res.setHeader('Content-Length', String(result.pdfBuffer.byteLength));
        return res.end(result.pdfBuffer);
      }

      const { pdfBuffer: _buf, ...jsonResult } = result;
      res.json(jsonResult);
    } catch (e) {
      console.error('[bm-template-storage] test error:', e);
      res.status(500).json({ error: asErr(e) });
    }
  });

  // ── POST /activate ─────────────────────────────────────────────────────────
  app.post('/api/docx-templates/bm/:mode/activate', requireAuth, async (req, res) => {
    try {
      const mode = parseMode(req.params.mode);
      if (!mode) return res.status(400).json({ error: 'mode must be print or signed' });

      const { activatedPath, archivedPath } = activateTemplate(mode);
      const activeStat = fs.statSync(activatedPath);

      res.json({
        ok: true, mode, activatedPath,
        activeSizeBytes: activeStat.size,
        archivedPath,
        message: `Шаблон активирован. Тест: POST /api/docx-templates/bm/${mode}/test`,
      });
    } catch (e) {
      console.error('[bm-template-storage] activate error:', e);
      res.status(500).json({ error: asErr(e) });
    }
  });
}
