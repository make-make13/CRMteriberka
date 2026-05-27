import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootPath = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const modalSource = fs.readFileSync(path.join(rootPath, 'src/components/leads/LeadModal.tsx'), 'utf8');

assert.equal(modalSource.includes('Данные источника'), false, 'main lead modal must not show the old visible source-data block');
assert.match(modalSource, /Технические данные/, 'lead modal must include a collapsible technical data section');
assert.equal(modalSource.includes('Внутренний номер объекта'), false, 'objectId must not be shown as a primary visible field');
assert.match(modalSource, /Пожелание по номеру/, 'objectType field must be labelled as a room preference');
assert.match(modalSource, /Источник:[\s\S]*formatLeadSource/, 'lead modal must show formatted source in a compact summary line');
assert.match(modalSource, /formatLeadReceivedAt/, 'lead modal must format the received date');
assert.match(modalSource, /Получена:[\s\S]*receivedAt/, 'lead modal must show received date in the compact summary line');
assert.match(modalSource, /rawJson[\s\S]*utmJson|utmJson[\s\S]*rawJson/, 'technical data must retain rawJson and utmJson');
assert.match(modalSource, /supabaseId/, 'technical data must include supabaseId');
assert.match(modalSource, /objectId/, 'technical data must include objectId');
assert.match(modalSource, /syncStatus/, 'technical data must include syncStatus');
assert.match(modalSource, /lastError/, 'technical data must include lastError');
assert.match(modalSource, /Нет технических данных/, 'technical data section must handle empty details');

console.log('lead modal simplification tests passed');
