import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const leadsSource = fs.readFileSync(path.join(root, 'src', 'components', 'leads', 'Leads.tsx'), 'utf8');
const modalSource = fs.readFileSync(path.join(root, 'src', 'components', 'leads', 'LeadModal.tsx'), 'utf8');

assert.match(modalSource, /onConfirmLead/, 'LeadModal must expose a dedicated confirm action callback.');
assert.match(modalSource, /handleConfirmLead/, 'LeadModal must route the confirm button through the dedicated confirm flow.');
assert.doesNotMatch(modalSource, /onClick=\{\(\) => handleQuickStatus\('confirmed'\)\}/, 'Confirm button must not only update status.');

assert.match(leadsSource, /handleConfirmLead/, 'Leads must implement a confirm flow.');
assert.match(leadsSource, /leadApi\.createClient\(id\)/, 'Confirm flow must create a client when the lead has no clientId.');
assert.match(
  leadsSource,
  /onCreatePrebookingFromLead\?\.\(leadForPrebooking\)|onCreatePrebookingFromLead\(leadForPrebooking\)/,
  'Confirm flow must open prebooking from the confirmed lead.',
);
assert.match(leadsSource, /desiredStartDate[\s\S]*desiredEndDate/, 'Confirm flow must require the requested dates before opening prebooking.');

console.log('lead confirm creates prebooking source checks passed.');
