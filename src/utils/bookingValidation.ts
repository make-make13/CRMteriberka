export interface BookingPeriodInput {
  isGBCottage: boolean;
  isCC: boolean;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
}

export type BookingPeriodResult =
  | { ok: true; startDateTime: string; endDateTime: string }
  | { ok: false; error: string };

const INVALID_DATE_ERROR = 'Проверьте дату и время бронирования.';

function parseDateParts(date: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function parseTimeParts(time: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return null;
  return {
    hour: Number(match[1]),
    minute: Number(match[2]),
  };
}

function parseLocalDate(date: string) {
  const parts = parseDateParts(date);
  if (!parts) return null;

  const result = new Date(parts.year, parts.month - 1, parts.day);
  if (
    result.getFullYear() !== parts.year ||
    result.getMonth() !== parts.month - 1 ||
    result.getDate() !== parts.day
  ) {
    return null;
  }

  return result;
}

function parseLocalDateTime(date: string, time: string) {
  const dateParts = parseDateParts(date);
  const timeParts = parseTimeParts(time);
  if (!dateParts || !timeParts) return null;
  if (timeParts.hour > 23 || timeParts.minute > 59) return null;

  const result = new Date(
    dateParts.year,
    dateParts.month - 1,
    dateParts.day,
    timeParts.hour,
    timeParts.minute,
    0,
    0,
  );

  if (
    result.getFullYear() !== dateParts.year ||
    result.getMonth() !== dateParts.month - 1 ||
    result.getDate() !== dateParts.day ||
    result.getHours() !== timeParts.hour ||
    result.getMinutes() !== timeParts.minute
  ) {
    return null;
  }

  return result;
}

export function validateBookingPeriod(input: BookingPeriodInput): BookingPeriodResult {
  if (input.isGBCottage) {
    const startDate = parseLocalDate(input.startDate);
    const endDate = parseLocalDate(input.endDate);
    if (!startDate || !endDate) {
      return { ok: false, error: INVALID_DATE_ERROR };
    }

    const nights = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    if (nights < 1) {
      return { ok: false, error: 'Минимальное время бронирования номера — 1 сутки.' };
    }

    return {
      ok: true,
      startDateTime: `${input.startDate}T14:00:00`,
      endDateTime: `${input.endDate}T12:00:00`,
    };
  }

  const start = parseLocalDateTime(input.startDate, input.startTime);
  const end = parseLocalDateTime(input.endDate, input.endTime);
  if (!start || !end) {
    return { ok: false, error: INVALID_DATE_ERROR };
  }

  const diffHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
  const minHours = input.isCC ? 3 : 1;
  if (diffHours < minHours) {
    return {
      ok: false,
      error: `Минимальное время бронирования - ${minHours} ${minHours === 1 ? 'час' : 'часа'}.`,
    };
  }

  return {
    ok: true,
    startDateTime: `${input.startDate}T${input.startTime}:00`,
    endDateTime: `${input.endDate}T${input.endTime}:00`,
  };
}
