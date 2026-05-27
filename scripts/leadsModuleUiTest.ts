import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const rootPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath: string) => fs.readFileSync(path.join(rootPath, relativePath), 'utf-8');

const typesSource = read('src/types.ts');
const appSource = read('src/App.tsx');
const apiSource = read('src/services/localApi.ts');
const serverSource = read('server.ts');
const dbSource = read('server/localDatabase.ts');

assert.match(typesSource, /export type View = .*'leads'/s, 'View union must include leads');
assert.match(typesSource, /export interface Lead\b/, 'Lead type must be declared');
assert.match(typesSource, /export type LeadStatus\b/, 'LeadStatus type must be declared');
assert.match(typesSource, /export type LeadSyncStatus\b/, 'LeadSyncStatus type must be declared');
assert.match(typesSource, /export interface LeadCreateInput\b/, 'LeadCreateInput type must be declared');
assert.match(typesSource, /export (interface|type) LeadUpdateInput\b/, 'LeadUpdateInput type must be declared');

assert.match(appSource, /label:\s*'Заявки'/, 'Top navigation must include Заявки');
assert.match(appSource, /id:\s*'leads' as View/, 'Top navigation item must use leads view');
assert.match(appSource, /case 'leads':/, 'App must render leads view');
assert.match(appSource, /<LeadsView\b/, 'App must render Leads component');

assert.equal(fs.existsSync(path.join(rootPath, 'src/components/leads/Leads.tsx')), true, 'Leads component must exist');
assert.equal(fs.existsSync(path.join(rootPath, 'src/components/leads/LeadModal.tsx')), true, 'LeadModal component must exist');
assert.equal(fs.existsSync(path.join(rootPath, 'src/components/leads/LeadStatusBadge.tsx')), true, 'LeadStatusBadge component must exist');

assert.match(apiSource, /export const leadApi\b/, 'leadApi must be exported');
assert.match(apiSource, /\/api\/leads/, 'leadApi must call /api/leads');
assert.match(serverSource, /app\.get\('\/api\/leads', requireAuth/, 'GET /api/leads must be protected');
assert.match(serverSource, /app\.get\('\/api\/leads\/:id', requireAuth/, 'GET /api/leads/:id must be protected');
assert.match(serverSource, /app\.post\('\/api\/leads', requireAuth/, 'POST /api/leads must be protected');
assert.match(serverSource, /app\.post\('\/api\/leads\/sync', requireAuth/, 'POST /api/leads/sync must be protected');
assert.match(serverSource, /app\.patch\('\/api\/leads\/:id', requireAuth/, 'PATCH /api/leads/:id must be protected');
assert.match(serverSource, /app\.patch\('\/api\/leads\/:id\/status', requireAuth/, 'PATCH /api/leads/:id/status must be protected');

assert.match(dbSource, /CREATE TABLE IF NOT EXISTS leads/, 'Local SQLite leads table must be created');
assert.match(dbSource, /getLeads\(/, 'Local database must expose getLeads');
assert.match(dbSource, /createLead\(/, 'Local database must expose createLead');
assert.match(dbSource, /updateLeadStatus\(/, 'Local database must expose updateLeadStatus');

const forbiddenSupabaseUiFiles = [
  'src/components/leads/Leads.tsx',
  'src/components/leads/LeadModal.tsx',
  'src/services/localApi.ts',
  'server.ts',
];

for (const file of forbiddenSupabaseUiFiles) {
  assert.equal(read(file).includes('supabase.'), false, `${file} must not call Supabase in local leads stage`);
}

assert.equal(serverSource.includes('/api/public/leads'), false, 'Public leads endpoint must not be added yet');
assert.equal(serverSource.includes('/api/public/leads/sync'), false, 'Public lead sync endpoint must not be added');

console.log('leads module UI tests passed');
