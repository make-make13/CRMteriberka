import type { Template } from '@pdfme/common';
import { generate } from '@pdfme/generator';
import { ContractData, Organization } from '../types';
import { organizationApi, pdfTemplateApi, settingsApi } from '../services/localApi';
import { formatDate, formatDateNumeric, inflectFIO, makeShortName, rubles, rublesOnly } from './documentHelpers';
import {
  createBanyaPackagePdfmeTemplate,
  createDefaultBanyaContractPdfmeTemplate,
  createChungaChangaPackagePdfmeTemplate,
  createDefaultChungaChangaContractPdfmeTemplate,
  createDefaultGiftCertificatePdfmeTemplate,
  createDefaultGolubayaBukhtaContractPdfmeTemplate,
  createDefaultInvoicePdfmeTemplate,
  createGolubayaBukhtaPackagePdfmeTemplate,
  ensureInvoiceActPage,
  pdfmePlugins,
  getPdfmeFont,
  normalizePdfmeTemplateFonts,
} from './pdfmeTemplates';
import {
  PDFME_BANYA_CONTRACT_TEMPLATE_ID,
  PDFME_CC_CONTRACT_TEMPLATE_ID,
  PDFME_GB_CONTRACT_TEMPLATE_ID,
  PDFME_GIFT_CERTIFICATE_TEMPLATE_ID,
  PDFME_INVOICE_TEMPLATE_ID,
  getPdfmeTemplateDefinition,
  type PdfmeTemplateId,
} from './pdfmeTemplateIds';
import { getPdfmeSchemaValueKey } from './pdfmeFieldNames';
import { hydratePdfmeStaticAssetsInTemplate } from './pdfmeStaticAssets';
import { extractContractNumberSequence } from './contractNumbers';

export type PdfmeContractGenerationMode = 'print' | 'send';

export interface GiftCertificateInput {
  amount: string;
  issueDate: string;
  number: string;
}

const PRINT_PAGE_LIMIT_BY_TEMPLATE: Partial<Record<PdfmeTemplateId, number>> = {
  [PDFME_CC_CONTRACT_TEMPLATE_ID]: 4,
  [PDFME_GB_CONTRACT_TEMPLATE_ID]: 2,
  [PDFME_BANYA_CONTRACT_TEMPLATE_ID]: 2,
};

const PRINT_HIDDEN_ASSET_FIELDS = new Set([
  'company_static_stamp',
  'director_static_signature',
  'accountant_static_signature',
  'act_company_static_stamp',
  'act_director_static_signature',
  'cc_company_stamp_image',
  'cc_executor_signature_image',
]);

function formatMoney(n: number): string {
  return n.toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).replace(/\s/g, ' ');
}

function roundRubles(n: number) {
  return Math.round(n);
}

function formatRublesWithoutKopeks(n: number): string {
  return Math.round(n).toLocaleString('ru-RU', {
    maximumFractionDigits: 0,
  }).replace(/\s/g, ' ');
}

function firstUpper(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : '';
}

function formatDateWithLeadingZeroWords(value: string) {
  const [day = '', month = '', year = ''] = formatDate(value).replace(/\s*г\.$/, '').split(' ');
  const normalizedDay = day.padStart(2, '0');
  return `${normalizedDay} ${month} ${year} г.`;
}

function formatActDate(value: string) {
  return formatDate(value).replace(/\s*г\.$/, '');
}

function formatActDateWithYearWord(value: string) {
  return formatDate(value).replace(/\s*г\.$/, ' года');
}

function getCleanCottageNumber(value: string) {
  return String(value || '').replace(/^(КОТТЕДЖ|ДОМ)\s*№?\s*/i, '').replace(/^№\s*/i, '').trim();
}

function getContractNumberBody(value: string) {
  const normalized = String(value || '').trim();
  const sequence = extractContractNumberSequence(normalized);
  if (sequence > 0) return String(sequence);
  return normalized.replace(/^(ЧЧ|ГБ|БК|ФР|Б|Ф|БМ)[\s-]*/i, '').trim();
}

