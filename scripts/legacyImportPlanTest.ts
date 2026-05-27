import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildLegacyImportPlan } from './legacyImportPlan.ts';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-import-plan-'));

try {
  fs.writeFileSync(
    path.join(tmpDir, 'dbo.Subject.csv'),
    [
      'ID;UserID;Stamp;F;I;O;DR;SU;NU;DV;KV;Adres;Email;Phone;Status;Kom',
      '1;1;2020-01-01 10:00:00.000;Петров;Иван;Иванович;1980-01-02 00:00:00.000;4511;4511 123456;2010-01-01 00:00:00.000;ОВД;Адрес;ivan@example.com;89110000000;NULL;VIP',
      '2;1;2020-01-02 10:00:00.000;Сидорова;Анна;;NULL;NULL;4715 111222;NULL;NULL;Адрес;anna@example.com;89112223344;NULL;',
      '3;1;2020-01-03 10:00:00.000;;;;NULL;NULL;NULL;NULL;NULL;;;8;NULL;',
    ].join('\n'),
    'utf8',
  );

  fs.writeFileSync(
    path.join(tmpDir, 'dbo.Contract.csv'),
    [
      'ID;Status;UserID;DateS;Stamp;IDSubject;IDHostel;DateB;DateE;F_;I_;O_;DR_;SU_;NU_;DV_;KV_;Adres_;Email_;Phone_;Value;Avans;Sauna;Saldo;Chel;Cottage;Kom;CDay;TimeB;TimeE;DatePay;SummPay;TypeDoc;Npom',
      '10;3;1;2020-01-01 00:00:00.000;2020-01-01 10:00:00.000;1;0;2020-02-01 00:00:00.000;2020-02-01 00:00:00.000;Петров;Иван;Иванович;1980-01-02 00:00:00.000;4511;4511 123456;2010-01-01 00:00:00.000;ОВД;Адрес;ivan@example.com;89110000000;10000.00;3000.00;NULL;7000.00;2;1;ok;0;14:00;18:00;NULL;NULL;0;',
      '11;3;1;2020-01-02 00:00:00.000;2020-01-02 10:00:00.000;1;0;2020-02-01 00:00:00.000;2020-02-01 00:00:00.000;Петров;Иван;Иванович;1980-01-02 00:00:00.000;4511;4511 123456;2010-01-01 00:00:00.000;ОВД;Адрес;ivan@example.com;89110000000;9000.00;1000.00;NULL;8000.00;1;2;ok;0;;;NULL;NULL;0;',
      '12;3;1;2020-01-03 00:00:00.000;2020-01-03 10:00:00.000;1;0;2020-02-01 00:00:00.000;2020-02-01 00:00:00.000;Петров;Иван;Иванович;1980-01-02 00:00:00.000;4511;4511 123456;2010-01-01 00:00:00.000;ОВД;Адрес;ivan@example.com;89110000000;9000.00;1000.00;NULL;8000.00;1;2;overlap;0;15:00;17:00;NULL;NULL;0;',
      '13;3;1;2020-01-04 00:00:00.000;2020-01-04 10:00:00.000;2;1;2020-02-02 00:00:00.000;2020-02-03 00:00:00.000;Сидорова;Анна;;NULL;NULL;4715 111222;NULL;NULL;Адрес;anna@example.com;89112223344;8000.00;1000.00;NULL;7000.00;1;3/1;gb ok;1;;;NULL;NULL;0;',
      '14;3;1;2020-01-05 00:00:00.000;2020-01-05 10:00:00.000;2;1;2020-02-04 00:00:00.000;2020-02-05 00:00:00.000;Сидорова;Анна;;NULL;NULL;4715 111222;NULL;NULL;Адрес;anna@example.com;89112223344;8000.00;9000.00;NULL;0.00;1;3/2;bad finance;1;;;NULL;NULL;0;',
      '15;3;1;2020-01-06 00:00:00.000;2020-01-06 10:00:00.000;2;1;2020-02-06 00:00:00.000;2020-02-07 00:00:00.000;Сидорова;Анна;;NULL;NULL;4715 111222;NULL;NULL;Адрес;anna@example.com;89112223344;8000.00;1000.00;NULL;7000.00;1;3/1,3/2;ambiguous;1;;;NULL;NULL;0;',
      '16;3;1;2020-01-07 00:00:00.000;2020-01-07 10:00:00.000;404;0;2020-02-08 00:00:00.000;2020-02-09 00:00:00.000;Нет;Клиента;;NULL;NULL;NULL;NULL;NULL;Адрес;;89115556677;8000.00;1000.00;NULL;7000.00;1;1;missing client;1;;;NULL;NULL;0;',
    ].join('\n'),
    'utf8',
  );

  const plan = buildLegacyImportPlan(tmpDir);
  assert.equal(plan.clients.toImport.length, 2);
  assert.equal(plan.clients.skipped.length, 1);
  assert.equal(plan.contracts.toImport.length, 3);
  assert.deepEqual(plan.contracts.toImport.map((item) => item.contract.id), [
    'legacy-contract-10',
    'legacy-contract-11',
    'legacy-contract-13',
  ]);
  assert.deepEqual(plan.contracts.toImport.map((item) => item.contract.bookings[0].objectId), [
    'cc-1',
    'cc-2',
    'gb-3-1',
  ]);
  assert.equal(plan.contracts.toImport[0].contract.status, 'partial_paid');
  assert.equal(plan.contracts.toImport[1].contract.bookings[0].startTime, '2020-02-01T14:00:00');
  assert.equal(plan.contracts.toImport[1].contract.bookings[0].endTime, '2020-02-01T18:00:00');
  assert.equal(plan.contracts.skipped.filter((item) => item.reason === 'booking_conflict').length, 1);
  assert.equal(plan.contracts.skipped.filter((item) => item.reason === 'invalid_finance').length, 1);
  assert.equal(plan.contracts.skipped.filter((item) => item.reason === 'unknown_object').length, 1);
  assert.equal(plan.contracts.skipped.filter((item) => item.reason === 'missing_client').length, 1);
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

console.log('legacyImportPlanTest: ok');
