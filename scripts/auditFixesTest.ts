import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { Template } from '@pdfme/common';
import { validateBookingPeriod } from '../src/utils/bookingValidation.ts';
import { bookingOverlapsDateRange, clientMatchesSearch, contractMatchesSearch, toIsoDateFilter } from '../src/utils/listFilters.ts';
import { createPdfmeVariableFieldName, getPdfmeSchemaValueKey } from '../src/utils/pdfmeFieldNames.ts';
import {
  PDFME_CC_CONTRACT_TEMPLATE_ID,
  PDFME_GB_CONTRACT_TEMPLATE_ID,
  PDFME_INVOICE_TEMPLATE_ID,
  PDFME_TEMPLATE_DEFINITIONS,
  getPdfmeTemplateDefinition,
} from '../src/utils/pdfmeTemplateIds.ts';
import { buildPdfmeContractInput, buildPdfmeInput } from '../src/utils/pdfmeDocumentGenerator.ts';
import { formatDate } from '../src/utils/documentHelpers.ts';
import {
  buildBoldVariableTextRuns,
  createDefaultChungaChangaContractPdfmeTemplate,
  createDefaultGolubayaBukhtaContractPdfmeTemplate,
  createDefaultInvoicePdfmeTemplate,
  ensureChungaChangaPackagePdfmeTemplate,
  ensureGolubayaBukhtaPackagePdfmeTemplate,
  ensureInvoiceActPage,
  getPdfmeFont,
  normalizePdfmeTemplateFonts,
  pdfmePlugins,
} from '../src/utils/pdfmeTemplates.ts';
import { getPdfmePreviewData, pdfmeTestData } from '../src/utils/pdfmeTestData.ts';
import {
  extractContractNumberSequence,
  formatContractNumber,
  getContractNumberPrefix,
  getNextContractNumberValue,
  resolveContractNumberCategory,
} from '../src/utils/contractNumbers.ts';
import { getEmailResponseError } from '../src/services/emailService.ts';
import { buildClientContractHistory } from '../src/utils/clientHistory.ts';
import { prepareContractDataFromContract } from '../src/utils/contractDocumentData.ts';
import { phoneMatchesSearch } from '../src/utils/phoneSearch.ts';
import { BookingConflictError, localDb } from '../server/localDatabase.ts';
import { backupService } from '../server/backupService.ts';
import { ValidationError, contractSchema, validate } from '../server/validation.ts';
import type { Client, Contract, ContractData } from '../src/types.ts';

const physicalClient: Client = {
  id: 'client-1',
  type: 'physical',
  firstName: 'Ivan',
  lastName: 'Petrov',
  middleName: 'Ivanovich',
  phone: '+7 (911) 316-46-09',
  email: 'ivan@example.com',
  passportSeries: '5112',
  passportNumber: '345678',
  passportIssuedBy: 'UFMS',
  passportIssueDate: '2020-01-01',
  registrationAddress: 'Murmansk',
  isBlacklisted: false,
  createdAt: '2026-04-20T00:00:00.000Z',
};

const contract: Contract = {
  id: 'contract-1',
  number: 'FB207911',
  clientId: physicalClient.id,
  baseType: 'chunga-changa',
  status: 'pre_booking',
  totalAmount: 0,
  prepayment: 0,
  remainder: 0,
  createdAt: '2026-04-20T00:00:00.000Z',
  dateSigned: '2026-04-20',
  bookings: [{
    id: 'booking-1',
    contractId: 'contract-1',
    objectId: 'cc-1',
    baseType: 'chunga-changa',
    startTime: '2026-04-21T14:00:00',
    endTime: '2026-04-23T12:00:00',
    type: 'main',
    price: 0,
  }],
};

assert.throws(
  () => validate(contractSchema, {
    ...contract,
    totalAmount: 10000,
    prepayment: 12000,
    remainder: 0,
  }),
  (error) => error instanceof ValidationError && /Предоплата/.test(error.message),
);

assert.throws(
  () => validate(contractSchema, {
    ...contract,
    totalAmount: 10000,
    prepayment: 3000,
    remainder: 1000,
  }),
  (error) => error instanceof ValidationError && /Остаток/.test(error.message),
);

assert.equal(clientMatchesSearch(physicalClient, '3164609'), true);
assert.equal(clientMatchesSearch(physicalClient, '8911'), true);
assert.equal(clientMatchesSearch(physicalClient, '8 911 316'), true);
assert.equal(phoneMatchesSearch('+7 (911) 316-46-09', '8911'), true);
assert.equal(phoneMatchesSearch('+7 (911) 316-46-09', '8 911 316'), true);
assert.equal(phoneMatchesSearch('+7 (911) 316-46-09', '911316'), true);
assert.equal(phoneMatchesSearch('8 911 316 46 09', '+7 911'), true);
assert.equal(phoneMatchesSearch('+7 (911) 316-46-09', '900'), false);
{
  const quickActionContractData = prepareContractDataFromContract(contract, physicalClient);
  assert.equal(quickActionContractData.contractNumber, 'FB207911');
  assert.equal(quickActionContractData.signDate, '2026-04-20');
  assert.equal(quickActionContractData.dateIn, '21.04.2026');
  assert.equal(quickActionContractData.timeIn, '14:00');
  assert.equal(quickActionContractData.dateOut, '23.04.2026');
  assert.equal(quickActionContractData.timeOut, '12:00');
  assert.equal(quickActionContractData.nights, 2);
  assert.equal(quickActionContractData.client.fullName, 'Petrov Ivan Ivanovich');
  assert.equal(quickActionContractData.client.passport, '5112 345678');
}

{
  const makeHistoryContract = (
    id: string,
    status: Contract['status'],
    startTime: string,
    totalAmount = 10000,
  ): Contract => ({
    id,
    number: id,
    clientId: physicalClient.id,
    baseType: 'golubaya-bukhta',
    status,
    totalAmount,
    prepayment: 0,
    remainder: totalAmount,
    createdAt: startTime,
    dateSigned: startTime.slice(0, 10),
    bookings: [{
      id: `${id}-booking`,
      contractId: id,
      objectId: 'gb-2',
      baseType: 'golubaya-bukhta',
      startTime,
      endTime: startTime.replace('14:00:00', '12:00:00'),
      type: 'main',
      price: totalAmount,
    }],
  });

  const history = buildClientContractHistory([
    makeHistoryContract('contract-paid-1', 'paid', '2026-04-01T14:00:00'),
    makeHistoryContract('contract-paid-2', 'paid', '2026-04-02T14:00:00'),
    makeHistoryContract('contract-paid-3', 'paid', '2026-04-03T14:00:00'),
    makeHistoryContract('contract-paid-4', 'paid', '2026-04-04T14:00:00'),
    makeHistoryContract('contract-partial-5', 'partial_paid', '2026-04-05T14:00:00'),
    makeHistoryContract('contract-cancelled', 'cancelled', '2026-04-06T14:00:00'),
    makeHistoryContract('other-client', 'paid', '2026-04-07T14:00:00'),
  ].map(item => item.id === 'other-client' ? { ...item, clientId: 'other-client' } : item), physicalClient.id);

  assert.equal(history.totalContracts, 6);
  assert.equal(history.activeBookingCount, 5);
  assert.equal(history.hasLoyaltyHint, true);
  assert.equal(history.items[0].status, 'cancelled');
  assert.equal(history.items.some(item => item.contractId === 'other-client'), false);
}

{
  const fetchedUrls: string[] = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    fetchedUrls.push(String(input));
    return {
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    } as Response;
  }) as typeof fetch;

  try {
    const font = await getPdfmeFont();
    assert.ok(font.angry, 'PDFMe font list should include angry');
    assert.equal(font.angry.fallback, false);
    assert.ok(fetchedUrls.includes('/fonts/ANGRY.OTF'), 'PDFMe should load angry from public fonts');
  } finally {
    globalThis.fetch = previousFetch;
  }
}
assert.equal(clientMatchesSearch(physicalClient, '5112 345678'), true);
assert.equal(clientMatchesSearch(physicalClient, 'ivan@example.com'), true);
assert.equal(contractMatchesSearch(contract, physicalClient, '9113164609'), true);
assert.equal(contractMatchesSearch(contract, physicalClient, 'FB207911'), true);

assert.equal(toIsoDateFilter('20.04.2026'), '2026-04-20');
assert.equal(toIsoDateFilter('99.99.9999'), '');
assert.equal(bookingOverlapsDateRange(contract.bookings[0], '21.04.2026', '22.04.2026'), true);
assert.equal(bookingOverlapsDateRange(contract.bookings[0], '99.99.9999', ''), false);

assert.deepEqual(validateBookingPeriod({
  isGBCottage: false,
  isCC: true,
  startDate: '2026-04-21',
  endDate: '2026-04-21',
  startTime: '',
  endTime: '13:00',
}).ok, false);

assert.deepEqual(validateBookingPeriod({
  isGBCottage: false,
  isCC: true,
  startDate: '2026-04-21',
  endDate: '2026-04-21',
  startTime: '10:00',
  endTime: '12:00',
}).ok, false);

const cottagePeriod = validateBookingPeriod({
  isGBCottage: true,
  isCC: false,
  startDate: '2026-04-21',
  endDate: '2026-04-22',
  startTime: '',
  endTime: '',
});
assert.equal(cottagePeriod.ok, true);
if (cottagePeriod.ok) {
  assert.equal(cottagePeriod.startDateTime, '2026-04-21T14:00:00');
  assert.equal(cottagePeriod.endDateTime, '2026-04-22T12:00:00');
}

