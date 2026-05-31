/**
 * Endpoint для DOCX-генерации договора БМ.
 *
 *   GET /api/bm-docx/contract/:contractId?mode=print|signed&output=docx|pdf&engine=template-fallback|template|code
 *
 *   - mode=print   — без печати и подписи Исполнителя (для распечатки)
 *   - mode=signed  — с печатью и подписью Исполнителя
 *   - output=docx  — отдаёт .docx
 *   - output=pdf   — отдаёт .pdf (через LibreOffice headless)
 *   - engine=template-fallback (default для новых клиентов):
 *       сначала пробует активный DOCX-шаблон из storage/docx-templates/bm/active/;
 *       если шаблона нет или генерация упала — резервный generateBmContractDocx().
 *   - engine=template:
 *       только активный шаблон; 404 если шаблон не найден.
 *   - engine=code (или engine не указан):
 *       всегда generateBmContractDocx() (прежнее поведение).
 *
 *   Ответный заголовок X-BM-DOCX-Engine: template | code | code-fallback
 *
 * Endpoint требует Bearer-токен (общий requireAuth).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type express from 'express';
import { localDb } from './localDatabase';
import type { Contract, Client, Organization } from '../src/types';
import { prepareContractDataFromContract } from '../src/utils/contractDocumentData';
import {
  generateBmContractDocx,
  type BmContractMode,
  type BmContractOutput,
} from '../src/utils/docx/bmContractGenerator';
import { generateBmContractFromTemplate } from '../src/utils/docx/bmTemplateContractGenerator';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

/** Путь к активному шаблону в server-storage (зеркалит логику bmDocxTemplateRouter). */
function getActiveTemplatePath(mode: BmContractMode): string {
  const envRoot = process.env.BM_DOCX_TEMPLATE_STORAGE_ROOT;
  const storageRoot = envRoot
    ? (path.isAbsolute(envRoot) ? envRoot : path.resolve(ROOT, envRoot))
    : path.join(ROOT, 'storage', 'docx-templates');
  return path.join(storageRoot, 'bm', 'active', `${mode}.docx`);
}

type Engine = 'template' | 'code' | 'template-fallback';

