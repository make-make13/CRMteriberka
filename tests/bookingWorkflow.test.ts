import { describe, expect, it } from 'vitest';
import { doBookingPeriodsOverlap, doBookingsConflict } from '../src/utils/bookingValidation';
import { getVisibleBookingSpan } from '../src/utils/hotelCalendarGrid';
import { parseMoneyInput, formatMoney } from '../src/utils/money';

describe('booking turnover rules', () => {
  it('allows a new check-in after same-day checkout', () => {
    expect(doBookingPeriodsOverlap(
      '2026-08-18T14:00:00',
      '2026-08-20T12:00:00',
      '2026-08-16T14:00:00',
      '2026-08-18T12:00:00',
    )).toBe(false);
  });

  it('still detects real same-day overlap before checkout', () => {
    expect(doBookingPeriodsOverlap(
      '2026-08-18T11:00:00',
      '2026-08-20T12:00:00',
      '2026-08-16T14:00:00',
      '2026-08-18T12:00:00',
    )).toBe(true);
  });

  it('allows check-in on checkout day of a stay saved with a non-standard checkout time', () => {
    // Брони, созданные CRM до 0.1.4, лежат в БД с выездом 17:00.
    // Заезд в 14:00 в день выезда всё равно должен быть доступен.
    expect(doBookingsConflict(
      '2026-08-12T14:00:00',
      '2026-08-13T12:00:00',
      '2026-08-10T14:00:00',
      '2026-08-12T17:00:00',
    )).toBe(false);
  });

  it('still blocks a stay that overlaps real nights', () => {
    expect(doBookingsConflict(
      '2026-08-11T14:00:00',
      '2026-08-13T12:00:00',
      '2026-08-10T14:00:00',
      '2026-08-12T17:00:00',
    )).toBe(true);
  });

  it('keeps hourly bookings protected by exact time', () => {
    // Почасовая бронь внутри одного дня сравнивается по времени, а не по ночам.
    expect(doBookingsConflict(
      '2026-08-12T13:00:00',
      '2026-08-12T16:00:00',
      '2026-08-12T15:00:00',
      '2026-08-12T18:00:00',
    )).toBe(true);

    expect(doBookingsConflict(
      '2026-08-12T13:00:00',
      '2026-08-12T16:00:00',
      '2026-08-12T16:00:00',
      '2026-08-12T19:00:00',
    )).toBe(false);
  });

  it('does not render multi-day booking as occupying checkout day', () => {
    const checkoutDay = [new Date(2026, 7, 18)];
    expect(getVisibleBookingSpan(
      new Date(2026, 7, 16, 14, 0),
      new Date(2026, 7, 18, 12, 0),
      checkoutDay,
    )).toBeNull();
  });
});

describe('money input', () => {
  it('parses rubles and kopecks from Russian-style input', () => {
    expect(parseMoneyInput('8 542,37 ₽')).toBe(8542.37);
  });

  it('formats kopecks without dropping fractional part', () => {
    expect(formatMoney(8542.37).replace(/\s/g, ' ')).toBe('8 542,37');
  });
});
