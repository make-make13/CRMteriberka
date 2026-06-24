import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  formatLeadContactValue,
  formatLeadGuestName,
  formatLeadObjectType,
  formatLeadOptionalValue,
} from '../src/components/leads/leadDisplay.ts';

const rootPath = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const leadsSource = fs.readFileSync(path.join(rootPath, 'src/components/leads/Leads.tsx'), 'utf8');

const cleanFamilyRoom = '\u0421\u0435\u043c\u0435\u0439\u043d\u044b\u0439 \u043d\u043e\u043c\u0435\u0440';
const cleanSeaViewRoom = '\u0421\u0442\u0430\u043d\u0434\u0430\u0440\u0442 \u043e\u0434\u043d\u043e\u043c\u0435\u0441\u0442\u043d\u044b\u0439 \u00b7 \u0432\u0438\u0434 \u043d\u0430 \u043c\u043e\u0440\u0435';
const unspecifiedLabel = '\u0422\u0438\u043f \u043d\u043e\u043c\u0435\u0440\u0430 \u043d\u0435 \u0443\u043a\u0430\u0437\u0430\u043d';
const damagedLabel = '\u0422\u0438\u043f \u043d\u043e\u043c\u0435\u0440\u0430 \u043d\u0435 \u043e\u043f\u0440\u0435\u0434\u0435\u043b\u0451\u043d';
const cleanGuestLabel = '\u0413\u043e\u0441\u0442\u044c';
const missingGuestLabel = '\u0413\u043e\u0441\u0442\u044c \u043d\u0435 \u0443\u043a\u0430\u0437\u0430\u043d';
const damagedGuestLabel = '\u0414\u0430\u043d\u043d\u044b\u0435 \u0433\u043e\u0441\u0442\u044f \u043d\u0435 \u043e\u043f\u0440\u0435\u0434\u0435\u043b\u0435\u043d\u044b';

assert.equal(formatLeadObjectType(cleanFamilyRoom), cleanFamilyRoom, 'clean room type must be displayed unchanged');
assert.equal(formatLeadObjectType(cleanSeaViewRoom), cleanSeaViewRoom, 'clean room type with separator must be displayed unchanged');
assert.equal(formatLeadObjectType(''), unspecifiedLabel, 'empty room type must use an unspecified fallback');
assert.equal(formatLeadObjectType(undefined), unspecifiedLabel, 'missing room type must use an unspecified fallback');
assert.equal(formatLeadObjectType('\uFFFD\uFFFD\uFFFD\uFFFD'), damagedLabel, 'replacement characters must use a damaged-value fallback');
assert.equal(formatLeadObjectType('????'), damagedLabel, 'question-mark damaged values must use a damaged-value fallback');
assert.equal(formatLeadObjectType('????? 2'), damagedLabel, 'values with repeated question marks must use a damaged-value fallback');

assert.match(leadsSource, /formatLeadObjectType/, 'Leads list must render objectType through formatLeadObjectType');
assert.equal(formatLeadGuestName(cleanGuestLabel), cleanGuestLabel, 'clean guest display name must be displayed unchanged');
assert.equal(formatLeadGuestName(''), missingGuestLabel, 'empty guest display name must use a missing guest fallback');
assert.equal(formatLeadGuestName('\uFFFD\uFFFD\uFFFD'), damagedGuestLabel, 'damaged guest display name must use a damaged guest fallback');
assert.equal(formatLeadGuestName('????'), damagedGuestLabel, 'question-mark guest display name must use a damaged guest fallback');
assert.equal(formatLeadContactValue('\uFFFD\uFFFD'), '\u2014', 'damaged contact values must be hidden behind a dash fallback');
assert.equal(formatLeadContactValue('????'), '\u2014', 'question-mark contact values must be hidden behind a dash fallback');
assert.equal(formatLeadOptionalValue('\uFFFD\uFFFD'), '', 'damaged optional values must be hidden behind an empty fallback');
assert.match(leadsSource, /formatLeadGuestName/, 'Leads list must render guestName through formatLeadGuestName');
assert.match(leadsSource, /formatLeadContactValue\(lead\.phone\)/, 'Leads list must render phone through formatLeadContactValue');
assert.match(leadsSource, /formatLeadContactValue\(lead\.email\)/, 'Leads list must render email through formatLeadContactValue');
assert.match(leadsSource, /formatLeadOptionalValue\(lead\.desiredTime/, 'Leads list must render desiredTime through formatLeadOptionalValue');

console.log('lead objectType display test passed');
