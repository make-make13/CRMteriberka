import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CC_OBJECTS, GB_OBJECTS } from '../src/constants.ts';
import type { Booking, Client, Contract } from '../src/types.ts';
import { parseLegacyCsv } from './legacyImportAnalysis.ts';

type CsvRow = ReturnType<typeof parseLegacyCsv>['rows'][number];

export type LegacySkipReason =
  | 'invalid_client'
  | 'missing_client'
  | 'invalid_dates'
  | 'invalid_time'
  | 'invalid_finance'
  | 'unknown_object'
  | 'booking_conflict';

export interface LegacySkippedRow {
  legacyId: string;
  reason: LegacySkipReason;
  message: string;
}

export interface LegacyImportPlan {
  sourceDir: string;
  generatedAt: string;
  clients: {
    toImport: Client[];
    skipped: LegacySkippedRow[];
  };
  contracts: {
    toImport: Array<{ legacyId: string; contract: Contract }>;
    skipped: LegacySkippedRow[];
  };
}

interface LegacyObjectMapping {
  objectId: string;
  baseType: Contract['baseType'];
}

interface LegacyPeriod {
  startTime: string;
  endTime: string;
  startMs: number;
  endMs: number;
}

const DEFAULT_SOURCE_DIR = path.join(process.cwd(), 'manual-backups', 'import-source', 'sql-export');
const VALID_CC_OBJECTS = new Set(CC_OBJECTS.map((object) => object.id));
const VALID_GB_OBJECTS = new Set(GB_OBJECTS.map((object) => object.id));

export function buildLegacyImportPlan(sourceDir = DEFAULT_SOURCE_DIR): LegacyImportPlan {
  const subjects = readRows(sourceDir, 'dbo.Subject.csv');
  const contracts = readRows(sourceDir, 'dbo.Contract.csv');
  const clients = buildClients(subjects);
  const clientsByLegacyId = new Map(
    clients.toImport.map((client) => [client.id.replace(/^legacy-subject-/, ''), client]),
  );
  const contractPlan = buildContracts(contracts, clientsByLegacyId);

  return {
    sourceDir,
    generatedAt: new Date().toISOString(),
    clients,
    contracts: contractPlan,
  };
}

export function writeLegacyImportPlan(sourceDir = DEFAULT_SOURCE_DIR, outDir = sourceDir): {
  jsonPath: string;
  markdownPath: string;
  plan: LegacyImportPlan;
} {
  const plan = buildLegacyImportPlan(sourceDir);
  fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, 'legacy-import-plan.json');
  const markdownPath = path.join(outDir, 'legacy-import-plan.md');
  fs.writeFileSync(jsonPath, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
  fs.writeFileSync(markdownPath, renderLegacyImportPlanMarkdown(plan), 'utf8');
  return { jsonPath, markdownPath, plan };
}

export function renderLegacyImportPlanMarkdown(plan: LegacyImportPlan): string {
  const skippedByReason = countSkipped(plan.contracts.skipped);
  const lines = [
    '# План чистого импорта старой базы',
    '',
    `Источник: \`${plan.sourceDir}\``,
    `Сформировано: ${plan.generatedAt}`,
    '',
    '## Что будет перенесено',
    '',
    `- Клиенты: ${plan.clients.toImport.length}`,
    `- Договоры: ${plan.contracts.toImport.length}`,
    '',
    '## Что будет пропущено',
    '',
    `- Клиенты: ${plan.clients.skipped.length}`,
    `- Договоры: ${plan.contracts.skipped.length}`,
    ...Object.entries(skippedByReason).map(([reason, count]) => `- ${reason}: ${count}`),
    '',
    '## Первые пропущенные договоры',
    '',
    ...(plan.contracts.skipped.length
      ? plan.contracts.skipped.slice(0, 50).map((item) => `- ${item.legacyId}: ${item.reason} - ${item.message}`)
      : ['Пропущенных договоров нет.']),
    '',
    'Этот файл только описывает перенос. Для записи в CRM нужен отдельный запуск с `--apply`.',
    '',
  ];
  return lines.join('\n');
}

function buildClients(rows: CsvRow[]): LegacyImportPlan['clients'] {
  const toImport: Client[] = [];
  const skipped: LegacySkippedRow[] = [];

  for (const row of rows) {
    const legacyId = text(row.ID);
    const firstName = clean(row.I);
    const lastName = clean(row.F);
    const phone = clean(row.Phone);
    if (!legacyId || (!firstName && !lastName) || digits(phone).length < 5) {
      skipped.push({
        legacyId: legacyId || 'unknown',
        reason: 'invalid_client',
        message: 'нет ID, имени/фамилии или нормального телефона',
      });
      continue;
    }

    const passport = splitPassport(row.NU);
    toImport.push({
      id: `legacy-subject-${legacyId}`,
      type: 'physical',
      firstName,
      lastName,
      middleName: clean(row.O),
      birthDate: toIsoDate(row.DR),
      phone,
      email: clean(row.Email),
      passportSeries: passport.series || clean(row.SU),
      passportNumber: passport.number,
      passportIssuedBy: clean(row.KV),
      passportIssueDate: toIsoDate(row.DV),
      registrationAddress: clean(row.Adres),
      additionalInfo: clean(row.Kom),
      isBlacklisted: false,
      createdAt: toIsoDateTime(row.Stamp) || new Date().toISOString(),
    });
  }

  return { toImport, skipped };
}

