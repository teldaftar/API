/**
 * Asia/Tashkent is a fixed UTC+5 offset year-round (no DST), which lets us do
 * exact boundary math without a tz library. If the app ever supports a DST
 * zone, swap this for luxon/date-fns-tz.
 */
export const TASHKENT_UTC_OFFSET_HOURS = 5;
const OFFSET_MS = TASHKENT_UTC_OFFSET_HOURS * 60 * 60 * 1000;

/** Current instant. Isolated here so tests can reason about "today". */
export function now(): Date {
  return new Date();
}

/** Today's calendar date in Tashkent, as `YYYY-MM-DD`. */
export function todayLocalDateString(reference: Date = now()): string {
  const shifted = new Date(reference.getTime() + OFFSET_MS);
  return shifted.toISOString().slice(0, 10);
}

/** Parse a `YYYY-MM-DD` string into its year/month/day parts. */
function parseLocalDate(dateStr: string): {
  year: number;
  month: number;
  day: number;
} {
  const [year, month, day] = dateStr.split('-').map((p) => parseInt(p, 10));
  return { year, month, day };
}

/**
 * Inclusive start-of-day boundary in UTC for a Tashkent calendar date.
 * `2026-08-01` -> `2026-07-31T19:00:00.000Z`.
 */
export function localDateStartUtc(dateStr: string): Date {
  const { year, month, day } = parseLocalDate(dateStr);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0) - OFFSET_MS);
}

/**
 * Exclusive end boundary in UTC: the start of the day *after* the given
 * Tashkent date. Use as `column < endUtc` to make the range inclusive of `to`.
 */
export function localDateEndExclusiveUtc(dateStr: string): Date {
  const { year, month, day } = parseLocalDate(dateStr);
  return new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0, 0) - OFFSET_MS);
}

/** Enumerate every calendar date from `from` to `to` inclusive (Tashkent). */
export function enumerateLocalDates(from: string, to: string): string[] {
  const dates: string[] = [];
  const start = parseLocalDate(from);
  const cursor = new Date(Date.UTC(start.year, start.month - 1, start.day));
  const endMs = Date.UTC(
    parseLocalDate(to).year,
    parseLocalDate(to).month - 1,
    parseLocalDate(to).day,
  );
  while (cursor.getTime() <= endMs) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

/** First day of the current month in Tashkent, as `YYYY-MM-DD`. */
export function firstDayOfCurrentMonth(reference: Date = now()): string {
  const today = todayLocalDateString(reference);
  return today.slice(0, 8) + '01';
}
