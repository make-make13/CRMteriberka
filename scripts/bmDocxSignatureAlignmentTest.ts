import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const source = fs.readFileSync(path.join(root, 'src', 'utils', 'docx', 'bmDocxBuilder.ts'), 'utf8');
const contractsSource = fs.readFileSync(path.join(root, 'src', 'components', 'contracts', 'Contracts.tsx'), 'utf8');
const contractModalSource = fs.readFileSync(path.join(root, 'src', 'components', 'contracts', 'ContractModal.tsx'), 'utf8');

assert.match(source, /EMPTY_SIGNATURE_PARAGRAPH_LINE_TWP/, 'DOCX builder must account for the empty paragraph line height in signature spacer.');
assert.match(source, /SIGNED_GUEST_SIGNATURE_SPACER/, 'DOCX builder must use a dedicated signed guest spacer.');
assert.match(source, /IMAGES_TOTAL_TWP - EMPTY_SIGNATURE_PARAGRAPH_LINE_TWP/, 'signed guest spacer must be shorter than the raw image stack height.');
assert.match(source, /const spacerAfter = isSigned \? SIGNED_GUEST_SIGNATURE_SPACER : HAND_SIG_AREA/, 'client signature must use the adjusted spacer in signed mode.');
assert.match(contractsSource, /downloadBmContract\(\s*String\(contract\.id\),\s*bmMode,\s*'pdf',\s*'code'/, 'contracts list must use the aligned code generator, not stale active templates.');
assert.match(contractModalSource, /downloadBmContract\(\s*String\(initialData\.id\),\s*bmMode,\s*'pdf',\s*'code'/, 'contract modal must use the aligned code generator, not stale active templates.');

console.log('BM DOCX signature alignment source checks passed.');