assert.equal(createPdfmeVariableFieldName([{ name: 'client_name' }], 'client_name'), 'client_name__copy_2');
assert.equal(getPdfmeSchemaValueKey({ name: 'client_name__copy_2', crmVariable: 'client_name' }), 'client_name');
assert.equal(getContractNumberPrefix('cc'), '\u0427\u0427');
assert.equal(getContractNumberPrefix('gb'), '\u0413\u0411');
assert.equal(getContractNumberPrefix('bath'), '\u0411');
assert.equal(getContractNumberPrefix('furako'), '\u0424');
assert.equal(extractContractNumberSequence('\u0427\u0427112'), 112);
assert.equal(extractContractNumberSequence('\u0413\u0411-2024-001'), 1);
assert.equal(formatContractNumber('bath', 12), '\u041112');
assert.equal(getNextContractNumberValue(['1', '\u0427\u04272', '\u0427\u042710'], 'cc'), '\u0427\u042711');
assert.equal(getNextContractNumberValue(['\u0413\u04117', '\u0413\u0411112'], 'gb'), '\u0413\u0411113');
assert.equal(getNextContractNumberValue(['\u04113', '\u04114'], 'bath'), '\u04115');
assert.equal(getNextContractNumberValue(['\u04248'], 'furako'), '\u04249');
assert.equal(resolveContractNumberCategory({ baseType: 'chunga-changa' }), 'cc');
assert.equal(resolveContractNumberCategory({ baseType: 'golubaya-bukhta', hasMainBooking: true }), 'gb');
assert.equal(resolveContractNumberCategory({ baseType: 'golubaya-bukhta', hasBath: true }), 'bath');
assert.equal(resolveContractNumberCategory({ baseType: 'golubaya-bukhta', hasFurako: true }), 'furako');
assert.equal(resolveContractNumberCategory({ baseType: 'golubaya-bukhta', prefilledObjectId: 'gb-bath' }), 'bath');
assert.equal(resolveContractNumberCategory({ baseType: 'golubaya-bukhta', prefilledObjectId: 'gb-furako' }), 'furako');

assert.equal(getPdfmeTemplateDefinition(PDFME_CC_CONTRACT_TEMPLATE_ID)?.documentType, 'contract');
assert.equal(getPdfmeTemplateDefinition(PDFME_GB_CONTRACT_TEMPLATE_ID)?.documentType, 'contract');
assert.equal(getPdfmeTemplateDefinition(PDFME_INVOICE_TEMPLATE_ID)?.documentType, 'invoice');
assert.match(String(getPdfmeTemplateDefinition(PDFME_INVOICE_TEMPLATE_ID)?.fileName || ''), /^PDFMe /);
assert.equal(new Set(PDFME_TEMPLATE_DEFINITIONS.map(definition => definition.id)).size, PDFME_TEMPLATE_DEFINITIONS.length);

const ccContractTemplate = createDefaultChungaChangaContractPdfmeTemplate();
assert.equal(ccContractTemplate.schemas.length, 6);
const ccContractPage1 = new Map((ccContractTemplate.schemas[0] as Array<Record<string, unknown>>).map(schema => [String(schema.name), schema]));
const ccContractPage2 = new Map((ccContractTemplate.schemas[1] as Array<Record<string, unknown>>).map(schema => [String(schema.name), schema]));
const ccContractPage3 = new Map((ccContractTemplate.schemas[2] as Array<Record<string, unknown>>).map(schema => [String(schema.name), schema]));
const ccContractPage4 = new Map((ccContractTemplate.schemas[3] as Array<Record<string, unknown>>).map(schema => [String(schema.name), schema]));
const ccContractPage5 = new Map((ccContractTemplate.schemas[4] as Array<Record<string, unknown>>).map(schema => [String(schema.name), schema]));
const ccContractPage6 = new Map((ccContractTemplate.schemas[5] as Array<Record<string, unknown>>).map(schema => [String(schema.name), schema]));
const ccPackageInvoiceHeaderSchema = ccContractPage5.get('invoice_header') as Record<string, any>;
const ccPackageActHeaderSchema = ccContractPage6.get('act_header') as Record<string, any>;
const ccContractSubtitleSchema = ccContractPage1.get('cc_contract_subtitle') as Record<string, any>;
const ccClientIntroSchema = ccContractPage1.get('cc_client_intro') as Record<string, any>;
const ccSection1TitleSchema = ccContractPage1.get('cc_section_1_title') as Record<string, any>;
const ccSection1BodySchema = ccContractPage1.get('cc_section_1_body') as Record<string, any>;
const ccSection2TitleSchema = ccContractPage1.get('cc_section_2_title') as Record<string, any>;
const ccSection2BodySchema = ccContractPage1.get('cc_section_2_body') as Record<string, any>;
const ccSection3TitleSchema = ccContractPage1.get('cc_section_3_title') as Record<string, any>;
const ccSection3BodySchema = ccContractPage1.get('cc_section_3_body') as Record<string, any>;
const ccAddendumIntroSchema = ccContractPage3.get('cc_addendum_intro') as Record<string, any>;
const ccSection3TailSchema = ccContractPage2.get('cc_section_3_tail') as Record<string, any>;
const ccSection4BodySchema = ccContractPage2.get('cc_section_4_body') as Record<string, any>;
const ccSection4TitleSchema = ccContractPage2.get('cc_section_4_title') as Record<string, any>;
const ccSection5TitleSchema = ccContractPage2.get('cc_section_5_title') as Record<string, any>;
const ccSection6TitleSchema = ccContractPage2.get('cc_section_6_title') as Record<string, any>;
const ccExecutorPartyTitleSchema = ccContractPage2.get('cc_executor_party_title') as Record<string, any>;
const ccExecutorRequisitesSchema = ccContractPage2.get('cc_executor_requisites') as Record<string, any>;
const ccClientPartyTitleSchema = ccContractPage2.get('cc_client_party_title') as Record<string, any>;
const ccClientRequisitesSchema = ccContractPage2.get('cc_client_requisites') as Record<string, any>;
const ccExecutorSignatureImageSchema = ccContractPage2.get('cc_executor_signature_image') as Record<string, any>;
const ccCompanyStampImageSchema = ccContractPage2.get('cc_company_stamp_image') as Record<string, any>;
const ccExecutorSignLineSchema = ccContractPage2.get('cc_executor_sign_line') as Record<string, any>;
const ccExecutorSignNameSchema = ccContractPage2.get('cc_executor_sign_name') as Record<string, any>;
const ccClientSignLineSchema = ccContractPage2.get('cc_client_sign_line') as Record<string, any>;
const ccClientSignNameSchema = ccContractPage2.get('cc_client_sign_name') as Record<string, any>;
const ccAddendumSection4Schema = ccContractPage3.get('cc_addendum_section_4') as Record<string, any>;
const ccAddendumCheckinTitleSchema = ccContractPage3.get('cc_addendum_checkin_title') as Record<string, any>;
const ccAddendumSection6BodySchema = ccContractPage4.get('cc_addendum_section_6_body') as Record<string, any>;
const ccAddendumFinalSignaturesTitleSchema = ccContractPage4.get('cc_addendum_final_signatures_title') as Record<string, any>;
const gbContractTemplate = createDefaultGolubayaBukhtaContractPdfmeTemplate();
assert.equal(gbContractTemplate.schemas.length, 4);
const gbContractPage1 = new Map((gbContractTemplate.schemas[0] as Array<Record<string, unknown>>).map(schema => [String(schema.name), schema]));
const gbContractPage3 = new Map((gbContractTemplate.schemas[2] as Array<Record<string, unknown>>).map(schema => [String(schema.name), schema]));
const gbContractPage4 = new Map((gbContractTemplate.schemas[3] as Array<Record<string, unknown>>).map(schema => [String(schema.name), schema]));
const gbContractHeaderSchema = gbContractPage1.get('cc_contract_header') as Record<string, any>;
const gbSection1BodySchema = gbContractPage1.get('cc_section_1_body') as Record<string, any>;
assert.equal(gbContractPage3.has('invoice_header'), true);
assert.equal(gbContractPage4.has('act_header'), true);
assert.match(String(gbContractHeaderSchema.text || ''), /ГБ\{contract_number\}/);
assert.match(String(gbSection1BodySchema.text || ''), /1\.2\.[\s\S]*\{cottage_number\}/);
assert.match(String(gbSection1BodySchema.text || ''), /1\.3\.[\s\S]*\{nights_label\}/);
assert.ok(
  Array.isArray(gbSection1BodySchema.variables) && gbSection1BodySchema.variables.includes('nights_label'),
  'GB section 1 must use the rendered hotel-day label instead of raw night count',
);
const schemaGap = (before: Record<string, any>, after: Record<string, any>) =>
  Number(after.position.y) - (Number(before.position.y) + Number(before.height || 0));
const pageArray = (page: unknown) => page as Array<Record<string, any>>;
const schemaIndex = (page: Array<Record<string, any>>, name: string) =>
  page.findIndex(schema => String(schema.name) === name);
