import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath: string) => fs.readFileSync(path.join(rootPath, relativePath), 'utf-8');

const appSource = read('src/App.tsx');
const contractModalSource = read('src/components/contracts/ContractModal.tsx');
const preBookingModalSource = read('src/components/contracts/PreBookingModal.tsx');
const leadModalSource = read('src/components/leads/LeadModal.tsx');
const dbSource = read('server/localDatabase.ts');
const pdfmeSource = read('src/utils/pdfmeDocumentGenerator.ts');

assert.match(appSource, /isPrebookingConversionMode/, 'App must track explicit prebooking-to-contract conversion mode');
assert.match(appSource, /contractConversionLeadId/, 'App must track a lead id for conversion when one is known');
assert.match(appSource, /leadApi\.list\(\)/, 'App must resolve a lead by prebooking/contract id when opening a prebooking as a contract');
assert.match(appSource, /leadApi\.update/, 'App must update the lead after successful contract conversion');
assert.match(appSource, /status:\s*'contract_created'/, 'Converted lead must be marked contract_created');
assert.match(appSource, /contractId:\s*contract\.id/, 'Converted lead must keep the converted contract id');
assert.match(appSource, /contractApi\.save\(contract\)/, 'Conversion must save through contractApi.save');
assert.doesNotMatch(appSource, /contractApi\.create|createContractFromPrebooking/, 'Conversion must not create a separate contract');

assert.match(preBookingModalSource, /onOpenContract/, 'PreBookingModal must keep the Договор action');
assert.match(contractModalSource, /isPrebookingConversion/, 'ContractModal must accept explicit conversion mode');
assert.match(contractModalSource, /isConvertingPreBooking/, 'ContractModal must derive conversion state');
assert.match(contractModalSource, /startsWith\('ПБ-'\)/, 'ContractModal must detect ПБ prebooking numbers');
assert.match(contractModalSource, /initialNextContractNumber/, 'ContractModal must reuse existing contract number generation');
assert.match(contractModalSource, /Предбронь будет сохранена как договор\. Номер договора обновлён автоматически\./, 'ContractModal must show conversion hint');
assert.match(contractModalSource, /status,\s*setStatus[\s\S]*signed_not_paid/, 'ContractModal must initialize conversion with a non-pre_booking status');
assert.match(contractModalSource, /initialMainBooking\?\.id/, 'ContractModal must preserve existing booking id where possible');
assert.match(contractModalSource, /if \(isConvertingPreBooking\) return;[\s\S]*ccCottageId !== 'cc-6'/, 'Conversion mode must not auto-reset prefilled prebooking dates for non-daily rooms');
const submitFlow = contractModalSource.match(/const onSubmit = \([\s\S]*?^  };/m)?.[0] || '';
assert.match(submitFlow, /onSave\(contract\)/, 'ContractModal submit flow must save through onSave');
assert.doesNotMatch(submitFlow, /generatePdfmeContractBlob|handleGenerateDoc/, 'Save flow must not generate PDF automatically');

assert.match(leadModalSource, /Договор создан/, 'Lead UI must show a created-contract label');
assert.match(leadModalSource, /contract_created/, 'Lead UI must recognize contract_created');

assert.match(dbSource, /saveContract\(contractInput: ContractRecord\)/, 'Existing saveContract must remain present');
assert.match(pdfmeSource, /generatePdfmeContractBlob/, 'PDFMe generator must remain an explicit generator utility');

console.log('prebooking to contract tests passed');
