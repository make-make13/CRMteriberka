/**
 * POC: генерация договора БМ через docxtemplater + PizZip.
 *
 * НЕ заменяет текущий generateBmContractDocx() (bmDocxBuilder / bmContractGenerator).
 * Это параллельный экспериментальный путь для оценки подхода «визуальный DOCX-шаблон
 * с {плейсхолдерами}», редактируемого в Word/LibreOffice.
 *
 * Архитектура:
 *   1. templates/docx/bm_contract_template_poc.docx  — DOCX-шаблон с {tag}-плейсхолдерами.
 *      Создаётся скриптом scripts/create_bm_contract_template_poc.ts.
 *      После создания шаблон можно открыть в Word, изменить оформление и сохранить —
 *      данные при следующей генерации подставятся автоматически.
 *   2. buildBmDocxVariables(contractData, org) — готовит Record<string, string> из тех же
 *      данных, что использует bmDocxBuilder. Общий источник истины — bmDocxData.ts.
 *   3. Docxtemplater рендерит шаблон, PizZip-буфер сохраняется как DOCX или конвертируется
 *      в PDF через LibreOffice headless (docxToPdf).
 */
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { buildBmDocxVariables } from './bmDocxData';
import { docxToPdf } from './docxToPdf';
import type { ContractData, Organization } from '../../types';

// ---------------------------------------------------------------------------
// Пути
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Путь к print-шаблону (без печати и подписи). */
export function getTemplatePath(): string {
  return path.resolve(__dirname, '../../../templates/docx/bm_contract_template_poc.docx');
}

/** Путь к signed-шаблону (со статическими печатью и подписью). */
export function getSignedTemplatePath(): string {
  return path.resolve(__dirname, '../../../templates/docx/bm_contract_template_signed_poc.docx');
}

// ---------------------------------------------------------------------------
// Публичный API
// ---------------------------------------------------------------------------

export interface BmTemplateGenerateOptions {
  /** 'docx' — вернуть DOCX-буфер, 'pdf' — сконвертировать через LibreOffice. */
  output: 'docx' | 'pdf';
  /**
   * Абсолютный путь к шаблону. Если не указан — используется print-шаблон
   * (bm_contract_template_poc.docx).
   */
  templatePath?: string;
}

/**
 * Генерирует DOCX (или PDF) договора БМ из шаблона с {плейсхолдерами}.
 *
 * Шаблон по умолчанию: templates/docx/bm_contract_template_poc.docx.
 * Для signed-варианта передайте templatePath: getSignedTemplatePath().
 * Если шаблон отсутствует — выбрасывает ошибку с подсказкой.
 */
export async function generateBmContractFromTemplate(
  contractData: ContractData,
  org: Partial<Organization>,
  options: BmTemplateGenerateOptions,
): Promise<Buffer> {
  const templatePath = options.templatePath ?? getTemplatePath();

  if (!fs.existsSync(templatePath)) {
    throw new Error(
      `Шаблон не найден: ${templatePath}\n`
      + 'Запустите подходящий скрипт create_bm_contract_template_*.ts для его создания.',
    );
  }

  // Подготовка переменных (те же данные, что у bmDocxBuilder)
  const vars = buildBmDocxVariables(contractData, org);

  // Загрузка шаблона
  const templateBinary = fs.readFileSync(templatePath, 'binary');
  const zip = new PizZip(templateBinary);

  // Docxtemplater: paragraphLoop=true позволяет удалять пустые абзацы,
  // linebreaks=true обрабатывает \n как разрывы строк внутри параграфа.
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
  });

  // Подстановка значений
  doc.render(vars as unknown as Record<string, string>);

  // Извлечение DOCX-буфера
  const docxBuffer = doc.getZip().generate({
    type: 'nodebuffer',
    compression: 'DEFLATE',
  }) as Buffer;

  if (options.output === 'pdf') {
    return docxToPdf(docxBuffer);
  }

  return docxBuffer;
}
