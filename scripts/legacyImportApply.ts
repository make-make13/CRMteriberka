import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Client, Contract } from '../src/types.ts';
import { clientSchema, contractSchema, validate } from '../server/validation.ts';
import {
  buildLegacyImportPlan,
  renderLegacyImportPlanMarkdown,
  type LegacyImportPlan,
  type LegacySkippedRow,
} from './legacyImportPlan.ts';

interface LegacyImportDb {
  createBackup(label: string): Promise<string>;
  saveClient(client: Client): unknown;
  saveContract(contract: Contract): unknown;
}

export interface LegacyImportApplyResult {
  appliedAt: string;
  backupPath: string;
  clientsPlanned: number;
  contractsPlanned: number;
  clientsImported: number;
  contractsImported: number;
  clientsSkippedBeforeApply: number;
  contractsSkippedBeforeApply: number;
  clientsSkippedByDatabase: LegacySkippedRow[];
  contractsSkippedByDatabase: LegacySkippedRow[];
}

const DEFAULT_SOURCE_DIR = path.join(process.cwd(), 'manual-backups', 'import-source', 'sql-export');

export async function applyLegacyImportPlan(plan: LegacyImportPlan, db: LegacyImportDb): Promise<LegacyImportApplyResult> {
  const backupPath = await db.createBackup('legacy-import');
  const clientsSkippedByDatabase: LegacySkippedRow[] = [];
  const contractsSkippedByDatabase: LegacySkippedRow[] = [];
  let clientsImported = 0;
  let contractsImported = 0;

  for (const client of plan.clients.toImport) {
    try {
      db.saveClient(validate(clientSchema, client) as Client);
      clientsImported += 1;
    } catch (error) {
      clientsSkippedByDatabase.push({
        legacyId: client.id.replace(/^legacy-subject-/, ''),
        reason: 'invalid_client',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  for (const item of plan.contracts.toImport) {
    try {
      db.saveContract(validate(contractSchema, item.contract) as Contract);
      contractsImported += 1;
    } catch (error) {
      contractsSkippedByDatabase.push({
        legacyId: item.legacyId,
        reason: 'booking_conflict',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    appliedAt: new Date().toISOString(),
    backupPath,
    clientsPlanned: plan.clients.toImport.length,
    contractsPlanned: plan.contracts.toImport.length,
    clientsImported,
    contractsImported,
    clientsSkippedBeforeApply: plan.clients.skipped.length,
    contractsSkippedBeforeApply: plan.contracts.skipped.length,
    clientsSkippedByDatabase,
    contractsSkippedByDatabase,
  };
}

export function writeLegacyImportApplyResult(result: LegacyImportApplyResult, outDir: string): {
  jsonPath: string;
  markdownPath: string;
} {
  fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, 'legacy-import-apply-result.json');
  const markdownPath = path.join(outDir, 'legacy-import-apply-result.md');
  fs.writeFileSync(jsonPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  fs.writeFileSync(markdownPath, renderApplyMarkdown(result), 'utf8');
  return { jsonPath, markdownPath };
}

function renderApplyMarkdown(result: LegacyImportApplyResult): string {
  return [
    '# Результат импорта старой базы',
    '',
    `Время: ${result.appliedAt}`,
    `Backup перед импортом: \`${result.backupPath}\``,
    '',
    '## Импортировано',
    '',
    `- Клиенты: ${result.clientsImported} из ${result.clientsPlanned}`,
    `- Договоры: ${result.contractsImported} из ${result.contractsPlanned}`,
    '',
    '## Пропущено',
    '',
    `- Клиенты до записи: ${result.clientsSkippedBeforeApply}`,
    `- Договоры до записи: ${result.contractsSkippedBeforeApply}`,
    `- Клиенты при записи в БД: ${result.clientsSkippedByDatabase.length}`,
    `- Договоры при записи в БД: ${result.contractsSkippedByDatabase.length}`,
    '',
    '## Первые пропуски при записи',
    '',
    ...(result.contractsSkippedByDatabase.length
      ? result.contractsSkippedByDatabase.slice(0, 50).map((item) => `- ${item.legacyId}: ${item.message}`)
      : ['Пропусков при записи нет.']),
    '',
  ].join('\n');
}

function parseArgs(argv: string[]) {
  let sourceDir = DEFAULT_SOURCE_DIR;
  let outDir = DEFAULT_SOURCE_DIR;
  let apply = false;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--source' && argv[index + 1]) {
      sourceDir = path.resolve(argv[index + 1]);
      index += 1;
    } else if (argv[index] === '--out' && argv[index + 1]) {
      outDir = path.resolve(argv[index + 1]);
      index += 1;
    } else if (argv[index] === '--apply') {
      apply = true;
    }
  }
  return { sourceDir, outDir, apply };
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  const { sourceDir, outDir, apply } = parseArgs(process.argv.slice(2));
  const plan = buildLegacyImportPlan(sourceDir);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'legacy-import-plan.json'), `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(outDir, 'legacy-import-plan.md'), renderLegacyImportPlanMarkdown(plan), 'utf8');

  if (!apply) {
    console.log('Dry run only. Add --apply to write valid rows into CRM.');
    console.log(`Clients to import: ${plan.clients.toImport.length}`);
    console.log(`Contracts to import: ${plan.contracts.toImport.length}`);
    console.log(`Clients skipped: ${plan.clients.skipped.length}`);
    console.log(`Contracts skipped: ${plan.contracts.skipped.length}`);
  } else {
    const { localDb } = await import('../server/localDatabase.ts');
    const result = await applyLegacyImportPlan(plan, localDb);
    const paths = writeLegacyImportApplyResult(result, outDir);
    console.log(`Import applied:\n${paths.jsonPath}\n${paths.markdownPath}`);
    console.log(`Backup: ${result.backupPath}`);
    console.log(`Clients imported: ${result.clientsImported}`);
    console.log(`Contracts imported: ${result.contractsImported}`);
    console.log(`Contracts skipped by DB: ${result.contractsSkippedByDatabase.length}`);
  }
}
