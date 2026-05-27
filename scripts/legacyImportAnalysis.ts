import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type CsvValue = string | null;
type CsvRow = Record<string, CsvValue>;

interface LegacyCsv {
  headers: string[];
  rows: CsvRow[];
}

interface CountItem {
  value: string;
  count: number;
}

interface IssueSample {
  id: string;
  message: string;
}

interface DuplicateSample {
  value: string;
  count: number;
  ids: string[];
}

interface BookingConflictSample {
  objectKey: string;
  firstContractId: string;
  secondContractId: string;
  firstPeriod: string;
  secondPeriod: string;
}

export interface LegacyImportReport {
  sourceDir: string;
  generatedAt: string;
  clients: {
    sourceTable: string;
    totalRows: number;
    withPhone: number;
    withoutPhone: number;
    withPassport: number;
    withoutPassport: number;
  };
  contracts: {
    sourceTable: string;
    totalRows: number;
    withMatchingSubject: number;
    withoutMatchingSubject: number;
    withDateRange: number;
    withoutDateRange: number;
  };
  distributions: {
    contractStatus: CountItem[];
    hostel: CountItem[];
    cottage: CountItem[];
    typeDoc: CountItem[];
    cDay: CountItem[];
  };
  dataQuality: {
    missingSubjects: IssueSample[];
    invalidDateRanges: IssueSample[];
    invalidTimes: IssueSample[];
    duplicatePhones: DuplicateSample[];
    duplicatePassports: DuplicateSample[];
    financialIssues: {
      prepaymentGreaterThanTotal: number;
      remainderMismatch: number;
      samples: IssueSample[];
    };
  };
  bookingConflicts: {
    sameObjectOverlaps: BookingConflictSample[];
  };
  mappingPreview: {
    client: Record<string, unknown> | null;
    contract: Record<string, unknown> | null;
    booking: Record<string, unknown> | null;
  };
}

interface ParsedPeriod {
  startIso: string;
  endIso: string;
  startMs: number;
  endMs: number;
}

const DEFAULT_SOURCE_DIR = path.join(process.cwd(), 'manual-backups', 'import-source', 'sql-export');
export function parseLegacyCsv(content: string): LegacyCsv {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  const text = content.replace(/^\uFEFF/, '');
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ';') {
      pushField();
    } else if (char === '\n') {
      pushRow();
    } else if (char !== '\r') {
      field += char;
    }
  }

  if (field !== '' || row.length > 0) {
    pushRow();
  }

  const [headerRow = [], ...dataRows] = rows;
  const headers = headerRow.map((header) => header.trim().replace(/^\uFEFF/, ''));
  return {
    headers,
    rows: dataRows
      .filter((values) => values.some((value) => value !== ''))
      .map((values) => Object.fromEntries(headers.map((header, index) => [
        header,
        values[index] === 'NULL' ? null : values[index] ?? '',
      ]))),
  };
}

