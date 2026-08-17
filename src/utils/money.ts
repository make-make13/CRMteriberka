export function parseMoneyInput(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
  }

  const normalized = String(value ?? '')
    .replace(/\s/g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '');

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

export function formatMoney(value: unknown, locales: Intl.LocalesArgument = 'ru-RU'): string {
  const amount = parseMoneyInput(value);
  return amount.toLocaleString(locales, {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}