const assertImageSize = (schema: Record<string, any>, width: number, height: number, label: string) => {
  assert.equal(schema.width, width, `${label} width`);
  assert.equal(schema.height, height, `${label} height`);
};
const assertDrawOrder = (page: Array<Record<string, any>>, lowerName: string, upperName: string) => {
  const lowerIndex = schemaIndex(page, lowerName);
  const upperIndex = schemaIndex(page, upperName);
  assert.ok(lowerIndex >= 0, `${lowerName} should exist`);
  assert.ok(upperIndex >= 0, `${upperName} should exist`);
  assert.ok(lowerIndex < upperIndex, `${upperName} should be drawn above ${lowerName}`);
};
const assertStampOnTopLayer = (page: Array<Record<string, any>>, stampName: string) => {
  const stampIndex = schemaIndex(page, stampName);
  assert.ok(stampIndex >= 0, `${stampName} should exist`);
  assert.equal(stampIndex, page.length - 1, `${stampName} should be the top layer on its page`);
};
const assertSectionRhythm = (
  previousBody: Record<string, any>,
  title: Record<string, any>,
  body: Record<string, any>,
  label: string,
) => {
  const beforeTitleGap = schemaGap(previousBody, title);
  const afterTitleGap = schemaGap(title, body);

  assert.ok(beforeTitleGap >= 8, `${label} should have enough air above the section title`);
  assert.ok(beforeTitleGap <= 12, `${label} should not leave a large hole above the section title`);
  assert.ok(afterTitleGap <= 2, `${label} title should sit close to its own body`);
  assert.ok(beforeTitleGap >= afterTitleGap + 7, `${label} title should belong visually to its own body`);
};
assert.equal(ccContractPage1.has('cc_contract_header'), true);
assert.equal(ccContractPage1.has('cc_contract_subtitle'), true);
assert.equal(ccContractPage1.has('cc_contract_subheader'), false);
assert.equal(ccContractPage1.has('cc_contract_period'), false);
assert.equal(ccContractPage1.has('cc_client_intro'), true);
assert.equal(ccContractPage1.has('cc_section_1_body'), true);
assert.equal(ccContractPage1.has('cc_section_1_1'), false);
assert.equal(ccContractPage1.has('cc_section_1_2'), false);
assert.equal(ccContractPage1.has('cc_section_1_3'), false);
assert.equal(ccContractPage1.has('cc_total_clause'), false);
assert.deepEqual(JSON.parse(String(ccContractPage1.get('cc_contract_header')?.content)), { contract_number: '216067' });
assert.deepEqual(ccContractSubtitleSchema.position, { x: 55, y: 17.2 });
assert.equal(ccContractSubtitleSchema.width, 100);
assert.equal(ccContractSubtitleSchema.height, 10);
assert.equal(ccContractSubtitleSchema.fontSize, 8);
assert.equal(ccContractSubtitleSchema.lineHeight, 1.15);
assert.equal(ccContractSubtitleSchema.alignment, 'center');
assert.equal(String(ccContractSubtitleSchema.text).split('\n').length, 2);
assert.deepEqual(ccContractSubtitleSchema.variables, ['date_in_short', 'date_out_short']);
assert.equal(ccContractSubtitleSchema.boldVariableFontName, 'NotoSerifBold');
assert.deepEqual(ccClientIntroSchema.position, { x: 22, y: 41 });
assert.equal(ccClientIntroSchema.width, 170);
assert.equal(ccClientIntroSchema.boldVariableFontName, 'NotoSerifBold');
for (const schema of [
  ccClientIntroSchema,
  ccSection1BodySchema,
  ccSection2BodySchema,
  ccSection3BodySchema,
]) {
  assert.equal(schema.fontSize, 8);
  assert.equal(schema.lineHeight, 1.15);
}
assert.deepEqual(ccSection1TitleSchema.position, { x: 78, y: 61 });
assert.deepEqual(ccSection1BodySchema.position, { x: 22, y: 67 });
assert.equal(ccSection1BodySchema.width, 170);
assert.equal(ccSection1BodySchema.height, 21);
assert.deepEqual(ccSection1BodySchema.variables, [
  'cottage_number',
  'time_in',
  'date_in_short',
  'time_out',
  'date_out_short',
  'prepayment',
  'prepayment_words',
  'total',
  'total_words',
]);
assert.equal(ccSection1BodySchema.boldVariableFontName, 'NotoSerifBold');
assert.equal(String(ccSection1BodySchema.text).split('\n').length, 4);
assert.deepEqual(ccSection2TitleSchema.position, { x: 70, y: 96 });
assert.deepEqual(ccSection2BodySchema.position, { x: 22, y: 102 });
assert.equal(ccSection2BodySchema.width, 170);
assert.equal(ccSection2BodySchema.height, 96);
assert.deepEqual(ccSection3TitleSchema.position, { x: 70, y: 208 });
assert.deepEqual(ccSection3BodySchema.position, { x: 22, y: 214 });
assert.equal(ccSection3BodySchema.width, 170);
assert.equal(ccSection3BodySchema.boldVariableFontName, 'NotoSerifBold');
assert.equal(ccSection3BodySchema.height, 74);
assert.ok(String(ccSection3BodySchema.text).includes('3.11.'), 'Page 1 should keep clauses 3.1-3.11 together');
assertSectionRhythm(ccClientIntroSchema, ccSection1TitleSchema, ccSection1BodySchema, 'section 1');
assertSectionRhythm(ccSection1BodySchema, ccSection2TitleSchema, ccSection2BodySchema, 'section 2');
assertSectionRhythm(ccSection2BodySchema, ccSection3TitleSchema, ccSection3BodySchema, 'section 3');
const legacyCcTemplate = ensureChungaChangaPackagePdfmeTemplate({
  basePdf: { width: 210, height: 297, padding: [5, 15, 5, 20] },
  schemas: [[
    { name: 'cc_contract_subheader', type: 'text', content: 'legacy subtitle', position: { x: 64, y: 14 }, width: 82, height: 5 },
    {
      name: 'cc_contract_period',
      type: 'multiVariableText',
      text: 'legacy period {date_in_short} {date_out_short}',
      variables: ['date_in_short', 'date_out_short'],
      content: '{}',
      position: { x: 55, y: 19 },
      width: 100,
      height: 6,
    },
    {
      name: 'cc_section_1_1',
      type: 'multiVariableText',
      text: '1.1 legacy {cottage_number}',
      variables: ['cottage_number'],
      content: '{}',
      position: { x: 18, y: 66 },
      width: 177,
      height: 11,
    },
    { name: 'cc_section_1_2', type: 'text', content: '1.2. legacy', position: { x: 18, y: 79 }, width: 177, height: 5 },
    {
      name: 'cc_section_1_3',
      type: 'multiVariableText',
      text: '1.3. legacy {time_in} {date_in_short} {time_out} {date_out_short}',
      variables: ['time_in', 'date_in_short', 'time_out', 'date_out_short'],
      content: '{}',
      position: { x: 18, y: 84 },
      width: 177,
      height: 5,
    },
    {
      name: 'cc_total_clause',
      type: 'multiVariableText',
      text: '1.4. legacy {prepayment} {prepayment_words} {total} {total_words}',
      variables: ['prepayment', 'prepayment_words', 'total', 'total_words'],
      content: '{}',
      position: { x: 18, y: 89 },
      width: 177,
      height: 8,
    },
  ]],
} as Template);
const legacyCcPage1 = new Map((legacyCcTemplate.schemas[0] as Array<Record<string, unknown>>).map(schema => [String(schema.name), schema]));
assert.equal(legacyCcPage1.has('cc_contract_subtitle'), true);
assert.equal(legacyCcPage1.has('cc_contract_subheader'), false);
assert.equal(legacyCcPage1.has('cc_contract_period'), false);
assert.equal(String(legacyCcPage1.get('cc_contract_subtitle')?.text).split('\n').length, 2);
assert.equal(legacyCcPage1.has('cc_section_1_body'), true);
assert.equal(legacyCcPage1.has('cc_section_1_1'), false);
assert.equal(legacyCcPage1.has('cc_section_1_2'), false);
assert.equal(legacyCcPage1.has('cc_section_1_3'), false);
assert.equal(legacyCcPage1.has('cc_total_clause'), false);
assert.equal(String(legacyCcPage1.get('cc_section_1_body')?.text).split('\n').length, 4);
assert.deepEqual((legacyCcPage1.get('cc_section_1_body') as Record<string, any>).variables, [
  'cottage_number',
  'time_in',
  'date_in_short',
  'time_out',
  'date_out_short',
  'prepayment',
  'prepayment_words',
  'total',
  'total_words',
]);
const legacyCcRequisitesTemplate = ensureChungaChangaPackagePdfmeTemplate({
  basePdf: { width: 210, height: 297, padding: [5, 15, 5, 20] },
  schemas: [[], [
    { name: 'cc_client_birth_label', type: 'text', content: 'Р”Р°С‚Р° СЂРѕР¶РґРµРЅРёСЏ', position: { x: 118, y: 173 }, width: 24, height: 5 },
    { name: 'client_dob', type: 'text', position: { x: 142, y: 173 }, width: 36, height: 5 },
    { name: 'cc_client_passport_label', type: 'text', content: 'РџР°СЃРїРѕСЂС‚:', position: { x: 118, y: 180 }, width: 24, height: 5 },
    { name: 'client_passport', type: 'text', position: { x: 142, y: 180 }, width: 36, height: 5 },
    { name: 'cc_client_passport_by_label', type: 'text', content: 'Р’С‹РґР°РЅ:', position: { x: 118, y: 187 }, width: 18, height: 5 },
    { name: 'client_passport_by', type: 'text', position: { x: 118, y: 194 }, width: 77, height: 12 },
    { name: 'cc_client_phone_label', type: 'text', content: 'РўРµР»РµС„РѕРЅ:', position: { x: 118, y: 211 }, width: 18, height: 5 },
    { name: 'client_phone', type: 'text', position: { x: 142, y: 211 }, width: 36, height: 5 },
    { name: 'cc_client_email_label', type: 'text', content: 'Р­Р»РµРєС‚СЂРѕРЅРЅР°СЏ РїРѕС‡С‚Р°:', position: { x: 118, y: 218 }, width: 28, height: 5 },
    { name: 'client_email', type: 'text', position: { x: 148, y: 218 }, width: 46, height: 5 },
  ]],
} as Template);
const legacyCcRequisitesPage2 = new Map((legacyCcRequisitesTemplate.schemas[1] as Array<Record<string, unknown>>).map(schema => [String(schema.name), schema]));
assert.equal(legacyCcRequisitesPage2.has('cc_client_requisites'), true);
assert.equal(legacyCcRequisitesPage2.has('client_phone'), false);
const legacyCcPartyTemplate = ensureChungaChangaPackagePdfmeTemplate({
  basePdf: { width: 210, height: 297, padding: [5, 15, 5, 20] },
  schemas: [[], [
    { name: 'cc_client_party_title', type: 'text', content: 'РЎС‚РѕСЂРѕРЅР°-2', position: { x: 145, y: 162 }, width: 30, height: 5 },
    { name: 'cc_client_name_full_page2', type: 'text', position: { x: 125, y: 168 }, width: 70, height: 6 },
  ]],
} as Template);
const legacyCcPartyPage2 = new Map((legacyCcPartyTemplate.schemas[1] as Array<Record<string, unknown>>).map(schema => [String(schema.name), schema]));
const legacyCcClientPartySchema = legacyCcPartyPage2.get('cc_client_party_title') as Record<string, any>;
assert.equal(legacyCcPartyPage2.has('cc_client_name_full_page2'), false);
assert.equal(legacyCcClientPartySchema.type, 'multiVariableText');
assert.equal(legacyCcClientPartySchema.text, 'Сторона-2\n{client_name}');
assert.deepEqual(legacyCcClientPartySchema.variables, ['client_name']);
assert.equal(ccContractPage2.has('cc_section_6_title'), true);
assert.equal(ccContractPage2.has('cc_executor_signature_image'), true);
assert.deepEqual(ccSection3TailSchema.position, { x: 22, y: 10 });
assert.equal(ccSection3TailSchema.width, 170);
assert.equal(ccSection3TailSchema.height, 15);
assert.ok(!String(ccSection3TailSchema.content || ccSection3TailSchema.text).includes('3.9.'), 'Page 2 tail should only contain the last compact clauses');
assert.deepEqual(ccSection4TitleSchema.position, { x: 76, y: 33 });
assert.deepEqual(ccSection4BodySchema.position, { x: 22, y: 39 });
assert.equal(ccSection4BodySchema.height, 42);
assertSectionRhythm(ccSection3TailSchema, ccSection4TitleSchema, ccSection4BodySchema, 'section 4');
assertSectionRhythm(ccSection4BodySchema, ccSection5TitleSchema, ccContractPage2.get('cc_section_5_body') as Record<string, any>, 'section 5');
assert.deepEqual(ccSection5TitleSchema.position, { x: 74, y: 91 });
assert.deepEqual((ccContractPage2.get('cc_section_5_body') as Record<string, any>).position, { x: 22, y: 97 });
assert.equal((ccContractPage2.get('cc_section_5_body') as Record<string, any>).height, 8);
assert.deepEqual(ccSection6TitleSchema.position, { x: 56, y: 115 });
assert.equal(ccSection6TitleSchema.width, 98);
assert.equal(schemaGap(ccContractPage2.get('cc_section_5_body') as Record<string, any>, ccSection6TitleSchema), 10);
assert.equal(schemaGap(ccSection6TitleSchema, ccExecutorPartyTitleSchema), 3);
assert.deepEqual(ccExecutorPartyTitleSchema.position, { x: 22, y: 123 });
assert.equal(ccExecutorPartyTitleSchema.width, 82);
assert.equal(ccExecutorPartyTitleSchema.height, 12);
assert.equal(ccExecutorPartyTitleSchema.type, 'text');
assert.equal(String(ccExecutorPartyTitleSchema.content).split('\n').length, 2);
assert.deepEqual(ccClientPartyTitleSchema.position, { x: 110, y: 123 });
assert.equal(ccClientPartyTitleSchema.width, 82);
assert.equal(ccClientPartyTitleSchema.height, 12);
assert.equal(ccClientPartyTitleSchema.type, 'multiVariableText');
assert.equal(ccClientPartyTitleSchema.text, 'Сторона-2\n{client_name}');
assert.deepEqual(ccClientPartyTitleSchema.variables, ['client_name']);
assert.equal(ccClientPartyTitleSchema.fontName, 'NotoSerifBold');
assert.equal(ccClientPartyTitleSchema.boldVariableFontName, 'NotoSerifBold');
assert.deepEqual(ccExecutorRequisitesSchema.position, { x: 22, y: 136 });
assert.equal(ccExecutorRequisitesSchema.width, 82);
assert.equal(ccExecutorRequisitesSchema.height, 56);
assert.equal(ccExecutorRequisitesSchema.fontSize, 8);
assert.equal(ccExecutorRequisitesSchema.lineHeight, 1.15);
assert.equal(ccContractPage2.has('cc_client_name_full_page2'), false);
assert.deepEqual(ccClientRequisitesSchema.position, { x: 110, y: 136 });
assert.equal(ccClientRequisitesSchema.width, 82);
assert.equal(ccClientRequisitesSchema.height, 44);
assert.equal(ccClientRequisitesSchema.fontSize, 8);
assert.equal(ccClientRequisitesSchema.lineHeight, 1.15);
assert.equal(ccClientRequisitesSchema.boldVariableFontName, 'NotoSerifBold');
assert.equal(String(ccClientRequisitesSchema.text).split('\n').length, 5);
assert.deepEqual(ccClientRequisitesSchema.variables, [
  'client_dob',
  'client_passport',
  'client_passport_by',
  'client_phone',
  'client_email',
]);
for (const oldClientField of [
  'cc_client_name_full_page2',
  'cc_client_birth_label',
  'client_dob',
  'cc_client_passport_label',
  'client_passport',
  'cc_client_passport_by_label',
  'client_passport_by',
  'cc_client_phone_label',
  'client_phone',
  'cc_client_email_label',
  'client_email',
]) {
  assert.equal(ccContractPage2.has(oldClientField), false, `${oldClientField} should be folded into one natural text block`);
}
assert.equal(ccExecutorRequisitesSchema.position.y, ccClientRequisitesSchema.position.y);
assert.ok(ccExecutorRequisitesSchema.position.x >= 22);
assert.deepEqual(ccCompanyStampImageSchema.position, { x: 54.01, y: 226.11 });
assertImageSize(ccCompanyStampImageSchema, 40, 40, 'contract stamp');
assert.deepEqual(ccExecutorSignatureImageSchema.position, { x: 33.76, y: 211.88 });
assertImageSize(ccExecutorSignatureImageSchema, 34, 20, 'contract signature');
assert.equal(ccCompanyStampImageSchema.opacity, 1);
assertDrawOrder(pageArray(ccContractTemplate.schemas[1]), 'cc_executor_sign_line', 'cc_executor_signature_image');
assertDrawOrder(pageArray(ccContractTemplate.schemas[1]), 'cc_executor_signature_image', 'cc_company_stamp_image');
assertDrawOrder(pageArray(ccContractTemplate.schemas[1]), 'cc_executor_sign_line', 'cc_company_stamp_image');
assertDrawOrder(pageArray(ccContractTemplate.schemas[1]), 'cc_client_sign_line', 'cc_company_stamp_image');
assert.deepEqual(ccExecutorSignLineSchema.position, { x: 37, y: 225 });
assert.deepEqual(ccExecutorSignNameSchema.position, { x: 74, y: 220 });
assert.deepEqual(ccClientSignLineSchema.position, { x: 115, y: 224 });
assert.equal(ccClientSignLineSchema.width, 37);
assert.deepEqual(ccClientSignNameSchema.position, { x: 155, y: 220 });
assertStampOnTopLayer(pageArray(ccContractTemplate.schemas[1]), 'cc_company_stamp_image');
const savedRaisedSignaturePositions: Record<string, { x: number; y: number }> = {
  cc_company_stamp_image: { x: 22, y: 190 },
  cc_executor_signature_image: { x: 29, y: 198 },
  cc_executor_sign_line: { x: 44, y: 217 },
  cc_executor_sign_name: { x: 74, y: 213 },
  cc_client_sign_line: { x: 115, y: 217 },
  cc_client_sign_name: { x: 155, y: 213 },
};
const savedRaisedSignatureTemplate = ensureChungaChangaPackagePdfmeTemplate({
  ...ccContractTemplate,
  schemas: [
    ...ccContractTemplate.schemas.slice(0, 1),
    (ccContractTemplate.schemas[1] as Array<Record<string, unknown>>).map(schema => {
      const position = savedRaisedSignaturePositions[String(schema.name)];
      return position ? { ...schema, position } : schema;
    }),
    ...ccContractTemplate.schemas.slice(2),
  ],
} as unknown as Template);
const savedRaisedSignaturePage2 = new Map((savedRaisedSignatureTemplate.schemas[1] as Array<Record<string, any>>).map(schema => [String(schema.name), schema]));
for (const [name, position] of Object.entries(savedRaisedSignaturePositions)) {
  assert.deepEqual(savedRaisedSignaturePage2.get(name)?.position, position, `${name} should preserve saved Designer position`);
}
assertStampOnTopLayer(pageArray(savedRaisedSignatureTemplate.schemas[1]), 'cc_company_stamp_image');
assert.equal(ccContractPage3.has('cc_addendum_header'), true);
assert.equal(ccContractPage3.has('cc_addendum_checkin_client_sign'), true);
assert.deepEqual(ccAddendumIntroSchema.position, { x: 22, y: 36 });
assert.equal(ccAddendumIntroSchema.width, 170);
assert.ok(ccAddendumSection4Schema.height <= 56);
assert.ok(schemaGap(ccAddendumSection4Schema, ccAddendumCheckinTitleSchema) <= 10);
assert.deepEqual(ccAddendumCheckinTitleSchema.position, { x: 24, y: 216 });
assert.equal(ccContractPage4.has('cc_addendum_final_client_label'), true);
assert.equal(ccContractPage4.has('cc_addendum_final_date'), true);
assert.ok(schemaGap(ccAddendumSection6BodySchema, ccAddendumFinalSignaturesTitleSchema) <= 8);
assert.deepEqual(ccAddendumFinalSignaturesTitleSchema.position, { x: 24, y: 42 });
assert.deepEqual((ccContractPage4.get('cc_addendum_final_exec_sign') as Record<string, any>).position, { x: 54.26, y: 65.26 });
assert.deepEqual((ccContractPage4.get('cc_addendum_final_client_sign') as Record<string, any>).position, { x: 143, y: 65 });
assert.equal(ccContractPage5.has('invoice_header'), true);
assert.equal(ccContractPage5.has('service_table_top'), true);
assert.equal(ccContractPage6.has('act_header'), true);
assert.equal(ccContractPage6.has('act_service_table_top'), true);
for (const schema of [
  ccContractPage2.get('cc_company_stamp_image'),
  ccContractPage5.get('company_static_stamp'),
  ccContractPage6.get('act_company_static_stamp'),
] as Array<Record<string, any>>) {
  assertImageSize(schema, 40, 40, `${schema.name} stamp`);
  assert.equal(schema.opacity, 1, `${schema.name} stamp should be fully opaque`);
}
for (const schema of [
  ccContractPage2.get('cc_executor_signature_image'),
  ccContractPage5.get('director_static_signature'),
  ccContractPage5.get('accountant_static_signature'),
  ccContractPage6.get('act_director_static_signature'),
] as Array<Record<string, any>>) {
  assertImageSize(schema, 34, 20, `${schema.name} signature`);
}
assertStampOnTopLayer(pageArray(ccContractTemplate.schemas[4]), 'company_static_stamp');
assertStampOnTopLayer(pageArray(ccContractTemplate.schemas[5]), 'act_company_static_stamp');
assertDrawOrder(pageArray(ccContractTemplate.schemas[4]), 'director_static_line', 'director_static_signature');
assertDrawOrder(pageArray(ccContractTemplate.schemas[4]), 'accountant_static_line', 'accountant_static_signature');
assertDrawOrder(pageArray(ccContractTemplate.schemas[4]), 'director_static_signature', 'company_static_stamp');
assertDrawOrder(pageArray(ccContractTemplate.schemas[4]), 'director_static_line', 'company_static_stamp');
assertDrawOrder(pageArray(ccContractTemplate.schemas[5]), 'act_director_line', 'act_director_static_signature');
assertDrawOrder(pageArray(ccContractTemplate.schemas[5]), 'act_director_static_signature', 'act_company_static_stamp');
assertDrawOrder(pageArray(ccContractTemplate.schemas[5]), 'act_director_line', 'act_company_static_stamp');
assertDrawOrder(pageArray(ccContractTemplate.schemas[5]), 'act_customer_line', 'act_company_static_stamp');
const savedMismatchedMediaTemplate = ensureChungaChangaPackagePdfmeTemplate({
  ...ccContractTemplate,
  schemas: ccContractTemplate.schemas.map((page, pageIndex) => {
    if (![1, 4, 5].includes(pageIndex)) return page;
    const schemas = pageArray(page).map(schema => {
      if (String(schema.name).includes('stamp')) {
        return { ...schema, width: 22, height: 22 };
      }
      if (String(schema.name).includes('signature')) {
        return { ...schema, width: 28, height: 14 };
      }
      return schema;
    });
    const stamp = schemas.find(schema => String(schema.name).includes('stamp'));
    return stamp ? [stamp, ...schemas.filter(schema => schema !== stamp)] : schemas;
  }),
} as unknown as Template);
for (const page of [1, 4, 5]) {
  const stamp = pageArray(savedMismatchedMediaTemplate.schemas[page]).find(schema => String(schema.name).includes('stamp')) as Record<string, any>;
  assertImageSize(stamp, 40, 40, `${stamp.name} saved stamp`);
  assertStampOnTopLayer(pageArray(savedMismatchedMediaTemplate.schemas[page]), String(stamp.name));
}
for (const page of [1, 4, 5]) {
  for (const schema of pageArray(savedMismatchedMediaTemplate.schemas[page])) {
    if (String(schema.name).includes('signature')) {
      assertImageSize(schema, 34, 20, `${schema.name} saved signature`);
    }
  }
}
for (const page of ccContractTemplate.schemas.slice(0, 4) as Array<Array<Record<string, any>>>) {
  for (const schema of page) {
    if (schema.type === 'multiVariableText' && Array.isArray(schema.variables) && schema.variables.length > 0) {
      assert.equal(schema.boldVariableFontName, 'NotoSerifBold', `${schema.name} should render CRM values in bold`);
    }
  }
}
for (const page of ccContractTemplate.schemas.slice(0, 4) as Array<Array<Record<string, any>>>) {
  for (const schema of page) {
    if (schema.type === 'text' && !schema.readOnly && typeof schema.content !== 'string') {
      assert.equal(schema.fontName, 'NotoSerifBold', `${schema.name} should show inserted CRM data in bold`);
    }
  }
}
for (const [pageIndex, page] of (ccContractTemplate.schemas.slice(0, 4) as Array<Array<Record<string, any>>>).entries()) {
  for (const schema of page) {
    if (schema.type === 'text' || schema.type === 'multiVariableText') {
      assert.equal(schema.fontSize, 8, `Page ${pageIndex + 1} schema ${schema.name} should use contract font size 8`);
      assert.equal(schema.lineHeight, 1.15, `Page ${pageIndex + 1} schema ${schema.name} should use contract line height 1.15`);
    }
  }
}
assert.equal(ccPackageInvoiceHeaderSchema.fontSize, 10.4, 'Package invoice page should keep invoice font size');
assert.equal(ccPackageActHeaderSchema.fontSize, 11, 'Package act page should keep act font size');
assert.deepEqual(
  buildBoldVariableTextRuns('РђСЂРµРЅРґР° СЃ {date_in_short} РїРѕ {date_out_short} РґР»СЏ {client_name}', JSON.stringify({
    date_in_short: '25.04.2026',
    date_out_short: '26.04.2026',
    client_name: 'Р’РµР»РёРєР°СЏ Р’РёРєС‚РѕСЂРёСЏ',
  })),
  [
    { text: 'РђСЂРµРЅРґР° СЃ ', bold: false },
    { text: '25.04.2026', bold: true },
    { text: ' РїРѕ ', bold: false },
    { text: '26.04.2026', bold: true },
    { text: ' РґР»СЏ ', bold: false },
    { text: 'Р’РµР»РёРєР°СЏ Р’РёРєС‚РѕСЂРёСЏ', bold: true },
  ],
);
assert.notEqual(
  pdfmePlugins['Multi-Variable Text'].pdf,
  undefined,
  'Custom Multi-Variable Text plugin must render inline CRM values in bold in generated PDF',
);

