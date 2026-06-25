import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const source = fs.readFileSync(path.join(root, 'src', 'components', 'common', 'DocumentPreviewModal.tsx'), 'utf8');

assert.match(source, /const restoreAppFocus = \(\) => \{/, 'DocumentPreviewModal must define focus restoration.');
assert.match(source, /pdfFrameRef\.current\?\.blur\(\)/, 'PDF iframe must be blurred when restoring focus.');
assert.match(source, /window\.focus\(\)/, 'Main window must be refocused after PDF preview actions.');
assert.match(source, /document\.body\.focus\(\{ preventScroll: true \}\)/, 'Document body must receive focus without scrolling.');
assert.match(source, /const handleClose = \(\) => \{[\s\S]*restoreAppFocus\(\);[\s\S]*onClose\(\);[\s\S]*\}/, 'Closing preview must restore app focus before closing.');
assert.match(source, /pdfFrameRef\.current\.contentWindow\.print\(\);[\s\S]*restoreAppFocus\(\);/, 'Printing from hidden PDF iframe must return focus to the app.');
assert.doesNotMatch(source, /onClick=\{onClose\}/, 'Close button must use the focus-safe close handler.');

console.log('Document preview focus checks passed.');
