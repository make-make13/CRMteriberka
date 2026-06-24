import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseJsonSafe } from '../src/components/leads/leadDisplay.ts';

const rootPath = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

function read(file: string) {
  return fs.readFileSync(path.join(rootPath, file), 'utf8');
}

const displayPath = path.join(rootPath, 'src/components/leads/leadDisplay.ts');

assert.equal(fs.existsSync(displayPath), true, 'lead display helpers must be isolated in leadDisplay.ts');

const displaySource = read('src/components/leads/leadDisplay.ts');
const leadsSource = read('src/components/leads/Leads.tsx');
const modalSource = read('src/components/leads/LeadModal.tsx');
const badgeSource = read('src/components/leads/LeadStatusBadge.tsx');

assert.match(displaySource, /bolshaya-medveditsa-landing[\s\S]*['"`]Сайт['"`]/, 'bolshaya-medveditsa-landing must be shown as Сайт');
assert.match(displaySource, /local[\s\S]*['"`]Локально['"`]/, 'local source must be shown as Локально');
assert.match(displaySource, /api-smoke[\s\S]*['"`]API['"`]/, 'api-smoke source must be shown as API');
assert.match(displaySource, /\bapi\b[\s\S]*['"`]API['"`]/, 'api source must be shown as API');
assert.match(displaySource, /Другое/, 'unknown source must fall back to Другое');

assert.match(displaySource, /supabaseId[\s\S]*Синхронизирована из Supabase|supabaseId[\s\S]*Заявка получена с сайта/, 'Supabase leads must not be labelled as local');
assert.match(displaySource, /Локальная заявка/, 'local leads must keep a local label');
assert.equal(modalSource.includes('Локальная заявка без синхронизации'), false, 'Supabase lead must not be rendered with the old local-without-sync label');

assert.match(displaySource, /parseJsonSafe/, 'utmJson/rawJson parsing must use parseJsonSafe');
assert.match(displaySource, /try\s*{[\s\S]*JSON\.parse[\s\S]*}\s*catch/, 'parseJsonSafe must guard JSON.parse with try/catch');
assert.equal(/JSON\.parse/.test(leadsSource), false, 'Leads.tsx must not call JSON.parse directly');
assert.equal(/JSON\.parse/.test(modalSource), false, 'LeadModal.tsx must not call JSON.parse directly');

assert.match(badgeSource, /Неизвестный статус/, 'LeadStatusBadge must render an unknown-status fallback');
assert.match(badgeSource, /statusIcon\[[^\]]+\]\s*\|\|/, 'LeadStatusBadge must fall back to a safe icon');
assert.match(badgeSource, /statusClass\[[^\]]+\]\s*\|\|/, 'LeadStatusBadge must fall back to a safe class');
assert.match(badgeSource, /LEAD_STATUS_LABELS\[[^\]]+\]\s*\|\|/, 'LeadStatusBadge must fall back to a safe label');

assert.match(leadsSource, /formatLeadSource/, 'Leads list must render formatted source labels');
assert.match(modalSource, /formatLeadSource/, 'Lead modal must render formatted source labels');
assert.match(modalSource, /getLeadOriginLabel/, 'Lead modal must render Supabase/local origin labels');

const parsedArray = parseJsonSafe('[{"role":"user","text":"ok"}]');
assert.equal(Array.isArray(parsedArray), true, 'valid JSON arrays must still parse');
assert.deepEqual(parseJsonSafe(null), null, 'null JSON value must return fallback');
assert.deepEqual(parseJsonSafe(undefined), null, 'undefined JSON value must return fallback');
assert.deepEqual(parseJsonSafe(''), null, 'empty JSON value must return fallback');
assert.deepEqual(parseJsonSafe('{bad json'), null, 'invalid JSON value must return fallback');

console.log('leads runtime safety tests passed');