export function analyzeLegacyImport(sourceDir = DEFAULT_SOURCE_DIR): LegacyImportReport {
  const subjectCsv = readLegacyCsv(sourceDir, 'dbo.Subject.csv');
  const contractCsv = readLegacyCsv(sourceDir, 'dbo.Contract.csv');
  const subjectsById = new Map(subjectCsv.rows.map((subject) => [stringValue(subject.ID), subject]));
  const subjectIds = new Set(subjectsById.keys());

  const duplicatePhones = collectDuplicates(subjectCsv.rows, (row) => normalizeDigits(row.Phone), 'ID');
  const duplicatePassports = collectDuplicates(subjectCsv.rows, (row) => normalizePassport(row.NU), 'ID');
  const missingSubjects: IssueSample[] = [];
  const invalidDateRanges: IssueSample[] = [];
  const invalidTimes: IssueSample[] = [];
  const financialSamples: IssueSample[] = [];
  let withMatchingSubject = 0;
  let withDateRange = 0;
  let prepaymentGreaterThanTotal = 0;
  let remainderMismatch = 0;
  const periods: Array<{ row: CsvRow; period: ParsedPeriod; objectKey: string }> = [];

  for (const row of contractCsv.rows) {
    const contractId = stringValue(row.ID);
    const subjectId = stringValue(row.IDSubject);
    if (subjectId && subjectIds.has(subjectId)) {
      withMatchingSubject += 1;
    } else {
      pushSample(missingSubjects, {
        id: contractId,
        message: `IDSubject=${subjectId || 'пусто'} не найден в dbo.Subject`,
      });
    }

    for (const timeField of ['TimeB', 'TimeE'] as const) {
      const time = row[timeField];
      if (hasValue(time) && !normalizeLegacyTime(time)) {
        pushSample(invalidTimes, {
          id: contractId,
          message: `${timeField}=${time}`,
        });
      }
    }

    const period = buildPeriod(row);
    if (period) {
      withDateRange += 1;
      periods.push({ row, period, objectKey: getLegacyObjectKey(row) });
    } else {
      pushSample(invalidDateRanges, {
        id: contractId,
        message: `DateB=${row.DateB || 'пусто'}, DateE=${row.DateE || 'пусто'}`,
      });
    }

    const total = numberValue(row.Value);
    const prepayment = numberValue(row.Avans);
    const remainder = numberValue(row.Saldo);
    if (total !== null && prepayment !== null && prepayment > total + 0.01) {
      prepaymentGreaterThanTotal += 1;
      pushSample(financialSamples, {
        id: contractId,
        message: `Avans=${prepayment}, Value=${total}`,
      });
    }
    if (total !== null && prepayment !== null && remainder !== null && Math.abs(remainder - (total - prepayment)) > 0.01) {
      remainderMismatch += 1;
      pushSample(financialSamples, {
        id: contractId,
        message: `Saldo=${remainder}, ожидалось ${roundMoney(total - prepayment)}`,
      });
    }
  }

  const firstContractWithSubject = contractCsv.rows.find((row) => {
    const subjectId = stringValue(row.IDSubject);
    return subjectId && subjectsById.has(subjectId);
  }) ?? contractCsv.rows[0] ?? null;
  const firstSubject = firstContractWithSubject
    ? subjectsById.get(stringValue(firstContractWithSubject.IDSubject)) ?? subjectCsv.rows[0] ?? null
    : subjectCsv.rows[0] ?? null;

  return {
    sourceDir,
    generatedAt: new Date().toISOString(),
    clients: {
      sourceTable: 'dbo.Subject',
      totalRows: subjectCsv.rows.length,
      withPhone: subjectCsv.rows.filter((row) => hasValue(row.Phone)).length,
      withoutPhone: subjectCsv.rows.filter((row) => !hasValue(row.Phone)).length,
      withPassport: subjectCsv.rows.filter((row) => hasValue(row.NU)).length,
      withoutPassport: subjectCsv.rows.filter((row) => !hasValue(row.NU)).length,
    },
    contracts: {
      sourceTable: 'dbo.Contract',
      totalRows: contractCsv.rows.length,
      withMatchingSubject,
      withoutMatchingSubject: contractCsv.rows.length - withMatchingSubject,
      withDateRange,
      withoutDateRange: contractCsv.rows.length - withDateRange,
    },
    distributions: {
      contractStatus: countBy(contractCsv.rows, 'Status'),
      hostel: countBy(contractCsv.rows, 'IDHostel'),
      cottage: countBy(contractCsv.rows, 'Cottage'),
      typeDoc: countBy(contractCsv.rows, 'TypeDoc'),
      cDay: countBy(contractCsv.rows, 'CDay'),
    },
    dataQuality: {
      missingSubjects,
      invalidDateRanges,
      invalidTimes,
      duplicatePhones,
      duplicatePassports,
      financialIssues: {
        prepaymentGreaterThanTotal,
        remainderMismatch,
        samples: financialSamples,
      },
    },
    bookingConflicts: {
      sameObjectOverlaps: findSameObjectOverlaps(periods),
    },
    mappingPreview: buildMappingPreview(firstSubject, firstContractWithSubject),
  };
}

export function writeLegacyImportReport(sourceDir = DEFAULT_SOURCE_DIR, outDir = sourceDir): { jsonPath: string; markdownPath: string; report: LegacyImportReport } {
  const report = analyzeLegacyImport(sourceDir);
  fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, 'legacy-import-analysis.json');
  const markdownPath = path.join(outDir, 'legacy-import-analysis.md');
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.writeFileSync(markdownPath, renderLegacyImportMarkdown(report), 'utf8');
  return { jsonPath, markdownPath, report };
}

