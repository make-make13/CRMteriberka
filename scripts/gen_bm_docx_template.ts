/**
 * Генерация DOCX-шаблонов договора БМ с плейсхолдерами docxtemplater.
 *
 * Запуск:
 *   npx tsx scripts/gen_bm_docx_template.ts
 *
 * Результат (в scratch/):
 *   bm_template_print.docx  — шаблон для режима «На печать» (без печати/подписи)
 *   bm_template_signed.docx — шаблон для режима «На отправку» (печать+подпись вшиты)
 *
 * Принцип:
 *   Вызывает buildBmContractDocx() с PLACEHOLDER_VARS, где каждое поле — это
 *   литеральная строка вида '{field_name}'. Та же функция, что в production,
 *   поэтому структура §15 (таблица, отступы, выравнивание) идентична.
 *
 *   Для signed-шаблона реальные stamp.png и signature.png вшиваются как изображения
 *   (они статические для компании). При заполнении шаблона docxtemplater'ом они
 *   останутся нетронутыми.
 *
 * После генерации:
 *   1. Открыть файлы в Word/LibreOffice, поправить визуал.
 *   2. Загрузить через CRM → Настройки → DOCX-шаблоны БМ.
 *   3. Вернуть engine обратно с 'code' на 'template-fallback' в Contracts.tsx
 *      и ContractModal.tsx.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildBmContractDocx } from '../src/utils/docx/bmDocxBuilder';
import type { BmDocxVariables } from '../src/utils/docx/bmDocxData';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');
const SCRATCH   = path.resolve(ROOT, 'scratch');
const ASSETS    = path.resolve(ROOT, 'public', 'pdfme-assets');

// ---------------------------------------------------------------------------
// Все переменные — плейсхолдеры docxtemplater ('{field_name}').
// Структура полностью соответствует BmDocxVariables из bmDocxData.ts.
//
// Exec-реквизиты (exec_*) захардкожены в EXEC_FIXED_REQUISITES внутри
// bmDocxBuilder.ts и не используются билдером, но присутствуют в типе
// BmDocxVariables и доступны шаблону если понадобятся.
// ---------------------------------------------------------------------------
const PLACEHOLDER_VARS: BmDocxVariables = {
  // Договор
  contract_number:      '{contract_number}',
  contract_header:      '{contract_header}',
  sign_date:            '{sign_date}',
  contract_period:      '{contract_period}',

  // Клиент
  client_name:          '{client_name}',
  client_name_gen:      '{client_name_gen}',
  client_name_dat:      '{client_name_dat}',
  client_dob:           '{client_dob}',
  client_passport_type: '{client_passport_type}',
  client_passport:      '{client_passport}',
  client_passport_date: '{client_passport_date}',
  client_passport_by:   '{client_passport_by}',
  client_passport_code: '{client_passport_code}',
  client_address:       '{client_address}',
  client_phone:         '{client_phone}',
  client_email:         '{client_email}',

  // Номер / проживание
  room_number:          '{room_number}',
  room_category:        '{room_category}',
  guests_label:         '{guests_label}',
  date_in:              '{date_in}',
  date_in_long:         '{date_in_long}',
  time_in:              '{time_in}',
  date_out:             '{date_out}',
  date_out_long:        '{date_out_long}',
  time_out:             '{time_out}',
  nights_label:         '{nights_label}',

  // Деньги
  total:                '{total}',
  total_words:          '{total_words}',
  prepayment:           '{prepayment}',
  prepayment_words:     '{prepayment_words}',
  balance:              '{balance}',
  balance_words:        '{balance_words}',

  // Подпись гостя (краткое ФИО «И. О. Фамилия» для строки подписи)
  client_short_name:    '{client_short_name}',

  // Исполнитель (в билдере используется EXEC_FIXED_REQUISITES,
  // но переменные доступны шаблону при необходимости)
  exec_name:            '{exec_name}',
  exec_director:        '{exec_director}',
  exec_inn:             '{exec_inn}',
  exec_kpp:             '{exec_kpp}',
  exec_ogrn:            '{exec_ogrn}',
  exec_address:         '{exec_address}',
  exec_phone:           '{exec_phone}',
  exec_bank:            '{exec_bank}',
  exec_rs:              '{exec_rs}',
  exec_bik:             '{exec_bik}',
  exec_ks:              '{exec_ks}',
};

// ---------------------------------------------------------------------------
async function main() {
  if (!fs.existsSync(SCRATCH)) fs.mkdirSync(SCRATCH, { recursive: true });

  const stampPath = path.resolve(ASSETS, 'stamp.png');
  const sigPath   = path.resolve(ASSETS, 'signature.png');

  // --- print-шаблон: без изображений, место для живой подписи ---
  console.log('\n[print] building template...');
  const printBuf = await buildBmContractDocx(PLACEHOLDER_VARS, {
    withStamp:     false,
    withSignature: false,
  });
  const printOut = path.resolve(SCRATCH, 'bm_template_print.docx');
  fs.writeFileSync(printOut, printBuf);
  console.log(`  saved: ${printOut}  (${printBuf.byteLength} bytes)`);

  // --- signed-шаблон: вшиты реальные stamp+signature компании ---
  console.log('\n[signed] building template...');
  const signedBuf = await buildBmContractDocx(PLACEHOLDER_VARS, {
    withStamp:     fs.existsSync(stampPath),
    withSignature: fs.existsSync(sigPath),
    stampPath,
    signaturePath: sigPath,
  });
  const signedOut = path.resolve(SCRATCH, 'bm_template_signed.docx');
  fs.writeFileSync(signedOut, signedBuf);
  console.log(`  saved: ${signedOut}  (${signedBuf.byteLength} bytes)`);

  // --- Проверка что плейсхолдеры не были повреждены normalizeRu ---
  console.log('\n=== Placeholder check ===');
  const PizZip = (await import('pizzip')).default;
  for (const [label, buf, file] of [
    ['print', printBuf, printOut],
    ['signed', signedBuf, signedOut],
  ] as Array<[string, Buffer, string]>) {
    const xml = new PizZip(buf).file('word/document.xml')!.asText();
    const required = ['contract_header', 'sign_date', 'client_name',
                      'room_number', 'room_category', 'date_in', 'date_out',
                      'total', 'total_words'];
    const missing = required.filter(p => !xml.includes(`{${p}}`));
    if (missing.length === 0) {
      console.log(`  [${label}] ✓ all 9 required placeholders present`);
    } else {
      console.error(`  [${label}] ✗ missing: ${missing.join(', ')}`);
    }
    // Additional check for §15
    console.log(`  [${label}]   {client_short_name}: ${xml.includes('{client_short_name}') ? '✓' : '✗'}`);
    console.log(`  [${label}]   images (w:drawing): ${(xml.match(/<w:drawing>/g) || []).length}`);
  }

  console.log(`
=== Next steps ===
  1. Открой в Word/LibreOffice и поправь визуал:
       scratch/bm_template_print.docx
       scratch/bm_template_signed.docx
  2. Загрузи через CRM → Настройки → DOCX-шаблоны БМ
       (отдельно: print.docx и signed.docx)
  3. После загрузки верни engine: 'code' → 'template-fallback'
       в Contracts.tsx и ContractModal.tsx
`);
}

main().catch(e => { console.error(e); process.exit(1); });
