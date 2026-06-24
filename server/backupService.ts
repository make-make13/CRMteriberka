import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { localDb, localPaths } from './localDatabase';

const execFileAsync = promisify(execFile);

const SCHEDULED_BACKUP_DIR = path.join(localPaths.backupDir, 'scheduled');
const TEMPLATE_BACKUP_DIR = path.join(localPaths.backupDir, 'templates');
const BACKUP_SETTINGS_ID = 'backup';
const BACKUP_STATUS_ID = 'backup_status';
// RCLONE_PATH   — полный путь к rclone.exe
// RCLONE_DIR    — папка с rclone.exe (добавляем rclone.exe в конце)
// fallback      — tools/rclone/rclone.exe рядом с process.cwd()
const LOCAL_RCLONE_PATH = (() => {
  if (process.env.RCLONE_PATH) return path.resolve(process.env.RCLONE_PATH);
  if (process.env.RCLONE_DIR)  return path.join(path.resolve(process.env.RCLONE_DIR), 'rclone.exe');
  return path.resolve(process.cwd(), 'tools', 'rclone', 'rclone.exe');
})();
const MIN_RETENTION = 1;
const MAX_RETENTION = 365;

type BackupMode = 'daily-cloud' | 'weekly-local' | 'shutdown';
type BackupKind = 'daily' | 'weekly' | 'monthly' | 'manual';
type RemoteKey = 'remote1' | 'remote2';

export interface BackupSettings {
  enabled: boolean;
  remote1: string;
  remote2: string;
  cloudPath: string;
  localDir: string;
  retentionDaily: number;
  retentionWeekly: number;
  retentionMonthly: number;
}

export interface BackupRemoteResult {
  key: RemoteKey;
  remote: string;
  ok: boolean;
  message: string;
  uploadedAt?: string;
}

export interface BackupRunResult {
  success: boolean;
  mode: BackupMode;
  createdAt: string;
  archivePath?: string;
  archiveName?: string;
  archiveSize?: number;
  localArchiveDeleted?: boolean;
  localCopies: Array<{ kind: BackupKind; path: string; size: number }>;
  remotes: BackupRemoteResult[];
  errors: string[];
}

export interface BackupStatus {
  settings: BackupSettings;
  rclone: {
    available: boolean;
    version?: string;
    error?: string;
  };
  lastRun: BackupRunResult | null;
  lastSuccessfulCloudBackupAt?: string;
  lastSuccessfulLocalBackupAt?: string;
  todayCloudBackupDone: boolean;
  scheduledDir: string;
}

export interface RcloneCommandResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  error?: string;
}

const DEFAULT_BACKUP_SETTINGS: BackupSettings = {
  enabled: true,
  remote1: 'big_medveditsa_cloud_1',
  remote2: 'big_medveditsa_cloud_2',
  cloudPath: 'BigMedveditsaCRM/backups',
  localDir: SCHEDULED_BACKUP_DIR,
  retentionDaily: 30,
  retentionWeekly: 12,
  retentionMonthly: 12,
};

const LEGACY_BACKUP_VALUES = new Set(['crm_cloud_1', 'crm_cloud_2', 'MyCRM/backups']);

function normalizeCloudValue(value: unknown, fallback: string) {
  const raw = String(value || '').trim();
  if (!raw || LEGACY_BACKUP_VALUES.has(raw)) return fallback;
  return raw;
}