export function renderLegacyImportMarkdown(report: LegacyImportReport): string {
  const lines = [
    '# Предварительный отчет импорта старой SQL базы',
    '',
    `Источник: \`${report.sourceDir}\``,
    `Сформировано: ${report.generatedAt}`,
    '',
    '## Объем данных',
    '',
    `- Клиенты (${report.clients.sourceTable}): ${report.clients.totalRows}`,
    `- Договоры (${report.contracts.sourceTable}): ${report.contracts.totalRows}`,
    `- Договоры с найденным клиентом: ${report.contracts.withMatchingSubject}`,
    `- Договоры без найденного клиента: ${report.contracts.withoutMatchingSubject}`,
    `- Договоры с распознанным периодом: ${report.contracts.withDateRange}`,
    `- Договоры без корректного периода: ${report.contracts.withoutDateRange}`,
    '',
    '## Качество данных',
    '',
    `- Дубли телефонов клиентов: ${report.dataQuality.duplicatePhones.length}`,
    `- Дубли паспортов клиентов: ${report.dataQuality.duplicatePassports.length}`,
    `- Некорректные периоды договоров: ${report.dataQuality.invalidDateRanges.length}`,
    `- Некорректные времена заезда/выезда: ${report.dataQuality.invalidTimes.length}`,
    `- Предоплата больше суммы: ${report.dataQuality.financialIssues.prepaymentGreaterThanTotal}`,
    `- Остаток не равен сумма минус предоплата: ${report.dataQuality.financialIssues.remainderMismatch}`,
    `- Возможные пересечения броней одного объекта: ${report.bookingConflicts.sameObjectOverlaps.length}`,
    '',
    '## Распределения',
    '',
    `- Status: ${formatDistribution(report.distributions.contractStatus)}`,
    `- IDHostel: ${formatDistribution(report.distributions.hostel)}`,
    `- Cottage: ${formatDistribution(report.distributions.cottage)}`,
    `- TypeDoc: ${formatDistribution(report.distributions.typeDoc)}`,
    `- CDay: ${formatDistribution(report.distributions.cDay)}`,
    '',
    '## Примеры проблем',
    '',
    ...formatIssueBlock('Договоры без клиента', report.dataQuality.missingSubjects),
    ...formatIssueBlock('Некорректные даты', report.dataQuality.invalidDateRanges),
    ...formatIssueBlock('Некорректное время', report.dataQuality.invalidTimes),
    ...formatIssueBlock('Финансы', report.dataQuality.financialIssues.samples),
    ...formatConflictBlock(report.bookingConflicts.sameObjectOverlaps),
    '',
    '## Черновая схема переноса',
    '',
    '```json',
    JSON.stringify(report.mappingPreview, null, 2),
    '```',
    '',
    'Это только предварительный отчет. Он не изменяет текущую CRM-базу.',
    '',
  ];
  return lines.join('\n');
}

