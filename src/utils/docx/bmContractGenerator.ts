/**
 * Верхнеуровневое API для DOCX-генерации договора БМ.
 *
 * Facade над тремя низкоуровневыми слоями:
 *   1. bmDocxData       — собирает плоский dict переменных из ContractData + Organization
 *   2. bmDocxBuilder    — programmatic-сборка DOCX (§1–§15)
 *   3. docxToPdf        — конвертация DOCX → PDF через LibreOffice headless
 *
 * Пример:
 *   const buf = await generateBmContractDocx(contractData, org, { mode: 'signed', output: 'pdf' });
 *   fs.writeFileSync('contract.pdf', buf);
 *
 * НЕ интегрируется в основную кнопку генерации — это экспериментальный путь
 * параллельно с PDFMe-генератором.
 */
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import type { ContractData, Organization } from '../../types';
import { buildBmDocxVariables, type BmDocxVariables } from './bmDocxData';
import { buildBmContractDocx } from './bmDocxBuilder';
import { docxToPdf } from './docxToPdf';

export type BmContractMode = 'print' | 'signed';
export type BmContractOutput = 'docx' | 'pdf';

export interface GenerateBmContractOptions {
  /**
   * `print`  — без печати и подписи Исполнителя (для распечатки на живую подпись).
   * `signed` — с печатью и подписью Исполнителя (для отправки в электронном виде).
   */
  mode: BmContractMode;

  /** `docx` — вернуть исходный DOCX-Buffer; `pdf` — после конвертации через LibreOffice. */
  output: BmContractOutput;

  /**
   * Опционально: пути к PNG-ассетам. По умолчанию используются
   * `<project>/public/pdfme-assets/stamp.png` и `signature.png`
   * — те же ассеты, что и в PDFMe-генераторе.
   */
  stampPath?: string;
  signaturePath?: string;
}

/** Корень проекта от расположения этого файла (src/utils/docx/). */
function defaultAssetRoots(): string[] {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return [
    path.resolve(process.cwd(), 'public', 'pdfme-assets'),
    path.resolve(here, '..', 'public', 'pdfme-assets'),
    path.resolve(here, '..', '..', '..', 'public', 'pdfme-assets'),
  ];
}

function resolveAsset(name: 'stamp.png' | 'signature.png', override?: string): string {
  if (override) return override;
  const candidates = defaultAssetRoots().map(root => path.resolve(root, name));
  return candidates.find(candidate => fs.existsSync(candidate)) || candidates[0];
}

/**
 * Главный entry-point: собирает DOCX (опционально конвертирует в PDF)
 * для договора БМ. Не сохраняет файлы на диск — возвращает Buffer.
 */
export async function generateBmContractDocx(
  contractData: ContractData,
  org: Partial<Organization>,
  options: GenerateBmContractOptions,
): Promise<Buffer> {
  const vars: BmDocxVariables = buildBmDocxVariables(contractData, org);

  const isSigned = options.mode === 'signed';
  const docxBuffer = await buildBmContractDocx(vars, {
    withStamp: isSigned,
    withSignature: isSigned,
    stampPath: resolveAsset('stamp.png', options.stampPath),
    signaturePath: resolveAsset('signature.png', options.signaturePath),
  });

  if (options.output === 'docx') return docxBuffer;
  return docxToPdf(docxBuffer);
}
