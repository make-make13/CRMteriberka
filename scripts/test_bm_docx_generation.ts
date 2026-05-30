/**
 * Тестовый CLI для DOCX-генерации договора БМ.
 *
 * Запуск:
 *   npx tsx scripts/test_bm_docx_generation.ts
 *
 * Требования:
 *   - localApi сервер запущен на :3002 (для загрузки реквизитов организации)
 *   - LibreOffice установлен (для DOCX→PDF)
 *
 * Результат:
 *   scratch/bm_contract_print.docx       (без подписи/печати)
 *   scratch/bm_contract_print.pdf
 *   scratch/bm_contract_signed.docx      (с подписью и печатью)
 *   scratch/bm_contract_signed.pdf
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { authApi, setAuthToken, organizationApi, settingsApi } from '../src/services/localApi';
import type { ContractData, Organization } from '../src/types';
import { buildBmDocxVariables } from '../src/utils/docx/bmDocxData';
import { buildBmContractDocx } from '../src/utils/docx/bmDocxBuilder';
import { docxToPdf, getSofficePathHint } from '../src/utils/docx/docxToPdf';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SCRATCH = path.resolve(ROOT, 'scratch');
const PUBLIC_ASSETS = path.resolve(ROOT, 'public', 'pdfme-assets');

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

async function generateOne(mode: 'print_contract' | 'contract_signed', vars: ReturnType<typeof buildBmDocxVariables>) {
  const isSigned = mode === 'contract_signed';
  const docxBuf = await buildBmContractDocx(vars, {
    withStamp: isSigned,
    withSignature: isSigned,
    stampPath: path.resolve(PUBLIC_ASSETS, 'stamp.png'),
    signaturePath: path.resolve(PUBLIC_ASSETS, 'signature.png'),
  });

  const docxPath = path.resolve(SCRATCH, `bm_contract_${mode === 'print_contract' ? 'print' : 'signed'}.docx`);
  fs.writeFileSync(docxPath, docxBuf);
  console.log(`  DOCX: ${docxPath} (${docxBuf.byteLength} bytes)`);

  let pdfPath = '';
  try {
    const pdfBuf = await docxToPdf(docxBuf);
    pdfPath = docxPath.replace(/\.docx$/, '.pdf');
    fs.writeFileSync(pdfPath, pdfBuf);
    console.log(`  PDF:  ${pdfPath} (${pdfBuf.byteLength} bytes)`);
  } catch (err: any) {
    console.warn(`  PDF:  FAILED — ${err?.message || err}`);
    console.warn(`        soffice hint: ${getSofficePathHint()}`);
    console.warn(`        Установите LibreOffice или задайте env LIBREOFFICE_PATH.`);
  }

  return { docxPath, pdfPath };
}

async function main() {
  if (!fs.existsSync(SCRATCH)) fs.mkdirSync(SCRATCH, { recursive: true });

  console.log('Authenticating...');
  const { token } = await authApi.login('Make', '3552');
  setAuthToken(token);

  console.log('Loading organization details...');
  const org = await loadOrg();

  const vars = buildBmDocxVariables(checklistData, org);
  console.log('Variables ready. contract_header =', vars.contract_header);
  console.log('                  contract_period =', vars.contract_period);
  console.log('                  guests_label    =', vars.guests_label);
  console.log('                  nights_label    =', vars.nights_label);

  console.log('\n[1/2] mode = print_contract (без печати/подписи)');
  await generateOne('print_contract', vars);

  console.log('\n[2/2] mode = contract_signed (с печатью и подписью)');
  await generateOne('contract_signed', vars);

  console.log('\nDone.');
}

main().catch(e => { console.error(e); process.exit(1); });
