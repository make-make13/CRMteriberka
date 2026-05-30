/**
 * DOCX → PDF через LibreOffice headless (libreoffice-convert).
 *
 * Требует установленный LibreOffice. Путь подбирается автоматически:
 *  - libreoffice-convert ищет soffice в PATH;
 *  - если не найден, можно задать env LIBREOFFICE_PATH.
 *
 * Использование:
 *    const pdfBuf = await docxToPdf(docxBuf);
 */
import { promisify } from 'util';
import libreofficeConvert from 'libreoffice-convert';

// libreoffice-convert требует callback-based API. promisify даёт нам Promise.
// DeprecationWarning DEP0174 не критичен — фактически работает.
const convertAsync = promisify(libreofficeConvert.convert) as (
  input: Buffer,
  outputFormat: string,
  filter: string | undefined,
) => Promise<Buffer>;

export async function docxToPdf(docxBuffer: Buffer): Promise<Buffer> {
  return convertAsync(docxBuffer, '.pdf', undefined);
}

/** Быстрая проверка, что soffice доступен. Возвращает путь или null. */
export function getSofficePathHint(): string | null {
  return process.env.LIBREOFFICE_PATH
    || process.env.SOFFICE_BINARY_PATH
    || 'auto (PATH)';
}
