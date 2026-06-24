import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

const root = process.cwd();
const envPath = path.join(root, '.env.local');
const outDir = path.join(root, 'build');
const outPath = path.join(outDir, 'packaged-default-settings.json');

const parsedEnv = fs.existsSync(envPath)
  ? dotenv.parse(fs.readFileSync(envPath))
  : {};

const env = { ...parsedEnv, ...process.env };
const value = (name, fallback = '') => String(env[name] ?? fallback).trim();
const boolValue = (name, fallback) => {
  const raw = value(name);
  if (!raw) return fallback;
  return raw !== 'false' && raw !== '0' && raw.toLowerCase() !== 'no';
};
const numberValue = (name, fallback) => {
  const parsed = Number(value(name));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const required = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SMTP_USER',
  'SMTP_PASSWORD',
];
const missing = required.filter(name => !value(name));
if (missing.length) {
  console.error(`[packaged-defaults] Missing required variables: ${missing.join(', ')}`);
  console.error('[packaged-defaults] Installer was not built because required packaged integration settings are incomplete.');
  process.exit(1);
}

const packagedDefaults = {
  version: 1,
  generatedAt: new Date().toISOString(),
  integrations: {
    supabaseUrl: value('SUPABASE_URL'),
    supabaseServiceKey: value('SUPABASE_SERVICE_ROLE_KEY'),
    supabaseTable: value('SUPABASE_LEADS_TABLE', 'leads'),
    supabaseSyncLimit: numberValue('SUPABASE_LEAD_SYNC_LIMIT', 50),
    supabaseAutoSyncEnabled: boolValue('SUPABASE_AUTO_SYNC_ENABLED', false),
    supabaseAutoSyncIntervalMinutes: numberValue('SUPABASE_AUTO_SYNC_INTERVAL_MINUTES', 5),
    libreOfficePath: value('LIBREOFFICE_PATH'),
    aiBackendUrl: value('AI_BACKEND_URL'),
    aiBackendKey: value('AI_BACKEND_KEY'),
    aiConsoleUrl: value('AI_CONSOLE_URL'),
  },
  email: {
    senderEmail: value('SMTP_USER'),
    senderName: value('SMTP_FROM_NAME', 'Большая Медведица'),
    defaultMessage: value('SMTP_DEFAULT_MESSAGE', 'Спасибо, что обратились к нам'),
    host: value('SMTP_HOST', 'smtp.mail.ru'),
    port: numberValue('SMTP_PORT', 465),
    secure: boolValue('SMTP_SECURE', true),
    appPassword: value('SMTP_PASSWORD'),
  },
  backup: {
    remote1: value('BACKUP_REMOTE_1', 'big_medveditsa_cloud_1'),
    remote2: value('BACKUP_REMOTE_2', 'big_medveditsa_cloud_2'),
    cloudPath: value('BACKUP_CLOUD_PATH', 'BigMedveditsaCRM/backups'),
  },
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(packagedDefaults, null, 2)}\n`, { mode: 0o600 });

const rclonePath = path.join(root, 'tools', 'rclone', 'rclone.exe');
const rcloneMessage = fs.existsSync(rclonePath)
  ? 'local rclone.exe will be included'
  : 'local rclone.exe not found; installed app will use winget/system rclone fallback';

console.log(`[packaged-defaults] Generated packaged integration defaults (${rcloneMessage}).`);
