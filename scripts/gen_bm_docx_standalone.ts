/**
 * Standalone DOCX/PDF генератор договора БМ — без сервера.
 *
 * Запуск:
 *   npx tsx scripts/gen_bm_docx_standalone.ts
 *
 * Требования:
 *   - LibreOffice установлен (для DOCX→PDF)
 *   - НЕ нужен сервер на :3002
 *
 * Результат:
 *   scratch/bm_contract_print.docx
 *   scratch/bm_contract_print.pdf
 *   scratch/bm_contract_signed.docx
 *   scratch/bm_contract_signed.pdf
 *
 * Использует тот же entry-point, что и сервер:
 *   generateBmContractDocx(contractData, org, { mode, output })
 * из src/utils/docx/bmContractGenerator.ts — никакого дублирования логики.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PDFDocument } from '@pdfme/pdf-lib';
import {
  generateBmContractDocx,
  type BmContractMode,
} from '../src/utils/docx/bmContractGenerator';
import type { ContractData, Organization } from '../src/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SCRATCH = path.resolve(ROOT, 'scratch');

// ---------------------------------------------------------------------------
// Тестовые данные — ContractData (та же структура, что хранится в БД).
// Org передаём пустым: реквизиты Исполнителя захардкожены в EXEC_FIXED_REQUISITES
// внутри bmDocxBuilder.ts (так же, как в production-потоке без legacy-settings).
// ---------------------------------------------------------------------------
const TEST_CONTRACT: ContractData = {
  contractNumber: 'БМ-42',
  signDate:       '2026-05-29',
  dateIn:         '2026-05-29',
  timeIn:         '14:00',
  dateOut:        '2026-05-30',
  timeOut:        '12:00',
  nights:         1,
  guests:         1,
  cottageNumber:  '7',
  roomCategory:   'Стандарт',
  base:           'chunga-changa',
  totalRub:       8000,
  prepaymentRub:  4000,
  client: {
    fullName:         'Петрова Анна Сергеевна',
    dob:              '1990-03-12',
    passport:         '5112 456789',
    passportDate:     '2015-04-10',
    passportIssuedBy: 'УМВД России по г. Мурманску',
    address:          'г. Мурманск, ул. Советская, д. 3, кв. 11',
    phone:            '+7 (921) 100-20-30',
    email:            'petrova@example.com',
  },
};

const EMPTY_ORG: Partial<Organization> = {};

// ---------------------------------------------------------------------------
// Генерация одного режима
// ---------------------------------------------------------------------------
async function generate(mode: BmContractMode): Promise<{
  docxBytes: number;
  pdfBytes: number;
  pdfPages: number;
}> {
  const docxPath = path.resolve(SCRATCH, `bm_contract_${mode}.docx`);
  const pdfPath  = path.resolve(SCRATCH, `bm_contract_${mode}.pdf`);

  console.log(`\n[${mode}] generating DOCX...`);
  const docxBuf = await generateBmContractDocx(TEST_CONTRACT, EMPTY_ORG, {
    mode,
    output: 'docx',
  });
  fs.writeFileSync(docxPath, docxBuf);
  console.log(`  DOCX saved: ${docxPath}  (${docxBuf.byteLength} bytes)`);

  console.log(`[${mode}] converting to PDF (LibreOffice)...`);
  const pdfBuf = await generateBmContractDocx(TEST_CONTRACT, EMPTY_ORG, {
    mode,
    output: 'pdf',
  });
  fs.writeFileSync(pdfPath, pdfBuf);

  const pdfDoc = await PDFDocument.load(pdfBuf);
  const pages = pdfDoc.getPageCount();
  console.log(`  PDF  saved: ${pdfPath}  (${pdfBuf.byteLength} bytes, ${pages} pages)`);

  return { docxBytes: docxBuf.byteLength, pdfBytes: pdfBuf.byteLength, pdfPages: pages };
}

// ---------------------------------------------------------------------------
async function main() {
  if (!fs.existsSync(SCRATCH)) fs.mkdirSync(SCRATCH, { recursive: true });

  const print  = await generate('print');
  const signed = await generate('signed');

  console.log('\n=== Summary ===');
  console.log(`  [print]  DOCX ${print.docxBytes} bytes | PDF ${print.pdfBytes} bytes | ${print.pdfPages} pages`);
  console.log(`  [signed] DOCX ${signed.docxBytes} bytes | PDF ${signed.pdfBytes} bytes | ${signed.pdfPages} pages`);
}

main().catch(e => { console.error(e); process.exit(1); });