const ccContractPage1Schemas = ccContractTemplate.schemas[0] as Array<Record<string, any>>;
for (const [index, firstSchema] of ccContractPage1Schemas.entries()) {
  if (!firstSchema.position || typeof firstSchema.width !== 'number' || typeof firstSchema.height !== 'number') continue;
  for (const secondSchema of ccContractPage1Schemas.slice(index + 1)) {
    if (!secondSchema.position || typeof secondSchema.width !== 'number' || typeof secondSchema.height !== 'number') continue;
    const xOverlap = Math.max(
      0,
      Math.min(firstSchema.position.x + firstSchema.width, secondSchema.position.x + secondSchema.width)
        - Math.max(firstSchema.position.x, secondSchema.position.x),
    );
    const yOverlap = Math.max(
      0,
      Math.min(firstSchema.position.y + firstSchema.height, secondSchema.position.y + secondSchema.height)
        - Math.max(firstSchema.position.y, secondSchema.position.y),
    );
    assert.ok(
      xOverlap <= 0 || yOverlap <= 0.3,
      `Page 1 schemas ${firstSchema.name} and ${secondSchema.name} overlap in PDFMe designer`,
    );
  }
}

for (const [pageIndex, page] of ccContractTemplate.schemas.slice(0, 4).entries()) {
  for (const schema of page as Array<Record<string, any>>) {
    if (!schema.position || typeof schema.width !== 'number') continue;
    const name = String(schema.name || '');
    const x = Number(schema.position.x);
    const y = Number(schema.position.y);
    const width = Number(schema.width);
    const height = Number(schema.height || 0);
    assert.ok(x >= 20, `Page ${pageIndex + 1} schema ${name} starts inside the PDFMe left padding`);
    assert.ok(x + width <= 195, `Page ${pageIndex + 1} schema ${name} exceeds the PDFMe right padding`);
    assert.ok(y >= 5, `Page ${pageIndex + 1} schema ${name} starts inside the PDFMe top padding`);
    assert.ok(y + height <= 292, `Page ${pageIndex + 1} schema ${name} exceeds the PDFMe bottom padding`);
  }
}

