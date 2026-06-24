import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const source = fs.readFileSync(path.join(root, 'server', 'backupService.ts'), 'utf8');

assert.match(source, /function getRcloneCommandCandidates/, 'backupService must collect explicit rclone command candidates.');
assert.match(source, /Microsoft[\\'"],\s*[\\'"]WinGet[\\'"],\s*[\\'"]Links[\\'"],\s*[\\'"]rclone\.exe/, 'rclone lookup must include the WinGet Links shim path.');
assert.match(source, /ProgramFiles/, 'rclone lookup must include Program Files install paths.');
assert.match(source, /for \(const command of getRcloneCommandCandidates\(\)\)/, 'checkRclone must try all known command candidates.');
assert.match(source, /const rclone = await checkRclone\(\)/, 'installRclone must verify rclone availability after winget completes.');
assert.match(source, /Установка завершилась, но rclone пока не найден/, 'installRclone must report a failed post-install availability check.');

console.log('rclone install compatibility source checks passed.');
