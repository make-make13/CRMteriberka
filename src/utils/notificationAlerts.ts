import { addDays, isSameDay, parseISO } from 'date-fns';
import type { Client, Contract } from '../types';

export interface ContractNotificationAlert {
  id: string;
  contractId: string;
  title: string;
  message: string;
  type: 'payment' | 'pre_booking';
  date: string;
  contract: Contract;
}

export function buildContractAlerts(
  contracts: Contract[],
  clients: Client[],
  now = new Date(),
): ContractNotificationAlert[] {
  const clientsById = new Map(clients.map(client => [client.id, client]));
  const alerts: ContractNotificationAlert[] = [];

  for (const contract of contracts) {
    if (contract.status === 'pre_booking') {
      if (contract.nextReminderAt && now >= new Date(contract.nextReminderAt)) {
        alerts.push({
          id: contract.id,
          contractId: contract.id,
          title: 'Предбронь: Истекает время',
          message: `Предбронь №${contract.number} не переведена в статус "Оплачен".`,
          type: 'pre_booking',
          date: now.toISOString(),
          contract,
        });
      }
      continue;
    }

    if (contract.status === 'paid' || contract.remainder <= 0) {
      continue;
    }

    if (isAlertSnoozed(contract, now)) {
      continue;
    }

    if (isPaymentAlertDismissed(contract)) {
      continue;
    }

    const hasUpcomingBooking = contract.bookings.some(booking => {
      const startDate = parseISO(booking.startTime);
      return isSameDay(startDate, now) || isSameDay(startDate, addDays(now, 1));
    });

    if (!hasUpcomingBooking) {
      continue;
    }

    const client = clientsById.get(contract.clientId);
    const clientName = client
      ? (client.type === 'physical' ? `${client.lastName} ${client.firstName}` : client.organizationName)
      : 'Неизвестный клиент';

    alerts.push({
      id: contract.id,
      contractId: contract.id,
      title: 'Оплата',
      message: `Договор №${contract.number} (${clientName}). Остаток: ${contract.remainder.toLocaleString()} ₽. Заезд скоро!`,
      type: 'payment',
      date: now.toISOString(),
      contract,
    });
  }

  return alerts;
}

export function isAlertSnoozed(contract: Pick<Contract, 'nextReminderAt'>, now = new Date()) {
  return Boolean(contract.nextReminderAt && now < new Date(contract.nextReminderAt));
}

export function isPaymentAlertDismissed(
  contract: Pick<Contract, 'dismissedPaymentAlertAt' | 'dismissedPaymentAlertRemainder' | 'remainder'>,
) {
  return Boolean(
    contract.dismissedPaymentAlertAt
    && contract.dismissedPaymentAlertRemainder !== undefined
    && Math.abs(Number(contract.dismissedPaymentAlertRemainder) - Number(contract.remainder)) <= 0.01,
  );
}
