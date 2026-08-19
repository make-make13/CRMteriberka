export type HotelCalendarPeriod = '1-10' | '11-20' | '21-end';

export interface VisibleBookingSpan {
  startIndex: number;
  daySpan: number;
}

/**
 * Какая часть дня выезда закрашивается в шахматке.
 * Гость уезжает утром, поэтому день выезда показывается частично: видно, что
 * номер утром ещё занят, но ячейка остаётся свободной для следующего заезда.
 */
export const CHECKOUT_TAIL_FRACTION = 0.2;

export interface BookingBarSpan extends VisibleBookingSpan {
  /** Доля дня выезда (0 или CHECKOUT_TAIL_FRACTION). */
  tailFraction: number;
  /** Отступ от начала дня заезда: гость заселяется днём, а не с утра. */
  headFraction: number;
}

const startOfLocalDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const addLocalDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const daysBetween = (from: Date, to: Date) => Math.round((to.getTime() - from.getTime()) / 86400000);

export function getHotelCalendarPeriodDays(monthDate: Date, period: HotelCalendarPeriod): Date[] {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();

  const [startDay, endDay] =
    period === '1-10' ? [1, 10] :
    period === '11-20' ? [11, 20] :
    [21, lastDay];

  const safeEndDay = Math.min(endDay, lastDay);
  return Array.from(
    { length: Math.max(0, safeEndDay - startDay + 1) },
    (_, index) => new Date(year, month, startDay + index),
  );
}

/**
 * Занятые бронью дни — только ночи проживания, без дня выезда.
 * Используется для того, чтобы решить, свободна ли ячейка для нового заезда.
 */
export function getVisibleBookingSpan(startTime: Date, endTime: Date, visibleDays: Date[]): VisibleBookingSpan | null {
  if (visibleDays.length === 0) return null;

  const periodStart = startOfLocalDay(visibleDays[0]);
  const periodEnd = startOfLocalDay(visibleDays[visibleDays.length - 1]);
  const bookingStart = startOfLocalDay(startTime);
  const rawBookingEnd = startOfLocalDay(endTime);
  const bookingEnd = rawBookingEnd > bookingStart ? addLocalDays(rawBookingEnd, -1) : bookingStart;

  if (bookingEnd < periodStart || bookingStart > periodEnd) return null;

  const visibleStart = bookingStart < periodStart ? periodStart : bookingStart;
  const visibleEnd = bookingEnd > periodEnd ? periodEnd : bookingEnd;
  const startIndex = daysBetween(periodStart, visibleStart);
  const daySpan = daysBetween(visibleStart, addLocalDays(visibleEnd, 1));

  return daySpan > 0 ? { startIndex, daySpan } : null;
}

/**
 * Ширина полосы брони в шахматке: занятые ночи закрашиваются полностью,
 * а день выезда — частично (CHECKOUT_TAIL_FRACTION).
 *
 * Отличается от getVisibleBookingSpan намеренно: это только отображение.
 * Занятость ячейки и проверка конфликтов по-прежнему считаются по ночам,
 * поэтому в день выезда можно заселить следующего гостя.
 */
export function getBookingBarSpan(startTime: Date, endTime: Date, visibleDays: Date[]): BookingBarSpan | null {
  if (visibleDays.length === 0) return null;

  const periodStart = startOfLocalDay(visibleDays[0]);
  const periodEnd = startOfLocalDay(visibleDays[visibleDays.length - 1]);
  const bookingStart = startOfLocalDay(startTime);
  const checkoutDay = startOfLocalDay(endTime);
  const hasCheckoutDay = checkoutDay > bookingStart;
  const lastNight = hasCheckoutDay ? addLocalDays(checkoutDay, -1) : bookingStart;
  const barEnd = hasCheckoutDay ? checkoutDay : bookingStart;

  if (barEnd < periodStart || bookingStart > periodEnd) return null;

  const visibleStart = bookingStart < periodStart ? periodStart : bookingStart;
  const startIndex = daysBetween(periodStart, visibleStart);

  const visibleLastNight = lastNight > periodEnd ? periodEnd : lastNight;
  const daySpan = visibleLastNight >= visibleStart
    ? daysBetween(visibleStart, addLocalDays(visibleLastNight, 1))
    : 0;

  const checkoutDayVisible = hasCheckoutDay && checkoutDay >= periodStart && checkoutDay <= periodEnd;
  const tailFraction = checkoutDayVisible ? CHECKOUT_TAIL_FRACTION : 0;

  // Начало полосы сдвигается на ту же долю: в день заезда номер занят не с утра.
  // Благодаря этому полосы соседних броней стыкуются в день пересменки и не
  // наезжают друг на друга: до сдвига — уезжающий гость, после — заезжающий.
  const headFraction = bookingStart >= periodStart ? CHECKOUT_TAIL_FRACTION : 0;

  const width = daySpan + tailFraction - headFraction;
  return width > 0 ? { startIndex, daySpan, tailFraction, headFraction } : null;
}