const crcTable = new Uint32Array(256).map((_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(input: Buffer) {
  let crc = 0xffffffff;
  for (const byte of input) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function timestampForFile(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('-');
}

function toDosDateTime(date: Date) {
  const year = Math.max(1980, date.getFullYear());
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosTime, dosDate };
}

function writeZip(entries: Array<{ name: string; data: Buffer }>, outputPath: string) {
  const fileParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  const now = new Date();
  const { dosTime, dosDate } = toDosDateTime(now);

  for (const entry of entries) {
    const nameBuffer = Buffer.from(entry.name.replace(/\\/g, '/'), 'utf8');
    const compressed = zlib.deflateRawSync(entry.data, { level: 9 });
    const crc = crc32(entry.data);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(entry.data.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);

    fileParts.push(localHeader, nameBuffer, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(entry.data.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, nameBuffer);

    offset += localHeader.length + nameBuffer.length + compressed.length;
  }

  const centralOffset = offset;
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralOffset, 16);
  end.writeUInt16LE(0, 20);

  fs.writeFileSync(outputPath, Buffer.concat([...fileParts, ...centralParts, end]));
}

function getDefaultSettings(): BackupSettings {
  return { ...DEFAULT_BACKUP_SETTINGS };
}

function isPathInside(parent: string, child: string) {
  const relative = path.relative(parent, child);
  return relative === '' || Boolean(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function normalizeLocalDir(value: unknown, strict: boolean) {
  const fallback = DEFAULT_BACKUP_SETTINGS.localDir;
  const raw = String(value || fallback).trim();
  const resolved = path.resolve(raw || fallback);
  const backupRoot = path.resolve(localPaths.backupDir);

  if (isPathInside(backupRoot, resolved)) {
    return resolved;
  }

  if (strict) {
    throw new Error(`Папка резервных копий должна находиться внутри ${backupRoot}`);
  }
  return fallback;
}

function normalizeRetention(value: unknown, fallback: number, fieldName: keyof Pick<BackupSettings, 'retentionDaily' | 'retentionWeekly' | 'retentionMonthly'>, strict: boolean) {
  const normalized = Number(value ?? fallback);
  if (Number.isInteger(normalized) && normalized >= MIN_RETENTION && normalized <= MAX_RETENTION) {
    return normalized;
  }

  if (strict) {
    throw new Error(`${fieldName} должен быть целым числом от ${MIN_RETENTION} до ${MAX_RETENTION}`);
  }
  return fallback;
}

function normalizeSettings(settings: Partial<BackupSettings> | null | undefined, options: { strict?: boolean } = {}): BackupSettings {
  const strict = options.strict === true;
  return {
    ...getDefaultSettings(),
    ...(settings || {}),
    remote1: normalizeCloudValue(settings?.remote1, DEFAULT_BACKUP_SETTINGS.remote1),
    remote2: normalizeCloudValue(settings?.remote2, DEFAULT_BACKUP_SETTINGS.remote2),
    cloudPath: normalizeCloudValue(settings?.cloudPath, DEFAULT_BACKUP_SETTINGS.cloudPath),
    localDir: normalizeLocalDir(settings?.localDir, strict),
    retentionDaily: normalizeRetention(settings?.retentionDaily, DEFAULT_BACKUP_SETTINGS.retentionDaily, 'retentionDaily', strict),
    retentionWeekly: normalizeRetention(settings?.retentionWeekly, DEFAULT_BACKUP_SETTINGS.retentionWeekly, 'retentionWeekly', strict),
    retentionMonthly: normalizeRetention(settings?.retentionMonthly, DEFAULT_BACKUP_SETTINGS.retentionMonthly, 'retentionMonthly', strict),
  };
}

function isSameLocalDate(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function isSameWeek(a: Date, b: Date) {
  const weekStart = (date: Date) => {
    const copy = new Date(date);
    const day = copy.getDay() || 7;
    copy.setHours(0, 0, 0, 0);
    copy.setDate(copy.getDate() - day + 1);
    return copy.getTime();
  };
  return weekStart(a) === weekStart(b);
}

function isSameMonth(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function getBackupStatusData() {
  return localDb.getSettings<{
    lastRun: BackupRunResult | null;
    lastSuccessfulCloudBackupAt?: string;
    lastSuccessfulLocalBackupAt?: string;
  }>(BACKUP_STATUS_ID) || { lastRun: null };
}

function saveBackupStatusData(data: ReturnType<typeof getBackupStatusData>) {
  localDb.saveSettings(data, BACKUP_STATUS_ID);
}

async function checkRclone() {
  try {
    const command = fs.existsSync(LOCAL_RCLONE_PATH) ? LOCAL_RCLONE_PATH : 'rclone';
    const { stdout } = await execFileAsync(command, ['version'], { timeout: 8000 });
    return {
      available: true,
      version: stdout.split(/\r?\n/)[0] || 'rclone',
    };
  } catch (error) {
    return {
      available: false,
      error: 'rclone не найден. Установите rclone и настройте два remote-хранилища.',
    };
  }
}

function truncateCommandOutput(value: unknown) {
  return String(value || '').slice(0, 2000);
}

async function installRclone(): Promise<RcloneCommandResult> {
  if (process.platform !== 'win32') {
    return {
      ok: false,
      stdout: '',
      stderr: '',
      error: 'Установка через winget доступна только на Windows. Установите rclone вручную.',
    };
  }

  try {
    const { stdout, stderr } = await execFileAsync('winget', [
      'install',
      'Rclone.Rclone',
      '--accept-package-agreements',
      '--accept-source-agreements',
    ], { timeout: 180000 });
    return {
      ok: true,
      stdout: truncateCommandOutput(stdout),
      stderr: truncateCommandOutput(stderr),
    };
  } catch (error: any) {
    const code = error?.code;
    const wingetMissing = code === 'ENOENT';
    return {
      ok: false,
      stdout: truncateCommandOutput(error?.stdout),
      stderr: truncateCommandOutput(error?.stderr),
      error: wingetMissing
        ? 'winget не найден. Установите App Installer из Microsoft Store или установите rclone вручную.'
        : truncateCommandOutput(error?.message || error),
    };
  }
}

async function testRemote(remote: string, cloudPath: string): Promise<BackupRemoteResult> {
  try {
    const command = fs.existsSync(LOCAL_RCLONE_PATH) ? LOCAL_RCLONE_PATH : 'rclone';
    await execFileAsync(command, ['lsd', `${remote}:${cloudPath}`], { timeout: 15000 });
    return { key: remote.endsWith('2') ? 'remote2' : 'remote1', remote, ok: true, message: 'Доступ есть' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { key: remote.endsWith('2') ? 'remote2' : 'remote1', remote, ok: false, message };
  }
}

async function uploadToRemote(key: RemoteKey, remote: string, cloudPath: string, archivePath: string): Promise<BackupRemoteResult> {
  const archiveName = path.basename(archivePath);
  try {
    const command = fs.existsSync(LOCAL_RCLONE_PATH) ? LOCAL_RCLONE_PATH : 'rclone';
    await execFileAsync(command, ['copyto', archivePath, `${remote}:${cloudPath}/${archiveName}`], { timeout: 120000 });
    return { key, remote, ok: true, message: 'Загружено', uploadedAt: new Date().toISOString() };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { key, remote, ok: false, message };
  }
}

function collectTemplateBackupEntries() {
  const result: Array<{ name: string; data: Buffer }> = [];
  if (!fs.existsSync(TEMPLATE_BACKUP_DIR)) return result;

  const walk = (dir: string) => {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, item.name);
      if (item.isDirectory()) {
        walk(fullPath);
      } else if (item.isFile()) {
        const relative = path.relative(TEMPLATE_BACKUP_DIR, fullPath).replace(/\\/g, '/');
        result.push({
          name: `template-history/${relative}`,
          data: fs.readFileSync(fullPath),
        });
      }
    }
  };

  walk(TEMPLATE_BACKUP_DIR);
  return result;
}

async function createArchive(kind: BackupKind, settings: BackupSettings, options: { includeTemplateHistory: boolean }) {
  fs.mkdirSync(settings.localDir, { recursive: true });
  const createdAt = new Date();
  const stamp = timestampForFile(createdAt);
  const safeKind = kind.replace(/[^a-z0-9_-]/gi, '_');
  const sqliteBackupPath = await localDb.createBackup(`scheduled-${safeKind}`);
  const sqliteBuffer = fs.readFileSync(sqliteBackupPath);
  const archiveName = `crm-${safeKind}-${stamp}.zip`;
  const archivePath = path.join(settings.localDir, archiveName);
  const manifest = {
    app: 'BigMedveditsaCRM',
    createdAt: createdAt.toISOString(),
    kind,
    schemaVersion: 1,
    database: {
      fileName: 'crm.sqlite',
      size: sqliteBuffer.length,
      tables: localDb.getTableNames(),
      tableCounts: localDb.getTableCounts(),
    },
    includes: options.includeTemplateHistory
      ? ['crm.sqlite', 'manifest.json', 'template-history/*']
      : ['crm.sqlite', 'manifest.json'],
    excludes: ['.env.local', 'SMTP_PASSWORD', 'appPassword', 'generated-pdf-files'],
  };

  writeZip([
    { name: 'crm.sqlite', data: sqliteBuffer },
    { name: 'manifest.json', data: Buffer.from(JSON.stringify(manifest, null, 2), 'utf8') },
    ...(options.includeTemplateHistory ? collectTemplateBackupEntries() : []),
  ], archivePath);

  fs.unlinkSync(sqliteBackupPath);
  const stat = fs.statSync(archivePath);
  if (stat.size === 0) {
    throw new Error('Backup archive is empty');
  }
  return { kind, path: archivePath, size: stat.size };
}

function cleanupRetention(settings: BackupSettings) {
  if (!fs.existsSync(settings.localDir)) return;
  const limits: Record<BackupKind, number> = {
    daily: settings.retentionDaily,
    weekly: settings.retentionWeekly,
    monthly: settings.retentionMonthly,
    manual: settings.retentionDaily,
  };

  for (const kind of Object.keys(limits) as BackupKind[]) {
    const files = fs.readdirSync(settings.localDir)
      .filter(name => name.startsWith(`crm-${kind}-`) && name.endsWith('.zip'))
      .map(name => {
        const filePath = path.join(settings.localDir, name);
        return { path: filePath, mtime: fs.statSync(filePath).mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);

    for (const file of files.slice(limits[kind])) {
      fs.unlinkSync(file.path);
    }
  }
}

export const backupService = {
  async checkRclone() {
    return checkRclone();
  },

  async installRclone() {
    return installRclone();
  },

  getSettings() {
    return normalizeSettings(localDb.getSettings<Partial<BackupSettings>>(BACKUP_SETTINGS_ID));
  },

  saveSettings(settings: Partial<BackupSettings>) {
    const normalized = normalizeSettings(settings, { strict: true });
    localDb.saveSettings(normalized, BACKUP_SETTINGS_ID);
    return normalized;
  },

  async getStatus(): Promise<BackupStatus> {
    const settings = this.getSettings();
    const statusData = getBackupStatusData();
    const rclone = await checkRclone();
    const todayCloudBackupDone = Boolean(
      statusData.lastSuccessfulCloudBackupAt
        && isSameLocalDate(new Date(statusData.lastSuccessfulCloudBackupAt), new Date())
    );

    return {
      settings,
      rclone,
      lastRun: statusData.lastRun || null,
      lastSuccessfulCloudBackupAt: statusData.lastSuccessfulCloudBackupAt,
      lastSuccessfulLocalBackupAt: statusData.lastSuccessfulLocalBackupAt,
      todayCloudBackupDone,
      scheduledDir: settings.localDir,
    };
  },

  async testRemotes() {
    const settings = this.getSettings();
    const rclone = await checkRclone();
    if (!rclone.available) {
      return {
        rclone,
        remotes: [
          { key: 'remote1' as RemoteKey, remote: settings.remote1, ok: false, message: rclone.error || 'rclone не найден' },
          { key: 'remote2' as RemoteKey, remote: settings.remote2, ok: false, message: rclone.error || 'rclone не найден' },
        ],
      };
    }

    const remotes = await Promise.all([
      testRemote(settings.remote1, settings.cloudPath).then(result => ({ ...result, key: 'remote1' as RemoteKey })),
      testRemote(settings.remote2, settings.cloudPath).then(result => ({ ...result, key: 'remote2' as RemoteKey })),
    ]);
    return { rclone, remotes };
  },

  async run(mode: BackupMode): Promise<BackupRunResult> {
    const settings = this.getSettings();
    const createdAt = new Date();
    const localCopies: BackupRunResult['localCopies'] = [];
    const remotes: BackupRemoteResult[] = [];
    const errors: string[] = [];

    try {
      const mainKind: BackupKind = mode === 'weekly-local' ? 'weekly' : 'daily';
      const mainArchive = await createArchive(mainKind, settings, {
        includeTemplateHistory: mode === 'weekly-local',
      });
      localCopies.push(mainArchive);

      if (mode === 'shutdown') {
        const statusData = getBackupStatusData();
        if (!statusData.lastSuccessfulLocalBackupAt || !isSameWeek(new Date(statusData.lastSuccessfulLocalBackupAt), createdAt)) {
          localCopies.push(await createArchive('weekly', settings, { includeTemplateHistory: true }));
        }
        if (!statusData.lastSuccessfulLocalBackupAt || !isSameMonth(new Date(statusData.lastSuccessfulLocalBackupAt), createdAt)) {
          localCopies.push(await createArchive('monthly', settings, { includeTemplateHistory: true }));
        }
      }

      if (mode !== 'weekly-local') {
        const rclone = await checkRclone();
        if (!rclone.available) {
          const message = rclone.error || 'rclone не найден';
          remotes.push(
            { key: 'remote1', remote: settings.remote1, ok: false, message },
            { key: 'remote2', remote: settings.remote2, ok: false, message },
          );
          errors.push(message);
        } else {
          const uploadResults = await Promise.all([
            uploadToRemote('remote1', settings.remote1, settings.cloudPath, mainArchive.path),
            uploadToRemote('remote2', settings.remote2, settings.cloudPath, mainArchive.path),
          ]);
          remotes.push(...uploadResults);
          errors.push(...uploadResults.filter(result => !result.ok).map(result => `${result.remote}: ${result.message}`));
        }
      }

      cleanupRetention(settings);
      const localArchiveDeleted = mode !== 'weekly-local'
        && errors.length === 0
        && fs.existsSync(mainArchive.path);

      if (localArchiveDeleted) {
        fs.unlinkSync(mainArchive.path);
      }

      const runResult: BackupRunResult = {
        success: errors.length === 0,
        mode,
        createdAt: createdAt.toISOString(),
        archivePath: localArchiveDeleted ? undefined : localCopies[0]?.path,
        archiveName: localCopies[0] ? path.basename(localCopies[0].path) : undefined,
        archiveSize: localCopies[0]?.size,
        localArchiveDeleted,
        localCopies,
        remotes,
        errors,
      };

      const statusData = getBackupStatusData();
      if (localCopies.length > 0) {
        statusData.lastSuccessfulLocalBackupAt = runResult.createdAt;
      }
      if (mode !== 'weekly-local' && remotes.length === 2 && remotes.every(remote => remote.ok)) {
        statusData.lastSuccessfulCloudBackupAt = runResult.createdAt;
      }
      statusData.lastRun = runResult;
      saveBackupStatusData(statusData);
      return runResult;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const runResult: BackupRunResult = {
        success: false,
        mode,
        createdAt: createdAt.toISOString(),
        localCopies,
        remotes,
        errors: [...errors, message],
      };
      const statusData = getBackupStatusData();
      statusData.lastRun = runResult;
      saveBackupStatusData(statusData);
      return runResult;
    }
  },

  openBackupFolder() {
    fs.mkdirSync(this.getSettings().localDir, { recursive: true });
    spawn('explorer.exe', [this.getSettings().localDir], { detached: true, stdio: 'ignore' }).unref();
    return { success: true, path: this.getSettings().localDir };
  },
};
