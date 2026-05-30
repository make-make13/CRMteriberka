/**
 * Тестовый CLI для DOCX/PDF-генерации договора БМ.
 *
 * Запуск:
 *   npx tsx scripts/test_bm_docx_generation.ts
 *
 * Требования:
 *   - localApi сервер запущен на :3002 (для загрузки реквизитов организации)
 *   - LibreOffice установлен (для DOCX→PDF)
 *
 * Результат:
 *   scratch/bm_contract_print.docx
 *   scratch/bm_contract_print.pdf
 *   scratch/bm_contract_signed.docx
 *   scratch/bm_contract_signed.pdf
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PDFDocument } from '@pdfme/pdf-lib';

import { authApi, setAuthToken, organizationApi, settingsApi } from '../src/services/localApi';
import type { ContractData, Organization } from '../src/types';
import {
  generateBmContractDocx,
  type BmContractMode,
} from '../src/utils/docx/bmContractGenerator';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SCRATCH = path.resolve(ROOT, 'scratch');

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : (input as Request).url;
  const fullUrl = url.startsWith('/') ? `http://localhost:3002${url}` : url;
  return originalFetch(fullUrl, init);
};

const checklistData: ContractData = {
  contractNumber: 'БМ-42',
  signDate: '2026-05-29',
  dateIn:  '2026-05-29',
  timeIn:  '14:00',
  dateOut: '2026-05-30',
  timeOut: '12:00',
  nights: 1,
  guests: 1,
  cottageNumber: '7',
  roomCategory: 'Стандарт',
  base: 'chunga-changa',
  totalRub: 8000,
  prepaymentRub: 4000,
  client: {
    fullName: 'Петрова Анна Сергеевна',
    dob: '1990-03-12',
    passport: '5112 456789',
    passportDate: '2015-04-10',
    passportIssuedBy: 'УМВД России по г. Мурманску',
    address: 'г. Мурманск, ул. Советская, д. 3, кв. 11',
    phone: '+7 (921) 100-20-30',
    email: 'petrova@example.com',
  },
};

async function loadOrg(): Promise<Partial<Organization>> {
  let org = (await organizationApi.get('company_details') || {}) as Partial<Organization>;
  if (!org.exec_bank) {
    const legacy = await settingsApi.get() as Partial<Organization> | null;
    if (legacy?.exec_bank) org = { ...legacy, ...org };
  }
  return org;
}

interface PerModeResult {
  mode: BmContractMode;
  docxPath: string;
  docxBytes: number;
  pdfPath: string;
  pdfBytes: number;
  pdfPages: number;
}

async function generateForMode(
  contractData: ContractData,
  org: Partial<Organization>,
  mode: BmContractMode,
): Promise<PerModeResult> {
  const tag = mode; // 'print' | 'signed' — совпадает с именем файла
  const docxPath = path.resolve(SCRATCH, `bm_contract_${tag}.docx`);
  const pdfPath = path.resolve(SCRATCH, `bm_contract_${tag}.pdf`);

  console.log(`\n[${mode}] generating DOCX...`);
  const docxBuf = await generateBmContractDocx(contractData, org, { mode, output: 'docx' });
  fs.writeFileSync(docxPath, docxBuf);
  console.log(`  DOCX: ${docxPath}  (${docxBuf.byteLength} bytes)`);

  console.log(`[${mode}] generating PDF...`);
  const pdfBuf = await generateBmContractDocx(contractData, org, { mode, output: 'pdf' });
  fs.writeFileSync(pdfPath, pdfBuf);
  const pdfDoc = await PDFDocument.load(pdfBuf);
  const pages = pdfDoc.getPageCount();
  console.log(`  PDF:  ${pdfPath}   (${pdfBuf.byteLength} bytes, ${pages} pages)`);

  return {
    mode,
    docxPath,
    docxBytes: docxBuf.byteLength,
    pdfPath,
    pdfBytes: pdfBuf.byteLength,
    pdfPages: pages,
  };
}

async function main() {
  if (!fs.existsSync(SCRATCH)) fs.mkdirSync(SCRATCH, { recursive: true });

  console.log('Authenticating...');
  const { token } = await authApi.login('Make', '3552');
  setAuthToken(token);

  console.log('Loading organization details...');
  const org = await loadOrg();

  const results: PerModeResult[] = [];
  results.push(await generateForMode(checklistData, org, 'print'));
  results.push(await generateForMode(checklistData, org, 'signed'));

  // --- Финальная сводка + sanity-проверки ---
  console.log('\n=== Summary ===');
  let allOk = true;
  for (const r of results) {
    const docxOk = fs.existsSync(r.docxPath);
    const pdfOk = fs.existsSync(r.pdfPath);
    const pagesOk = r.pdfPages === 6;
    const status = docxOk && pdfOk && pagesOk ? 'OK' : 'FAIL';
    if (status === 'FAIL') allOk = false;
    console.log(`  [${r.mode}] DOCX=${docxOk ? '✓' : '✗'} PDF=${pdfOk ? '✓' : '✗'} pages=${r.pdfPages}${pagesOk ? '' : ' (expected 6)'}  ${status}`);
  }
  if (!allOk) {
    console.error('\nFAIL — see above.');
    process.exit(1);
  }
  console.log('\nAll 4 files generated; both PDFs have 6 pages.');
}

main().catch(e => { console.error(e); process.exit(1); });
