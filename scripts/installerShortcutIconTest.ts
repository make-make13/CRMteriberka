import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const nsisSource = fs.readFileSync(path.join(root, 'scripts', 'nsis-installer.nsh'), 'utf8');
const builderConfig = fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf8');

assert.match(
  builderConfig,
  /win:\s*[\s\S]*icon:\s*assets\/app-icon\/icon\.ico/,
  'electron-builder must point Windows builds at the app ICO.',
);
assert.match(
  nsisSource,
  /\$INSTDIR\\resources\\app\\assets\\app-icon\\icon\.ico/,
  'NSIS installer must use the packaged ICO file for shortcuts.',
);
assert.match(
  nsisSource,
  /CreateShortCut\s+"\$newDesktopLink"\s+"\$appExe"\s+""\s+"\$0"/,
  'Desktop shortcut must be recreated with the explicit packaged ICO.',
);
assert.match(
  nsisSource,
  /CreateShortCut\s+"\$newStartMenuLink"\s+"\$appExe"\s+""\s+"\$0"/,
  'Start menu shortcut must be recreated with the explicit packaged ICO.',
);

console.log('installer shortcut icon checks passed.');
