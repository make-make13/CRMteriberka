import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function read(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const modal = read('src/components/common/DocumentPreviewModal.tsx');

assert(
  modal.includes('../../utils/pdfjsCompat') || modal.includes('../utils/pdfjsCompat'),
  'DocumentPreviewModal must install pdf.js main-thread compatibility before importing pdf.js.',
);

assert(
  modal.includes('pdfjsWorkerCompat?worker'),
  'DocumentPreviewModal must use the compatibility worker wrapper instead of importing pdf.worker directly.',
);

const mainCompat = read('src/utils/pdfjsCompat.ts');
const workerCompat = read('src/utils/pdfjsWorkerCompat.ts');

assert(
  mainCompat.includes('Uint8Array.prototype') && mainCompat.includes("'toHex'"),
  'main compatibility module must polyfill Uint8Array.prototype.toHex.',
);
assert(mainCompat.includes('getOrInsertComputed'), 'main compatibility module must polyfill getOrInsertComputed.');
assert(workerCompat.includes('./pdfjsCompat'), 'worker compatibility module must install shared pdf.js compatibility first.');

assert(
  workerCompat.includes("pdfjs-dist/build/pdf.worker.min.mjs"),
  'worker compatibility module must load the real pdf.js worker after polyfills.',
);

console.log('PDF.js preview compatibility source checks passed.');