const invoiceTemplate = createDefaultInvoicePdfmeTemplate();
assert.equal(invoiceTemplate.schemas.length, 2);
const invoiceSchemas = invoiceTemplate.schemas[0] as Array<Record<string, unknown>>;
const actSchemas = invoiceTemplate.schemas[1] as Array<Record<string, unknown>>;
assert.equal(invoiceSchemas.some(schema => schema.name === 'bank_static_box'), true);
assert.equal(invoiceSchemas.some(schema => schema.name === 'supplier_static_text'), true);
assert.equal(invoiceSchemas.some(schema => schema.name === 'accountant_static_signature'), true);
assert.equal(invoiceSchemas.some(schema => schema.name === 'company_static_stamp' && schema.type === 'image'), true);

const invoiceSchemaByName = new Map(invoiceSchemas.map(schema => [String(schema.name), schema]));
assert.deepEqual(invoiceTemplate.basePdf, { width: 210, height: 297, padding: [5, 15, 5, 20] });
assert.deepEqual(invoiceSchemaByName.get('bank_static_box')?.position, { x: 20, y: 18.5 });
assert.equal(invoiceSchemaByName.get('bank_static_box')?.width, 175);
assert.deepEqual(invoiceSchemaByName.get('service_table_top')?.position, { x: 20, y: 80 });
assert.equal(invoiceSchemaByName.get('service_table_top')?.width, 175);
assert.deepEqual(invoiceSchemaByName.get('service_table_v_6')?.position, { x: 195, y: 80 });
assert.deepEqual(invoiceSchemaByName.get('service_total')?.position, { x: 173, y: 97 });
assert.equal(invoiceSchemaByName.get('service_total')?.width, 22);
assert.equal(invoiceSchemaByName.has('bank_static_left_row_1'), false);
assert.deepEqual(invoiceSchemaByName.get('bank_static_left_inn_kpp copy')?.position, { x: 79, y: 35.5 });
assert.deepEqual(invoiceSchemaByName.get('bank_static_left_inn_kpp copy 2')?.position, { x: 28, y: 35.5 });
assert.equal(invoiceSchemaByName.get('bank_static_kpp_label')?.alignment, 'center');
assert.equal(invoiceSchemaByName.get('service_row_price')?.alignment, 'center');
assert.equal(invoiceSchemaByName.get('service_row_total')?.alignment, 'center');
assert.deepEqual(invoiceSchemaByName.get('director_static_line')?.position, { x: 64, y: 159 });
assert.deepEqual(invoiceSchemaByName.get('company_static_stamp')?.position, { x: 79.1, y: 161.17 });
assert.deepEqual(invoiceSchemaByName.get('director_static_signature')?.position, { x: 64.53, y: 145.48 });

