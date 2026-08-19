import { describe, expect, it } from 'vitest';
import { doBookingPeriodsOverlap, doBookingsConflict } from '../src/utils/bookingValidation';
import { CHECKOUT_TAIL_FRACTION, getBookingBarSpan, getVisibleBookingSpan } from '../src/utils/hotelCalendarGrid';
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

describe('checkout day rendering', () => {
  const week = Array.from({ length: 7 }, (_, i) => new Date(2026, 7, 24 + i)); // 24-30 августа

  it('fills nights fully and the checkout day partially', () => {
    // Бронь 25 -> 27: ночи 25 и 26 заняты, 27-е закрашено на 20%.
    const span = getBookingBarSpan(new Date(2026, 7, 25, 14, 0), new Date(2026, 7, 27, 12, 0), week);
    expect(span).toEqual({ startIndex: 1, daySpan: 2, tailFraction: CHECKOUT_TAIL_FRACTION, headFraction: CHECKOUT_TAIL_FRACTION });
  });

  it('keeps the checkout day free for a new check-in', () => {
    // Та же бронь: ячейка 27-го числа не считается занятой.
    expect(getVisibleBookingSpan(
      new Date(2026, 7, 25, 14, 0),
      new Date(2026, 7, 27, 12, 0),
      [new Date(2026, 7, 27)],
    )).toBeNull();
  });

  it('clips nights that started before the visible week', () => {
    // Бронь 22 -> 25: из ночей в окно попала только ночь 24-го, плюс хвост 25-го.
    const span = getBookingBarSpan(new Date(2026, 7, 22, 14, 0), new Date(2026, 7, 25, 12, 0), week);
    expect(span).toEqual({ startIndex: 0, daySpan: 1, tailFraction: CHECKOUT_TAIL_FRACTION, headFraction: 0 });
  });

  it('shows only the tail when every night is before the visible week', () => {
    // Бронь 22 -> 24: все ночи вне окна, видно только хвост дня выезда.
    const span = getBookingBarSpan(new Date(2026, 7, 22, 14, 0), new Date(2026, 7, 24, 12, 0), week);
    expect(span).toEqual({ startIndex: 0, daySpan: 0, tailFraction: CHECKOUT_TAIL_FRACTION, headFraction: 0 });
  });

  it('does not add a tail to a same-day booking', () => {
    const span = getBookingBarSpan(new Date(2026, 7, 25, 14, 0), new Date(2026, 7, 25, 17, 0), week);
    expect(span).toEqual({ startIndex: 1, daySpan: 1, tailFraction: 0, headFraction: CHECKOUT_TAIL_FRACTION });
  });
});

describe('turnover day layout', () => {
  const week = Array.from({ length: 7 }, (_, i) => new Date(2026, 7, 24 + i));
  const barEdges = (start: Date, end: Date) => {
    const s = getBookingBarSpan(start, end, week)!;
    return {
      from: s.startIndex + s.headFraction,
      to: s.startIndex + s.daySpan + s.tailFraction,
    };
  };

  it('lets consecutive stays meet on the turnover day without overlapping', () => {
    const leaving = barEdges(new Date(2026, 7, 25, 14, 0), new Date(2026, 7, 27, 12, 0));
    const arriving = barEdges(new Date(2026, 7, 27, 14, 0), new Date(2026, 7, 28, 12, 0));
    expect(leaving.to).toBeCloseTo(arriving.from, 5);
    expect(leaving.to).toBeLessThanOrEqual(arriving.from);
  });
});
