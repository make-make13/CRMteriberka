import type { Client, Contract } from '../types';
import { phoneMatchesSearch } from './phoneSearch';

function normalizeText(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

function digitsOnly(value: unknown) {
  return String(value ?? '').replace(/\D/g, '');
}

function hasQuery(values: unknown[], query: string) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return true;

  const queryDigits = digitsOnly(query);
  return values.some(value => {
    const text = normalizeText(value);
    if (text.includes(normalizedQuery)) return true;

    const valueDigits = digitsOnly(value);
    return Boolean(queryDigits && (valueDigits.includes(queryDigits) || phoneMatchesSearch(value, query)));
  });
}

export function getClientSearchValues(client: Client) {
  if (client.type === 'physical') {
    return [
      client.lastName,
      client.firstName,
      client.middleName,
      `${client.lastName} ${client.firstName} ${client.middleName || ''}`,
      client.phone,
      client.email,
      client.passportSeries,
      client.passportNumber,
      `${client.passportSeries}${client.passportNumber}`,
      `${client.passportSeries} ${client.passportNumber}`,
      client.passportIssuedBy,
      client.registrationAddress,
      client.additionalInfo,
    ];
  }

  return [
    client.organizationName,
    client.contactPerson,
    client.phone,
    client.email,
    client.inn,
    client.kpp,
    client.ogrn,
    client.legalAddress,
    client.bankName,
    client.bankAccount,
    client.corrAccount,
    client.bik,
    client.additionalInfo,
  ];
}

export function clientMatchesSearch(client: Client, query: string) {
  return hasQuery(getClientSearchValues(client), query);
}

export function contractMatchesSearch(contract: Contract, client: Client | undefined, query: string) {
  return hasQuery([
    contract.number,
    contract.comment,
    ...(client ? getClientSearchValues(client) : []),
  ], query);
}

export function toIsoDateFilter(displayDate: string) {
  if (!displayDate) return '';
  if (!/^\d{2}\.\d{2}\.\d{4}$/.test(displayDate)) return '';

  const [dayRaw, monthRaw, yearRaw] = displayDate.split('.');
  const day = Number(dayRaw);
  const month = Number(monthRaw);
  const year = Number(yearRaw);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return '';
  }

  return `${yearRaw}-${monthRaw}-${dayRaw}`;
}

export function bookingOverlapsDateRange(
  booking: Pick<Contract['bookings'][number], 'startTime' | 'endTime'>,
  dateFrom: string,
  dateTo: string,
) {
  if (!dateFrom && !dateTo) return true;

  const from = toIsoDateFilter(dateFrom);
  const to = toIsoDateFilter(dateTo);
  // Неполная/некорректная дата (например, 2-значный год во время ввода) не должна
  // прятать все договоры — просто не сужаем выборку по непарсящейся границе.
  if (!from && !to) return true;

  const start = booking.startTime.split('T')[0];
  const end = booking.endTime.split('T')[0];
  return start <= (to || '9999-99-99') && end >= (from || '0000-00-00');
}