function asErr(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function parseMode(raw: unknown): BmContractMode {
  const v = String(raw ?? 'print').toLowerCase();
  if (v === 'signed') return 'signed';
  return 'print';
}

function parseOutput(raw: unknown): BmContractOutput {
  const v = String(raw ?? 'pdf').toLowerCase();
  if (v === 'docx') return 'docx';
  return 'pdf';
}

function parseEngine(raw: unknown): Engine {
  const v = String(raw ?? 'code').toLowerCase();
  if (v === 'template') return 'template';
  if (v === 'template-fallback') return 'template-fallback';
  return 'code';
}

function findContract(contractId: string): Contract | null {
  // localDb не имеет getContractById — фильтруем listContracts.
  // Сравниваем и по id, и по contract.number — чтобы можно было дёргать
  // endpoint в т.ч. по человеко-читаемому номеру договора.
  const list = localDb.listContracts<Contract>() as Contract[];
  return (
    list.find(c => String((c as any).id) === contractId)
    || list.find(c => String((c as any).number) === contractId)
    || null
  );
}

function loadOrganization(): Partial<Organization> {
  // На фронте loadOrg() читает organizations[company_details] и при отсутствии
  // exec_bank делает merge с legacy settings (через settingsApi). На бэкенде
  // основной источник — organizations[company_details]. Для БМ реквизиты
  // Исполнителя в EXEC_FIXED_REQUISITES захардкожены (см. bmDocxBuilder),
  // поэтому отсутствие legacy fallback здесь некритично.
  return (localDb.getOrganization<Organization>('company_details') || {}) as Partial<Organization>;
}

function contentTypeFor(output: BmContractOutput): string {
  return output === 'docx'
    ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    : 'application/pdf';
}

/**
 * HTTP-заголовки требуют ASCII. Кириллический номер договора («БМ6») сломает
 * Content-Disposition при прямой подстановке. Возвращаем два варианта:
 *   - filename=…    — ASCII fallback (для совсем старых клиентов)
 *   - filename*=…   — RFC 5987 (UTF-8 percent-encoded), который понимают все
 *                    современные браузеры/curl.
 */
function buildContentDisposition(
  contract: Contract,
  mode: BmContractMode,
  output: BmContractOutput,
): string {
  const rawNum = String((contract as any).number || (contract as any).id || 'contract');
  const fullName = `bm_contract_${rawNum}_${mode}.${output}`;
  const asciiName = fullName.replace(/[^\x20-\x7E]/g, '_');
  const rfc5987 = encodeURIComponent(fullName).replace(/'/g, '%27');
  return `attachment; filename="${asciiName}"; filename*=UTF-8''${rfc5987}`;
}

export function registerBmDocxRoutes(
  app: express.Express,
  requireAuth: express.RequestHandler,
) {
  app.get('/api/bm-docx/contract/:contractId', requireAuth, async (req, res) => {
    try {
      const contractId = String(req.params.contractId || '').trim();
      if (!contractId) {
        return res.status(400).json({ error: 'contractId required' });
      }

      const contract = findContract(contractId);
      if (!contract) {
        return res.status(404).json({ error: `Contract not found: ${contractId}` });
      }

      // Этот endpoint предназначен ТОЛЬКО для БМ. Защита от ошибочного
      // вызова для других баз (ГБ, Баня) — отдаём 400, не пытаемся генерировать.
      if ((contract as any).baseType !== 'chunga-changa') {
        return res.status(400).json({
          error: `BM DOCX generator поддерживает только base='chunga-changa' (БМ). У этого договора baseType='${(contract as any).baseType}'.`,
        });
      }

      const client = localDb.getClientById<Client>(String((contract as any).clientId || '')) as Client | null;
      if (!client) {
        return res.status(404).json({ error: `Client not found for contract ${contractId}` });
      }

      const org = loadOrganization();

      // Готовим ContractData той же функцией, что использует основной фронт —
      // никакого дублирования логики склонений/дат.
      const contractData = prepareContractDataFromContract(contract, client);

      const mode   = parseMode(req.query.mode);
      const output = parseOutput(req.query.output);
      const engine = parseEngine(req.query.engine);

      let buffer: Buffer;
      let engineUsed: string;

      if (engine === 'template') {
        // Только активный шаблон — 404 если нет
        const tmplPath = getActiveTemplatePath(mode);
        if (!fs.existsSync(tmplPath)) {
          return res.status(404).json({
            error: `Активный DOCX-шаблон не найден: mode=${mode}. Загрузите и активируйте шаблон в Настройках.`,
          });
        }
        buffer = await generateBmContractFromTemplate(contractData, org, { output, templatePath: tmplPath });
        engineUsed = 'template';
      } else if (engine === 'template-fallback') {
        // Пробуем шаблон, при неудаче — резервный кодогенератор
        const tmplPath = getActiveTemplatePath(mode);
        if (fs.existsSync(tmplPath)) {
          try {
            buffer = await generateBmContractFromTemplate(contractData, org, { output, templatePath: tmplPath });
            engineUsed = 'template';
          } catch (tmplErr) {
            console.warn('[bm-docx] template generation failed, falling back to code:', tmplErr);
            buffer = await generateBmContractDocx(contractData, org, { mode, output });
            engineUsed = 'code-fallback';
          }
        } else {
          buffer = await generateBmContractDocx(contractData, org, { mode, output });
          engineUsed = 'code-fallback';
        }
      } else {
        // engine=code (по умолчанию) — прежнее поведение
        buffer = await generateBmContractDocx(contractData, org, { mode, output });
        engineUsed = 'code';
      }

      res.setHeader('Content-Type', contentTypeFor(output));
      res.setHeader('Content-Disposition', buildContentDisposition(contract, mode, output));
      res.setHeader('Content-Length', String(buffer.byteLength));
      res.setHeader('X-BM-DOCX-Engine', engineUsed);
      res.end(buffer);
    } catch (error) {
      console.error('[bm-docx] generation failed:', error);
      res.status(500).json({ error: asErr(error) });
    }
  });

  /**
   * Debug-endpoint: возвращает только метаданные (без буфера), чтобы
   * убедиться что договор/клиент/организация резолвятся, не дожидаясь
   * LibreOffice-конвертации.
   */
  app.get('/api/bm-docx/contract/:contractId/info', requireAuth, (req, res) => {
    try {
      const contractId = String(req.params.contractId || '').trim();
      const contract = findContract(contractId);
      if (!contract) return res.status(404).json({ error: `Contract not found: ${contractId}` });

      const client = localDb.getClientById<Client>(String((contract as any).clientId || '')) as Client | null;
      const org = loadOrganization();

      res.json({
        contractId,
        resolvedNumber: (contract as any).number,
        baseType: (contract as any).baseType,
        bmEligible: (contract as any).baseType === 'chunga-changa',
        clientFound: Boolean(client),
        clientName: client ? (client as any).fullName : null,
        orgKeys: Object.keys(org),
        modes: ['print', 'signed'],
        outputs: ['docx', 'pdf'],
      });
    } catch (error) {
      res.status(500).json({ error: asErr(error) });
    }
  });
}