function resolveContractTemplateId(contractData: ContractData): PdfmeTemplateId {
  if (contractData.services?.banya) return PDFME_BANYA_CONTRACT_TEMPLATE_ID;
  return contractData.base === 'golubaya-bukhta'
    ? PDFME_GB_CONTRACT_TEMPLATE_ID
    : PDFME_CC_CONTRACT_TEMPLATE_ID;
}

function buildServiceRow(contractData: ContractData) {
  const total = contractData.totalRub;
  let serviceName = '';

  if (contractData.services?.banya) {
    serviceName = `Услуги по временному размещению в банном комплексе ${formatDateNumeric(contractData.dateIn)} с ${contractData.services.banya.timeFrom} по ${contractData.services.banya.timeTo}`;
  } else if (contractData.services?.furako) {
    serviceName = `Услуги по предоставлению фурако (${contractData.dateIn}, ${contractData.services.furako.timeFrom}–${contractData.services.furako.timeTo})`;
  } else {
    const cottageNumber = getCleanCottageNumber(contractData.cottageNumber);
    const unitLabel = contractData.base === 'chunga-changa' ? 'номере' : 'коттедже';
    serviceName = `Услуги по временному размещению в ${unitLabel} №${cottageNumber} (${contractData.dateIn}–${contractData.dateOut})`;
  }

  const isBanya = Boolean(contractData.services?.banya);
  const isFurako = Boolean(contractData.services?.furako);
  const serviceUnit = isBanya ? 'усл' : isFurako ? 'час.' : 'усл';
  const serviceQty = isBanya ? 1 : isFurako ? contractData.nights : 1;
  const servicePrice = isFurako && serviceQty > 0 ? Math.round(total / serviceQty) : total;

  return {
    serviceName,
    serviceQty: String(serviceQty),
    serviceUnit,
    servicePrice: formatMoney(servicePrice),
    serviceTotal: formatMoney(total),
  };
}

function formatHotelDaysLabel(days: number) {
  const normalizedDays = Math.max(0, Math.trunc(days));
  const mod10 = normalizedDays % 10;
  const mod100 = normalizedDays % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return `${normalizedDays} сутки`;
  }
  return `${normalizedDays} суток`;
}

