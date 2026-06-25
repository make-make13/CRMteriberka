import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const source = fs.readFileSync(path.join(root, 'src', 'utils', 'docx', 'bmDocxBuilder.ts'), 'utf8');
const generatorSource = fs.readFileSync(path.join(root, 'src', 'utils', 'docx', 'bmContractGenerator.ts'), 'utf8');
const contractsSource = fs.readFileSync(path.join(root, 'src', 'components', 'contracts', 'Contracts.tsx'), 'utf8');
const contractModalSource = fs.readFileSync(path.join(root, 'src', 'components', 'contracts', 'ContractModal.tsx'), 'utf8');
const electronBuilderConfig = fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf8');

assert.match(source, /EMPTY_SIGNATURE_PARAGRAPH_LINE_TWP/, 'DOCX builder must account for the empty paragraph line height in signature spacer.');
assert.match(source, /SIGNED_GUEST_SIGNATURE_SPACER/, 'DOCX builder must use a dedicated signed guest spacer.');
assert.match(source, /IMAGES_TOTAL_TWP - EMPTY_SIGNATURE_PARAGRAPH_LINE_TWP/, 'signed guest spacer must be shorter than the raw image stack height.');
assert.match(source, /getExecutorImageStackHeight/, 'signed spacer must be based on images that actually exist.');
assert.match(source, /Math\.max\(0,\s*executorImageStackHeight - EMPTY_SIGNATURE_PARAGRAPH_LINE_TWP\)/, 'guest spacer must follow the actual executor image stack height.');
assert.match(source, /STAMP_PX\s*=\s*\{\s*width:\s*58,\s*height:\s*58\s*\}/, 'signed stamp must stay compact so it does not push signatures down.');
assert.match(source, /SIG_PX\s*=\s*\{\s*width:\s*72,\s*height:\s*28\s*\}/, 'signed director signature image must stay compact.');
assert.doesNotMatch(source, /const spacerAfter = isSigned \? SIGNED_GUEST_SIGNATURE_SPACER : HAND_SIG_AREA/, 'guest spacer must not assume signed images exist.');
assert.match(generatorSource, /process\.cwd\(\),\s*'public',\s*'pdfme-assets'/, 'asset lookup must work from packaged app cwd.');
assert.match(generatorSource, /candidate => fs\.existsSync\(candidate\)/, 'asset lookup must choose an existing packaged/source asset path.');
assert.match(electronBuilderConfig, /public\/pdfme-assets\/\*\*\//, 'installer must include stamp/signature assets.');
assert.match(contractsSource, /downloadBmContract\(\s*String\(contract\.id\),\s*bmMode,\s*'pdf',\s*'code'/, 'contracts list must use the aligned code generator, not stale active templates.');
assert.match(contractModalSource, /downloadBmContract\(\s*String\(initialData\.id\),\s*bmMode,\s*'pdf',\s*'code'/, 'contract modal must use the aligned code generator, not stale active templates.');

console.log('BM DOCX signature alignment source checks passed.');
