import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import type { Database as DatabaseConnection } from 'better-sqlite3';
import { doBookingsConflict } from '../src/utils/bookingValidation';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3');

// Версия приложения — записывается в schema_migrations.app_version при применении миграции.
const _pkgJson = (() => {
  try { return require('../package.json') as { version?: string }; } catch { return {}; }
})();
const _APP_VERSION: string = typeof _pkgJson.version === 'string' ? _pkgJson.version : '0.0.0';

// ── Integration Settings types ──────────────────────────────────────────────

/** Полная запись настроек (хранится в SQLite, секреты не покидают сервер) */
export interface IntegrationSettingsStored {
  supabaseUrl?: string;
  supabaseServiceKey?: string;
  supabaseTable?: string;
  supabaseSyncLimit?: number;
  supabaseAutoSyncEnabled?: boolean;
  supabaseAutoSyncIntervalMinutes?: number;
  libreOfficePath?: string;
  aiBackendUrl?: string;
  aiBackendKey?: string;
  /** URL веб-панели BM-concierge (не секрет, отдаётся frontend как есть) */
  aiConsoleUrl?: string;
}

/** Входные данные для сохранения (пустой секрет = оставить прежнее) */
export interface IntegrationSettingsInput {
  supabaseUrl?: string;
  supabaseServiceKey?: string;
  supabaseTable?: string;
  supabaseSyncLimit?: number;
  supabaseAutoSyncEnabled?: boolean;
  supabaseAutoSyncIntervalMinutes?: number;
  libreOfficePath?: string;
  aiBackendUrl?: string;
  aiBackendKey?: string;
  aiConsoleUrl?: string;
}

interface PackagedDefaultSettings {
  integrations?: IntegrationSettingsInput;
  email?: {
    senderEmail?: string;
    senderName?: string;
    defaultMessage?: string;
    host?: string;
    port?: number;
    secure?: boolean;
    appPassword?: string;
  };
  backup?: {
    remote1?: string;
    remote2?: string;
    cloudPath?: string;
  };
}

function loadPackagedDefaultSettings(): PackagedDefaultSettings {
  const candidates = [
    process.env.CRM_PACKAGED_DEFAULTS_PATH || '',
    path.resolve(process.cwd(), 'build', 'packaged-default-settings.json'),
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      if (!fs.existsSync(candidate)) continue;
      const parsed = safeJsonParse<PackagedDefaultSettings>(
        fs.readFileSync(candidate, 'utf8'),
        {},
      );
      console.log('[DB] Loaded packaged default settings.');
      return parsed || {};
    } catch (error) {
      console.warn(`[DB] Failed to load packaged default settings from ${candidate}:`, error);
    }
  }

  return {};
}

/** Маскированный вид для frontend (секреты заменены маской) */
export interface IntegrationSettingsMasked {
  supabaseUrl: string;
  supabaseUrlSource: 'crm' | 'env' | 'none';
  supabaseTable: string;
  supabaseTableSource: 'crm' | 'env' | 'default';
  supabaseSyncLimit: number;
  supabaseAutoSyncEnabled: boolean;
  supabaseAutoSyncIntervalMinutes: number;
  supabaseServiceKeyMask: string;
  supabaseServiceKeyHas: boolean;
  supabaseServiceKeySource: 'crm' | 'env' | 'none';
  libreOfficePath: string;
  aiBackendUrl: string;
  aiBackendKeyMask: string;
  aiBackendKeyHas: boolean;
  /** URL веб-панели BM-concierge (не секрет) */
  aiConsoleUrl: string;
}

/** Маскирует секреты: показывает только последние 4 символа */
export function maskIntegrationSettings(s: IntegrationSettingsStored): IntegrationSettingsMasked {
  const maskSecret = (v: string | undefined) => {
    if (!v) return '';
    if (v.length <= 4) return '••••';
    return '••••••••' + v.slice(-4);
  };
  const envSupabaseUrl = process.env.SUPABASE_URL || '';
  const envSupabaseTable = process.env.SUPABASE_LEADS_TABLE || '';
  const envSupabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const effectiveSupabaseUrl = s.supabaseUrl || envSupabaseUrl;
  const effectiveSupabaseTable = s.supabaseTable || envSupabaseTable || 'leads';
  const effectiveSupabaseKey = s.supabaseServiceKey || envSupabaseKey;

  return {
    supabaseUrl:                    effectiveSupabaseUrl,
    supabaseUrlSource:              s.supabaseUrl ? 'crm' : (envSupabaseUrl ? 'env' : 'none'),
    supabaseTable:                  effectiveSupabaseTable,
    supabaseTableSource:            s.supabaseTable ? 'crm' : (envSupabaseTable ? 'env' : 'default'),
    supabaseSyncLimit:              s.supabaseSyncLimit              || 50,
    supabaseAutoSyncEnabled:        Boolean(s.supabaseAutoSyncEnabled),
    supabaseAutoSyncIntervalMinutes: s.supabaseAutoSyncIntervalMinutes || 5,
    supabaseServiceKeyMask:         maskSecret(effectiveSupabaseKey),
    supabaseServiceKeyHas:          Boolean(effectiveSupabaseKey),
    supabaseServiceKeySource:       s.supabaseServiceKey ? 'crm' : (envSupabaseKey ? 'env' : 'none'),
    libreOfficePath:                s.libreOfficePath                || '',
    aiBackendUrl:                   s.aiBackendUrl                   || '',
    aiBackendKeyMask:               maskSecret(s.aiBackendKey),
    aiBackendKeyHas:                Boolean(s.aiBackendKey),
    aiConsoleUrl:                   s.aiConsoleUrl                   || '',
  };
}

// ── Database records ─────────────────────────────────────────────────────────

export interface BookingRecord {
  id: string;
  contractId: string;
  objectId: string;
  baseType: string;
  startTime: string;
  endTime: string;
  type: string;
  price: number;
}

export interface ContractRecord {
  id: string;
  number: string;
  clientId: string;
  baseType: string;
  status: string;
  totalAmount: number;
  prepayment: number;
  remainder: number;
  createdAt: string;
  dateSigned: string;
  nextReminderAt?: string;
  comment?: string;
  bookings: BookingRecord[];
  guestsCount?: number;
}

export interface TaskReminderRecord {
  id: string;
  title: string;
  description?: string;
  remindAt: string;
  hasReminder?: boolean;
  color?: 'none' | 'red' | 'amber' | 'green' | 'blue';
  isDone: boolean;
  createdBy: string;
  createdAt: string;
  completedAt?: string;
  isArchived?: boolean;
  archivedAt?: string;
}

export type LeadStatusRecord =
  | 'new'
  | 'confirmed'
  | 'in_progress'
  | 'client_created'
  | 'prebooking_created'
  | 'contract_created'
  | 'rejected'
  | 'duplicate';

export type LeadSyncStatusRecord = 'local' | 'pulled' | 'failed';

export interface LeadRecord {
  id: string;
  supabaseId?: string;
  source: string;
  status: LeadStatusRecord;
  syncStatus: LeadSyncStatusRecord;
  guestName?: string;
  phone: string;
  email?: string;
  desiredStartDate?: string;
  desiredEndDate?: string;
  desiredTime?: string;
  guestsCount?: number;
  objectType?: string;
  objectId?: string;
  message?: string;
  utmJson?: string;
  rawJson?: string;
  clientId?: string;
  contractId?: string;
  prebookingId?: string;
  managerNote?: string;
  // AI-concierge fields
  channel?: string;
  externalConversationId?: string;
  aiSummary?: string;
  transcriptJson?: string;
  guestContact?: string;
  createdAt: string;
  updatedAt: string;
  supabaseCreatedAt?: string;
  pulledToCrmAt?: string;
  convertedAt?: string;
  lastError?: string;
}

export type LeadCreateRecordInput = Partial<Omit<LeadRecord, 'id' | 'createdAt' | 'updatedAt'>> & {
  id?: string;
  phone: string;
};

export type LeadUpdateRecordInput = Partial<Omit<LeadRecord, 'id' | 'createdAt' | 'updatedAt'>>;

export interface LeadListFilters {
  status?: LeadStatusRecord | 'all';
  search?: string;
}