const actSchemaByName = new Map(actSchemas.map(schema => [String(schema.name), schema]));
assert.equal(actSchemaByName.has('act_header'), true);
assert.deepEqual(actSchemaByName.get('act_header')?.position, { x: 20, y: 14 });
assert.equal(actSchemaByName.get('act_header')?.width, 175);
assert.deepEqual(actSchemaByName.get('act_header_line')?.position, { x: 20, y: 22 });
assert.equal(actSchemaByName.get('act_header_line')?.width, 175);
assert.deepEqual(actSchemaByName.get('act_service_table_top')?.position, { x: 20, y: 38 });
assert.equal(actSchemaByName.get('act_service_table_top')?.width, 175);
assert.equal(actSchemaByName.has('act_total_label'), true);
assert.equal(actSchemaByName.has('act_service_total'), true);
assert.equal(actSchemaByName.has('act_qty_words'), true);
assert.equal(actSchemaByName.has('act_total_words_only'), true);
assert.equal(actSchemaByName.has('act_customer_title'), true);
assert.equal(actSchemaByName.has('act_customer_line'), true);
assert.equal([...actSchemaByName.keys()].some(name => name.endsWith(' ')), false);
assert.equal(actSchemaByName.get('act_completion_text')?.content, 'Вышеперечисленные услуги выполнены полностью и в срок. Заказчик претензий по объему, качеству и срокам\nоказания услуг не имеет.');
assert.equal(actSchemaByName.get('act_executor_title')?.content, 'ИСПОЛНИТЕЛЬ');
assert.equal(actSchemaByName.get('act_executor_role')?.content, 'Генеральный директор ООО "Золото Арктики"');
assert.equal(actSchemaByName.get('act_company_static_stamp')?.type, 'image');
assert.equal(actSchemaByName.get('act_director_static_signature')?.type, 'image');
assert.deepEqual(actSchemaByName.get('act_director_line')?.position, { x: 53, y: 143 });
assert.equal(actSchemaByName.get('act_director_line')?.width, 30);
assert.deepEqual(actSchemaByName.get('act_director_static_signature')?.position, { x: 52.71, y: 129.47 });
assert.deepEqual(actSchemaByName.get('act_company_static_stamp')?.position, { x: 62.44, y: 143.29 });
const savedMismatchedInvoiceActTemplate = ensureInvoiceActPage({
  ...invoiceTemplate,
  schemas: invoiceTemplate.schemas.map(page => {
    const schemas = pageArray(page).map(schema => {
      if (String(schema.name).includes('stamp')) {
        return { ...schema, width: 22, height: 22 };
      }
      if (String(schema.name).includes('signature')) {
        return { ...schema, width: 28, height: 14 };
      }
      return schema;
    });
    const stamp = schemas.find(schema => String(schema.name).includes('stamp'));
    return stamp ? [stamp, ...schemas.filter(schema => schema !== stamp)] : schemas;
  }),
} as unknown as Template);
for (const page of savedMismatchedInvoiceActTemplate.schemas as Array<Array<Record<string, any>>>) {
  const stamp = page.find(schema => String(schema.name).includes('stamp'));
  if (stamp) {
    assertImageSize(stamp, 40, 40, `${stamp.name} invoice/act stamp`);
    assertStampOnTopLayer(page, String(stamp.name));
  }
  for (const schema of page) {
    if (String(schema.name).includes('signature')) {
      assertImageSize(schema, 34, 20, `${schema.name} invoice/act signature`);
    }
  }
}

const savedPackageTemplate = ensureChungaChangaPackagePdfmeTemplate({
  ...ccContractTemplate,
  schemas: [
    ...ccContractTemplate.schemas.slice(0, 4),
    [
      { name: 'invoice_header', type: 'text', position: { x: 1, y: 1 }, width: 10, height: 5 },
      { name: 'saved_invoice_page_marker', type: 'text', position: { x: 1, y: 8 }, width: 10, height: 5 },
    ],
    [
      { name: 'act_header', type: 'text', position: { x: 1, y: 1 }, width: 10, height: 5 },
      { name: 'saved_act_page_marker', type: 'text', position: { x: 1, y: 8 }, width: 10, height: 5 },
    ],
  ],
} as unknown as Template, invoiceTemplate);
assert.equal((savedPackageTemplate.schemas[4] as Array<Record<string, unknown>>).some(schema => schema.name === 'saved_invoice_page_marker'), true);
assert.equal((savedPackageTemplate.schemas[5] as Array<Record<string, unknown>>).some(schema => schema.name === 'saved_act_page_marker'), true);
const savedGbPackageTemplate = ensureGolubayaBukhtaPackagePdfmeTemplate({
  ...gbContractTemplate,
  schemas: [
    ...gbContractTemplate.schemas.slice(0, 2),
    [
      { name: 'invoice_header', type: 'text', position: { x: 1, y: 1 }, width: 10, height: 5 },
      { name: 'saved_gb_invoice_page_marker', type: 'text', position: { x: 1, y: 8 }, width: 10, height: 5 },
    ],
    [
      { name: 'act_header', type: 'text', position: { x: 1, y: 1 }, width: 10, height: 5 },
      { name: 'saved_gb_act_page_marker', type: 'text', position: { x: 1, y: 8 }, width: 10, height: 5 },
    ],
  ],
} as unknown as Template, invoiceTemplate);
assert.equal((savedGbPackageTemplate.schemas[2] as Array<Record<string, unknown>>).some(schema => schema.name === 'saved_gb_invoice_page_marker'), true);
assert.equal((savedGbPackageTemplate.schemas[3] as Array<Record<string, unknown>>).some(schema => schema.name === 'saved_gb_act_page_marker'), true);

const invoiceInput = buildPdfmeInput({
  contractNumber: 'ГБ3',
  signDate: '2026-04-16',
  dateIn: '2026-04-19',
  timeIn: '14:00',
  dateOut: '2026-04-20',
  timeOut: '12:00',
  nights: 1,
  guests: 2,
  cottageNumber: 'КОТТЕДЖ №5.1',
  base: 'golubaya-bukhta',
  totalRub: 6000,
  prepaymentRub: 0,
  client: {
    fullName: 'Иванов Иван Иванович',
    dob: '1990-01-01',
    passport: '1111 222222',
    passportDate: '2010-01-01',
    passportIssuedBy: 'ОВД',
    address: 'Мурманск',
    phone: '+7 900 000-00-00',
    email: 'ivan@example.com',
  },
} satisfies ContractData, {});
const todayText = formatDate(new Date().toLocaleDateString('en-CA'));
assert.equal(invoiceInput.qty_words, 'Всего наименований 1, на сумму 6 000 руб.');
assert.equal(invoiceInput.total_words_only, 'Шесть тысяч рублей 00 копеек');
assert.equal(invoiceInput.total, '6 000,00');
assert.equal(invoiceInput.total_no_vat, '5 714,00');
assert.equal(invoiceInput.vat_amount, '286,00');
assert.equal(invoiceInput.invoice_header, `Счет на оплату № ГБ3 от ${todayText}`);
assert.equal(invoiceInput.act_header, 'Акт № ГБ3 от 20 апреля 2026 г.');
assert.equal(invoiceInput.nights_label, '1 сутки');
assert.equal(invoiceInput.service_row_name, invoiceInput.act_service_row_name);
assert.equal(invoiceInput.act_service_row_total, '6 000,00');
assert.equal(invoiceInput.act_service_total, '6 000,00');
assert.equal(invoiceInput.act_vat_amount, invoiceInput.vat_amount);
assert.equal(invoiceInput.act_total, '6 000,00');
assert.equal(invoiceInput.act_qty_words, 'Всего наименований 1, на сумму 6 000 руб.');
assert.equal(invoiceInput.act_total_words_only, 'Шесть тысяч рублей 00 копеек');
assert.equal(invoiceInput.act_client_name_short, '/И.И. Иванов/');

const ccContractInput = buildPdfmeContractInput({
  contractNumber: 'ЧЧ216067',
  signDate: '2026-04-06',
  dateIn: '2026-04-25',
  timeIn: '17:00',
  dateOut: '2026-04-25',
  timeOut: '22:00',
  nights: 1,
  guests: 15,
  cottageNumber: '3',
  base: 'chunga-changa',
  totalRub: 7500,
  prepaymentRub: 7200,
  client: {
    fullName: 'Великая Виктория Алексеевна',
    dob: '1985-09-30',
    passport: '4710 244857',
    passportDate: '2010-09-07',
    passportIssuedBy: 'ОУФМС РФ по МО в Октябрьском АО г. Мурманска',
    address: 'г. Мурманск',
    phone: '9113061217',
    email: 'snickers-nu@mail.ru',
  },
} satisfies ContractData, {
  exec_name: 'ООО «Золото Арктики»',
  exec_director_short: 'Е. А. Сташ',
  exec_inn: '5105013870',
  exec_kpp: '510501001',
  exec_ogrn: '1215100000158',
  exec_address: '184433, Мурманская область, Печенгский район, г. Заполярный, ул. Ленина, д.1А, помещение 34',
  exec_post_address: '183038, г. Мурманск, пер. Терский, д. 3',
  exec_phone: 'бух. 994411',
  exec_bank: 'МУРМАНСКОЕ ОТДЕЛЕНИЕ №8627 ПАО СБЕРБАНК Г. МУРМАНСК',
  exec_rs: '4070 2810 9417 1000 0190',
  exec_bik: '044 705 615',
  exec_ks: '30101810300000000615',
});
assert.equal(ccContractInput.contract_number, '216067');
assert.equal(ccContractInput.contract_header, 'ДОГОВОР №ЧЧ216067');
assert.equal(ccContractInput.invoice_header, `Счёт №ЧЧ216067 от ${todayText}`);
assert.equal(ccContractInput.act_header, 'Акт №ЧЧ216067 от 25 апреля 2026 г.');
assert.equal(ccContractInput.contract_period, 'в период с 25.04.2026 по 25.04.2026');
assert.equal(ccContractInput.client_name, 'Великая Виктория Алексеевна');
assert.equal(ccContractInput.client_name_short, '/В.А. Великая/');
assert.equal(ccContractInput.prepayment, '7 200,00');
assert.equal(ccContractInput.total, '7 500,00');
assert.equal(ccContractInput.addendum_reference, 'к Договору оказания услуг по размещению №ЧЧ216067 от 06 апреля 2026 г.');
assert.equal(ccContractInput.service_row_name, ccContractInput.act_service_row_name);
assert.equal(ccContractInput.addendum_checkout_date, '25.04.2026');

