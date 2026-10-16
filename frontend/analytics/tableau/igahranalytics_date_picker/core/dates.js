/* igahranalytics_date_picker — civil date helpers (pure, no Tableau dependency).
 *
 * All user-facing dates are local civil dates (YYYY-MM-DD components). Parsing
 * never goes through Date('YYYY-MM-DD') UTC parsing, so +03:00 (Turkey) and
 * other zones cannot shift a selected day. JavaScript Date objects are created
 * only at the Tableau boundary via explicit local components.
 */

const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

export function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

export function daysInMonth(year, month) {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  if (month === 4 || month === 6 || month === 9 || month === 11) return 30;
  return 31;
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

export function civilToString(civil) {
  return `${String(civil.year).padStart(4, '0')}-${pad2(civil.month)}-${pad2(civil.day)}`;
}

/** ISO day alias kept for readability at call sites. */
export const toIsoDay = civilToString;

export const PRESET_IDS = [
  'this-month',
  'last-month',
  'this-year',
  'last-year',
  'last-30-days',
  'last-12-calendar-months',
  'custom',
];

function compareCivil(a, b) {
  if (a.year !== b.year) return a.year - b.year;
  if (a.month !== b.month) return a.month - b.month;
  return a.day - b.day;
}

/** Parse an exact YYYY-MM-DD civil date; throws on anything else. */
export function parseCivilDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`invalid date: expected YYYY-MM-DD, received ${JSON.stringify(value)}`);
  }
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (year < MIN_YEAR || year > MAX_YEAR) {
    throw new Error(`invalid date: year out of supported range 1900-2100 (${value})`);
  }
  if (month < 1 || month > 12) {
    throw new Error(`invalid date: month out of range (${value})`);
  }
  if (day < 1 || day > daysInMonth(year, month)) {
    throw new Error(`invalid date: impossible calendar day (${value})`);
  }
  return { year, month, day };
}

/** Locale date label without any UTC conversion. */
export function formatCivilDate(civil, locale = 'tr-TR') {
  const day = pad2(civil.day);
  const month = pad2(civil.month);
  const year = String(civil.year).padStart(4, '0');
  if (locale === 'en-US' || locale === 'en') return `${month}/${day}/${year}`;
  return `${day}.${month}.${year}`;
}

/**
 * Build the inclusive Tableau range for a civil start/end pair.
 * DATE fields filter on whole days (local midnight bounds); DATETIME fields
 * extend the final day to 23:59:59.999 local so late-day timestamps are kept.
 */
export function toTableauRange(startInput, endInput, fieldType = 'DATE') {
  const start = typeof startInput === 'string' ? parseCivilDate(startInput) : startInput;
  const end = typeof endInput === 'string' ? parseCivilDate(endInput) : endInput;
  if (compareCivil(start, end) > 0) {
    throw new Error(`invalid date range: start ${civilToString(start)} is after end ${civilToString(end)}`);
  }
  const min = new Date(start.year, start.month - 1, start.day, 0, 0, 0, 0);
  const type = String(fieldType || 'DATE').toUpperCase();
  const max = type === 'DATETIME'
    ? new Date(end.year, end.month - 1, end.day, 23, 59, 59, 999)
    : new Date(end.year, end.month - 1, end.day, 0, 0, 0, 0);
  return { min, max };
}

function addDays(civil, delta) {
  // Noon anchor avoids DST midnight transitions shifting the civil day.
  const probe = new Date(civil.year, civil.month - 1, civil.day, 12, 0, 0, 0);
  probe.setDate(probe.getDate() + delta);
  return { year: probe.getFullYear(), month: probe.getMonth() + 1, day: probe.getDate() };
}

/**
 * Inclusive preset ranges for a civil "today". Last-30-days means the 30-day
 * inclusive window ending today; last-12-calendar-months means the current
 * calendar month plus the previous 11 months, ending today. Custom has no
 * computed range (null).
 */
export function presetRange(name, today) {
  const end = civilToString(today);
  switch (name) {
    case 'this-month':
      return { start: civilToString({ year: today.year, month: today.month, day: 1 }), end };
    case 'last-month': {
      const prev = today.month === 1
        ? { year: today.year - 1, month: 12 }
        : { year: today.year, month: today.month - 1 };
      return {
        start: civilToString({ ...prev, day: 1 }),
        end: civilToString({ ...prev, day: daysInMonth(prev.year, prev.month) }),
      };
    }
    case 'this-year':
      return { start: civilToString({ year: today.year, month: 1, day: 1 }), end };
    case 'last-year':
      return {
        start: civilToString({ year: today.year - 1, month: 1, day: 1 }),
        end: civilToString({ year: today.year - 1, month: 12, day: 31 }),
      };
    case 'last-30-days':
      return { start: civilToString(addDays(today, -29)), end };
    case 'last-12-calendar-months': {
      const anchor = new Date(today.year, today.month - 1, 1, 12, 0, 0, 0);
      anchor.setMonth(anchor.getMonth() - 11);
      return {
        start: civilToString({ year: anchor.getFullYear(), month: anchor.getMonth() + 1, day: 1 }),
        end,
      };
    }
    case 'custom':
      return null;
    default:
      throw new Error(`unknown preset: ${JSON.stringify(name)}`);
  }
}