function readLegacyCsv(sourceDir: string, fileName: string): LegacyCsv {
  const filePath = path.join(sourceDir, fileName);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Не найден файл выгрузки: ${filePath}`);
  }
  return parseLegacyCsv(fs.readFileSync(filePath, 'utf8'));
}

function buildMappingPreview(subject: CsvRow | null, contract: CsvRow | null) {
  const subjectId = subject ? stringValue(subject.ID) : '';
  const contractId = contract ? stringValue(contract.ID) : '';
  const period = contract ? buildPeriod(contract) : null;

  return {
    client: subject ? {
      id: `legacy-subject-${subjectId}`,
      type: 'physical',
      firstName: trimmed(subject.I),
      lastName: trimmed(subject.F),
      middleName: trimmed(subject.O),
      birthDate: toIsoDate(subject.DR),
      phone: trimmed(subject.Phone),
      email: trimmed(subject.Email),
      passportSeries: splitPassport(subject.NU).series || trimmed(subject.SU),
      passportNumber: splitPassport(subject.NU).number,
      passportIssuedBy: trimmed(subject.KV),
      passportIssueDate: toIsoDate(subject.DV),
      registrationAddress: trimmed(subject.Adres),
      additionalInfo: trimmed(subject.Kom),
      isBlacklisted: false,
    } : null,
    contract: contract ? {
      id: `legacy-contract-${contractId}`,
      number: contractId,
      clientId: `legacy-subject-${stringValue(contract.IDSubject)}`,
      baseType: inferBaseType(contract),
      status: mapContractStatus(contract.Status),
      totalAmount: numberValue(contract.Value) ?? 0,
      prepayment: numberValue(contract.Avans) ?? 0,
      remainder: numberValue(contract.Saldo) ?? 0,
      createdAt: toIsoDateTime(contract.Stamp) ?? toIsoDateTime(contract.DateS),
      dateSigned: toIsoDate(contract.DateS),
      guestsCount: numberValue(contract.Chel),
      comment: trimmed(contract.Kom),
    } : null,
    booking: contract && period ? {
      id: `legacy-booking-${contractId}`,
      contractId: `legacy-contract-${contractId}`,
      objectId: getLegacyObjectKey(contract),
      baseType: inferBaseType(contract),
      startTime: period.startIso,
      endTime: period.endIso,
      type: 'main',
      price: numberValue(contract.Value) ?? 0,
    } : null,
  };
}

function buildPeriod(row: CsvRow): ParsedPeriod | null {
  const startDate = toIsoDate(row.DateB);
  const endDate = toIsoDate(row.DateE);
  if (!startDate || !endDate) {
    return null;
  }
  const startTime = normalizeLegacyTime(row.TimeB) || '14:00';
  const endTime = normalizeLegacyTime(row.TimeE) || '12:00';
  const startIso = `${startDate}T${startTime}:00`;
  const endIso = `${endDate}T${endTime}:00`;
  const startMs = Date.parse(startIso);
  const endMs = Date.parse(endIso);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return null;
  }
  return { startIso, endIso, startMs, endMs };
}

function findSameObjectOverlaps(periods: Array<{ row: CsvRow; period: ParsedPeriod; objectKey: string }>) {
  const overlaps: BookingConflictSample[] = [];
  const groups = new Map<string, Array<{ row: CsvRow; period: ParsedPeriod; objectKey: string }>>();
  for (const period of periods) {
    const items = groups.get(period.objectKey) ?? [];
    items.push(period);
    groups.set(period.objectKey, items);
  }

  for (const [objectKey, items] of groups) {
    const sorted = [...items].sort((left, right) => left.period.startMs - right.period.startMs);
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1];
      const current = sorted[index];
      if (current.period.startMs < previous.period.endMs) {
        pushSample(overlaps, {
          objectKey,
          firstContractId: stringValue(previous.row.ID),
          secondContractId: stringValue(current.row.ID),
          firstPeriod: `${previous.period.startIso} - ${previous.period.endIso}`,
          secondPeriod: `${current.period.startIso} - ${current.period.endIso}`,
        });
      }
    }
  }
  return overlaps;
}

function collectDuplicates(rows: CsvRow[], getValue: (row: CsvRow) => string, idField: string): DuplicateSample[] {
  const groups = new Map<string, string[]>();
  for (const row of rows) {
    const value = getValue(row);
    if (value.length < 5) {
      continue;
    }
    const ids = groups.get(value) ?? [];
    ids.push(stringValue(row[idField]));
    groups.set(value, ids);
  }
  return [...groups.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([value, ids]) => ({ value, count: ids.length, ids: ids.slice(0, 10) }))
}

function countBy(rows: CsvRow[], field: string): CountItem[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = stringValue(row[field]) || 'пусто';
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([value, count]) => ({ value, count }));
}

function toIsoDate(value: CsvValue): string {
  const text = stringValue(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (!match) {
    return '';
  }
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    date.getUTCFullYear() !== Number(year)
    || date.getUTCMonth() !== Number(month) - 1
    || date.getUTCDate() !== Number(day)
  ) {
    return '';
  }
  return `${year}-${month}-${day}`;
}

function toIsoDateTime(value: CsvValue): string {
  const text = stringValue(value);
  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/.exec(text);
  if (!match || !toIsoDate(match[1])) {
    return '';
  }
  return `${match[1]}T${match[2]}`;
}

function normalizeLegacyTime(value: CsvValue): string {
  const text = stringValue(value).trim();
  if (!text) {
    return '';
  }
  const match = /^(\d{1,2}):(\d{1,2})(?::\d{0,2})?$/.exec(text);
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

function numberValue(value: CsvValue): number | null {
  const text = stringValue(value).replace(',', '.').trim();
  if (!text) {
    return null;
  }
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function splitPassport(value: CsvValue): { series: string; number: string } {
  const digits = normalizeDigits(value);
  return {
    series: digits.slice(0, 4),
    number: digits.slice(4),
  };
}

function getLegacyObjectKey(row: CsvRow): string {
  const hostel = stringValue(row.IDHostel) || 'unknown-hostel';
  const cottage = stringValue(row.Cottage) || 'unknown-cottage';
  const room = stringValue(row.Npom);
  return room ? `legacy-hostel-${hostel}-cottage-${cottage}-room-${room}` : `legacy-hostel-${hostel}-cottage-${cottage}`;
}

function inferBaseType(row: CsvRow): 'chunga-changa' | 'golubaya-bukhta' {
  return stringValue(row.IDHostel) === '1' ? 'golubaya-bukhta' : 'chunga-changa';
}

function mapContractStatus(value: CsvValue): string {
  const status = stringValue(value);
  if (status === '0') return 'pre_booking';
  if (status === '1') return 'paid';
  if (status === '2') return 'partial_paid';
  if (status === '3') return 'cancelled';
  return 'signed_not_paid';
}

function normalizeDigits(value: CsvValue): string {
  return stringValue(value).replace(/\D/g, '');
}

function normalizePassport(value: CsvValue): string {
  return normalizeDigits(value);
}

function trimmed(value: CsvValue): string {
  return stringValue(value).trim();
}

function hasValue(value: CsvValue): boolean {
  return trimmed(value) !== '';
}

function stringValue(value: CsvValue | undefined): string {
  return value ?? '';
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function pushSample<T>(items: T[], item: T): void {
  items.push(item);
}

function formatDistribution(items: CountItem[]): string {
  return items.slice(0, 10).map((item) => `${item.value}=${item.count}`).join(', ') || 'нет данных';
}

function formatIssueBlock(title: string, samples: IssueSample[]): string[] {
  if (samples.length === 0) {
    return [`### ${title}`, '', 'Проблем не найдено.', ''];
  }
  return [
    `### ${title}`,
    '',
    ...samples.slice(0, 10).map((sample) => `- ${sample.id}: ${sample.message}`),
    '',
  ];
}

