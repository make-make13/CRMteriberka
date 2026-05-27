import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/components/contracts/ContractModal.tsx', import.meta.url), 'utf8');

assert.equal(source.includes('setBaseType'), false, 'ContractModal must not expose base switching state');
assert.equal(source.includes('Base Toggle'), false, 'ContractModal must not render the old base toggle');
assert.match(source, /const baseType = 'chunga-changa' as BaseType;/, 'New/edit contract baseType must be fixed to chunga-changa');
assert.match(source, /Старый объект \/ неактивный объект/, 'Legacy objects need a safe fallback label');
assert.match(source, /return CC_OBJECTS;/, 'Current room options should derive from CC_OBJECTS');

const ccDropdownStart = source.indexOf('{showCcCottageDropdown &&');
const ccDropdownEnd = source.indexOf('{/* Booking Details', ccDropdownStart);
const ccDropdownSource = source.slice(ccDropdownStart, ccDropdownEnd);

assert.ok(ccDropdownSource.includes('ccObjectOptions.map'), 'Current room dropdown should use safe current-room options');
assert.equal(ccDropdownSource.includes('GB_OBJECTS.map'), false, 'Current room dropdown must not show GB_OBJECTS');

console.log('contract modal base UI tests passed');
