/**
 * Утилиты генерации БМ-пакета и совместного счёта+акта.
 *
 * Экспортируемые функции:
 *   generateBmSendPackageBlob  — договор (DOCX) + счёт + акт, один PDF
 *   generateBmInvoiceActPdf    — счёт + акт в одном PDF (с печатью или без)
 *
 * Счёт и акт берутся из двух последних страниц стандартного
 * CC PDFMe-пакета (generatePdfmeContractBlob).
 * Первые страницы пакета (CC-шаблон договора) отбрасываются.
 *
 * Размер печати PDFMe выровнен под DOCX-шаблон (29mm, см. pdfmeTemplates.ts).
 */
import { PDFDocument } from '@pdfme/pdf-lib';
import type { ContractData } from '../../types';

/**
 * Собирает пакет из уже готового PDF-договора БМ
 * и счёта+акта из PDFMe CC-пакета.
 *
 * @param contractPdfBlob  PDF договора (DOCX-шаблон, с печатью)
 * @param contractData     Данные договора (для генерации счёта/акта)
 * @returns Merged PDF Blob: договор + счёт + акт
 */
export async function generateBmSendPackageBlob(
  contractPdfBlob: Blob,
  contractData: ContractData,
): Promise<Blob> {
  // Ленивый импорт — не загружаем тяжёлый PDFMe без нужды.
  const { generatePdfmeContractBlob } = await import('../pdfmeDocumentGenerator');

  // Генерируем CC-пакет в режиме 'send' (содержит договор + счёт + акт).
  // Нас интересуют только последние 2 страницы: счёт и акт.
  const packageBlob = await generatePdfmeContractBlob(contractData, 'send');

  const [contractBuf, packageBuf] = await Promise.all([
    contractPdfBlob.arrayBuffer(),
    packageBlob.arrayBuffer(),
  ]);

  const [contractDoc, packageDoc] = await Promise.all([
    PDFDocument.load(contractBuf),
    PDFDocument.load(packageBuf),
  ]);

  const merged = await PDFDocument.create();

  // Все страницы DOCX-договора (с печатью и подписью)
  const contractPageIndices = contractDoc.getPageIndices();
  const copiedContractPages = await merged.copyPages(contractDoc, contractPageIndices);
  copiedContractPages.forEach(p => merged.addPage(p));

  // Последние 2 страницы CC-пакета — счёт и акт.
  // Структура CC-пакета: [...договор (N стр.)] + [счёт] + [акт].
  // Берём последние 2 страницы, не зависим от числа страниц договора.
  const pkgCount = packageDoc.getPageCount();
  if (pkgCount >= 2) {
    const invoiceActPages = await merged.copyPages(packageDoc, [pkgCount - 2, pkgCount - 1]);
    invoiceActPages.forEach(p => merged.addPage(p));
  }

  const mergedBytes = await merged.save();
  return new Blob([mergedBytes], { type: 'application/pdf' });
}

// ---------------------------------------------------------------------------
// Совместная генерация счёта + акта
// ---------------------------------------------------------------------------

/**
 * Формирует PDF из 2 страниц: счёт + акт.
 *
 * @param contractData  Данные договора
 * @param mode          'send'  → с печатью и подписью
 *                      'print' → без печати и подписи
 * @returns PDF Blob: [счёт, акт]
 */
export async function generateBmInvoiceActPdf(
  contractData: ContractData,
  mode: 'send' | 'print',
): Promise<Blob> {
  const { generatePdfmeContractBlob } = await import('../pdfmeDocumentGenerator');

  // 'send'         — все страницы, печать есть.
  // 'send-no-stamp' — все страницы, печать/подпись скрыты.
  const pdfmeMode = mode === 'send' ? 'send' : 'send-no-stamp';
  const packageBlob = await generatePdfmeContractBlob(contractData, pdfmeMode);

  const packageBuf = await packageBlob.arrayBuffer();
  const packageDoc = await PDFDocument.load(packageBuf);
  const pkgCount = packageDoc.getPageCount();

  // Структура CC-пакета: [...договор (N стр.)] [счёт] [акт]
  // Берём последние 2 страницы.
  const result = await PDFDocument.create();
  if (pkgCount >= 2) {
    const pages = await result.copyPages(packageDoc, [pkgCount - 2, pkgCount - 1]);
    pages.forEach(p => result.addPage(p));
  }

  const bytes = await result.save();
  return new Blob([bytes], { type: 'application/pdf' });
}
