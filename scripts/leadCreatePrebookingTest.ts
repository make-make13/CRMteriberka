import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath: string) => fs.readFileSync(path.join(rootPath, relativePath), 'utf-8');

const appSource = read('src/App.tsx');
const leadsSource = read('src/components/leads/Leads.tsx');
const modalSource = read('src/components/leads/LeadModal.tsx');
const preBookingSource = read('src/components/contracts/PreBookingModal.tsx');
const localApiSource = read('src/services/localApi.ts');
const serverSource = read('server.ts');
const dbSource = read('server/localDatabase.ts');

assert.match(modalSource, /Создать предбронь/, 'LeadModal must render the Создать предбронь action');
assert.match(modalSource, /Сначала создайте гостя/, 'LeadModal must explain that a guest is required before prebooking');
assert.match(modalSource, /Предбронь создана/, 'LeadModal must show a created prebooking label');
assert.match(modalSource, /lead\.clientId/, 'LeadModal must only enable prebooking when clientId exists');
assert.match(modalSource, /lead\?\.prebookingId|lead\.prebookingId/, 'LeadModal must hide prebooking action when prebookingId exists');
assert.match(modalSource, /lead\?\.contractId|lead\.contractId/, 'LeadModal must hide prebooking action when contractId exists');
assert.match(modalSource, /rejected/, 'LeadModal must block prebooking for rejected leads');
assert.match(modalSource, /duplicate/, 'LeadModal must block prebooking for duplicate leads');
assert.match(modalSource, /onCreatePrebookingFromLead/, 'LeadModal must expose a prebooking action callback');

assert.match(leadsSource, /onCreatePrebookingFromLead/, 'Leads must pass lead prebooking action into LeadModal');
assert.match(leadsSource, /handleCreatePrebookingFromLead/, 'Leads must handle the lead prebooking action');
assert.match(appSource, /leadPrebookingPrefill/, 'App must keep lead prefill state for PreBookingModal');
assert.match(appSource, /handleCreatePrebookingFromLead/, 'App must open PreBookingModal from a lead');
assert.match(appSource, /contractApi\.save\(contract\)/, 'App must save prebooking through contractApi.save');
assert.match(appSource, /leadApi\.update/, 'App must update the lead after prebooking save');
assert.match(appSource, /prebookingId:\s*contract\.id/, 'App must write prebookingId after save');
assert.match(appSource, /contractId:\s*contract\.id/, 'App must write contractId after save');
assert.match(appSource, /status:\s*'prebooking_created'/, 'App must set lead status to prebooking_created after save');

assert.match(preBookingSource, /leadPrefill/, 'PreBookingModal must support lead prefill');
assert.match(preBookingSource, /clientId:[\s\S]*leadPrefill\?\.clientId/, 'PreBookingModal must use lead clientId when opened from a lead');
assert.match(preBookingSource, /Выберите номер для предброни/, 'PreBookingModal must require a room when lead prefill has no objectId');
assert.match(preBookingSource, /setSelectedObjectId/, 'PreBookingModal must allow selecting a room for lead prefill');
assert.match(preBookingSource, /leadPrefill\?\.baseType/, 'PreBookingModal must use lead prefill baseType');
assert.match(preBookingSource, /message/, 'PreBookingModal must include lead message in comment/prefill');

assert.equal(serverSource.includes('/api/leads/:id/create-prebooking'), false, 'must not add a create-prebooking endpoint');
assert.equal(localApiSource.includes('createPrebooking'), false, 'must not add a separate leadApi.createPrebooking endpoint');
assert.equal(dbSource.includes('createPrebooking'), false, 'must not add direct database prebooking creation');
assert.equal(/INSERT INTO bookings/.test(appSource + leadsSource + modalSource + preBookingSource), false, 'UI must not write bookings directly');
assert.match(dbSource, /saveContract\(contractInput: ContractRecord\)/, 'existing saveContract must remain present');

console.log('lead create prebooking tests passed');
