/**
 * Интеграционный тест POC-генератора договора БМ на основе docxtemplater.
 *
 * Запуск:
 *   npx tsx scripts/test_bm_docx_template_poc.ts [contractIdOrNumber]
 *
 * Шаблон должен существовать. Если нет — запустите сначала:
 *   npx tsx scripts/create_bm_contract_template_poc.ts
 *
 * Артефакты:
 *   scratch/bm_contract_template_poc.docx
 *   scratch/bm_contract_template_poc.pdf
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PDFDocument } from '@pdfme/pdf-lib';

import { localDb } from '../server/localDatabase';
import type { Contract, Client, Organization } from '../src/types';
import { prepareContractDataFromContract } from '../src/utils/contractDocumentData';
import { generateBmContractFromTemplate, getTemplatePath } from '../src/utils/docx/bmTemplateContractGenerator';
import { buildBmDocxVariables } from '../src/utils/docx/bmDocxData';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SCRATCH = path.resolve(ROOT, 'scratch');

function findContract(idOrNumber?: string): Contract | null {
  const list = localDb.listContracts<Contract>() as Contract[];
  if (idOrNumber) {
    return (
      list.find(c => String((c as any).id) === idOrNumber)
      || list.find(c => String((c as any).number) === idOrNumber)
      || null
    );
  }
  return list.find(c => (c as any).baseType === 'chunga-changa') || null;
}

async function main() {
  if (!fs.existsSync(SCRATCH)) fs.mkdirSync(SCRATCH, { recursive: true });

  // ── Проверка шаблона ───────────────────────────────────────────────────────
  const templatePath = getTemplatePath();
  if (!fs.existsSync(templatePath)) {
    console.error(`[ERROR] Шаблон не найден: ${templatePath}`);
    console.error('Сначала запустите: npx tsx scripts/create_bm_contract_template_poc.ts');
    process.exit(1);
  }
  const templateStat = fs.statSync(templatePath);
  console.log(`Шаблон: ${templatePath}  (${templateStat.size.toLocaleString()} байт)`);

  // ── Загрузка договора ──────────────────────────────────────────────────────
  const arg = process.argv[2];
  const contract = findContract(arg);
  if (!contract) {
    console.error('Не нашёл БМ-договор', arg ? `по идентификатору: ${arg}` : '(первый chunga-changa)');
    process.exit(1);
  }
  console.log('Договор:', {
    id: (contract as any).id,
    number: (contract as any).number,
    base: (contract as any).baseType,
    clientId: (contract as any).clientId,
  });

  const client = localDb.getClientById<Client>(String((contract as any).clientId || '')) as Client | null;
  if (!client) {
    console.error('Клиент не найден для договора:', (contract as any).clientId);
    process.exit(1);
  }
  console.log('Клиент:', { name: (client as any).fullName });

  const org = (localDb.getOrganization<Organization>('company_details') || {}) as Partial<Organization>;

  const contractData = prepareContractDataFromContract(contract, client);
  const vars = buildBmDocxVariables(contractData, org);
  console.log('Переменные:');
  console.log(`  contract_header  = "${vars.contract_header}"`);
  console.log(`  sign_date        = "${vars.sign_date}"`);
  console.log(`  contract_period  = "${vars.contract_period}"`);
  console.log(`  client_name      = "${vars.client_name}"`);
  console.log(`  room_number      = "${vars.room_number}"`);
  console.log(`  room_category    = "${vars.room_category}"`);
  console.log(`  date_in          = "${vars.date_in}"  date_out = "${vars.date_out}"`);
  console.log(`  total            = "${vars.total}"`);
  console.log(`  total_words      = "${vars.total_words}"`);

  // ── DOCX ──────────────────────────────────────────────────────────────────
  const docxPath = path.resolve(SCRATCH, 'bm_contract_template_poc.docx');
  console.log('\n[docx] Генерация...');
  const t0 = Date.now();
  const docxBuf = await generateBmContractFromTemplate(contractData, org, { output: 'docx' });
  const docxMs = Date.now() - t0;
  fs.writeFileSync(docxPath, docxBuf);
  console.log(`  ${docxPath}`);
  console.log(`  Размер: ${docxBuf.byteLength.toLocaleString()} байт  Время: ${docxMs} мс`);

  // ── PDF ───────────────────────────────────────────────────────────────────
  const pdfPath = path.resolve(SCRATCH, 'bm_contract_template_poc.pdf');
  console.log('\n[pdf]  Генерация через LibreOffice...');
  const t1 = Date.now();
  const pdfBuf = await generateBmContractFromTemplate(contractData, org, { output: 'pdf' });
  const pdfMs = Date.now() - t1;
  fs.writeFileSync(pdfPath, pdfBuf);
  const pdfDoc = await PDFDocument.load(pdfBuf);
  const pages = pdfDoc.getPageCount();
  console.log(`  ${pdfPath}`);
  console.log(`  Размер: ${pdfBuf.byteLength.toLocaleString()} байт  Страниц: ${pages}  Время: ${pdfMs} мс`);

  // ── Итоги ─────────────────────────────────────────────────────────────────
  console.log('\n=== Summary (template POC) ===');
  console.log(`  DOCX: ${docxBuf.byteLength.toLocaleString()} байт  ✓`);
  console.log(`  PDF:  ${pdfBuf.byteLength.toLocaleString()} байт  ${pages} стр.`);

  if (pages < 4) {
    console.warn(`\n[WARN] PDF содержит ${pages} стр. — ожидалось ≥4. Возможно, шрифт/отступы дали другой результат.`);
  } else {
    console.log('\n[OK] Количество страниц в пределах ожиданий.');
  }

  console.log('\nПроверьте файлы:');
  console.log(`  start ${docxPath}`);
  console.log(`  start ${pdfPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });
