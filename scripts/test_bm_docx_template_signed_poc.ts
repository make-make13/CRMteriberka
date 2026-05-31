/**
 * Интеграционный тест POC signed-шаблона договора БМ.
 *
 * Проверяет гипотезу: статические изображения, встроенные в DOCX-шаблон,
 * сохраняются после прохождения через docxtemplater (только текстовые {теги} меняются).
 *
 * Запуск:
 *   npx tsx scripts/test_bm_docx_template_signed_poc.ts [contractIdOrNumber]
 *
 * Шаблон должен существовать. Если нет — сначала:
 *   npx tsx scripts/create_bm_contract_template_signed_poc.ts
 *
 * Артефакты:
 *   scratch/bm_contract_template_signed_poc.docx
 *   scratch/bm_contract_template_signed_poc.pdf
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PDFDocument } from '@pdfme/pdf-lib';

import { localDb } from '../server/localDatabase';
import type { Contract, Client, Organization } from '../src/types';
import { prepareContractDataFromContract } from '../src/utils/contractDocumentData';
import {
  generateBmContractFromTemplate,
  getSignedTemplatePath,
} from '../src/utils/docx/bmTemplateContractGenerator';
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

/** Проверяет размер DOCX-архива на наличие image-записей в word/media/. */
function inspectDocxImages(docxBuf: Buffer): { count: number; names: string[] } {
  // Ищем PNG-сигнатуру \x89PNG в буфере (упрощённая проверка)
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // \x89PNG
  let count = 0;
  let pos = 0;
  while ((pos = docxBuf.indexOf(sig, pos)) !== -1) {
    count++;
    pos += 4;
  }
  // Ищем имена файлов в Local File Header ZIP (сигнатура 0x04034B50)
  const names: string[] = [];
  pos = 0;
  const lfhSig = Buffer.from([0x50, 0x4B, 0x03, 0x04]);
  while ((pos = docxBuf.indexOf(lfhSig, pos)) !== -1) {
    const fnLen = docxBuf.readUInt16LE(pos + 26);
    const name = docxBuf.slice(pos + 30, pos + 30 + fnLen).toString('utf8');
    if (name.startsWith('word/media/')) names.push(name);
    pos += 4;
  }
  return { count, names };
}

async function main() {
  if (!fs.existsSync(SCRATCH)) fs.mkdirSync(SCRATCH, { recursive: true });

  // ── Проверка шаблона ───────────────────────────────────────────────────────
  const templatePath = getSignedTemplatePath();
  if (!fs.existsSync(templatePath)) {
    console.error(`[ERROR] Signed-шаблон не найден: ${templatePath}`);
    console.error('Сначала запустите: npx tsx scripts/create_bm_contract_template_signed_poc.ts');
    process.exit(1);
  }
  const templateStat = fs.statSync(templatePath);
  console.log(`Шаблон: ${path.basename(templatePath)}  (${templateStat.size.toLocaleString()} байт)`);

  // Проверяем, что в шаблоне есть встроенные изображения
  const templateBuf = fs.readFileSync(templatePath);
  const templateImages = inspectDocxImages(templateBuf);
  console.log(`  Медиа-файлы в шаблоне: [${templateImages.names.join(', ')}]`);
  if (templateImages.names.length === 0) {
    console.warn('[WARN] В шаблоне не обнаружено word/media/* файлов. Изображения не встроены?');
  }

  // ── Загрузка договора ──────────────────────────────────────────────────────
  const arg = process.argv[2];
  const contract = findContract(arg);
  if (!contract) {
    console.error('Не нашёл БМ-договор', arg ? `по идентификатору: ${arg}` : '(первый chunga-changa)');
    process.exit(1);
  }
  console.log('\nДоговор:', {
    id: (contract as any).id,
    number: (contract as any).number,
    base: (contract as any).baseType,
  });

  const client = localDb.getClientById<Client>(String((contract as any).clientId || '')) as Client | null;
  if (!client) {
    console.error('Клиент не найден:', (contract as any).clientId);
    process.exit(1);
  }

  const org = (localDb.getOrganization<Organization>('company_details') || {}) as Partial<Organization>;
  const contractData = prepareContractDataFromContract(contract, client);
  const vars = buildBmDocxVariables(contractData, org);

  console.log('Переменные:');
  console.log(`  contract_header = "${vars.contract_header}"`);
  console.log(`  client_name     = "${vars.client_name}"`);
  console.log(`  client_short_name = "${vars.client_short_name}"`);
  console.log(`  total           = "${vars.total}"`);

  // ── DOCX ──────────────────────────────────────────────────────────────────
  const docxPath = path.resolve(SCRATCH, 'bm_contract_template_signed_poc.docx');
  console.log('\n[docx] Генерация из signed-шаблона...');
  const t0 = Date.now();
  const docxBuf = await generateBmContractFromTemplate(contractData, org, {
    output: 'docx',
    templatePath,
  });
  const docxMs = Date.now() - t0;
  fs.writeFileSync(docxPath, docxBuf);

  // Ключевая проверка: изображения в результирующем DOCX
  const resultImages = inspectDocxImages(docxBuf);
  const imagesPreserved = resultImages.names.length >= templateImages.names.length;

  console.log(`  Файл: ${docxPath}`);
  console.log(`  Размер: ${docxBuf.byteLength.toLocaleString()} байт  Время: ${docxMs} мс`);
  console.log(`  Медиа-файлы в результате: [${resultImages.names.join(', ')}]`);
  console.log(`  Изображения сохранились: ${imagesPreserved ? '✓ ДА' : '✗ НЕТ'}`);

  // ── PDF ───────────────────────────────────────────────────────────────────
  const pdfPath = path.resolve(SCRATCH, 'bm_contract_template_signed_poc.pdf');
  console.log('\n[pdf]  Генерация через LibreOffice...');
  const t1 = Date.now();
  const pdfBuf = await generateBmContractFromTemplate(contractData, org, {
    output: 'pdf',
    templatePath,
  });
  const pdfMs = Date.now() - t1;
  fs.writeFileSync(pdfPath, pdfBuf);
  const pdfDoc = await PDFDocument.load(pdfBuf);
  const pages = pdfDoc.getPageCount();
  console.log(`  Файл: ${pdfPath}`);
  console.log(`  Размер: ${pdfBuf.byteLength.toLocaleString()} байт  Страниц: ${pages}  Время: ${pdfMs} мс`);

  // ── Итоги ─────────────────────────────────────────────────────────────────
  console.log('\n=== Summary (signed template POC) ===');

  const checks = [
    { label: 'DOCX создан', ok: fs.existsSync(docxPath) },
    { label: 'PDF создан', ok: fs.existsSync(pdfPath) },
    { label: 'PDF ≥4 страниц', ok: pages >= 4 },
    { label: 'Изображения в DOCX сохранились', ok: imagesPreserved },
    { label: 'Плейсхолдеры заменились (contract_header)', ok: !docxBuf.toString('binary').includes('{contract_header}') },
  ];

  for (const c of checks) {
    console.log(`  [${c.ok ? '✓' : '✗'}] ${c.label}`);
  }

  const allOk = checks.every(c => c.ok);
  console.log(allOk ? '\n✓ Все проверки пройдены.' : '\n✗ Часть проверок не пройдена!');

  if (!imagesPreserved) {
    console.log('\n[WARN] Изображения не сохранились — возможно, нужен docxtemplater-image-module.');
  }

  console.log('\nПроверьте визуально:');
  console.log(`  start ${docxPath}`);
  console.log(`  start ${pdfPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });
