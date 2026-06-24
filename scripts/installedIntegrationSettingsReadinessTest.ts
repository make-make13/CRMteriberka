import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dbSource = fs.readFileSync(path.join(root, 'server', 'localDatabase.ts'), 'utf8');
const supabaseSyncSource = fs.readFileSync(path.join(root, 'server', 'supabaseLeadSync.ts'), 'utf8');
const docxToPdfSource = fs.readFileSync(path.join(root, 'src', 'utils', 'docx', 'docxToPdf.ts'), 'utf8');
const leadsUiSource = fs.readFileSync(path.join(root, 'src', 'components', 'leads', 'Leads.tsx'), 'utf8');
const integrationsUiSource = fs.readFileSync(path.join(root, 'src', 'components', 'settings', 'IntegrationsSettingsTab.tsx'), 'utf8');
const systemStatusUiSource = fs.readFileSync(path.join(root, 'src', 'components', 'settings', 'SystemStatusTab.tsx'), 'utf8');
const emailUiSource = fs.readFileSync(path.join(root, 'src', 'components', 'settings', 'EmailSettingsTab.tsx'), 'utf8');
const builderConfig = fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf8');

assert.doesNotMatch(
  dbSource,
  /if \(clientsCount > 0 \|\| contractsCount > 0 \|\| bookingsCount > 0\) \{[\s\S]*?return;\s*\}/,
  'Installed CRM must seed missing settings even when an existing user database already has clients/contracts/bookings.',
);

assert.match(dbSource, /normalizeEmailSettings/, 'Email settings must normalize legacy SMTP field names.');
assert.match(dbSource, /raw\.smtpHost/, 'Legacy smtpHost must be mapped to host.');
assert.match(dbSource, /raw\.smtpPort/, 'Legacy smtpPort must be mapped to port.');
assert.match(dbSource, /raw\.smtpSecure/, 'Legacy smtpSecure must be mapped to secure.');
assert.match(dbSource, /raw\.authUser/, 'Legacy authUser must be mapped to senderEmail.');

assert.match(dbSource, /host:\s*'smtp\.mail\.ru'/, 'Default SMTP seed must use the current host field.');
assert.match(dbSource, /port:\s*465/, 'Default SMTP seed must use the current port field.');
assert.match(dbSource, /secure:\s*true/, 'Default SMTP seed must use the current secure field.');
assert.doesNotMatch(dbSource, /smtpHost:\s*'smtp\.mail\.ru'/, 'Default SMTP seed must not use legacy smtpHost.');

assert.match(
  integrationsUiSource,
  /После установки/,
  'Integrations UI must explicitly explain that installed CRM keys are configured in the CRM screen.',
);
assert.match(
  integrationsUiSource,
  /переменные окружения нужны только для разработки/,
  'Integrations UI must not make installed users think .env.local is the primary configuration path.',
);
assert.match(
  emailUiSource,
  /Пустое поле пароля при сохранении не меняет сохранённый пароль/,
  'Email UI must clearly explain preserved SMTP password behavior.',
);

assert.doesNotMatch(
  supabaseSyncSource,
  /SUPABASE_URL[\s\S]{0,120}\.env\.local/,
  'Installed Supabase errors must direct users to CRM settings, not .env.local.',
);
assert.doesNotMatch(
  leadsUiSource,
  /\.env\.local/,
  'Lead sync UI errors must direct users to CRM settings, not .env.local.',
);
assert.doesNotMatch(
  systemStatusUiSource,
  /fallback:\s*\.env\.local/,
  'System status must not describe .env.local as the installed-app fallback.',
);
assert.doesNotMatch(
  docxToPdfSource,
  /LIBREOFFICE_PATH[\s\S]{0,120}\.env\.local/,
  'Installed LibreOffice errors must direct users to CRM settings, not .env.local.',
);

assert.match(builderConfig, /files:\s*[\s\S]*dist-server\/\*\*\/\*/, 'Installer config must include backend bundle.');
assert.doesNotMatch(builderConfig, /\.env\.local/, 'Installer config must not bundle .env.local secrets.');

console.log('installed integration settings readiness checks passed.');
