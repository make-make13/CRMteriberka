import { describe, it, expect } from 'vitest';
import { toIsoDateFilter, bookingOverlapsDateRange } from '../src/utils/listFilters';

const booking = {
  startTime: new Date(2026, 1, 18, 14, 0).toISOString(), // 18.02.2026
  endTime: new Date(2026, 1, 20, 12, 0).toISOString(),   // 20.02.2026
};

describe('toIsoDateFilter', () => {
  it('конвертирует ДД.ММ.ГГГГ в ISO', () => {
    expect(toIsoDateFilter('18.02.2026')).toBe('2026-02-18');
  });
  it('отвергает 2-значный год', () => {
    expect(toIsoDateFilter('18.02.26')).toBe('');
  });
  it('отвергает несуществующую дату', () => {
    expect(toIsoDateFilter('31.02.2026')).toBe('');
  });
  it('пустая строка → пусто', () => {
    expect(toIsoDateFilter('')).toBe('');
  });
});

describe('bookingOverlapsDateRange', () => {
  it('без дат — показывает всё', () => {
    expect(bookingOverlapsDateRange(booking, '', '')).toBe(true);
  });
  it('бронь внутри периода', () => {
    expect(bookingOverlapsDateRange(booking, '01.02.2026', '28.02.2026')).toBe(true);
  });
  it('период вне брони', () => {
    expect(bookingOverlapsDateRange(booking, '01.03.2026', '10.03.2026')).toBe(false);
  });
  it('только нижняя граница', () => {
    expect(bookingOverlapsDateRange(booking, '18.02.2026', '')).toBe(true);
  });
  // Регрессия: неполная/2-значная дата не должна прятать все договоры
  it('неполная дата не обнуляет выборку', () => {
    expect(bookingOverlapsDateRange(booking, '18.02.26', '20.02.26')).toBe(true);
  });
  it('одна валидная + одна битая — фильтрует по валидной', () => {
    expect(bookingOverlapsDateRange(booking, '18.02.2026', '20.02.26')).toBe(true);
  });
});