/* legacy mojibake block preserved by patch
const ccPreviewData = getPdfmePreviewData(PDFME_CC_CONTRACT_TEMPLATE_ID);
assert.equal(ccPreviewData.contract_number, '216067');
assert.equal(ccPreviewData.invoice_number, '216067');
assert.equal(ccPreviewData.contract_header, 'Р вЂќР С›Р вЂњР С›Р вЂ™Р С›Р В  РІвЂћвЂ“Р В§Р В§216067');
assert.equal(ccPreviewData.invoice_header, 'Р РЋРЎвЂЎРЎвЂРЎвЂљ РІвЂћвЂ“Р В§Р В§216067 Р С•РЎвЂљ 18 Р В°Р С—РЎР‚Р ВµР В»РЎРЏ 2026 Р С–.');
assert.equal(ccPreviewData.act_header, 'Р С’Р С”РЎвЂљ РІвЂћвЂ“Р В§Р В§216067 Р С•РЎвЂљ 18 Р В°Р С—РЎР‚Р ВµР В»РЎРЏ 2026 Р С–.');
assert.equal(ccPreviewData.addendum_reference, 'Р С” Р вЂќР С•Р С–Р С•Р Р†Р С•РЎР‚РЎС“ Р С•Р С”Р В°Р В·Р В°Р Р…Р С‘РЎРЏ РЎС“РЎРѓР В»РЎС“Р С– Р С—Р С• РЎР‚Р В°Р В·Р СР ВµРЎвЂ°Р ВµР Р…Р С‘РЎР‹ РІвЂћвЂ“Р В§Р В§216067 Р С•РЎвЂљ 06 Р В°Р С—РЎР‚Р ВµР В»РЎРЏ 2026 Р С–.');
assert.match(ccPreviewData.service_name, /РІвЂћвЂ“Р В§Р В§216067/);
assert.match(ccPreviewData.service_row_name, /РІвЂћвЂ“Р В§Р В§216067/);
assert.match(ccPreviewData.act_service_row_name, /РІвЂћвЂ“Р В§Р В§216067/);
const gbPreviewData = getPdfmePreviewData(PDFME_GB_CONTRACT_TEMPLATE_ID);
assert.equal(gbPreviewData.contract_number, '216067');
assert.equal(gbPreviewData.invoice_number, '216067');
assert.equal(gbPreviewData.contract_header, 'Р”РћР“РћР’РћР  в„–Р“Р‘216067');
assert.equal(gbPreviewData.invoice_header, 'РЎС‡С‘С‚ в„–Р“Р‘216067 РѕС‚ 18 Р°РїСЂРµР»СЏ 2026 Рі.');
assert.equal(gbPreviewData.act_header, 'РђРєС‚ в„–Р“Р‘216067 РѕС‚ 18 Р°РїСЂРµР»СЏ 2026 Рі.');
assert.equal(gbPreviewData.addendum_reference, 'Рє Р”РѕРіРѕРІРѕСЂСѓ РѕРєР°Р·Р°РЅРёСЏ СѓСЃР»СѓРі РїРѕ СЂР°Р·РјРµС‰РµРЅРёСЋ в„–Р“Р‘216067 РѕС‚ 06 Р°РїСЂРµР»СЏ 2026 Рі.');
assert.match(gbPreviewData.service_name, /в„–Р“Р‘216067/);
assert.match(gbPreviewData.service_row_name, /в„–Р“Р‘216067/);
assert.match(gbPreviewData.act_service_row_name, /в„–Р“Р‘216067/);
assert.equal(getPdfmePreviewData(PDFME_INVOICE_TEMPLATE_ID).invoice_header, pdfmeTestData.invoice_header);

*/
const ccPreviewData = getPdfmePreviewData(PDFME_CC_CONTRACT_TEMPLATE_ID);
assert.equal(ccPreviewData.contract_number, '216067');
assert.equal(ccPreviewData.invoice_number, '216067');
assert.equal(ccPreviewData.contract_header, 'ДОГОВОР №ЧЧ216067');
assert.equal(ccPreviewData.invoice_header, 'Счёт №ЧЧ216067 от 18 апреля 2026 г.');
assert.equal(ccPreviewData.act_header, 'Акт №ЧЧ216067 от 18 апреля 2026 г.');
assert.equal(ccPreviewData.addendum_reference, 'к Договору оказания услуг по размещению №ЧЧ216067 от 06 апреля 2026 г.');
assert.match(ccPreviewData.service_name, /№ЧЧ216067/);
assert.match(ccPreviewData.service_row_name, /№ЧЧ216067/);
assert.match(ccPreviewData.act_service_row_name, /№ЧЧ216067/);
const gbPreviewData = getPdfmePreviewData(PDFME_GB_CONTRACT_TEMPLATE_ID);
assert.equal(gbPreviewData.contract_number, '216067');
assert.equal(gbPreviewData.invoice_number, '216067');
assert.equal(gbPreviewData.contract_header, 'ДОГОВОР №ГБ216067');
assert.equal(gbPreviewData.invoice_header, 'Счёт №ГБ216067 от 18 апреля 2026 г.');
assert.equal(gbPreviewData.act_header, 'Акт №ГБ216067 от 18 апреля 2026 г.');
assert.equal(gbPreviewData.addendum_reference, 'к Договору оказания услуг по размещению №ГБ216067 от 06 апреля 2026 г.');
assert.match(gbPreviewData.service_name, /№ГБ216067/);
assert.match(gbPreviewData.service_row_name, /№ГБ216067/);
assert.match(gbPreviewData.act_service_row_name, /№ГБ216067/);
assert.equal(getPdfmePreviewData(PDFME_INVOICE_TEMPLATE_ID).invoice_header, pdfmeTestData.invoice_header);