export interface SupabaseLeadRow {
  id: string;
  created_at?: string | null;
  updated_at?: string | null;
  source?: string | null;
  status?: string | null;
  guest_name?: string | null;
  phone?: string | null;
  email?: string | null;
  desired_start_date?: string | null;
  desired_end_date?: string | null;
  desired_time?: string | null;
  guests_count?: number | string | null;
  object_type?: string | null;
  object_id?: string | null;
  message?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  page_url?: string | null;
  referrer?: string | null;
  user_agent?: string | null;
  // AI-concierge fields (опциональны — заполняет AI-бэкенд)
  channel?: string | null;
  external_conversation_id?: string | null;
  ai_summary?: string | null;
  transcript_json?: string | null;
  guest_contact?: string | null;
}

type JsonObject = Record<string, unknown>;

interface LeadDbRow {
  id: string;
  supabase_id: string | null;
  source: string;
  status: LeadStatusRecord;
  sync_status: LeadSyncStatusRecord;
  guest_name: string | null;
  phone: string;
  email: string | null;
  desired_start_date: string | null;
  desired_end_date: string | null;
  desired_time: string | null;
  guests_count: number | null;
  object_type: string | null;
  object_id: string | null;
  message: string | null;
  utm_json: string | null;
  raw_json: string | null;
  client_id: string | null;
  contract_id: string | null;
  prebooking_id: string | null;
  manager_note: string | null;
  // AI-concierge fields
  channel: string | null;
  external_conversation_id: string | null;
  ai_summary: string | null;
  transcript_json: string | null;
  guest_contact: string | null;
  created_at: string;
  updated_at: string;
  supabase_created_at: string | null;
  pulled_to_crm_at: string | null;
  converted_at: string | null;
  last_error: string | null;
}

// ── Data directory resolution ──────────────────────────────────────────────
// Приоритет путей (от наивысшего к наименьшему):
//   1. CRM_DB_PATH   — явный путь к файлу БД
//   2. CRM_DATA_DIR  — корневая директория данных (БД = CRM_DATA_DIR/crm.sqlite)
//   3. По умолчанию  — <cwd>/data/  (dev-режим и текущее расположение)
//
// Директория бэкапов всегда = DATA_DIR/backups/, независимо от CRM_DB_PATH.
// Не переносить существующую БД автоматически — только читать нужный путь.

const DATA_DIR = process.env.CRM_DATA_DIR
  ? path.resolve(process.env.CRM_DATA_DIR)
  : path.resolve(process.cwd(), 'data');

const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const TEMPLATE_BACKUP_DIR = path.join(BACKUP_DIR, 'templates');

const DB_PATH = process.env.CRM_DB_PATH
  ? path.resolve(process.env.CRM_DB_PATH)
  : path.join(DATA_DIR, 'crm.sqlite');
const STABLE_PDFME_INVOICE_TEMPLATE_ID = 'invoice_pdfme';
const LEGACY_PDFME_INVOICE_TEMPLATE_RE = /^invoice_pdfme_v(\d+)$/;

function nowIso() {
  return new Date().toISOString();
}

function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function normalizeServiceObjectId(objectId: string) {
  if (objectId === 'bath') return 'gb-bath';
  if (objectId === 'furako') return 'gb-furako';
  return objectId;
}

function normalizeBooking(booking: BookingRecord, contractId: string): BookingRecord {
  return {
    ...booking,
    id: booking.id || `${contractId}-${Math.random().toString(36).slice(2, 10)}`,
    contractId,
    objectId: normalizeServiceObjectId(booking.objectId),
    price: Number(booking.price || 0),
  };
}

function normalizeContract(contract: ContractRecord): ContractRecord {
  const bookings = (contract.bookings || []).map(booking => normalizeBooking(booking, contract.id));
  return {
    ...contract,
    bookings,
    totalAmount: Number(contract.totalAmount || 0),
    prepayment: Number(contract.prepayment || 0),
    remainder: Number(contract.remainder || 0),
    createdAt: contract.createdAt || nowIso(),
  };
}

function cleanOptionalString(value: unknown) {
  const text = String(value || '').trim();
  return text || undefined;
}

// ── Ремонт mojibake в текстовых полях заявок ─────────────────────────────────
// Восстанавливает классический mojibake: UTF-8-байты, ошибочно прочитанные как
// Windows-1251 (например, «РЎС‚Р°РЅРґР°СЂС‚» -> «Стандарт»). Карта кодирования cp1251
// строится из встроенного TextDecoder, без сторонних зависимостей.
// Strict-guard: преобразование применяется ТОЛЬКО если результат — валидный UTF-8
// с кириллицей. Чистый UTF-8 и уже разрушенные значения ('?'/U+FFFD) не трогаются.
// Применяется только к НЕперсональному полю object_type на входе (см. createLead*).
let _cp1251Encode: Map<string, number> | null = null;
function cp1251EncodeMap(): Map<string, number> {
  if (_cp1251Encode) return _cp1251Encode;
  const map = new Map<string, number>();
  const dec = new TextDecoder('windows-1251');
  for (let b = 0; b < 256; b++) map.set(dec.decode(Uint8Array.of(b)), b);
  _cp1251Encode = map;
  return map;
}

function repairTextMojibake(value: string | undefined): string | undefined {
  if (!value) return value;
  if (value.includes('?') || value.includes('\uFFFD')) return value;
  // Быстрый фильтр: если нет символов из диапазона 0x80..0x4FF — это не наш mojibake.
  let suspect = false;
  for (let i = 0; i < value.length; i++) {
    const cc = value.charCodeAt(i);
    if (cc >= 0x80 && cc <= 0x4ff) { suspect = true; break; }
  }
  if (!suspect) return value;
  const enc = cp1251EncodeMap();
  const bytes = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i++) {
    const b = enc.get(value[i]);
    if (b === undefined) return value; // символ вне cp1251 → это не данный вид mojibake
    bytes[i] = b;
  }
  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (decoded !== value && /[А-Яа-яЁё]/.test(decoded)) return decoded;
  } catch {
    // байты не складываются в валидный UTF-8 → исходник был чистым UTF-8, не трогаем
  }
  return value;
}

