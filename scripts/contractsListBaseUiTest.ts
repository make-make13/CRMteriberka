import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/components/contracts/Contracts.tsx', import.meta.url), 'utf8');

assert.equal(source.includes('setBaseFilter'), false, 'Contracts list must not expose base filter state');
assert.equal(source.includes('baseFilter'), false, 'Contracts list must not filter visibly by legacy base');
assert.equal(source.includes('Все базы'), false, 'Contracts list must not show "Все базы"');
assert.equal(source.includes('Чунга-Чанга'), false, 'Contracts list must not show legacy Chunga-Changa label');
assert.equal(source.includes('Голубая Бухта'), false, 'Contracts list must not show legacy Golubaya Bukhta label');
assert.equal(source.includes('>База<'), false, 'Contracts table must not render base column');

assert.ok(source.includes('Новый договор'), 'New contract button should remain');
assert.ok(source.includes('На печать'), 'Print action should remain');
assert.ok(source.includes('На отправку'), 'Send action should remain');
assert.ok(source.includes('Период заселения'), 'Settlement period filter should remain');

console.log('contracts list base UI tests passed');
