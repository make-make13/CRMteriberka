import assert from 'node:assert/strict';
import { getHotelCalendarPeriodDays, getVisibleBookingSpan } from '../src/utils/hotelCalendarGrid';

const may2026 = new Date(2026, 4, 15);

const firstPeriod = getHotelCalendarPeriodDays(may2026, '1-10');
assert.equal(firstPeriod.length, 10);
assert.equal(firstPeriod[0].getDate(), 1);
assert.equal(firstPeriod[9].getDate(), 10);

const secondPeriod = getHotelCalendarPeriodDays(may2026, '11-20');
assert.equal(secondPeriod.length, 10);
assert.equal(secondPeriod[0].getDate(), 11);
assert.equal(secondPeriod[9].getDate(), 20);

const thirdPeriod = getHotelCalendarPeriodDays(may2026, '21-end');
assert.equal(thirdPeriod.length, 11);
assert.equal(thirdPeriod[0].getDate(), 21);
assert.equal(thirdPeriod[10].getDate(), 31);

const clippedToFirst = getVisibleBookingSpan(
  new Date(2026, 4, 8, 14),
  new Date(2026, 4, 14, 12),
  firstPeriod,
);
assert.deepEqual(clippedToFirst, { startIndex: 7, daySpan: 3 });

const clippedToSecond = getVisibleBookingSpan(
  new Date(2026, 4, 8, 14),
  new Date(2026, 4, 14, 12),
  secondPeriod,
);
assert.deepEqual(clippedToSecond, { startIndex: 0, daySpan: 4 });

const outsidePeriod = getVisibleBookingSpan(
  new Date(2026, 5, 1, 14),
  new Date(2026, 5, 2, 12),
  firstPeriod,
);
assert.equal(outsidePeriod, null);

console.log('hotel calendar grid tests passed');
