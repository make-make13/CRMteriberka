export type HotelCalendarPeriod = '1-10' | '11-20' | '21-end';

export interface VisibleBookingSpan {
  startIndex: number;
  daySpan: number;
}

const startOfLocalDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const addLocalDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

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
  const startIndex = Math.round((visibleStart.getTime() - periodStart.getTime()) / 86400000);
  const daySpan = Math.round((addLocalDays(visibleEnd, 1).getTime() - visibleStart.getTime()) / 86400000);

  return daySpan > 0 ? { startIndex, daySpan } : null;
}
