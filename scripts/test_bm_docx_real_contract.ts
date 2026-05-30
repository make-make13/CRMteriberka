/**
 * Интеграционный тест DOCX-генератора БМ на РЕАЛЬНЫХ данных из CRM-БД.
 *
 * Не поднимает HTTP-сервер — напрямую читает localDb и вызывает
 * generateBmContractDocx с теми же данными, что увидит endpoint
 * /api/bm-docx/contract/:id.
 *
 * Запуск:
 *   npx tsx scripts/test_bm_docx_real_contract.ts [contractIdOrNumber]
 *
 * Если ID не передан — берётся первый найденный BM-договор.
 *
 * Артефакты:
 *   scratch/bm_real_contract_<num>_print.{docx,pdf}
 *   scratch/bm_real_contract_<num>_signed.{docx,pdf}
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PDFDocument } from '@pdfme/pdf-lib';

import { localDb } from '../server/localDatabase';
import type { Contract, Client, Organization } from '../src/types';
import { prepareContractDataFromContract } from '../src/utils/contractDocumentData';
import {
  generateBmContractDocx,
  type BmContractMode,
} from '../src/utils/docx/bmContractGenerator';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SCRATCH = path.resolve(ROOT, 'scratch');

function findContract(idOrNumber?: string): Contract | null {
  const list = localDb.listContracts<Contract>() as Contract[];
  if (idOrNumber) {
    return list.find(c => String((c as any).id) === idOrNumber)
      || list.find(c => String((c as any).number) === idOrNumber)
      || null;
  }
  return list.find(c => (c as any).baseType === 'chunga-changa') || null;
}

async function generateForMode(
  contractData: ReturnType<typeof prepareContractDataFromContract>,
  org: Partial<Organization>,
  mode: BmContractMode,
  num: string,
) {
  const docxPath = path.resolve(SCRATCH, `bm_real_contract_${num}_${mode}.docx`);
  const pdfPath = path.resolve(SCRATCH, `bm_real_contract_${num}_${mode}.pdf`);

  console.log(`\n[${mode}] DOCX...`);
  const docxBuf = await generateBmContractDocx(contractData, org, { mode, output: 'docx' });
  fs.writeFileSync(docxPath, docxBuf);
  console.log(`  ${docxPath}  (${docxBuf.byteLength} bytes)`);

  console.log(`[${mode}] PDF...`);
  const pdfBuf = await generateBmContractDocx(contractData, org, { mode, output: 'pdf' });
  fs.writeFileSync(pdfPath, pdfBuf);
  const pdfDoc = await PDFDocument.load(pdfBuf);
  const pages = pdfDoc.getPageCount();
  console.log(`  ${pdfPath}  (${pdfBuf.byteLength} bytes, ${pages} pages)`);

  return { docxPath, pdfPath, pages, docxBytes: docxBuf.byteLength };
}

async function main() {
  if (!fs.existsSync(SCRATCH)) fs.mkdirSync(SCRATCH, { recursive: true });

  const arg = process.argv[2];
  const contract = findContract(arg);
  if (!contract) {
    console.error('Не нашёл BM-договор в БД', arg ? `по идентификатору ${arg}` : '');
    process.exit(1);
  }
  console.log('Контракт:', {
    id: (contract as any).id,
    number: (contract as any).number,
    base: (contract as any).baseType,
    clientId: (contract as any).clientId,
    dateSigned: (contract as any).dateSigned,
  });

  const client = localDb.getClientById<Client>(String((contract as any).clientId || '')) as Client | null;
  if (!client) {
    console.error('Клиент не найден для договора:', (contract as any).clientId);
    process.exit(1);
  }
  console.log('Клиент:', { name: (client as any).fullName, passport: (client as any).passport });

  const org = (localDb.getOrganization<Organization>('company_details') || {}) as Partial<Organization>;
  console.log('Organization keys:', Object.keys(org));

  const contractData = prepareContractDataFromContract(contract, client);
  console.log('ContractData готов: nights=' + (contractData as any).nights + ', guests=' + (contractData as any).guests + ', totalRub=' + (contractData as any).totalRub);

  const num = String((contract as any).number || (contract as any).id).replace(/[^A-Za-zА-Яа-я0-9_\-]/g, '_');

  const printR = await generateForMode(contractData, org, 'print', num);
  const signedR = await generateForMode(contractData, org, 'signed', num);

  console.log('\n=== Summary ===');
  for (const r of [printR, signedR]) {
    const ok = fs.existsSync(r.docxPath) && fs.existsSync(r.pdfPath);
    console.log(`  ${r.docxPath}: ok=${ok}, pages=${r.pages}`);
  }
  // sanity: signed должен содержать PNG-ассеты → быть существенно больше print
  const sizeDiff = signedR.docxBytes - printR.docxBytes;
  console.log(`\nsigned − print DOCX size = ${sizeDiff} bytes (signed должно быть > print из-за PNG)`);
}

main().catch(e => { console.error(e); process.exit(1); });
