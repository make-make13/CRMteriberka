export const PDFME_INVOICE_TEMPLATE_ID = 'invoice_pdfme' as const;
export const PDFME_CC_CONTRACT_TEMPLATE_ID = 'cc_contract_pdfme' as const;
export const PDFME_GB_CONTRACT_TEMPLATE_ID = 'gb_contract_pdfme' as const;
export const PDFME_BANYA_CONTRACT_TEMPLATE_ID = 'banya_contract_pdfme' as const;
export const PDFME_GIFT_CERTIFICATE_TEMPLATE_ID = 'gift_certificate_pdfme' as const;

export type PdfmeTemplateId =
  | typeof PDFME_INVOICE_TEMPLATE_ID
  | typeof PDFME_CC_CONTRACT_TEMPLATE_ID
  | typeof PDFME_GB_CONTRACT_TEMPLATE_ID
  | typeof PDFME_BANYA_CONTRACT_TEMPLATE_ID
  | typeof PDFME_GIFT_CERTIFICATE_TEMPLATE_ID;

export interface PdfmeTemplateDefinition {
  id: PdfmeTemplateId;
  title: string;
  shortTitle: string;
  description: string;
  fileName: string;
  documentType: 'invoice' | 'contract' | 'certificate';
}

export const PDFME_TEMPLATE_DEFINITIONS: PdfmeTemplateDefinition[] = [
  {
    id: PDFME_CC_CONTRACT_TEMPLATE_ID,
    title: 'PDFMe / Пакет Большая Медведица',
    shortTitle: 'Пакет БМ',
    description: 'Единый PDFMe-пакет: договор, счёт и акт в одном файле.',
    fileName: 'PDFMe Пакет Большая Медведица',
    documentType: 'contract',
  },
  {
    id: PDFME_GB_CONTRACT_TEMPLATE_ID,
    title: 'PDFMe / Legacy-пакет',
    shortTitle: 'Legacy',
    description: 'Legacy PDFMe-пакет для старых договоров.',
    fileName: 'PDFMe Legacy-пакет',
    documentType: 'contract',
  },
  {
    id: PDFME_BANYA_CONTRACT_TEMPLATE_ID,
    title: 'PDFMe / Договор Бани',
    shortTitle: 'Договор БК',
    description: 'PDFMe-пакет для бани: договор, счёт и акт в одном файле.',
    fileName: 'PDFMe Договор Бани',
    documentType: 'contract',
  },
  {
    id: PDFME_INVOICE_TEMPLATE_ID,
    title: 'PDFMe / Счёт',
    shortTitle: 'Счёт',
    description: 'Основной PDF-макет счёта, синхронизированный с полями CRM и служащий базовым шаблоном услуги.',
    fileName: 'PDFMe Счёт',
    documentType: 'invoice',
  },
];

export function getPdfmeTemplateDefinition(id: string) {
  return PDFME_TEMPLATE_DEFINITIONS.find(definition => definition.id === id);
}