function buildContracts(rows: CsvRow[], clientsByLegacyId: Map<string, Client>): LegacyImportPlan['contracts'] {
  const toImport: Array<{ legacyId: string; contract: Contract }> = [];
  const skipped: LegacySkippedRow[] = [];
  const acceptedBookings: Array<{ objectId: string; startMs: number; endMs: number; contractId: string }> = [];

  for (const row of rows) {
    const legacyId = text(row.ID);
    const subjectId = text(row.IDSubject);
    const client = clientsByLegacyId.get(subjectId);
    if (!client) {
      skipped.push({ legacyId, reason: 'missing_client', message: `клиент IDSubject=${subjectId || 'пусто'} не переносится` });
      continue;
    }

    const object = mapLegacyObject(row);
    if (!object) {
      skipped.push({ legacyId, reason: 'unknown_object', message: `Cottage=${clean(row.Cottage) || 'пусто'}, IDHostel=${clean(row.IDHostel) || 'пусто'}` });
      continue;
    }

    const period = buildLegacyPeriod(row, object.baseType);
    if (!period) {
      skipped.push({ legacyId, reason: 'invalid_dates', message: `DateB=${clean(row.DateB) || 'пусто'}, DateE=${clean(row.DateE) || 'пусто'}` });
      continue;
    }

    const invalidTime = findInvalidTime(row);
    if (invalidTime) {
      skipped.push({ legacyId, reason: 'invalid_time', message: invalidTime });
      continue;
    }

    const totalAmount = money(row.Value) ?? 0;
    const prepayment = money(row.Avans) ?? 0;
    const remainder = money(row.Saldo) ?? 0;
    if (prepayment > totalAmount + 0.01 || Math.abs(remainder - (totalAmount - prepayment)) > 0.01) {
      skipped.push({
        legacyId,
        reason: 'invalid_finance',
        message: `Value=${totalAmount}, Avans=${prepayment}, Saldo=${remainder}`,
      });
      continue;
    }

    const conflict = acceptedBookings.find((booking) => (
      booking.objectId === object.objectId
      && period.startMs < booking.endMs
      && period.endMs > booking.startMs
    ));
    if (conflict && mapLegacyStatus(row) !== 'cancelled') {
      skipped.push({
        legacyId,
        reason: 'booking_conflict',
        message: `пересекается с импортируемым договором ${conflict.contractId} по объекту ${object.objectId}`,
      });
      continue;
    }

    const contractId = `legacy-contract-${legacyId}`;
    const booking: Booking = {
      id: `legacy-booking-${legacyId}`,
      contractId,
      objectId: object.objectId,
      baseType: object.baseType,
      startTime: period.startTime,
      endTime: period.endTime,
      type: 'main',
      price: totalAmount,
    };
    const contract: Contract = {
      id: contractId,
      number: `OLD-${legacyId}`,
      clientId: client.id,
      baseType: object.baseType,
      status: mapLegacyStatus(row),
      totalAmount,
      prepayment,
      remainder,
      createdAt: toIsoDateTime(row.Stamp) || toIsoDateTime(row.DateS) || new Date().toISOString(),
      dateSigned: toIsoDate(row.DateS) || period.startTime.slice(0, 10),
      guestsCount: Math.max(0, Math.trunc(money(row.Chel) ?? 0)),
      comment: buildComment(row),
      bookings: [booking],
    };

    toImport.push({ legacyId, contract });
    if (contract.status !== 'cancelled') {
      acceptedBookings.push({
        objectId: object.objectId,
        startMs: period.startMs,
        endMs: period.endMs,
        contractId: legacyId,
      });
    }
  }

  return { toImport, skipped };
}

function mapLegacyObject(row: CsvRow): LegacyObjectMapping | null {
  const hostel = text(row.IDHostel);
  const cottage = normalizeCottage(clean(row.Cottage));
  if (!cottage || /[,;]/.test(cottage) || /\s/.test(cottage)) {
    return null;
  }

  if (hostel === '0') {
    const objectId = `cc-${cottage}`;
    return VALID_CC_OBJECTS.has(objectId) ? { objectId, baseType: 'chunga-changa' } : null;
  }

  if (hostel === '1') {
    const objectId = `gb-${cottage.replace('/', '-')}`;
    return VALID_GB_OBJECTS.has(objectId) ? { objectId, baseType: 'golubaya-bukhta' } : null;
  }

  return null;
}