const pdfmeEditorSource = fs.readFileSync(
  new URL('../src/components/settings/PdfmeTemplateEditorModal.tsx', import.meta.url),
  'utf8',
);
assert.match(
  pdfmeEditorSource,
  /getPdfmePreviewData\(templateId\)/,
  'PDFMe editor preview must use template-specific sample data so РџР°РєРµС‚ Р§Р§ shows Р§Р§-prefixed numbers',
);
const pdfmeEditorOnChangeStart = pdfmeEditorSource.indexOf('designer.onChangeTemplate((newTpl: Template) => {');
assert.notEqual(pdfmeEditorOnChangeStart, -1);
const pdfmeEditorOnChangeEnd = pdfmeEditorSource.indexOf('\n      });', pdfmeEditorOnChangeStart);
assert.notEqual(pdfmeEditorOnChangeEnd, -1);
const pdfmeEditorOnChangeBody = pdfmeEditorSource.slice(pdfmeEditorOnChangeStart, pdfmeEditorOnChangeEnd);
assert.equal(
  /refreshStats\(/.test(pdfmeEditorOnChangeBody),
  false,
  'PDFMe Designer must not rebuild the field list on each sidebar keystroke',
);
assert.equal(
  /set(?:IsDirty|CanUndo)\(/.test(pdfmeEditorOnChangeBody),
  false,
  'PDFMe Designer must use guarded refs instead of direct React state updates on each sidebar keystroke',
);
assert.equal(
  /markDesigner(?:Dirty|CanUndo)\(/.test(pdfmeEditorOnChangeBody),
  false,
  'PDFMe Designer must not trigger React chrome updates on each sidebar keystroke',
);
assert.match(pdfmeEditorOnChangeBody, /dirtyRef\.current = true/);
assert.match(pdfmeEditorOnChangeBody, /canUndoRef\.current = true/);
assert.match(pdfmeEditorSource, /markDesignerDirty/);
assert.match(pdfmeEditorSource, /flushDesignerChromeState/);
assert.match(
  pdfmeEditorSource,
  /createDesignerFocusSnapshot/,
  'PDFMe sidebar inputs need a focus snapshot because Ant InputNumber is remounted while typing',
);
assert.match(
  pdfmeEditorSource,
  /restoreDesignerFocus/,
  'PDFMe sidebar inputs need focus restoration after internal right-sidebar rerenders',
);
assert.match(pdfmeEditorSource, /MutationObserver/);
assert.match(
  pdfmeEditorSource,
  /document\.addEventListener\('pointerdown', handleDocumentPointerDown, true\)/,
  'PDFMe sidebar focus snapshot should be cleared when the user clicks app chrome outside the designer',
);
assert.match(
  pdfmeEditorSource,
  /!root\.contains\(event\.target\)/,
  'PDFMe focus restoration must not steal focus after clicking outside the designer root',
);
const pdfmeEditorKeyboardStart = pdfmeEditorSource.indexOf('const handler = (e: KeyboardEvent) => {');
assert.notEqual(pdfmeEditorKeyboardStart, -1);
const pdfmeEditorKeyboardEnd = pdfmeEditorSource.indexOf('\n    };', pdfmeEditorKeyboardStart);
assert.notEqual(pdfmeEditorKeyboardEnd, -1);
const pdfmeEditorKeyboardBody = pdfmeEditorSource.slice(pdfmeEditorKeyboardStart, pdfmeEditorKeyboardEnd);
const saveShortcutIndex = pdfmeEditorKeyboardBody.indexOf('handleSave();');
const typingGuardIndex = pdfmeEditorKeyboardBody.indexOf('if (isTypingTarget) return;');
assert.notEqual(saveShortcutIndex, -1);
assert.notEqual(typingGuardIndex, -1);
assert.ok(
  saveShortcutIndex < typingGuardIndex,
  'Ctrl+S should save even while focus is inside a PDFMe sidebar input',
);
const pdfmeEditorCloseStart = pdfmeEditorSource.indexOf('const handleClose = useCallback(');
assert.notEqual(pdfmeEditorCloseStart, -1);
const pdfmeEditorCloseEnd = pdfmeEditorSource.indexOf('\n  }, [onClose]);', pdfmeEditorCloseStart);
assert.notEqual(pdfmeEditorCloseEnd, -1);
const pdfmeEditorCloseBody = pdfmeEditorSource.slice(pdfmeEditorCloseStart, pdfmeEditorCloseEnd);
assert.match(pdfmeEditorCloseBody, /dirtyRef\.current/);
assert.match(pdfmeEditorCloseBody, /confirm/);
assert.doesNotMatch(pdfmeEditorSource, /onClick=\{onClose\}/);
assert.match(pdfmeEditorSource, /onClick=\{handleClose\}/);

const tableTemplate = {
  basePdf: { width: 210, height: 297, padding: [5, 5, 5, 5] },
  schemas: [[{
    name: 'service_table',
    type: 'table',
    position: { x: 10, y: 20 },
    width: 100,
    height: 30,
    headStyles: { fontWeight: 'bold' },
    bodyStyles: { fontSize: 8 },
  }]],
} as unknown as Template;
const normalizedTableTemplate = normalizePdfmeTemplateFonts(tableTemplate);
assert.equal(normalizedTableTemplate.schemas[0].length, 1);
assert.equal((normalizedTableTemplate.schemas[0][0] as Record<string, unknown>).type, 'table');
assert.equal(((normalizedTableTemplate.schemas[0][0] as Record<string, any>).headStyles).fontName, 'NotoSerifBold');

assert.equal(await getEmailResponseError(new Response(JSON.stringify({ error: 'SMTP down' }), { status: 500 })), 'SMTP down');
assert.equal(await getEmailResponseError(new Response('plain smtp error', { status: 500 })), 'plain smtp error');

const backupPath = await localDb.createBackup(`codex-audit-fix-test-${Date.now()}`);
assert.equal(fs.existsSync(backupPath), true);
assert.ok(fs.statSync(backupPath).size > 0);
fs.unlinkSync(backupPath);

{
  const contractId = `codex-self-conflict-${Date.now()}`;
  const overlappingSelfConflict: Contract = {
    ...contract,
    id: contractId,
    status: 'pre_booking',
    totalAmount: 10000,
    prepayment: 0,
    remainder: 10000,
    bookings: [
      {
        ...contract.bookings[0],
        id: `${contractId}-a`,
        contractId,
        objectId: 'gb-bath',
        baseType: 'golubaya-bukhta',
        startTime: '2036-01-10T12:00:00.000Z',
        endTime: '2036-01-10T15:00:00.000Z',
        type: 'service',
        price: 5000,
      },
      {
        ...contract.bookings[0],
        id: `${contractId}-b`,
        contractId,
        objectId: 'bath',
        baseType: 'golubaya-bukhta',
        startTime: '2036-01-10T14:00:00.000Z',
        endTime: '2036-01-10T16:00:00.000Z',
        type: 'service',
        price: 5000,
      },
    ],
  };

  try {
    assert.throws(
      () => localDb.saveContract(overlappingSelfConflict),
      (error) => error instanceof BookingConflictError && /пересекаются/.test(error.message),
    );
  } finally {
    localDb.deleteContract(overlappingSelfConflict.id);
  }
}

{
  const backupSettingsBeforeAudit = localDb.getSettings<Record<string, unknown>>('backup');
  const restoreBackupSettings = () => {
    if (backupSettingsBeforeAudit) {
      localDb.saveSettings(backupSettingsBeforeAudit, 'backup');
    }
  };

  try {
    assert.throws(
      () => backupService.saveSettings({
        ...backupService.getSettings(),
        localDir: path.parse(process.cwd()).root,
      }),
      /Папка резервных копий/,
    );
    assert.throws(
      () => backupService.saveSettings({
        ...backupService.getSettings(),
        retentionDaily: 0,
      }),
      /retentionDaily/,
    );
  } finally {
    restoreBackupSettings();
  }
}

const backupStatusBeforeAudit = (localDb as any).db
  .prepare("SELECT data_json FROM settings WHERE id = 'backup_status'")
  .get() as { data_json: string } | undefined;
const scheduledBackupResult = await backupService.run('weekly-local');
assert.equal(scheduledBackupResult.success, true);
assert.equal(scheduledBackupResult.remotes.length, 0);
assert.ok(scheduledBackupResult.archivePath);
assert.equal(fs.existsSync(scheduledBackupResult.archivePath!), true);
const scheduledBackupBuffer = fs.readFileSync(scheduledBackupResult.archivePath!);
assert.equal(scheduledBackupBuffer.subarray(0, 4).toString('hex'), '504b0304');
assert.equal(scheduledBackupBuffer.includes(Buffer.from('.env.local')), false);
assert.equal(scheduledBackupBuffer.includes(Buffer.from('SMTP_PASSWORD')), false);
fs.unlinkSync(scheduledBackupResult.archivePath!);
if (backupStatusBeforeAudit) {
  (localDb as any).db
    .prepare("UPDATE settings SET data_json = ?, updated_at = datetime('now') WHERE id = 'backup_status'")
    .run(backupStatusBeforeAudit.data_json);
} else {
  (localDb as any).db.prepare("DELETE FROM settings WHERE id = 'backup_status'").run();
}

const backupServiceSource = fs.readFileSync(
  new URL('../server/backupService.ts', import.meta.url),
  'utf8',
);
assert.match(backupServiceSource, /rclone/);
assert.match(backupServiceSource, /copyto/);
assert.match(backupServiceSource, /retentionDaily/);
assert.match(backupServiceSource, /manifest\.json/);
assert.match(backupServiceSource, /localDb\.createBackup/);
assert.match(backupServiceSource, /includeTemplateHistory/);
assert.match(backupServiceSource, /localArchiveDeleted/);
assert.match(backupServiceSource, /fs\.unlinkSync\(mainArchive\.path\)/);

const localApiSource = fs.readFileSync(
  new URL('../src/services/localApi.ts', import.meta.url),
  'utf8',
);
assert.match(localApiSource, /\/api\/backups\/status/);
assert.match(localApiSource, /\/api\/backups\/run/);
assert.match(localApiSource, /\/api\/backups\/test-remotes/);

const appSource = fs.readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
assert.match(appSource, /backupApi\.status/);
assert.match(appSource, /backupApi\.run\('shutdown'\)/);
assert.match(appSource, /Создать (ещё )?и выйти/);

const clientModalSource = fs.readFileSync(
  new URL('../src/components/clients/ClientModal.tsx', import.meta.url),
  'utf8',
);
assert.match(clientModalSource, /<form id=\{clientFormId\}/);
assert.match(clientModalSource, /type="submit"\s+form=\{clientFormId\}/);
for (const message of [
  'Укажите фамилию',
  'Укажите имя',
  'Укажите телефон',
  'Укажите название организации',
  'Укажите ИНН',
]) {
  assert.match(clientModalSource, new RegExp(message));
}
assert.match(clientModalSource, /errors\.lastName/);
assert.match(clientModalSource, /errors\.firstName/);
assert.match(clientModalSource, /errors\.phone/);
assert.match(clientModalSource, /errors\.organizationName/);
assert.match(clientModalSource, /errors\.inn/);

const authServiceSource = fs.readFileSync(new URL('../server/authService.ts', import.meta.url), 'utf8');
assert.match(authServiceSource, /pbkdf2Sync/);
assert.match(authServiceSource, /DEFAULT_ADMIN_LOGIN = 'Make'/);
assert.match(authServiceSource, /DEFAULT_ADMIN_PASSWORD = '3552'/);
assert.match(authServiceSource, /safeManager/);
assert.doesNotMatch(authServiceSource, /passwordHash[^]*res\.json/);

const serverSource = fs.readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
for (const route of [
  '/api/auth/login',
  '/api/auth/me',
  '/api/auth/logout',
  '/api/managers',
]) {
  assert.match(serverSource, new RegExp(route.replace(/\//g, '\\/')));
}
assert.match(serverSource, /requireAdmin/);
assert.match(serverSource, /app\.delete\('\/api\/clients\/:id', requireAdmin/);
assert.match(serverSource, /app\.delete\('\/api\/contracts\/:id', requireAdmin/);

assert.match(localApiSource, /setAuthToken/);
assert.match(localApiSource, /Authorization/);
assert.match(localApiSource, /authApi/);
assert.match(localApiSource, /managerApi/);

const authContextSource = fs.readFileSync(new URL('../src/context/AuthContext.tsx', import.meta.url), 'utf8');
assert.match(authContextSource, /createContext/);
assert.match(authContextSource, /localStorage/);
assert.match(authContextSource, /authApi\.me/);
assert.match(authContextSource, /canDeleteClients/);
assert.match(authContextSource, /canManageManagers/);

const loginModalSource = fs.readFileSync(new URL('../src/components/auth/LoginModal.tsx', import.meta.url), 'utf8');
assert.match(loginModalSource, /Вход в CRM/);
assert.match(loginModalSource, /Make/);
assert.match(loginModalSource, /Пароль/);

const settingsViewSource = fs.readFileSync(new URL('../src/components/settings/SettingsView.tsx', import.meta.url), 'utf8');
assert.match(settingsViewSource, /ManagersSettingsTab/);
assert.match(settingsViewSource, /canManageTemplates/);
assert.match(settingsViewSource, /canManageManagers/);

const clientsSource = fs.readFileSync(new URL('../src/components/clients/Clients.tsx', import.meta.url), 'utf8');
assert.match(clientsSource, /canDeleteClients/);
assert.match(clientsSource, /clientApi\.delete/);

const contractsSource = fs.readFileSync(new URL('../src/components/contracts/Contracts.tsx', import.meta.url), 'utf8');
assert.match(contractsSource, /canDeleteContracts/);

console.log('auditFixesTest: ok');

