/**
 * Интеграционный тест хранилища DOCX-шаблонов договора БМ.
 *
 * ИЗОЛЯЦИЯ: тест создаёт собственный инстанс хранилища в
 *   scratch/test-docx-template-storage/
 * через createBmTemplateStorage() и НИКОГДА не обращается к реальному
 *   storage/docx-templates/bm/{active,drafts,archive}/
 * Это значит, что случайный запуск на рабочем окружении НЕ повредит
 * реальные активные шаблоны.
 *
 * Тестируемые функции (из bmDocxTemplateRouter.ts):
 *   createBmTemplateStorage — factory, возвращает инстанс под scratch-root
 *   validateDocxBuffer      — stateless-валидация
 *   REQUIRED_PLACEHOLDERS   — список обязательных тегов
 *
 * Сценарий:
 *   1. Создаём scratch storage-директории.
 *   2. Валидируем print- и signed-шаблоны.
 *   3. Кладём оба в draft.
 *   4. Тест-генерируем PDF из draft (реальные данные БМ-договора из БД).
 *   5. Активируем print (draft → active, archivedPath=null — не было старого).
 *   6. Активируем повторно → старый active уходит в archive.
 *   7. Активируем signed.
 *   8. Проверяем, что реальный storage/docx-templates/ не затронут.
 *
 * Запуск:
 *   npx tsx scripts/test_bm_docx_template_storage.ts
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  createBmTemplateStorage,
  validateDocxBuffer,
  REQUIRED_PLACEHOLDERS,
  type TemplateMode,
} from '../server/bmDocxTemplateRouter';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ── Изолированный scratch-root для теста ──────────────────────────────────
const SCRATCH_STORAGE_ROOT = path.join(ROOT, 'scratch', 'test-docx-template-storage');
const storage = createBmTemplateStorage(SCRATCH_STORAGE_ROOT);
const {
  STORAGE_PATHS,
  getActivePath,
  getDraftPath,
  ensureStorageDirs,
  putDraft,
  activateTemplate,
  listArchive,
  testGenerateFromStorage,
} = storage;

// ── Реальный storage — только для проверки «не затронут» ──────────────────
const REAL_STORAGE_ACTIVE = path.join(ROOT, 'storage', 'docx-templates', 'bm', 'active');

// ── Источники шаблонов (создаются POC-скриптами) ──────────────────────────
const TEMPLATE_SOURCES: Record<TemplateMode, string> = {
  print: path.join(ROOT, 'templates', 'docx', 'bm_contract_template_poc.docx'),
  signed: path.join(ROOT, 'templates', 'docx', 'bm_contract_template_signed_poc.docx'),
};

// ---------------------------------------------------------------------------
// Вспомогательные функции отчёта
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, condition: boolean, details?: string): void {
  if (condition) {
    console.log(`  [✓] ${label}`);
    passed++;
  } else {
    console.log(`  [✗] ${label}${details ? ': ' + details : ''}`);
    failed++;
    failures.push(label + (details ? ': ' + details : ''));
  }
}

function section(title: string): void {
  console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 60 - title.length))}`);
}

// ---------------------------------------------------------------------------
// Основной тест
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== test_bm_docx_template_storage ===\n');
  console.log(`  Scratch storage: ${SCRATCH_STORAGE_ROOT}`);
  console.log(`  Real storage:    ${REAL_STORAGE_ACTIVE}`);
  console.log(`  (тест работает только с scratch, реальный storage не трогает)`);

  // Снапшот реального storage до теста
  const realActivesBefore = fs.existsSync(REAL_STORAGE_ACTIVE)
    ? fs.readdirSync(REAL_STORAGE_ACTIVE).filter(f => f.endsWith('.docx'))
    : [];

  // ── 1. Storage directories ──────────────────────────────────────────────────
  section('1. Storage directories (scratch)');

  ensureStorageDirs();

  check('scratch storage root создан', fs.existsSync(STORAGE_PATHS.root));
  check('scratch bm/active создан', fs.existsSync(STORAGE_PATHS.active));
  check('scratch bm/drafts создан', fs.existsSync(STORAGE_PATHS.drafts));
  check('scratch bm/archive создан', fs.existsSync(STORAGE_PATHS.archive));

  // Убеждаемся, что scratch НЕ указывает на реальный storage
  check(
    'scratch root ≠ реальный storage',
    !STORAGE_PATHS.root.includes(path.join('storage', 'docx-templates')),
  );

  // ── 2. Template sources ─────────────────────────────────────────────────────
  section('2. Template sources (templates/docx/)');

  for (const [mode, src] of Object.entries(TEMPLATE_SOURCES) as Array<[TemplateMode, string]>) {
    const exists = fs.existsSync(src);
    check(`${mode} source exists`, exists, src);
    if (!exists) {
      const scriptName = mode === 'print' ? 'create_bm_contract_template_poc.ts' : 'create_bm_contract_template_signed_poc.ts';
      console.log(`    → npx tsx scripts/${scriptName}`);
    }
  }

  if (!fs.existsSync(TEMPLATE_SOURCES.print) || !fs.existsSync(TEMPLATE_SOURCES.signed)) {
    console.log('\n[ABORT] Исходные шаблоны не найдены. Запустите create-скрипты и повторите.');
    process.exit(1);
  }

  // ── 3. Validation ───────────────────────────────────────────────────────────
  section('3. Validation');

  for (const [mode, src] of Object.entries(TEMPLATE_SOURCES) as Array<[TemplateMode, string]>) {
    const buf = fs.readFileSync(src);
    const v = await validateDocxBuffer(buf);
    check(`${mode}: valid`, v.valid, v.errors.join('; '));
    check(`${mode}: все обязательные плейсхолдеры найдены`,
      v.missingPlaceholders.length === 0,
      v.missingPlaceholders.length > 0 ? `missing: ${v.missingPlaceholders.join(', ')}` : '');
    console.log(`    Found: [${v.foundPlaceholders.join(', ')}]`);
  }

  // Невалидный буфер
  const badV = await validateDocxBuffer(Buffer.from('not a docx'));
  check('Невалидный файл отклоняется', !badV.valid, badV.errors[0]);

  // ZIP без document.xml
  const noXmlV = await validateDocxBuffer(Buffer.from([0x50, 0x4B, 0x05, 0x06, ...new Array(18).fill(0)]));
  check('DOCX без document.xml отклоняется', !noXmlV.valid);

  // ── 4. Put drafts ───────────────────────────────────────────────────────────
  section('4. Put drafts → scratch storage');

  for (const [mode, src] of Object.entries(TEMPLATE_SOURCES) as Array<[TemplateMode, string]>) {
    const buf = fs.readFileSync(src);
    const v = await putDraft(mode as TemplateMode, buf);
    const draftExists = fs.existsSync(getDraftPath(mode as TemplateMode));
    check(`${mode}: draft сохранён в scratch`, v.valid && draftExists);
    if (draftExists) {
      const sz = fs.statSync(getDraftPath(mode as TemplateMode)).size;
      console.log(`    ${path.relative(ROOT, getDraftPath(mode as TemplateMode))}  (${sz.toLocaleString()} байт)`);
    }
  }

  // ── 5. Test generation from draft ──────────────────────────────────────────
  section('5. Test generation from draft (реальные данные БМ-договора)');

  for (const mode of ['print', 'signed'] as TemplateMode[]) {
    console.log(`  [${mode}] Генерация PDF...`);
    const t0 = Date.now();
    const result = await testGenerateFromStorage(mode);
    const ms = Date.now() - t0;

    check(`${mode}: генерация ok`, result.ok, result.error);
    if (result.ok) {
      check(`${mode}: PDF ≥4 страниц`, result.pages >= 4, `pages=${result.pages}`);
      check(`${mode}: which=draft`, result.which === 'draft');
      console.log(`    pages=${result.pages}  pdf=${result.pdfBytes.toLocaleString()}b  docx=${result.docxBytes.toLocaleString()}b  t=${ms}ms`);
    }
  }

  // ── 6. Activate print (первый раз — нет старого active) ────────────────────
  section('6. Activate print (draft → active, нет старого active)');

  const archiveBefore = listArchive('print');
  const { activatedPath, archivedPath } = activateTemplate('print');

  check('active/print.docx создан в scratch', fs.existsSync(activatedPath));
  check('drafts/print.docx удалён из scratch', !fs.existsSync(getDraftPath('print')));
  check('archivedPath=null (не было старого active)', archivedPath === null, String(archivedPath));
  console.log(`    activatedPath: ${path.relative(ROOT, activatedPath)}`);

  // ── 7. Второй upload + activate → archive ──────────────────────────────────
  section('7. Second activation → archive old active');

  const printBuf2 = fs.readFileSync(TEMPLATE_SOURCES.print);
  const v2 = await putDraft('print', printBuf2);
  check('Второй draft сохранён', v2.valid && fs.existsSync(getDraftPath('print')));

  const { activatedPath: act2, archivedPath: arc2 } = activateTemplate('print');
  const archiveAfter = listArchive('print');

  check('active/print.docx существует после второй активации', fs.existsSync(act2));
  check('drafts/print.docx удалён', !fs.existsSync(getDraftPath('print')));
  check('Старый active заархивирован', arc2 !== null && fs.existsSync(arc2 ?? ''), String(arc2));
  check('archive count +1', archiveAfter.length === archiveBefore.length + 1,
    `before=${archiveBefore.length} after=${archiveAfter.length}`);
  console.log(`    archived: ${arc2 ? path.relative(ROOT, arc2) : 'null'}`);
  console.log(`    archive list: [${archiveAfter.map(a => a.name).join(', ')}]`);

  // ── 8. Activate signed ─────────────────────────────────────────────────────
  section('8. Activate signed');

  const { activatedPath: actSigned } = activateTemplate('signed');
  check('active/signed.docx создан в scratch', fs.existsSync(actSigned));
  check('drafts/signed.docx удалён из scratch', !fs.existsSync(getDraftPath('signed')));
  console.log(`    activatedPath: ${path.relative(ROOT, actSigned)}`);

  // ── 9. Реальный storage не тронут ──────────────────────────────────────────
  section('9. Реальный storage/docx-templates/ не тронут');

  const realActivesAfter = fs.existsSync(REAL_STORAGE_ACTIVE)
    ? fs.readdirSync(REAL_STORAGE_ACTIVE).filter(f => f.endsWith('.docx'))
    : [];

  check(
    'Файлы в real active не изменились',
    JSON.stringify(realActivesBefore.sort()) === JSON.stringify(realActivesAfter.sort()),
    `before=[${realActivesBefore.join(', ')}] after=[${realActivesAfter.join(', ')}]`,
  );
  console.log(`    real active before: [${realActivesBefore.join(', ')}]`);
  console.log(`    real active after:  [${realActivesAfter.join(', ')}]`);

  // ── Итоги ──────────────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(64));
  console.log(`=== ИТОГ: ${passed} passed, ${failed} failed ===`);

  if (failures.length) {
    console.log('\nНе пройдено:');
    failures.forEach(f => console.log(`  ✗ ${f}`));
  }

  console.log('\nСтруктура scratch storage:');
  for (const [name, dir] of Object.entries(STORAGE_PATHS)) {
    if (name === 'root' || name === 'bm') continue;
    const files = fs.existsSync(dir)
      ? fs.readdirSync(dir).filter(f => !f.startsWith('.'))
      : [];
    console.log(`  ${name.padEnd(8)}: [${files.join(', ')}]`);
  }

  if (failed > 0) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
