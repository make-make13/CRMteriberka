import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const source = fs.readFileSync(path.join(root, 'src', 'utils', 'docx', 'bmDocxBuilder.ts'), 'utf8');
const generatorSource = fs.readFileSync(path.join(root, 'src', 'utils', 'docx', 'bmContractGenerator.ts'), 'utf8');
const contractsSource = fs.readFileSync(path.join(root, 'src', 'components', 'contracts', 'Contracts.tsx'), 'utf8');
const contractModalSource = fs.readFileSync(path.join(root, 'src', 'components', 'contracts', 'ContractModal.tsx'), 'utf8');
const electronBuilderConfig = fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf8');
const executorSignatureBlockPath = path.join(root, 'public', 'pdfme-assets', 'executor-signature-block.png');

assert.match(source, /EMPTY_SIGNATURE_PARAGRAPH_LINE_TWP/, 'DOCX builder must account for the empty paragraph line height in signature spacer.');
assert.match(source, /SIGNED_GUEST_SIGNATURE_SPACER/, 'DOCX builder must use a dedicated signed guest spacer.');
assert.match(source, /IMAGES_TOTAL_TWP - EMPTY_SIGNATURE_PARAGRAPH_LINE_TWP/, 'signed guest spacer must be shorter than the raw image stack height.');
assert.match(source, /getExecutorPreLineStackHeight/, 'signed spacer must be based on images that are above the director line.');
assert.match(source, /Math\.max\(0,\s*executorPreLineStackHeight - EMPTY_SIGNATURE_PARAGRAPH_LINE_TWP\)/, 'guest spacer must follow only the executor pre-line image stack height.');
assert.ok(fs.existsSync(executorSignatureBlockPath), 'executor signature block asset must exist.');
assert.match(source, /executorSignatureBlockPath\?: string/, 'DOCX builder must accept the fixed executor signature block asset.');
assert.match(source, /EXECUTOR_SIGNATURE_BLOCK_PX\s*=\s*\{\s*width:\s*280,\s*height:\s*118\s*\}/, 'executor signature block must preserve readable signature, stamp, and line sizes.');
assert.match(source, /EXECUTOR_SIGNATURE_BLOCK_LINE_TWP\s*=\s*39\s*\*\s*15/, 'guest line alignment must follow the line position inside the fixed executor block.');
assert.match(source, /hasExecutorSignatureBlockAsset/, 'signed layout must prefer the fixed executor signature block when packaged.');
assert.match(source, /transformation:\s*EXECUTOR_SIGNATURE_BLOCK_PX/, 'signed layout must render the fixed executor signature block.');
assert.doesNotMatch(source, /floating:/, 'BM DOCX signature layout must not use floating images because LibreOffice conversion can hang.');
assert.doesNotMatch(source, /const spacerAfter = isSigned \? SIGNED_GUEST_SIGNATURE_SPACER : HAND_SIG_AREA/, 'guest spacer must not assume signed images exist.');
assert.match(generatorSource, /process\.cwd\(\),\s*'public',\s*'pdfme-assets'/, 'asset lookup must work from packaged app cwd.');
assert.match(generatorSource, /candidate => fs\.existsSync\(candidate\)/, 'asset lookup must choose an existing packaged/source asset path.');
assert.match(generatorSource, /executor-signature-block\.png/, 'BM contract generator must resolve the fixed executor signature block asset.');
assert.match(generatorSource, /executorSignatureBlockPath:\s*resolveAsset\('executor-signature-block\.png'/, 'BM contract generator must pass the fixed executor signature block asset to the DOCX builder.');
assert.match(electronBuilderConfig, /public\/pdfme-assets\/\*\*\//, 'installer must include stamp/signature assets.');
assert.match(contractsSource, /downloadBmContract\(\s*String\(contract\.id\),\s*bmMode,\s*'pdf',\s*'code'/, 'contracts list must use the aligned code generator, not stale active templates.');
assert.match(contractModalSource, /downloadBmContract\(\s*String\(initialData\.id\),\s*bmMode,\s*'pdf',\s*'code'/, 'contract modal must use the aligned code generator, not stale active templates.');

console.log('BM DOCX signature alignment source checks passed.');