function generateLocalId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function timestampForFile() {
  const date = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}-${pad(date.getMinutes())}`;
}

export class BookingConflictError extends Error {
  constructor(
    message: string,
    public conflictContractId?: string,
    public conflictStatus?: string,
    public conflictNumber?: string
  ) {
    super(message);
    this.name = 'BookingConflictError';
  }
}

export class LocalDatabase {
  private db: DatabaseConnection;

  constructor() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    // Если CRM_DB_PATH указывает в другую директорию — создаём и её.
    const dbDir = path.dirname(DB_PATH);
    if (dbDir !== DATA_DIR) fs.mkdirSync(dbDir, { recursive: true });
    // Запомнить до открытия: нужно ли делать backup перед миграциями.
    const dbExistedBeforeOpen = fs.existsSync(DB_PATH);
    this.db = new BetterSqlite3(DB_PATH) as DatabaseConnection;
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.initSchema();
    this.migratePdfmeInvoiceTemplateId();
    this.migrateLeadAiFields();
    this.runNewMigrations(dbExistedBeforeOpen);
    this.ensureDefaultSettings();
  }

  private initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS clients (
        id TEXT PRIMARY KEY,
        data_json TEXT NOT NULL,
        created_at TEXT,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS contracts (
        id TEXT PRIMARY KEY,
        number TEXT,
        client_id TEXT,
        base_type TEXT,
        status TEXT,
        date_signed TEXT,
        created_at TEXT,
        updated_at TEXT NOT NULL,
        data_json TEXT NOT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_contracts_number
        ON contracts(number)
        WHERE number IS NOT NULL AND number != '';

      CREATE TABLE IF NOT EXISTS bookings (
        id TEXT PRIMARY KEY,
        contract_id TEXT NOT NULL,
        object_id TEXT NOT NULL,
        base_type TEXT,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        type TEXT,
        price REAL DEFAULT 0,
        data_json TEXT NOT NULL,
        FOREIGN KEY(contract_id) REFERENCES contracts(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_bookings_object_time
        ON bookings(object_id, start_time, end_time);

      CREATE TABLE IF NOT EXISTS settings (
        id TEXT PRIMARY KEY,
        data_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS organizations (
        id TEXT PRIMARY KEY,
        data_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS html_templates (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS pdf_templates (
        id TEXT PRIMARY KEY,
        template_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS templates_meta (
        id TEXT PRIMARY KEY,
        data_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS email_settings (
        id TEXT PRIMARY KEY,
        data_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS email_history (
        id TEXT PRIMARY KEY,
        data_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS managers (
        id TEXT PRIMARY KEY,
        login TEXT NOT NULL UNIQUE,
        role TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        data_json TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        remind_at TEXT NOT NULL,
        is_done INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        data_json TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_tasks_remind_done
        ON tasks(is_done, remind_at);

      CREATE TABLE IF NOT EXISTS leads (
        id TEXT PRIMARY KEY,
        supabase_id TEXT UNIQUE,
        source TEXT NOT NULL,
        status TEXT NOT NULL,
        sync_status TEXT NOT NULL,
        guest_name TEXT,
        phone TEXT NOT NULL,
        email TEXT,
        desired_start_date TEXT,
        desired_end_date TEXT,
        desired_time TEXT,
        guests_count INTEGER,
        object_type TEXT,
        object_id TEXT,
        message TEXT,
        utm_json TEXT,
        raw_json TEXT,
        client_id TEXT,
        contract_id TEXT,
        prebooking_id TEXT,
        manager_note TEXT,
        -- AI-concierge fields (заполняются AI-бэкендом)
        channel TEXT,
        external_conversation_id TEXT,
        ai_summary TEXT,
        transcript_json TEXT,
        guest_contact TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        supabase_created_at TEXT,
        pulled_to_crm_at TEXT,
        converted_at TEXT,
        last_error TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_leads_supabase_id
        ON leads(supabase_id);

      CREATE INDEX IF NOT EXISTS idx_leads_status
        ON leads(status);

      CREATE INDEX IF NOT EXISTS idx_leads_created_at
        ON leads(created_at);

      CREATE INDEX IF NOT EXISTS idx_leads_phone
        ON leads(phone);

      CREATE INDEX IF NOT EXISTS idx_leads_email
        ON leads(email);

      CREATE TABLE IF NOT EXISTS schema_migrations (
        id          TEXT PRIMARY KEY,
        applied_at  TEXT NOT NULL,
        app_version TEXT
      );
    `);
  }

  private migratePdfmeInvoiceTemplateId() {
    const existingStable = this.db.prepare('SELECT id FROM pdf_templates WHERE id = ?')
      .get(STABLE_PDFME_INVOICE_TEMPLATE_ID) as { id: string } | undefined;
    if (existingStable) return;

    const legacyRows = this.db.prepare(`
      SELECT id, template_json, updated_at
      FROM pdf_templates
      WHERE id LIKE 'invoice_pdfme_v%'
      ORDER BY updated_at DESC, id DESC
    `).all() as Array<{ id: string; template_json: string; updated_at: string }>;

    const legacy = legacyRows
      .filter(row => LEGACY_PDFME_INVOICE_TEMPLATE_RE.test(row.id))
      .sort((a, b) => {
        const versionA = Number(a.id.match(LEGACY_PDFME_INVOICE_TEMPLATE_RE)?.[1] || 0);
        const versionB = Number(b.id.match(LEGACY_PDFME_INVOICE_TEMPLATE_RE)?.[1] || 0);
        if (versionA !== versionB) return versionB - versionA;
        return b.updated_at.localeCompare(a.updated_at);
      })[0];

    if (!legacy) return;

    const tx = this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO pdf_templates (id, template_json, updated_at)
        VALUES (?, ?, ?)
      `).run(STABLE_PDFME_INVOICE_TEMPLATE_ID, legacy.template_json, legacy.updated_at);

      const legacyMeta = this.getJsonById<JsonObject>('templates_meta', legacy.id);
      const meta = legacyMeta || {
        id: STABLE_PDFME_INVOICE_TEMPLATE_ID,
        uploadedAt: legacy.updated_at,
        fileName: 'PDFMe счет',
        uploadedBy: `migrated-from-${legacy.id}`,
      };
      this.upsertJson('templates_meta', STABLE_PDFME_INVOICE_TEMPLATE_ID, {
        ...meta,
        id: STABLE_PDFME_INVOICE_TEMPLATE_ID,
        uploadedAt: (meta.uploadedAt as string) || legacy.updated_at,
        migratedFrom: legacy.id,
      });
    });

    tx();
  }

  /**
   * Добавляет AI-поля в таблицу leads для существующих баз данных.
   * Безопасно: проверяет наличие колонок через PRAGMA перед ALTER TABLE.
   */
  private migrateLeadAiFields() {
    const existing = (this.db.prepare('PRAGMA table_info(leads)').all() as { name: string }[])
      .map(r => r.name);
    const toAdd = [
      { name: 'channel',                  def: 'TEXT' },
      { name: 'external_conversation_id', def: 'TEXT' },
      { name: 'ai_summary',               def: 'TEXT' },
      { name: 'transcript_json',          def: 'TEXT' },
      { name: 'guest_contact',            def: 'TEXT' },
    ];
    for (const col of toAdd) {
      if (!existing.includes(col.name)) {
        this.db.exec(`ALTER TABLE leads ADD COLUMN ${col.name} ${col.def}`);
      }
    }
  }

  /**
   * Safe auto-initialization / seeding of missing settings.
   * Existing user data and already saved settings are preserved.
   */
  private ensureDefaultSettings() {
    const clientsCount = (this.db.prepare('SELECT COUNT(*) as count FROM clients').get() as { count: number }).count;
    const contractsCount = (this.db.prepare('SELECT COUNT(*) as count FROM contracts').get() as { count: number }).count;
    const bookingsCount = (this.db.prepare('SELECT COUNT(*) as count FROM bookings').get() as { count: number }).count;
    const packagedDefaults = loadPackagedDefaultSettings();

    if (clientsCount > 0 || contractsCount > 0 || bookingsCount > 0) {
      console.log(`[DB] Existing data found (clients: ${clientsCount}, contracts: ${contractsCount}, bookings: ${bookingsCount}). Ensuring only missing settings.`);
    } else {
      console.log('[DB] No user data found. Ensuring default settings...');
    }

    // 1. Seed general settings
    const existingGeneral = this.getSettings('general');
    if (!existingGeneral) {
      const INITIAL_SETTINGS = {
        companyName: 'Большая Медведица',
        inn: '5105013870',
        address: '184433, Мурманская область, Печенгский район, г. Заполярный, ул. Ленина, д.1А, помещение 34',
        phone: '+7 (931) 802-21-51',
        vatRate: 0.05,
        emailForReports: 'medvedica.hotel@vk.com',
      };
      this.saveSettings(INITIAL_SETTINGS, 'general');
      console.log('[DB] Seeded default general settings for Большая Медведица.');
    }

    // 2. Seed integrations (Supabase sync) settings
    const currentIntegrations = this.getIntegrationSettingsFull();
    const integrationDefaults = packagedDefaults.integrations || {};
    const integrationSeed: IntegrationSettingsInput = {};
    if (!currentIntegrations.supabaseUrl) {
      integrationSeed.supabaseUrl = integrationDefaults.supabaseUrl || process.env.SUPABASE_URL || '';
    }
    if (!currentIntegrations.supabaseServiceKey) {
      integrationSeed.supabaseServiceKey = integrationDefaults.supabaseServiceKey || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    }
    if (!currentIntegrations.supabaseTable) {
      integrationSeed.supabaseTable = integrationDefaults.supabaseTable || process.env.SUPABASE_LEADS_TABLE || 'leads';
    }
    if (!currentIntegrations.supabaseSyncLimit) {
      integrationSeed.supabaseSyncLimit = integrationDefaults.supabaseSyncLimit || Number(process.env.SUPABASE_LEAD_SYNC_LIMIT || 50);
    }
    if (currentIntegrations.supabaseAutoSyncEnabled == null) {
      integrationSeed.supabaseAutoSyncEnabled = integrationDefaults.supabaseAutoSyncEnabled ?? false;
    }
    if (!currentIntegrations.supabaseAutoSyncIntervalMinutes) {
      integrationSeed.supabaseAutoSyncIntervalMinutes = integrationDefaults.supabaseAutoSyncIntervalMinutes || 5;
    }
    if (!currentIntegrations.libreOfficePath && integrationDefaults.libreOfficePath) {
      integrationSeed.libreOfficePath = integrationDefaults.libreOfficePath;
    }
    if (!currentIntegrations.aiBackendUrl && integrationDefaults.aiBackendUrl) {
      integrationSeed.aiBackendUrl = integrationDefaults.aiBackendUrl;
    }
    if (!currentIntegrations.aiBackendKey && integrationDefaults.aiBackendKey) {
      integrationSeed.aiBackendKey = integrationDefaults.aiBackendKey;
    }
    if (!currentIntegrations.aiConsoleUrl && integrationDefaults.aiConsoleUrl) {
      integrationSeed.aiConsoleUrl = integrationDefaults.aiConsoleUrl;
    }
    if (Object.keys(integrationSeed).length > 0) {
      this.saveIntegrationSettings(integrationSeed);
      console.log('[DB] Seeded default integration settings (Supabase).');
    }

    // 3. Seed SMTP email settings
    const currentEmail = this.getEmailSettings<{
      senderEmail?: string;
      senderName?: string;
      defaultMessage?: string;
      host?: string;
      port?: number;
      secure?: boolean;
      appPassword?: string;
    }>() || {};
    const emailDefaults = packagedDefaults.email || {};
    const emailSeed = { ...currentEmail };
    let shouldSaveEmail = false;
    const fillEmail = <K extends keyof typeof emailSeed>(key: K, value: (typeof emailSeed)[K]) => {
      if (emailSeed[key] == null || emailSeed[key] === '') {
        emailSeed[key] = value;
        shouldSaveEmail = true;
      }
    };

    fillEmail('senderEmail', emailDefaults.senderEmail || process.env.SMTP_USER || 'medvedica.hotel@vk.com');
    fillEmail('senderName', emailDefaults.senderName || process.env.SMTP_FROM_NAME || 'Большая Медведица');
    fillEmail('defaultMessage', emailDefaults.defaultMessage || 'Спасибо, что обратились к нам');
    fillEmail('host', emailDefaults.host || process.env.SMTP_HOST || 'smtp.mail.ru');
    fillEmail('port', emailDefaults.port || Number(process.env.SMTP_PORT || 465));
    fillEmail('secure', emailDefaults.secure ?? (String(process.env.SMTP_SECURE || 'true') !== 'false'));
    fillEmail('appPassword', emailDefaults.appPassword || process.env.SMTP_PASSWORD || '');

    if (shouldSaveEmail) {
      this.saveEmailSettings(emailSeed);
      console.log('[DB] Seeded default SMTP settings.');
    }

    // 4. Seed backup cloud remote names/path from packaged defaults when provided.
    if (packagedDefaults.backup && !this.getSettings('backup')) {
      this.saveSettings(packagedDefaults.backup, 'backup');
      console.log('[DB] Seeded default backup settings.');
    }
  }

  // ── Schema versioning helpers (Task 4) ────────────────────────────────────

  /** Проверяет, была ли уже применена миграция с данным id. */
  private hasMigration(id: string): boolean {
    const row = this.db.prepare('SELECT 1 FROM schema_migrations WHERE id = ?').get(id);
    return row !== undefined;
  }

  /** Фиксирует применение миграции в schema_migrations. */
  private markMigrationApplied(id: string): void {
    this.db.prepare(
      'INSERT OR IGNORE INTO schema_migrations (id, applied_at, app_version) VALUES (?, ?, ?)'
    ).run(id, nowIso(), _APP_VERSION);
  }

  /**
   * Создаёт резервную копию БД через VACUUM INTO перед структурными миграциями.
   * Путь: data/backups/before-migration-YYYY-MM-DD-HH-mm-ss/crm.sqlite
   * Бросает ошибку, если backup не удался — миграция не запускается.
   */
  private backupBeforeMigrations(): void {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const dir = path.join(BACKUP_DIR, `before-migration-${ts}`);
    const dest = path.join(dir, 'crm.sqlite');
    try {
      fs.mkdirSync(dir, { recursive: true });
      // VACUUM INTO — онлайн-резервная копия, работает при открытой БД (SQLite 3.27+)
      const destForSql = dest.replace(/\\/g, '/').replace(/'/g, "''");
      this.db.exec(`VACUUM INTO '${destForSql}'`);
      console.log(`[DB] Pre-migration backup created: ${dest}`);
    } catch (err) {
      throw new Error(
        `Не удалось создать резервную копию базы данных перед миграцией.\n` +
        `Путь: ${dest}\n` +
        `Ошибка: ${err instanceof Error ? err.message : String(err)}\n` +
        `Миграция остановлена для безопасности данных.`
      );
    }
  }

  /**
   * Запускает новые версионированные миграции (Task 4/5).
   * Идемпотентны: каждая применяется не более одного раза (запись в schema_migrations).
   * Если есть ожидающие миграции И база существовала до запуска — сначала создаётся backup.
   *
   * Как добавить новую миграцию:
   *   1. Добавьте объект в массив migrations с уникальным id (нпр. 'add_bookings_notes_v1').
   *   2. В run() выполните SQL-изменение.
   *   3. Порядок в массиве важен — новые добавляйте в конец.
   */
  private runNewMigrations(dbExistedBeforeOpen: boolean): void {
    type Migration = { id: string; run: () => void };

    // ─── Список версионированных миграций ──────────────────────────────────
    // Новые миграции добавляйте СЮДА в конец списка:
    const migrations: Migration[] = [
      // { id: 'example_v1', run: () => { this.db.exec('ALTER TABLE foo ADD COLUMN bar TEXT'); } },
    ];
    // ───────────────────────────────────────────────────────────────────────

    const pending = migrations.filter(m => !this.hasMigration(m.id));
    if (pending.length === 0) return;

    if (dbExistedBeforeOpen) {
      this.backupBeforeMigrations();
    }

    for (const m of pending) {
      m.run();
      this.markMigrationApplied(m.id);
      console.log(`[DB] Migration applied: ${m.id}`);
    }
  }

  listClients<T>() {
    const rows = this.db.prepare('SELECT data_json FROM clients ORDER BY created_at DESC, updated_at DESC').all() as { data_json: string }[];
    return rows.map(row => safeJsonParse<T>(row.data_json, {} as T));
  }

  getClientById<T>(id: string) {
    const row = this.db.prepare('SELECT data_json FROM clients WHERE id = ?').get(id) as { data_json: string } | undefined;
    return row ? safeJsonParse<T>(row.data_json, {} as T) : null;
  }

  saveClient<T extends { id: string; createdAt?: string }>(client: T) {
    const updatedAt = nowIso();
    const createdAt = client.createdAt || updatedAt;
    const saved = { ...client, createdAt };
    this.db.prepare(`
      INSERT INTO clients (id, data_json, created_at, updated_at)
      VALUES (@id, @data_json, @created_at, @updated_at)
      ON CONFLICT(id) DO UPDATE SET
        data_json = excluded.data_json,
        updated_at = excluded.updated_at
    `).run({
      id: saved.id,
      data_json: JSON.stringify(saved),
      created_at: createdAt,
      updated_at: updatedAt,
    });
    return saved;
  }

  deleteClient(id: string) {
    this.db.prepare('DELETE FROM clients WHERE id = ?').run(id);
  }

  listManagers<T>() {
    const rows = this.db.prepare('SELECT data_json, password_salt, password_hash FROM managers ORDER BY created_at ASC').all() as Array<{
      data_json: string;
      password_salt: string;
      password_hash: string;
    }>;
    return rows.map(row => ({
      ...safeJsonParse<T>(row.data_json, {} as T),
      passwordSalt: row.password_salt,
      passwordHash: row.password_hash,
    }));
  }

  getManagerById<T>(id: string) {
    const row = this.db.prepare('SELECT data_json, password_salt, password_hash FROM managers WHERE id = ?').get(id) as
      | { data_json: string; password_salt: string; password_hash: string }
      | undefined;
    return row ? {
      ...safeJsonParse<T>(row.data_json, {} as T),
      passwordSalt: row.password_salt,
      passwordHash: row.password_hash,
    } : null;
  }

  getManagerByLogin<T>(login: string) {
    const row = this.db.prepare('SELECT data_json, password_salt, password_hash FROM managers WHERE lower(login) = lower(?)').get(login) as
      | { data_json: string; password_salt: string; password_hash: string }
      | undefined;
    return row ? {
      ...safeJsonParse<T>(row.data_json, {} as T),
      passwordSalt: row.password_salt,
      passwordHash: row.password_hash,
    } : null;
  }

  saveManager<T extends { id: string; login: string; role: string; isActive: boolean; createdAt?: string; updatedAt?: string }>(
    manager: T,
    password: { salt: string; hash: string },
  ) {
    const updatedAt = nowIso();
    const createdAt = manager.createdAt || updatedAt;
    const saved = { ...manager, createdAt, updatedAt };
    this.db.prepare(`
      INSERT INTO managers (id, login, role, is_active, data_json, password_salt, password_hash, created_at, updated_at)
      VALUES (@id, @login, @role, @is_active, @data_json, @password_salt, @password_hash, @created_at, @updated_at)
      ON CONFLICT(id) DO UPDATE SET
        login = excluded.login,
        role = excluded.role,
        is_active = excluded.is_active,
        data_json = excluded.data_json,
        password_salt = excluded.password_salt,
        password_hash = excluded.password_hash,
        updated_at = excluded.updated_at
    `).run({
      id: saved.id,
      login: saved.login,
      role: saved.role,
      is_active: saved.isActive ? 1 : 0,
      data_json: JSON.stringify(saved),
      password_salt: password.salt,
      password_hash: password.hash,
      created_at: createdAt,
      updated_at: updatedAt,
    });
    return saved;
  }

  deleteManager(id: string) {
    this.db.prepare('DELETE FROM managers WHERE id = ?').run(id);
  }

  listContracts<T>() {
    const rows = this.db.prepare('SELECT data_json FROM contracts ORDER BY created_at DESC, updated_at DESC').all() as { data_json: string }[];
    return rows.map(row => safeJsonParse<T>(row.data_json, {} as T));
  }

  listContractsByClient<T extends { clientId?: string }>(clientId: string) {
    const rows = this.db.prepare(`
      SELECT data_json
      FROM contracts
      WHERE client_id = ?
      ORDER BY created_at DESC, updated_at DESC
    `).all(clientId) as { data_json: string }[];
    return rows.map(row => safeJsonParse<T>(row.data_json, {} as T));
  }

  saveContract(contractInput: ContractRecord) {
    const contract = normalizeContract(contractInput);

    const updatedAt = nowIso();
    const tx = this.db.transaction(() => {
      this.assertNoBookingConflicts(contract);

      this.db.prepare(`
        INSERT INTO contracts (
          id, number, client_id, base_type, status, date_signed, created_at, updated_at, data_json
        )
        VALUES (
          @id, @number, @client_id, @base_type, @status, @date_signed, @created_at, @updated_at, @data_json
        )
        ON CONFLICT(id) DO UPDATE SET
          number = excluded.number,
          client_id = excluded.client_id,
          base_type = excluded.base_type,
          status = excluded.status,
          date_signed = excluded.date_signed,
          updated_at = excluded.updated_at,
          data_json = excluded.data_json
      `).run({
        id: contract.id,
        number: contract.number,
        client_id: contract.clientId,
        base_type: contract.baseType,
        status: contract.status,
        date_signed: contract.dateSigned,
        created_at: contract.createdAt,
        updated_at: updatedAt,
        data_json: JSON.stringify(contract),
      });

      this.db.prepare('DELETE FROM bookings WHERE contract_id = ?').run(contract.id);
      const insertBooking = this.db.prepare(`
        INSERT INTO bookings (
          id, contract_id, object_id, base_type, start_time, end_time, type, price, data_json
        )
        VALUES (
          @id, @contract_id, @object_id, @base_type, @start_time, @end_time, @type, @price, @data_json
        )
      `);

      for (const booking of contract.bookings) {
        insertBooking.run({
          id: booking.id,
          contract_id: contract.id,
          object_id: booking.objectId,
          base_type: booking.baseType,
          start_time: booking.startTime,
          end_time: booking.endTime,
          type: booking.type,
          price: booking.price,
          data_json: JSON.stringify(booking),
        });
      }
    });

    tx();
    return contract;
  }

  deleteContract(id: string) {
    const tx = this.db.transaction(() => {
      this.db.prepare('DELETE FROM bookings WHERE contract_id = ?').run(id);
      this.db.prepare('DELETE FROM contracts WHERE id = ?').run(id);
    });
    tx();
  }

  getLeads(filters: LeadListFilters = {}) {
    const where: string[] = [];
    const params: unknown[] = [];

    if (filters.status && filters.status !== 'all') {
      where.push('status = ?');
      params.push(filters.status);
    }

    const search = String(filters.search || '').trim().toLowerCase();
    if (search) {
      where.push('(lower(coalesce(guest_name, "")) LIKE ? OR lower(phone) LIKE ? OR lower(coalesce(email, "")) LIKE ?)');
      const pattern = `%${search}%`;
      params.push(pattern, pattern, pattern);
    }

    const rows = this.db.prepare(`
      SELECT *
      FROM leads
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY created_at DESC, updated_at DESC
    `).all(...params) as LeadDbRow[];

    return rows.map(row => this.mapLeadRow(row));
  }

  getLeadById(id: string) {
    const row = this.db.prepare('SELECT * FROM leads WHERE id = ?').get(id) as LeadDbRow | undefined;
    return row ? this.mapLeadRow(row) : null;
  }

  getLeadBySupabaseId(supabaseId: string) {
    const row = this.db.prepare('SELECT * FROM leads WHERE supabase_id = ?').get(supabaseId) as LeadDbRow | undefined;
    return row ? this.mapLeadRow(row) : null;
  }

  createLead(input: LeadCreateRecordInput) {
    const now = nowIso();
    const phone = cleanOptionalString(input.phone);
    if (!phone) {
      throw new Error('Телефон заявки обязателен');
    }

    const lead: LeadRecord = {
      id: input.id || generateLocalId('lead'),
      supabaseId: cleanOptionalString(input.supabaseId),
      source: cleanOptionalString(input.source) || 'Локально',
      status: input.status || 'new',
      syncStatus: input.syncStatus || 'local',
      guestName: cleanOptionalString(input.guestName),
      phone,
      email: cleanOptionalString(input.email),
      desiredStartDate: cleanOptionalString(input.desiredStartDate),
      desiredEndDate: cleanOptionalString(input.desiredEndDate),
      desiredTime: cleanOptionalString(input.desiredTime),
      guestsCount: input.guestsCount === undefined || input.guestsCount === null ? undefined : Number(input.guestsCount),
      objectType: repairTextMojibake(cleanOptionalString(input.objectType)),
      objectId: cleanOptionalString(input.objectId),
      message: cleanOptionalString(input.message),
      utmJson: cleanOptionalString(input.utmJson),
      rawJson: cleanOptionalString(input.rawJson),
      clientId: cleanOptionalString(input.clientId),
      contractId: cleanOptionalString(input.contractId),
      prebookingId: cleanOptionalString(input.prebookingId),
      managerNote: cleanOptionalString(input.managerNote),
      createdAt: now,
      updatedAt: now,
      supabaseCreatedAt: cleanOptionalString(input.supabaseCreatedAt),
      pulledToCrmAt: cleanOptionalString(input.pulledToCrmAt),
      convertedAt: cleanOptionalString(input.convertedAt),
      lastError: cleanOptionalString(input.lastError),
    };

    this.insertLead(lead);
    return lead;
  }

  createLeadFromSupabase(row: SupabaseLeadRow) {
    const supabaseId = cleanOptionalString(row.id);
    if (!supabaseId) {
      throw new Error('Supabase lead id is required');
    }

    const existing = this.getLeadBySupabaseId(supabaseId);
    if (existing) return existing;

    const phone = cleanOptionalString(row.phone);
    if (!phone) {
      throw new Error('Телефон заявки обязателен');
    }

    const createdAt = cleanOptionalString(row.created_at) || nowIso();
    const updatedAt = cleanOptionalString(row.updated_at) || createdAt;
    const status = this.normalizeLeadStatus(row.status);
    const utm = {
      utm_source: cleanOptionalString(row.utm_source),
      utm_medium: cleanOptionalString(row.utm_medium),
      utm_campaign: cleanOptionalString(row.utm_campaign),
      utm_content: cleanOptionalString(row.utm_content),
      utm_term: cleanOptionalString(row.utm_term),
      page_url: cleanOptionalString(row.page_url),
      referrer: cleanOptionalString(row.referrer),
      user_agent: cleanOptionalString(row.user_agent),
    };
    const cleanUtm = Object.fromEntries(Object.entries(utm).filter(([, value]) => Boolean(value)));

    const lead: LeadRecord = {
      id: generateLocalId('lead'),
      supabaseId,
      source: cleanOptionalString(row.source) || 'bolshaya-medveditsa-landing',
      status,
      syncStatus: 'pulled',
      guestName: cleanOptionalString(row.guest_name),
      phone,
      email: cleanOptionalString(row.email),
      desiredStartDate: cleanOptionalString(row.desired_start_date),
      desiredEndDate: cleanOptionalString(row.desired_end_date),
      desiredTime: cleanOptionalString(row.desired_time),
      guestsCount: row.guests_count === undefined || row.guests_count === null ? undefined : Number(row.guests_count),
      objectType: repairTextMojibake(cleanOptionalString(row.object_type)),
      objectId: cleanOptionalString(row.object_id),
      message: cleanOptionalString(row.message),
      utmJson: Object.keys(cleanUtm).length ? JSON.stringify(cleanUtm) : undefined,
      rawJson: JSON.stringify(row),
      channel: cleanOptionalString(row.channel),
      externalConversationId: cleanOptionalString(row.external_conversation_id),
      aiSummary: cleanOptionalString(row.ai_summary),
      transcriptJson: cleanOptionalString(row.transcript_json),
      guestContact: cleanOptionalString(row.guest_contact),
      createdAt,
      updatedAt,
      supabaseCreatedAt: cleanOptionalString(row.created_at),
      pulledToCrmAt: nowIso(),
    };

    this.insertLead(lead);
    return lead;
  }

  updateLead(id: string, patch: LeadUpdateRecordInput) {
    const current = this.getLeadById(id);
    if (!current) return null;

    const next: LeadRecord = {
      ...current,
      ...patch,
      supabaseId: patch.supabaseId === undefined ? current.supabaseId : cleanOptionalString(patch.supabaseId),
      source: patch.source === undefined ? current.source : (cleanOptionalString(patch.source) || current.source),
      guestName: patch.guestName === undefined ? current.guestName : cleanOptionalString(patch.guestName),
      phone: patch.phone === undefined ? current.phone : (cleanOptionalString(patch.phone) || current.phone),
      email: patch.email === undefined ? current.email : cleanOptionalString(patch.email),
      desiredStartDate: patch.desiredStartDate === undefined ? current.desiredStartDate : cleanOptionalString(patch.desiredStartDate),
      desiredEndDate: patch.desiredEndDate === undefined ? current.desiredEndDate : cleanOptionalString(patch.desiredEndDate),
      desiredTime: patch.desiredTime === undefined ? current.desiredTime : cleanOptionalString(patch.desiredTime),
      guestsCount: patch.guestsCount === undefined ? current.guestsCount : Number(patch.guestsCount),
      objectType: patch.objectType === undefined ? current.objectType : cleanOptionalString(patch.objectType),
      objectId: patch.objectId === undefined ? current.objectId : cleanOptionalString(patch.objectId),
      message: patch.message === undefined ? current.message : cleanOptionalString(patch.message),
      utmJson: patch.utmJson === undefined ? current.utmJson : cleanOptionalString(patch.utmJson),
      rawJson: patch.rawJson === undefined ? current.rawJson : cleanOptionalString(patch.rawJson),
      clientId: patch.clientId === undefined ? current.clientId : cleanOptionalString(patch.clientId),
      contractId: patch.contractId === undefined ? current.contractId : cleanOptionalString(patch.contractId),
      prebookingId: patch.prebookingId === undefined ? current.prebookingId : cleanOptionalString(patch.prebookingId),
      managerNote: patch.managerNote === undefined ? current.managerNote : cleanOptionalString(patch.managerNote),
      supabaseCreatedAt: patch.supabaseCreatedAt === undefined ? current.supabaseCreatedAt : cleanOptionalString(patch.supabaseCreatedAt),
      pulledToCrmAt: patch.pulledToCrmAt === undefined ? current.pulledToCrmAt : cleanOptionalString(patch.pulledToCrmAt),
      convertedAt: patch.convertedAt === undefined ? current.convertedAt : cleanOptionalString(patch.convertedAt),
      lastError: patch.lastError === undefined ? current.lastError : cleanOptionalString(patch.lastError),
      updatedAt: nowIso(),
    };

    this.insertLead(next);
    return next;
  }

  updateLeadStatus(id: string, status: LeadStatusRecord) {
    return this.updateLead(id, { status });
  }

  linkLeadToClient(id: string, clientId: string) {
    return this.updateLead(id, { clientId, status: 'client_created', convertedAt: nowIso() });
  }

  linkLeadToContract(id: string, contractId: string) {
    return this.updateLead(id, { contractId, status: 'contract_created', convertedAt: nowIso() });
  }

  deleteLead(id: string) {
    this.db.prepare('DELETE FROM leads WHERE id = ?').run(id);
    return { success: true as const };
  }

  listTasks<T>() {
    const rows = this.db.prepare('SELECT data_json FROM tasks ORDER BY is_done ASC, remind_at ASC, created_at DESC').all() as { data_json: string }[];
    return rows.map(row => safeJsonParse<T>(row.data_json, {} as T));
  }

  saveTask(taskInput: TaskReminderRecord) {
    const updatedAt = nowIso();
    const createdAt = taskInput.createdAt || updatedAt;
    const task: TaskReminderRecord = {
      ...taskInput,
      id: taskInput.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: String(taskInput.title || '').trim(),
      description: taskInput.description ? String(taskInput.description).trim() : undefined,
      remindAt: taskInput.remindAt || updatedAt,
      hasReminder: taskInput.hasReminder !== false,
      color: taskInput.color || 'none',
      isDone: Boolean(taskInput.isDone),
      createdBy: taskInput.createdBy || 'system',
      createdAt,
      completedAt: taskInput.isDone ? (taskInput.completedAt || updatedAt) : undefined,
      isArchived: Boolean(taskInput.isArchived),
      archivedAt: taskInput.isArchived ? (taskInput.archivedAt || updatedAt) : undefined,
    };

    if (!task.title) {
      throw new Error('Название задачи обязательно');
    }

    this.db.prepare(`
      INSERT INTO tasks (id, remind_at, is_done, created_at, updated_at, data_json)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        remind_at = excluded.remind_at,
        is_done = excluded.is_done,
        updated_at = excluded.updated_at,
        data_json = excluded.data_json
    `).run(task.id, task.remindAt, task.isDone ? 1 : 0, task.createdAt, updatedAt, JSON.stringify(task));

    return task;
  }

  deleteTask(id: string) {
    this.db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  }

  private assertNoBookingConflicts(contract: ContractRecord) {
    if (contract.status === 'cancelled') return;

    const rows = this.db.prepare(`
      SELECT b.object_id, b.start_time, b.end_time, b.contract_id, c.number, c.status
      FROM bookings b
      JOIN contracts c ON c.id = b.contract_id
      WHERE b.contract_id != ?
    `).all(contract.id) as Array<{
      object_id: string;
      start_time: string;
      end_time: string;
      contract_id: string;
      number: string;
      status: string;
    }>;

    const activeRows = rows.filter(row => row.status !== 'cancelled');
    const parsedBookings = contract.bookings.map(booking => {
      const newStart = new Date(booking.startTime).getTime();
      const newEnd = new Date(booking.endTime).getTime();
      if (!Number.isFinite(newStart) || !Number.isFinite(newEnd) || newEnd <= newStart) {
        throw new BookingConflictError('Некорректное время бронирования.');
      }
      return { booking, start: newStart, end: newEnd };
    });

    for (let index = 0; index < parsedBookings.length; index += 1) {
      const current = parsedBookings[index];
      const conflict = parsedBookings.slice(index + 1).find(candidate => (
        candidate.booking.objectId === current.booking.objectId
        && doBookingsConflict(current.start, current.end, candidate.start, candidate.end)
      ));

      if (conflict) {
        throw new BookingConflictError(
          `Бронирования внутри договора пересекаются для объекта ${current.booking.objectId}.`
        );
      }
    }

    for (const { booking, start: newStart, end: newEnd } of parsedBookings) {
      const conflict = activeRows.find(row => {
        if (normalizeServiceObjectId(row.object_id) !== booking.objectId) return false;
        const existingStart = new Date(row.start_time).getTime();
        const existingEnd = new Date(row.end_time).getTime();
        return doBookingsConflict(newStart, newEnd, existingStart, existingEnd);
      });

      if (conflict) {
        throw new BookingConflictError(
          `Объект уже занят на выбранное время. Конфликт с договором ${conflict.number || conflict.contract_id}.`,
          conflict.contract_id,
          conflict.status,
          conflict.number
        );
      }
    }
  }

  getSettings<T>(id = 'general') {
    const row = this.db.prepare('SELECT data_json FROM settings WHERE id = ?').get(id) as { data_json: string } | undefined;
    return row ? safeJsonParse<T>(row.data_json, {} as T) : null;
  }

  saveSettings<T extends object>(settings: T, id = 'general') {
    this.upsertJson('settings', id, settings);
    return settings;
  }

  // ── Integration Settings ────────────────────────────────────────────────────
  // Хранятся в таблице settings под id = 'integrations'.
  // Секреты (service keys) хранятся полностью на сервере,
  // но во frontend никогда не отдаются открытым текстом.

  private static readonly INTEGRATIONS_ID = 'integrations';

  /** Внутренний: возвращает полный объект настроек (включая секреты). */
  getIntegrationSettingsFull(): IntegrationSettingsStored {
    return this.getSettings<IntegrationSettingsStored>(LocalDatabase.INTEGRATIONS_ID) || {};
  }

  /** Сохранить настройки интеграций. Секреты: пустая строка = оставить прежнее значение. */
  saveIntegrationSettings(input: IntegrationSettingsInput): IntegrationSettingsMasked {
    const current = this.getIntegrationSettingsFull();
    const next: IntegrationSettingsStored = {
      supabaseUrl:        ('supabaseUrl'        in input ? input.supabaseUrl?.trim()        : current.supabaseUrl)        ?? '',
      supabaseTable:      ('supabaseTable'      in input ? input.supabaseTable?.trim()      : current.supabaseTable)      || 'leads',
      supabaseSyncLimit:  ('supabaseSyncLimit'  in input ? Number(input.supabaseSyncLimit)  : current.supabaseSyncLimit)  || 50,
      supabaseAutoSyncEnabled:
        ('supabaseAutoSyncEnabled' in input ? Boolean(input.supabaseAutoSyncEnabled) : current.supabaseAutoSyncEnabled) ?? false,
      supabaseAutoSyncIntervalMinutes:
        ('supabaseAutoSyncIntervalMinutes' in input ? Number(input.supabaseAutoSyncIntervalMinutes) : current.supabaseAutoSyncIntervalMinutes) || 5,
      libreOfficePath:    ('libreOfficePath'    in input ? input.libreOfficePath?.trim()    : current.libreOfficePath)    ?? '',
      aiBackendUrl:       ('aiBackendUrl'       in input ? input.aiBackendUrl?.trim()       : current.aiBackendUrl)       ?? '',
      aiConsoleUrl:       ('aiConsoleUrl'       in input ? input.aiConsoleUrl?.trim()       : current.aiConsoleUrl)       ?? '',
      // Секреты: заменяем только если в input передана непустая строка
      supabaseServiceKey: (input.supabaseServiceKey?.trim())  || current.supabaseServiceKey  || '',
      aiBackendKey:       (input.aiBackendKey?.trim())        || current.aiBackendKey        || '',
    };
    this.saveSettings(next, LocalDatabase.INTEGRATIONS_ID);
    return maskIntegrationSettings(next);
  }

  listOrganizations<T>() {
    return this.listJsonTable<T>('organizations');
  }

  getOrganization<T>(id: string) {
    return this.getJsonById<T>('organizations', id);
  }

  saveOrganization<T extends object>(id: string, organization: T) {
    const data = { ...organization, id };
    this.upsertJson('organizations', id, data);
    return data;
  }

  listTemplatesMeta<T>() {
    return this.listJsonTable<T>('templates_meta');
  }

  getPdfTemplate<T = unknown>(id: string) {
    const row = this.db.prepare('SELECT id, template_json, updated_at FROM pdf_templates WHERE id = ?').get(id) as
      | { id: string; template_json: string; updated_at: string }
      | undefined;
    return row ? { id: row.id, template: safeJsonParse<T>(row.template_json, {} as T), updatedAt: row.updated_at } : null;
  }

  deletePdfTemplate(id: string) {
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM pdf_templates WHERE id = ?').run(id);
      this.db.prepare('DELETE FROM templates_meta WHERE id = ?').run(id);
    })();
  }

  listPdfTemplates<T = unknown>() {
    const rows = this.db.prepare('SELECT id, template_json, updated_at FROM pdf_templates ORDER BY id').all() as Array<{
      id: string;
      template_json: string;
      updated_at: string;
    }>;

    return rows.map(row => ({
      id: row.id,
      template: safeJsonParse<T>(row.template_json, {} as T),
      updatedAt: row.updated_at,
    }));
  }

  savePdfTemplate<T>(id: string, template: T, meta?: JsonObject) {
    const updatedAt = nowIso();
    const existing = this.getPdfTemplate(id);
    const templateJson = JSON.stringify(template);

    if (existing) {
      const existingJson = JSON.stringify(existing.template);
      if (existingJson !== templateJson) {
        fs.mkdirSync(TEMPLATE_BACKUP_DIR, { recursive: true });
        const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '_');
        fs.writeFileSync(
          path.join(TEMPLATE_BACKUP_DIR, `${safeId}-${timestampForFile()}.pdfme.json`),
          existingJson,
          'utf8'
        );
      }
    }

    this.db.prepare(`
      INSERT INTO pdf_templates (id, template_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        template_json = excluded.template_json,
        updated_at = excluded.updated_at
    `).run(id, templateJson, updatedAt);

    const metaData = meta || {
      id,
      uploadedAt: updatedAt,
      fileName: 'PDFMe template',
      uploadedBy: 'local',
    };
    this.upsertJson('templates_meta', id, { ...metaData, id, uploadedAt: (metaData.uploadedAt as string) || updatedAt });

    return { id, template, updatedAt };
  }

  private normalizeEmailSettings<T>(settings: T | null): T | null {
    if (!settings || typeof settings !== 'object') {
      return settings;
    }

    const raw = settings as Record<string, unknown>;
    const normalized: Record<string, unknown> = { ...raw };

    if (!normalized.senderEmail && raw.authUser) {
      normalized.senderEmail = raw.authUser;
    }
    if (!normalized.host && raw.smtpHost) {
      normalized.host = raw.smtpHost;
    }
    if (normalized.port == null && raw.smtpPort != null) {
      normalized.port = raw.smtpPort;
    }
    if (normalized.secure == null && raw.smtpSecure != null) {
      normalized.secure = raw.smtpSecure;
    }

    return normalized as T;
  }

  getEmailSettings<T>() {
    return this.normalizeEmailSettings(this.getJsonById<T>('email_settings', 'smtp'));
  }

  saveEmailSettings<T extends object>(settings: T) {
    const typed = settings as T & { appPassword?: string };
    const newPassword = (typed.appPassword ?? '').trim();
    const { appPassword: _pw, ...rest } = typed as any;

    let toSave: object;
    if (newPassword) {
      toSave = { ...rest, appPassword: newPassword };
    } else {
      // Preserve existing password if no new one provided
      const existing = this.getEmailSettings<{ appPassword?: string }>() || {};
      toSave = existing.appPassword ? { ...rest, appPassword: existing.appPassword } : rest;
    }

    this.upsertJson('email_settings', 'smtp', toSave);
    const { appPassword: _stripped, ...safeSettings } = toSave as any;
    return safeSettings;
  }

  addEmailHistory<T extends object>(entry: T) {
    const entryWithOptionalId = entry as T & { id?: unknown };
    const id = String(entryWithOptionalId.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    this.db.prepare(`
      INSERT INTO email_history (id, data_json, created_at)
      VALUES (?, ?, ?)
    `).run(id, JSON.stringify({ ...entry, id }), nowIso());
  }

  async createBackup(label = 'crm-backup') {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const fileName = `${label}-${timestampForFile()}.sqlite`;
    const backupPath = path.join(BACKUP_DIR, fileName);
    await this.db.backup(backupPath);

    const stat = fs.statSync(backupPath);
    if (stat.size === 0) {
      throw new Error('SQLite backup file is empty');
    }
    return backupPath;
  }

  getTableNames() {
    const rows = this.db.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `).all() as Array<{ name: string }>;
    return rows.map(row => row.name);
  }

  getTableCounts() {
    const result: Record<string, number> = {};
    for (const table of this.getTableNames()) {
      const row = this.db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as { count: number };
      result[table] = row.count;
    }
    return result;
  }

  private listJsonTable<T>(table: string) {
    const rows = this.db.prepare(`SELECT id, data_json FROM ${table} ORDER BY id`).all() as { id: string; data_json: string }[];
    const result: Record<string, T> = {};
    for (const row of rows) {
      result[row.id] = safeJsonParse<T>(row.data_json, {} as T);
    }
    return result;
  }

  private getJsonById<T>(table: string, id: string) {
    const row = this.db.prepare(`SELECT data_json FROM ${table} WHERE id = ?`).get(id) as { data_json: string } | undefined;
    return row ? safeJsonParse<T>(row.data_json, {} as T) : null;
  }

  private upsertJson(table: string, id: string, data: object) {
    this.db.prepare(`
      INSERT INTO ${table} (id, data_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        data_json = excluded.data_json,
        updated_at = excluded.updated_at
    `).run(id, JSON.stringify(data), nowIso());
  }

  private mapLeadRow(row: LeadDbRow): LeadRecord {
    return {
      id: row.id,
      supabaseId: row.supabase_id || undefined,
      source: row.source,
      status: row.status,
      syncStatus: row.sync_status,
      guestName: row.guest_name || undefined,
      phone: row.phone,
      email: row.email || undefined,
      desiredStartDate: row.desired_start_date || undefined,
      desiredEndDate: row.desired_end_date || undefined,
      desiredTime: row.desired_time || undefined,
      guestsCount: row.guests_count ?? undefined,
      objectType: row.object_type || undefined,
      objectId: row.object_id || undefined,
      message: row.message || undefined,
      utmJson: row.utm_json || undefined,
      rawJson: row.raw_json || undefined,
      clientId: row.client_id || undefined,
      contractId: row.contract_id || undefined,
      prebookingId: row.prebooking_id || undefined,
      managerNote: row.manager_note || undefined,
      channel: row.channel || undefined,
      externalConversationId: row.external_conversation_id || undefined,
      aiSummary: row.ai_summary || undefined,
      transcriptJson: row.transcript_json || undefined,
      guestContact: row.guest_contact || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      supabaseCreatedAt: row.supabase_created_at || undefined,
      pulledToCrmAt: row.pulled_to_crm_at || undefined,
      convertedAt: row.converted_at || undefined,
      lastError: row.last_error || undefined,
    };
  }

  private normalizeLeadStatus(status: unknown): LeadStatusRecord {
    const value = cleanOptionalString(status);
    if (
      value === 'new'
      || value === 'confirmed'
      || value === 'in_progress'
      || value === 'client_created'
      || value === 'prebooking_created'
      || value === 'contract_created'
      || value === 'rejected'
      || value === 'duplicate'
    ) {
      return value;
    }
    return 'new';
  }

  private insertLead(lead: LeadRecord) {
    this.db.prepare(`
      INSERT INTO leads (
        id, supabase_id, source, status, sync_status, guest_name, phone, email,
        desired_start_date, desired_end_date, desired_time, guests_count, object_type, object_id,
        message, utm_json, raw_json, client_id, contract_id, prebooking_id, manager_note,
        channel, external_conversation_id, ai_summary, transcript_json, guest_contact,
        created_at, updated_at, supabase_created_at, pulled_to_crm_at, converted_at, last_error
      )
      VALUES (
        @id, @supabase_id, @source, @status, @sync_status, @guest_name, @phone, @email,
        @desired_start_date, @desired_end_date, @desired_time, @guests_count, @object_type, @object_id,
        @message, @utm_json, @raw_json, @client_id, @contract_id, @prebooking_id, @manager_note,
        @channel, @external_conversation_id, @ai_summary, @transcript_json, @guest_contact,
        @created_at, @updated_at, @supabase_created_at, @pulled_to_crm_at, @converted_at, @last_error
      )
      ON CONFLICT(id) DO UPDATE SET
        supabase_id = excluded.supabase_id,
        source = excluded.source,
        status = excluded.status,
        sync_status = excluded.sync_status,
        guest_name = excluded.guest_name,
        phone = excluded.phone,
        email = excluded.email,
        desired_start_date = excluded.desired_start_date,
        desired_end_date = excluded.desired_end_date,
        desired_time = excluded.desired_time,
        guests_count = excluded.guests_count,
        object_type = excluded.object_type,
        object_id = excluded.object_id,
        message = excluded.message,
        utm_json = excluded.utm_json,
        raw_json = excluded.raw_json,
        client_id = excluded.client_id,
        contract_id = excluded.contract_id,
        prebooking_id = excluded.prebooking_id,
        manager_note = excluded.manager_note,
        channel = excluded.channel,
        external_conversation_id = excluded.external_conversation_id,
        ai_summary = excluded.ai_summary,
        transcript_json = excluded.transcript_json,
        guest_contact = excluded.guest_contact,
        updated_at = excluded.updated_at,
        supabase_created_at = excluded.supabase_created_at,
        pulled_to_crm_at = excluded.pulled_to_crm_at,
        converted_at = excluded.converted_at,
        last_error = excluded.last_error
    `).run({
      id: lead.id,
      supabase_id: lead.supabaseId || null,
      source: lead.source,
      status: lead.status,
      sync_status: lead.syncStatus,
      guest_name: lead.guestName || null,
      phone: lead.phone,
      email: lead.email || null,
      desired_start_date: lead.desiredStartDate || null,
      desired_end_date: lead.desiredEndDate || null,
      desired_time: lead.desiredTime || null,
      guests_count: lead.guestsCount ?? null,
      object_type: lead.objectType || null,
      object_id: lead.objectId || null,
      message: lead.message || null,
      utm_json: lead.utmJson || null,
      raw_json: lead.rawJson || null,
      client_id: lead.clientId || null,
      contract_id: lead.contractId || null,
      prebooking_id: lead.prebookingId || null,
      manager_note: lead.managerNote || null,
      channel: lead.channel || null,
      external_conversation_id: lead.externalConversationId || null,
      ai_summary: lead.aiSummary || null,
      transcript_json: lead.transcriptJson || null,
      guest_contact: lead.guestContact || null,
      created_at: lead.createdAt,
      updated_at: lead.updatedAt,
      supabase_created_at: lead.supabaseCreatedAt || null,
      pulled_to_crm_at: lead.pulledToCrmAt || null,
      converted_at: lead.convertedAt || null,
      last_error: lead.lastError || null,
    });
  }
}

export const localDb = new LocalDatabase();
export const localPaths = {
  dataDir: DATA_DIR,
  backupDir: BACKUP_DIR,
  dbPath: DB_PATH,
};
