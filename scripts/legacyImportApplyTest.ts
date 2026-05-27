import assert from 'node:assert/strict';
import type { Client, Contract } from '../src/types.ts';
import { applyLegacyImportPlan } from './legacyImportApply.ts';
import type { LegacyImportPlan } from './legacyImportPlan.ts';

const client: Client = {
  id: 'legacy-subject-1',
  type: 'physical',
  firstName: 'Иван',
  lastName: 'Петров',
  phone: '89110000000',
  email: '',
  passportSeries: '4511',
  passportNumber: '123456',
  passportIssuedBy: '',
  passportIssueDate: '',
  registrationAddress: '',
  isBlacklisted: false,
  createdAt: '2020-01-01T00:00:00',
};

const makeContract = (id: string): Contract => ({
  id,
  number: id,
  clientId: client.id,
  baseType: 'chunga-changa',
  status: 'partial_paid',
  totalAmount: 10000,
  prepayment: 3000,
  remainder: 7000,
  createdAt: '2020-01-01T00:00:00',
  dateSigned: '2020-01-01',
  bookings: [{
    id: `${id}-booking`,
    contractId: id,
    objectId: 'cc-1',
    baseType: 'chunga-changa',
    startTime: '2020-02-01T14:00:00',
    endTime: '2020-02-01T18:00:00',
    type: 'main',
    price: 10000,
  }],
});

const plan: LegacyImportPlan = {
  sourceDir: 'fixture',
  generatedAt: '2026-05-15T00:00:00.000Z',
  clients: {
    toImport: [client],
    skipped: [],
  },
  contracts: {
    toImport: [
      { legacyId: '10', contract: makeContract('legacy-contract-10') },
      { legacyId: '11', contract: makeContract('legacy-contract-11') },
    ],
    skipped: [],
  },
};

const savedClients: string[] = [];
const savedContracts: string[] = [];
const result = await applyLegacyImportPlan(plan, {
  createBackup: async (label: string) => `backup-${label}.sqlite`,
  saveClient: (item: Client) => {
    savedClients.push(item.id);
    return item;
  },
  saveContract: (item: Contract) => {
    if (item.id === 'legacy-contract-11') {
      throw new Error('conflict');
    }
    savedContracts.push(item.id);
    return item;
  },
});

assert.equal(result.backupPath, 'backup-legacy-import.sqlite');
assert.equal(result.clientsImported, 1);
assert.equal(result.contractsImported, 1);
assert.equal(result.contractsSkippedByDatabase.length, 1);
assert.deepEqual(savedClients, ['legacy-subject-1']);
assert.deepEqual(savedContracts, ['legacy-contract-10']);

console.log('legacyImportApplyTest: ok');
