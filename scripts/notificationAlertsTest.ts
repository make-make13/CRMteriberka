import assert from 'node:assert/strict';
import type { Client, Contract } from '../src/types.ts';
import { buildContractAlerts, isAlertSnoozed, isPaymentAlertDismissed } from '../src/utils/notificationAlerts.ts';

const client: Client = {
  id: 'client-1',
  type: 'physical',
  firstName: 'Иван',
  lastName: 'Петров',
  phone: '89110000000',
  email: '',
  passportSeries: '',
  passportNumber: '',
  passportIssuedBy: '',
  passportIssueDate: '',
  registrationAddress: '',
  isBlacklisted: false,
  createdAt: '2026-05-15T00:00:00.000Z',
};

const makeContract = (overrides: Partial<Contract> = {}): Contract => ({
  id: 'contract-1',
  number: 'OLD-1',
  clientId: client.id,
  baseType: 'chunga-changa',
  status: 'partial_paid',
  totalAmount: 10000,
  prepayment: 9000,
  remainder: 1000,
  createdAt: '2026-05-15T00:00:00.000Z',
  dateSigned: '2026-05-15',
  bookings: [{
    id: 'booking-1',
    contractId: 'contract-1',
    objectId: 'cc-1',
    baseType: 'chunga-changa',
    startTime: '2026-05-16T14:00:00',
    endTime: '2026-05-16T18:00:00',
    type: 'main',
    price: 10000,
  }],
  ...overrides,
});

{
  const alerts = buildContractAlerts([makeContract()], [client], new Date('2026-05-15T12:00:00'));
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].type, 'payment');
  assert.equal(alerts[0].title, 'Оплата');
}

{
  const alerts = buildContractAlerts([
    makeContract({ nextReminderAt: '2026-05-16T12:00:00.000Z' }),
  ], [client], new Date('2026-05-15T12:00:00Z'));
  assert.equal(alerts.length, 0);
  assert.equal(isAlertSnoozed(makeContract({ nextReminderAt: '2026-05-16T12:00:00.000Z' }), new Date('2026-05-15T12:00:00Z')), true);
}

{
  const alerts = buildContractAlerts([
    makeContract({ nextReminderAt: '2026-05-15T11:00:00.000Z' }),
  ], [client], new Date('2026-05-15T12:00:00Z'));
  assert.equal(alerts.length, 1);
}

{
  const dismissed = makeContract({
    dismissedPaymentAlertAt: '2026-05-15T12:00:00.000Z',
    dismissedPaymentAlertRemainder: 1000,
  });
  assert.equal(isPaymentAlertDismissed(dismissed), true);
  assert.equal(buildContractAlerts([dismissed], [client], new Date('2026-05-15T12:00:00Z')).length, 0);
  assert.equal(buildContractAlerts([{ ...dismissed, remainder: 500 }], [client], new Date('2026-05-15T12:00:00Z')).length, 1);
}

console.log('notificationAlertsTest: ok');
