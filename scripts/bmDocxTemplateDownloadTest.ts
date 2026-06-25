import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const routerSource = fs.readFileSync(path.join(root, 'server', 'bmDocxTemplateRouter.ts'), 'utf8');
const tabSource = fs.readFileSync(path.join(root, 'src', 'components', 'settings', 'BmDocxTemplatesTab.tsx'), 'utf8');
const electronBuilderConfig = fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf8');

for (const mode of ['print', 'signed'] as const) {
  const templatePath = path.join(root, 'templates', 'docx', 'bm', `${mode}.docx`);
  assert.ok(fs.existsSync(templatePath), `default BM ${mode} DOCX template must exist`);
}

assert.match(routerSource, /function getDefaultTemplatePath\(mode: TemplateMode\)/, 'backend must know where default BM templates are stored.');
assert.match(routerSource, /templates',\s*'docx',\s*'bm'/, 'backend default template path must point to templates/docx/bm.');
assert.match(routerSource, /const fileToSend = fs\.existsSync\(activeFile\) \? activeFile : defaultFile;/, 'download endpoint must fall back to default template when active template is missing.');
assert.match(tabSource, /handleDownloadTemplate/, 'settings UI must expose template download action.');
assert.doesNotMatch(tabSource, /\{hasActive && \(\s*<motion\.button[\s\S]*?handleDownloadTemplate/, 'download template button must not be hidden when active template is missing.');
assert.match(tabSource, /Скачать базовый шаблон/, 'settings UI must label default template download clearly.');
assert.match(electronBuilderConfig, /templates\/docx\/bm\/\*\*\/\*/, 'installer must include default BM DOCX templates.');

console.log('BM DOCX template download checks passed.');
