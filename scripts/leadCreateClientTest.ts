import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath: string) => fs.readFileSync(path.join(rootPath, relativePath), 'utf-8');

const serverSource = read('server.ts');
const dbSource = read('server/localDatabase.ts');
const apiSource = read('src/services/localApi.ts');
const modalSource = read('src/components/leads/LeadModal.tsx');
const leadsSource = read('src/components/leads/Leads.tsx');

assert.match(serverSource, /app\.post\('\/api\/leads\/:id\/create-client', requireAuth/, 'POST /api/leads/:id/create-client must be protected by requireAuth');
assert.match(serverSource, /localDb\.getLeadById\(req\.params\.id\)/, 'create-client endpoint must load the lead by id');
assert.match(serverSource, /lead\.clientId/, 'create-client endpoint must guard repeated conversion by client_id/clientId');
assert.match(serverSource, /localDb\.getClientById/, 'create-client endpoint must return an existing linked client');
assert.match(serverSource, /localDb\.saveClient/, 'create-client endpoint must create a client through the existing client save method');
assert.match(serverSource, /localDb\.linkLeadToClient/, 'create-client endpoint must link the lead to the created client');
assert.match(dbSource, /getClientById<T>/, 'local database must expose getClientById');
assert.match(dbSource, /linkLeadToClient\(id: string, clientId: string\)/, 'local database must keep linkLeadToClient');

assert.match(apiSource, /createClient:\s*\(id: string\)\s*=>\s*apiRequest<LeadCreateClientResult>/, 'leadApi.createClient must be exposed');
assert.match(apiSource, /\/api\/leads\/\$\{id\}\/create-client/, 'leadApi.createClient must call /api/leads/:id/create-client');
assert.match(apiSource, /method:\s*'POST'/, 'leadApi.createClient must use POST');

assert.match(modalSource, /onCreateClient/, 'LeadModal must accept a create-client action');
assert.match(modalSource, /Создать гостя/, 'LeadModal must render the Создать гостя button');
assert.match(modalSource, /Гость создан/, 'LeadModal must show a compact created-client label');
assert.match(modalSource, /lead\.clientId/, 'LeadModal must hide create-client action once clientId exists');
assert.match(modalSource, /client_created/, 'LeadModal must block create-client action for client_created status');
assert.match(modalSource, /contract_created/, 'LeadModal must block create-client action for contract_created status');
assert.match(modalSource, /rejected/, 'LeadModal must block create-client action for rejected status');
assert.match(modalSource, /duplicate/, 'LeadModal must block create-client action for duplicate status');
assert.match(leadsSource, /leadApi\.createClient\(id\)/, 'Leads container must call leadApi.createClient');
assert.match(leadsSource, /Гость создан/, 'Leads container must show a success toast');

for (const [fileName, source] of [
  ['server.ts', serverSource],
  ['src/services/localApi.ts', apiSource],
  ['src/components/leads/LeadModal.tsx', modalSource],
] as const) {
  assert.equal(source.includes('create-contract'), false, `${fileName} must not add contract creation`);
  assert.equal(source.includes('create-prebooking'), false, `${fileName} must not add prebooking creation`);
}

console.log('lead create client tests passed');
