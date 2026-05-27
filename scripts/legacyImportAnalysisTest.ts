import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { analyzeLegacyImport, parseLegacyCsv } from './legacyImportAnalysis.ts';

const parsed = parseLegacyCsv('ID;Name;Note\n1;"Иван; Петров";"строка ""с кавычками"""\n2;NULL;\n');
assert.deepEqual(parsed.headers, ['ID', 'Name', 'Note']);
assert.deepEqual(parsed.rows, [
  { ID: '1', Name: 'Иван; Петров', Note: 'строка "с кавычками"' },
  { ID: '2', Name: null, Note: '' },
]);

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-import-analysis-'));
try {
  fs.writeFileSync(
    path.join(tmpDir, 'dbo.Subject.csv'),
    [
      'ID;UserID;Stamp;F;I;O;DR;SU;NU;DV;KV;Adres;Email;Phone;Status;Kom',
      '1;1;2020-01-01 10:00:00.000;Петров;Иван;Иванович;1980-01-02 00:00:00.000;4511;4511 123456;2010-01-01 00:00:00.000;ОВД;Адрес;ivan@example.com;89110000000;NULL;VIP',
      '2;1;2020-01-02 10:00:00.000;Сидорова;Анна;;NULL;NULL;NULL;NULL;NULL;Адрес;anna@example.com;89110000000;NULL;дубль телефона',
    ].join('\n'),
    'utf8',
  );
  fs.writeFileSync(
    path.join(tmpDir, 'dbo.Contract.csv'),
    [
      'ID;Status;UserID;DateS;Stamp;IDSubject;IDHostel;DateB;DateE;F_;I_;O_;DR_;SU_;NU_;DV_;KV_;Adres_;Email_;Phone_;Value;Avans;Sauna;Saldo;Chel;Cottage;Kom;CDay;TimeB;TimeE;DatePay;SummPay;TypeDoc;Npom',
      '10;1;1;2020-01-01 00:00:00.000;2020-01-01 10:00:00.000;1;0;2020-02-01 00:00:00.000;2020-02-03 00:00:00.000;Петров;Иван;Иванович;1980-01-02 00:00:00.000;4511;4511 123456;2010-01-01 00:00:00.000;ОВД;Адрес;ivan@example.com;89110000000;10000.00;3000.00;NULL;7000.00;2;1;ok;2;14:00;12:00;NULL;NULL;0;',
      '11;1;1;2020-01-02 00:00:00.000;2020-01-02 10:00:00.000;404;0;2020-02-02 00:00:00.000;2020-02-01 00:00:00.000;Нет;Клиента;;NULL;NULL;NULL;NULL;NULL;Адрес;;89112222222;5000.00;6000.00;NULL;1.00;1;1;bad;0;bad-time;12:00;NULL;NULL;0;',
      '12;1;1;2020-01-03 00:00:00.000;2020-01-03 10:00:00.000;2;0;2020-02-01 00:00:00.000;2020-02-02 00:00:00.000;Сидорова;Анна;;NULL;NULL;NULL;NULL;NULL;Адрес;anna@example.com;89110000000;9000.00;1000.00;NULL;8000.00;1;1;overlap;1;14:00;12:00;NULL;NULL;0;',
      '13;1;1;2020-01-04 00:00:00.000;2020-01-04 10:00:00.000;2;0;2020-03-01 00:00:00.000;2020-03-02 00:00:00.000;Сидорова;Анна;;NULL;NULL;NULL;NULL;NULL;Адрес;anna@example.com;89110000000;9000.00;1000.00;NULL;8000.00;1;2;empty times use defaults;1;;;NULL;NULL;0;',
    ].join('\n'),
    'utf8',
  );

  const report = analyzeLegacyImport(tmpDir);
  assert.equal(report.clients.totalRows, 2);
  assert.equal(report.contracts.totalRows, 4);
  assert.equal(report.contracts.withoutMatchingSubject, 1);
  assert.equal(report.contracts.withDateRange, 3);
  assert.equal(report.dataQuality.duplicatePhones.length, 1);
  assert.equal(report.dataQuality.invalidDateRanges.length, 1);
  assert.equal(report.dataQuality.invalidTimes.length, 1);
  assert.equal(report.dataQuality.financialIssues.prepaymentGreaterThanTotal, 1);
  assert.equal(report.dataQuality.financialIssues.remainderMismatch, 1);
  assert.equal(report.bookingConflicts.sameObjectOverlaps.length, 1);
  assert.equal(report.mappingPreview.client.id, 'legacy-subject-1');
  assert.equal(report.mappingPreview.contract.clientId, 'legacy-subject-1');
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

console.log('legacyImportAnalysisTest: ok');
