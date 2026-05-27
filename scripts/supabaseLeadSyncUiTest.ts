import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const rootPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath: string) => fs.readFileSync(path.join(rootPath, relativePath), 'utf-8');

const envExampleSource = read('.env.example');
const serverSource = read('server.ts');
const dbSource = read('server/localDatabase.ts');
const apiSource = read('src/services/localApi.ts');
const leadsSource = read('src/components/leads/Leads.tsx');

assert.match(envExampleSource, /^SUPABASE_URL=$/m, '.env.example must document SUPABASE_URL without a value');
assert.match(envExampleSource, /^SUPABASE_SERVICE_ROLE_KEY=$/m, '.env.example must document SUPABASE_SERVICE_ROLE_KEY without a value');
assert.match(envExampleSource, /^SUPABASE_LEADS_TABLE=leads$/m, '.env.example must document SUPABASE_LEADS_TABLE');
assert.match(envExampleSource, /^SUPABASE_LEAD_SYNC_LIMIT=50$/m, '.env.example must document SUPABASE_LEAD_SYNC_LIMIT');

assert.equal(fs.existsSync(path.join(rootPath, 'server/supabaseLeadSync.ts')), true, 'server/supabaseLeadSync.ts must exist');
assert.match(serverSource, /app\.post\('\/api\/leads\/sync', requireAuth/, 'POST /api/leads/sync must be protected by requireAuth');
assert.match(serverSource, /syncSupabaseLeads/, 'server.ts must call syncSupabaseLeads');
assert.match(dbSource, /createLeadFromSupabase\(/, 'local database must expose createLeadFromSupabase');
assert.match(apiSource, /sync:\s*\(\)\s*=>\s*apiRequest<LeadSyncResult>\('\/api\/leads\/sync'/, 'leadApi.sync must call /api/leads/sync');

const syncButtonBlock = leadsSource.match(/<button[\s\S]*?Проверить заявки[\s\S]*?<\/button>/)?.[0] || '';
assert.ok(syncButtonBlock, 'Leads UI must render the sync button');
assert.equal(/\sdisabled(?:=|\s|>)/.test(syncButtonBlock), false, 'Sync button must not be permanently disabled');
assert.match(leadsSource, /leadApi\.sync\(\)/, 'Sync button must call leadApi.sync');
assert.match(leadsSource, /Загружено новых заявок:/, 'Successful sync toast must mention loaded leads count');
assert.match(leadsSource, /Supabase не настроен/, 'Supabase configuration error must be user-facing');
assert.match(leadsSource, /SUPABASE_URL/, 'Supabase configuration error must mention SUPABASE_URL');
assert.match(leadsSource, /SERVICE_ROLE_KEY/, 'Supabase configuration error must mention service role key without exposing the full env name in frontend source');
assert.match(leadsSource, /\.env\.local/, 'Supabase configuration error must mention .env.local');

for (const file of [
  'src/services/localApi.ts',
  'src/components/leads/Leads.tsx',
  'src/App.tsx',
]) {
  const source = read(file);
  assert.equal(source.includes('SUPABASE_SERVICE_ROLE_KEY'), false, `${file} must not contain SUPABASE_SERVICE_ROLE_KEY`);
  assert.equal(source.includes('VITE_SUPABASE_SERVICE_ROLE_KEY'), false, `${file} must not contain VITE_SUPABASE_SERVICE_ROLE_KEY`);
}

console.log('supabase lead sync UI tests passed');