function formatConflictBlock(samples: BookingConflictSample[]): string[] {
  if (samples.length === 0) {
    return ['### Пересечения броней', '', 'Проблем не найдено.', ''];
  }
  return [
    '### Пересечения броней',
    '',
    ...samples.slice(0, 10).map((sample) => (
      `- ${sample.objectKey}: договор ${sample.firstContractId} (${sample.firstPeriod}) пересекается с ${sample.secondContractId} (${sample.secondPeriod})`
    )),
    '',
  ];
}

function parseArgs(argv: string[]) {
  let sourceDir = DEFAULT_SOURCE_DIR;
  let outDir = DEFAULT_SOURCE_DIR;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--source' && argv[index + 1]) {
      sourceDir = path.resolve(argv[index + 1]);
      index += 1;
    } else if (arg === '--out' && argv[index + 1]) {
      outDir = path.resolve(argv[index + 1]);
      index += 1;
    }
  }
  return { sourceDir, outDir };
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  const { sourceDir, outDir } = parseArgs(process.argv.slice(2));
  const result = writeLegacyImportReport(sourceDir, outDir);
  console.log(`Legacy import analysis created:\n${result.jsonPath}\n${result.markdownPath}`);
  console.log(`Clients: ${result.report.clients.totalRows}`);
  console.log(`Contracts: ${result.report.contracts.totalRows}`);
  console.log(`Contracts without client: ${result.report.contracts.withoutMatchingSubject}`);
  console.log(`Possible booking overlaps: ${result.report.bookingConflicts.sameObjectOverlaps.length}`);
}