function buildLegacyPeriod(row: CsvRow, baseType: Contract['baseType']): LegacyPeriod | null {
  const startDate = toIsoDate(row.DateB);
  const endDate = toIsoDate(row.DateE);
  if (!startDate || !endDate) {
    return null;
  }

  const startTime = normalizeTime(row.TimeB) || (baseType === 'golubaya-bukhta' ? '17:00' : '14:00');
  const endTime = normalizeTime(row.TimeE) || (baseType === 'golubaya-bukhta' ? '14:00' : '18:00');
  const startIso = `${startDate}T${startTime}:00`;
  const endIso = `${endDate}T${endTime}:00`;
  const startMs = Date.parse(startIso);
  const endMs = Date.parse(endIso);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return null;
  }
  return { startTime: startIso, endTime: endIso, startMs, endMs };
}

function findInvalidTime(row: CsvRow): string {
  for (const field of ['TimeB', 'TimeE'] as const) {
    const value = row[field];
    if (clean(value) && !normalizeTime(value)) {
      return `${field}=${clean(value)}`;
    }
  }
  return '';
}

function mapLegacyStatus(row: CsvRow): Contract['status'] {
  if (text(row.Status) === '0') {
    return 'cancelled';
  }
  const total = money(row.Value) ?? 0;
  const prepayment = money(row.Avans) ?? 0;
  const remainder = money(row.Saldo) ?? Math.max(0, total - prepayment);
  if (total > 0 && remainder <= 0.01) {
    return 'paid';
  }
  if (prepayment > 0) {
    return 'partial_paid';
  }
  return 'signed_not_paid';
}

function buildComment(row: CsvRow): string {
  const parts = [
    clean(row.Kom),
    `Импорт из старой базы: Contract.ID=${text(row.ID)}`,
    `Старый Status=${text(row.Status) || 'пусто'}, IDHostel=${text(row.IDHostel) || 'пусто'}, Cottage=${clean(row.Cottage) || 'пусто'}`,
  ].filter(Boolean);
  return parts.join('\n');
}

function readRows(sourceDir: string, fileName: string): CsvRow[] {
  const filePath = path.join(sourceDir, fileName);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Не найден файл: ${filePath}`);
  }
  return parseLegacyCsv(fs.readFileSync(filePath, 'utf8')).rows;
}

function countSkipped(skipped: LegacySkippedRow[]): Record<string, number> {
  return skipped.reduce<Record<string, number>>((result, item) => {
    result[item.reason] = (result[item.reason] ?? 0) + 1;
    return result;
  }, {});
}

function normalizeCottage(value: string): string {
  return value
    .trim()
    .replace(/\\/g, '/')
    .replace(/\./g, '/')
    .replace(/^0+(\d)/, '$1')
    .toLowerCase();
}

function toIsoDate(value: unknown): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text(value));
  if (!match) {
    return '';
  }
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day)) {
    return '';
  }
  return `${year}-${month}-${day}`;
}

function toIsoDateTime(value: unknown): string {
  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/.exec(text(value));
  if (!match || !toIsoDate(match[1])) {
    return '';
  }
  return `${match[1]}T${match[2]}`;
}

function normalizeTime(value: unknown): string {
  const match = /^(\d{1,2}):(\d{1,2})(?::\d{0,2})?$/.exec(clean(value));
  if (!match) {
    return '';
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    return '';
  }
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function splitPassport(value: unknown): { series: string; number: string } {
  const valueDigits = digits(value);
  return {
    series: valueDigits.slice(0, 4),
    number: valueDigits.slice(4),
  };
}

function money(value: unknown): number | null {
  const parsed = Number(text(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function digits(value: unknown): string {
  return text(value).replace(/\D/g, '');
}

function clean(value: unknown): string {
  return text(value).trim();
}

function text(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

function parseArgs(argv: string[]) {
  let sourceDir = DEFAULT_SOURCE_DIR;
  let outDir = DEFAULT_SOURCE_DIR;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--source' && argv[index + 1]) {
      sourceDir = path.resolve(argv[index + 1]);
      index += 1;
    } else if (argv[index] === '--out' && argv[index + 1]) {
      outDir = path.resolve(argv[index + 1]);
      index += 1;
    }
  }
  return { sourceDir, outDir };
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  const { sourceDir, outDir } = parseArgs(process.argv.slice(2));
  const result = writeLegacyImportPlan(sourceDir, outDir);
  console.log(`Legacy import plan created:\n${result.jsonPath}\n${result.markdownPath}`);
  console.log(`Clients to import: ${result.plan.clients.toImport.length}`);
  console.log(`Contracts to import: ${result.plan.contracts.toImport.length}`);
  console.log(`Clients skipped: ${result.plan.clients.skipped.length}`);
  console.log(`Contracts skipped: ${result.plan.contracts.skipped.length}`);
}
