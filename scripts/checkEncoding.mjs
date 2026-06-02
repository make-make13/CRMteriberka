import fs from 'node:fs';
import path from 'node:path';

const ROOTS = ['src', 'server', 'server.ts', 'scripts'];
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const SELF = path.normalize('scripts/checkEncoding.mjs');
const IGNORED_FILES = new Set([
  path.normalize('src/utils/pdfmeTemplates.ts'),
  path.normalize('src/utils/pdfmeTemplatesTest.ts'),
  path.normalize('scripts/auditFixesTest.ts'),
]);

const SUSPICIOUS_PATTERNS = [
  '\u0420\u045f',
  '\u0420\u045a',
  '\u0420\u040b',
  '\u0420\u2019',
  '\u0420\u040e',
  '\u0420\u00b0',
  '\u0420\u00b5',
  '\u0420\u00b8',
  '\u0421\u0403',
  '\u0421\u201a',
  '\u0421\u040c',
];

function walk(target, files = []) {
  if (!fs.existsSync(target)) return files;
  const stat = fs.statSync(target);
  if (stat.isFile()) {
    const normalized = path.normalize(target);
    if (normalized !== SELF && !IGNORED_FILES.has(normalized) && EXTENSIONS.has(path.extname(target))) {
      files.push(target);
    }
    return files;
  }

  for (const item of fs.readdirSync(target)) {
    walk(path.join(target, item), files);
  }

  return files;
}

const findings = [];

for (const file of ROOTS.flatMap(root => walk(root))) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);

  lines.forEach((line, index) => {
    const pattern = SUSPICIOUS_PATTERNS.find(item => line.includes(item));
    if (pattern) {
      findings.push({
        file,
        line: index + 1,
        sample: line.trim().slice(0, 140),
      });
    }
  });
}

if (findings.length > 0) {
  console.error('Encoding check failed: possible mojibake was found.');
  for (const finding of findings.slice(0, 40)) {
    console.error(`${finding.file}:${finding.line}: ${finding.sample}`);
  }
  if (findings.length > 40) {
    console.error(`...and ${findings.length - 40} more findings`);
  }
  process.exit(1);
}

console.log('Encoding check passed.');