function formatGuestsLabel(guests: number) {
  const normalizedGuests = Math.max(1, Math.trunc(guests));
  const mod10 = normalizedGuests % 10;
  const mod100 = normalizedGuests % 100;
  
  if (mod10 === 1 && mod100 !== 11) {
    return `${normalizedGuests} человек`;
  }
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${normalizedGuests} человека`;
  }
  return `${normalizedGuests} человек`;
}

function createDefaultTemplateForId(templateId: PdfmeTemplateId): Template {
  switch (templateId) {
    case PDFME_CC_CONTRACT_TEMPLATE_ID:
      return createDefaultChungaChangaContractPdfmeTemplate();
    case PDFME_BANYA_CONTRACT_TEMPLATE_ID:
      return createDefaultBanyaContractPdfmeTemplate();
    case PDFME_GB_CONTRACT_TEMPLATE_ID:
      return createDefaultGolubayaBukhtaContractPdfmeTemplate();
    case PDFME_GIFT_CERTIFICATE_TEMPLATE_ID:
      return createDefaultGiftCertificatePdfmeTemplate();
    case PDFME_INVOICE_TEMPLATE_ID:
      return createDefaultInvoicePdfmeTemplate();
    default:
      return createDefaultInvoicePdfmeTemplate();
  }
}

async function loadPdfmeTemplate(templateId: PdfmeTemplateId): Promise<Template> {
  const saved = await pdfTemplateApi.get<Template>(templateId);

  if (templateId === PDFME_CC_CONTRACT_TEMPLATE_ID) {
    if (saved?.template?.schemas) {
      return saved.template;
    }

    const invoiceTemplate = await loadInvoiceTemplateForPackage();
    return createChungaChangaPackagePdfmeTemplate(createDefaultTemplateForId(templateId), invoiceTemplate);
  }

  if (templateId === PDFME_GB_CONTRACT_TEMPLATE_ID) {
    if (saved?.template?.schemas) {
      return saved.template;
    }

    const invoiceTemplate = await loadInvoiceTemplateForPackage();
    return createGolubayaBukhtaPackagePdfmeTemplate(createDefaultTemplateForId(templateId), invoiceTemplate);
  }

  if (templateId === PDFME_BANYA_CONTRACT_TEMPLATE_ID) {
    if (saved?.template?.schemas) {
      return saved.template;
    }

    const gbSaved = await pdfTemplateApi.get<Template>(PDFME_GB_CONTRACT_TEMPLATE_ID);
    const gbSourceTemplate = gbSaved?.template?.schemas
      ? gbSaved.template
      : createGolubayaBukhtaPackagePdfmeTemplate(
          createDefaultGolubayaBukhtaContractPdfmeTemplate(),
          await loadInvoiceTemplateForPackage(),
        );

    return createBanyaPackagePdfmeTemplate(gbSourceTemplate, gbSourceTemplate);
  }

  if (!saved) return createDefaultTemplateForId(templateId);
  if (Array.isArray(saved.template?.schemas)) {
    const normalized = normalizePdfmeTemplateFonts(saved.template);
    return templateId === PDFME_INVOICE_TEMPLATE_ID ? ensureInvoiceActPage(normalized) : normalized;
  }

  throw new Error('Сохраненный PDFMe-шаблон поврежден. Откройте настройки PDFMe и сохраните шаблон заново.');
}

async function loadInvoiceTemplateForPackage(): Promise<Template> {
  const saved = await pdfTemplateApi.get<Template>(PDFME_INVOICE_TEMPLATE_ID);
  if (saved?.template?.schemas) {
    return ensureInvoiceActPage(normalizePdfmeTemplateFonts(saved.template));
  }
  return createDefaultInvoicePdfmeTemplate();
}

function createContractOutputTemplate(
  template: Template,
  templateId: PdfmeTemplateId,
  mode: PdfmeContractGenerationMode,
): Template {
  if (mode === 'send') {
    return {
      ...template,
      schemas: template.schemas.map(page => page.map(schema => ({ ...schema }))),
    };
  }

  const pageLimit = PRINT_PAGE_LIMIT_BY_TEMPLATE[templateId] ?? template.schemas.length;

  return {
    ...template,
    schemas: template.schemas.slice(0, pageLimit).map(page =>
      page
        .filter(schema => !PRINT_HIDDEN_ASSET_FIELDS.has(String((schema as Record<string, unknown>).name || '')))
        .map(schema => ({ ...schema })),
    ),
  };
}

async function loadOrganization(): Promise<Partial<Organization>> {
  let org = (await organizationApi.get('company_details') || {}) as Partial<Organization>;
  if (!org.exec_bank) {
    const legacy = await settingsApi.get() as Partial<Organization> | null;
    if (legacy?.exec_bank) org = { ...legacy, ...org };
  }
  return org;
}

export function buildPdfmeInput(contractData: ContractData, org: Partial<Organization>) {
  const total = contractData.totalRub;
  const prepayment = contractData.prepaymentRub;
  const balance = total - prepayment;
  const vatAmount = roundRubles(total * 5 / 105);
  const totalNoVat = roundRubles(total - vatAmount);
  const service = buildServiceRow(contractData);
  const today = new Date().toLocaleDateString('en-CA');
  const docDate = formatDate(today);
  const actDate = formatDate(contractData.dateOut);
  const signDate = formatDate(contractData.signDate);
  const { gen: nameGen, dat: nameDat } = inflectFIO(contractData.client.fullName);
  const clientShortName = makeShortName(contractData.client.fullName).trim();
  const qtyWords = `Всего наименований ${service.serviceQty}, на сумму ${formatRublesWithoutKopeks(total)} руб.`;
  const totalWordsOnly = firstUpper(rubles(total));

  return {
    contract_number: String(contractData.contractNumber).trim(),
    sign_date: signDate,
    sign_date_short: formatDateNumeric(contractData.signDate),
    current_date: docDate,
    current_date_short: formatDateNumeric(today),
    date_in: formatDate(contractData.dateIn),
    date_in_short: formatDateNumeric(contractData.dateIn),
    time_in: contractData.timeIn,
    date_out: formatDate(contractData.dateOut),
    date_out_short: formatDateNumeric(contractData.dateOut),
    time_out: contractData.timeOut,
    nights: String(contractData.nights),
    nights_label: formatHotelDaysLabel(contractData.nights),
    guests: String(contractData.guests),
    guests_label: formatGuestsLabel(contractData.guests),
    cottage_number: getCleanCottageNumber(contractData.cottageNumber),
    room_category: (contractData.roomCategory || '').trim(),

    client_name: contractData.client.fullName.trim(),
    client_name_gen: nameGen.trim(),
    client_name_dat: nameDat.trim(),
    client_name_short: clientShortName,
    client_dob: formatDate(contractData.client.dob),
    client_passport: String(contractData.client.passport).trim(),
    client_passport_date: formatDate(contractData.client.passportDate),
    client_passport_date_short: formatDateNumeric(contractData.client.passportDate),
    client_passport_by: contractData.client.passportIssuedBy.trim(),
    client_passport_code: (contractData.client.passportCode || '').trim(),
    client_address: contractData.client.address.trim(),
    client_phone: contractData.client.phone.trim(),
    client_email: contractData.client.email.trim(),
    client_inn: String(contractData.client.inn ?? '').trim(),
    client_kpp: String(contractData.client.kpp ?? '').trim(),
    client_ogrn: String(contractData.client.ogrn ?? '').trim(),

    total: formatMoney(total),
    total_words: totalWordsOnly,
    total_words_only: totalWordsOnly,
    total_no_vat: formatMoney(totalNoVat),
    prepayment: formatMoney(prepayment),
    prepayment_words: firstUpper(rubles(prepayment)),
    prepayment_words_only: firstUpper(rublesOnly(prepayment)),
    balance: formatMoney(balance),
    balance_words: firstUpper(rubles(balance)),
    balance_words_only: firstUpper(rublesOnly(balance)),
    vat_rate: '5%',
    vat_amount: formatMoney(vatAmount),

    exec_name: org.exec_name || '',
    exec_director: org.exec_director || '',
    exec_director_short: `/${org.exec_director_short || ''}/`,
    exec_director_short2: `/${org.exec_director_short || ''}/`,
    exec_inn: org.exec_inn || '',
    exec_kpp: org.exec_kpp || '',
    exec_ogrn: org.exec_ogrn || '',
    exec_address: org.exec_address || '',
    exec_post_address: org.exec_post_address || '',
    exec_phone: org.exec_phone || '',
    exec_bank: org.exec_bank || '',
    exec_rs: org.exec_rs || '',
    exec_bik: org.exec_bik || '',
    exec_ks: org.exec_ks || '',
    bank_inn: org.bank_inn || '',
    bank_kpp: org.bank_kpp || '',
    property_address_cc: org.property_address_cc || '',
    property_address_gb: org.property_address_gb || '',
    property_address: contractData.base === 'chunga-changa'
      ? (org.property_address_cc || '')
      : (org.property_address_gb || ''),

    doc_date: docDate,
    invoice_number: String(contractData.contractNumber).trim(),
    invoice_header: `Счет на оплату № ${contractData.contractNumber} от ${docDate}`,
    act_header: `Акт № ${contractData.contractNumber} от ${actDate}`,
    supplier_text: `${org.exec_name || ''} ИНН ${org.exec_inn || ''}, КПП ${org.exec_kpp || ''} ${org.exec_address || ''}, тел.: ${org.exec_phone || ''}`,
    service_name: service.serviceName,
    service_qty: service.serviceQty,
    service_unit: service.serviceUnit,
    service_price: service.servicePrice,
    service_total: service.serviceTotal,
    service_row_no: '1',
    service_row_name: service.serviceName,
    service_row_qty: service.serviceQty,
    service_row_unit: service.serviceUnit,
    service_row_price: service.servicePrice,
    service_row_total: service.serviceTotal,
    act_client_name: contractData.client.fullName.trim(),
    act_client_name_short: `/${clientShortName}/`,
    act_service_row_no: '1',
    act_service_row_name: service.serviceName,
    act_service_row_qty: service.serviceQty,
    act_service_row_unit: service.serviceUnit,
    act_service_row_price: service.servicePrice,
    act_service_row_total: service.serviceTotal,
    act_service_total: service.serviceTotal,
    act_vat_amount: formatMoney(vatAmount),
    act_total: formatMoney(total),
    act_qty_words: qtyWords,
    act_total_words_only: totalWordsOnly,
    qty_words: qtyWords,

    service_table: JSON.stringify([[
      '1',
      service.serviceName,
      service.serviceQty,
      service.serviceUnit,
      service.servicePrice,
      service.serviceTotal,
    ]]),
  };
}

export function buildPdfmeContractInput(
  contractData: ContractData,
  org: Partial<Organization>,
  templateId: PdfmeTemplateId = contractData.services?.banya
    ? PDFME_BANYA_CONTRACT_TEMPLATE_ID
    : contractData.base === 'golubaya-bukhta'
      ? PDFME_GB_CONTRACT_TEMPLATE_ID
      : PDFME_CC_CONTRACT_TEMPLATE_ID,
) {
  const contractNumberBody = getContractNumberBody(contractData.contractNumber);
  const common = buildPdfmeInput({
    ...contractData,
    contractNumber: contractNumberBody,
  }, org);
  const contractSignDate = formatDateWithLeadingZeroWords(contractData.signDate);
  const clientShortName = `/${makeShortName(contractData.client.fullName).trim()}/`;
  const contractPrefix = templateId === PDFME_CC_CONTRACT_TEMPLATE_ID
    ? 'БМ-'
    : templateId === PDFME_BANYA_CONTRACT_TEMPLATE_ID
      ? 'БК'
      : 'ГБ';
  const contractPeriod = templateId === PDFME_BANYA_CONTRACT_TEMPLATE_ID
    ? `в банном комплексе ${common.date_in_short}`
    : `в период с ${common.date_in_short} по ${common.date_out_short}`;
  const fullContractNumber = `${contractPrefix}${contractNumberBody}`;

  return {
    ...common,
    contract_number: contractNumberBody,
    invoice_number: contractNumberBody,
    sign_date: contractSignDate,
    invoice_header: `Счёт №${fullContractNumber} от ${common.doc_date}`,
    act_header: `Акт №${fullContractNumber} от ${formatDate(contractData.dateOut)}`,
    contract_header: `ДОГОВОР №${fullContractNumber}`,
    contract_period: contractPeriod,
    addendum_reference: `к Договору оказания услуг по размещению №${fullContractNumber} от ${contractSignDate}`,
    addendum_checkout_date: common.date_out_short,
    client_name_short: clientShortName,

    cc_client_name_full_page2: common.client_name,
    cc_client_sign_name: clientShortName,
    cc_addendum_date: contractSignDate,
    cc_addendum_checkin_client_sign: clientShortName,
    cc_addendum_checkout_client_sign: clientShortName,
    cc_addendum_checkout_date: common.date_out_short,
    cc_addendum_final_client_label: `${common.client_name}:`,
    cc_addendum_final_client_sign: clientShortName,
    cc_addendum_final_date: common.date_out_short,
  };
}
function applySchemaGeneratedInputs(template: Template, input: Record<string, unknown>) {
  const schemas = (template.schemas ?? []).flat() as Array<Record<string, unknown>>;
  for (const schema of schemas) {
    if (typeof schema.name !== 'string') continue;

    if (schema.type === 'multiVariableText') {
      const variables = Array.isArray(schema.variables) ? schema.variables : [];
      const variableValues = variables.reduce<Record<string, string>>((acc, variableName) => {
        if (typeof variableName === 'string') {
          acc[variableName] = String(input[variableName] ?? '');
        }
        return acc;
      }, {});

      input[schema.name] = JSON.stringify(variableValues);
      continue;
    }

    if (['image', 'signature', 'svg'].includes(String(schema.type)) && input[schema.name] === undefined) {
      input[schema.name] = typeof schema.content === 'string' ? schema.content : '';
      continue;
    }

    if (['qrcode', 'pdf417'].includes(String(schema.type)) && input[schema.name] === undefined) {
      input[schema.name] = typeof schema.content === 'string' ? schema.content : '';
      continue;
    }

    if (input[schema.name] === undefined) {
      const valueKey = getPdfmeSchemaValueKey(schema);
      if (valueKey && valueKey !== schema.name) {
        input[schema.name] = input[valueKey] ?? '';
      }
    }
  }

  return input;
}

export async function generatePdfmeInvoiceBlob(contractData: ContractData): Promise<Blob> {
  const org = await loadOrganization();
  return generatePdfmeBlob(PDFME_INVOICE_TEMPLATE_ID, buildPdfmeInput(contractData, org));
}

export async function generateGiftCertificateBlob(input: GiftCertificateInput): Promise<Blob> {
  return generatePdfmeBlob(PDFME_GIFT_CERTIFICATE_TEMPLATE_ID, {
    certificate_amount: input.amount,
    certificate_issue_date: input.issueDate,
    certificate_number: input.number,
  });
}

export async function generatePdfmeContractBlob(
  contractData: ContractData,
  mode: PdfmeContractGenerationMode = 'send',
): Promise<Blob> {
  const org = await loadOrganization();
  const templateId = resolveContractTemplateId(contractData);
  return generatePdfmeBlob(templateId, buildPdfmeContractInput(contractData, org, templateId), mode);
}

export async function ensureDefaultPdfmeInvoiceTemplate() {
  return ensureDefaultPdfmeTemplate(PDFME_INVOICE_TEMPLATE_ID);
}

export async function ensureDefaultPdfmeContractTemplate() {
  return ensureDefaultPdfmeTemplate(PDFME_CC_CONTRACT_TEMPLATE_ID);
}

async function generatePdfmeBlob(
  templateId: PdfmeTemplateId,
  input: Record<string, unknown>,
  contractMode: PdfmeContractGenerationMode = 'send',
): Promise<Blob> {
  const loadedTemplate = await loadPdfmeTemplate(templateId);
  const template = await hydratePdfmeStaticAssetsInTemplate(
    templateId === PDFME_CC_CONTRACT_TEMPLATE_ID
      || templateId === PDFME_GB_CONTRACT_TEMPLATE_ID
      || templateId === PDFME_BANYA_CONTRACT_TEMPLATE_ID
      ? createContractOutputTemplate(loadedTemplate, templateId, contractMode)
      : loadedTemplate,
  );
  const inputs = [applySchemaGeneratedInputs(template, input)];
  const font = await getPdfmeFont();

  const pdf = await generate({
    template,
    inputs,
    plugins: pdfmePlugins,
    options: { font },
  });

  return new Blob([pdf], { type: 'application/pdf' });
}

export async function ensureDefaultPdfmeTemplate(templateId: PdfmeTemplateId) {
  const saved = await pdfTemplateApi.get<Template>(templateId);
  if (saved?.template?.schemas) return saved;

  const definition = getPdfmeTemplateDefinition(templateId);

  return pdfTemplateApi.save(templateId, createDefaultTemplateForId(templateId), {
    id: templateId,
    uploadedAt: new Date().toISOString(),
    fileName: definition?.fileName || 'PDFMe template',
    uploadedBy: 'pdfme-default',
  });
}
