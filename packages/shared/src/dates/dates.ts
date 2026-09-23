// BS dates and Nepal Time (ADR-008). The only module allowed to import nepali-date-converter.
//
// We take just the library's month-length table and do the arithmetic here in UTC ms. Its
// AD→BS conversion reads the host's *local* time, which differs between the phone (NPT) and
// Convex (UTC), so we never call it.

import { dateConfigMap } from "nepali-date-converter";

/** A BS date string, `"YYYY-MM-DD"` zero-padded (e.g. `"2083-06-07"`). */
export type DateBs = string;
/** A BS month string, `"YYYY-MM"` (e.g. `"2083-06"`). */
export type MonthBs = string;
export type DateLocale = "ne" | "en";
export type BsParts = { year: number; month: number; day: number }; // month is 1–12

const DAY_MS = 86_400_000;
/** Nepal Time is UTC+05:45 all year (no DST). */
export const NPT_OFFSET_MS = (5 * 60 + 45) * 60 * 1000;

export const BS_MIN_YEAR = 2000;
export const BS_MAX_YEAR = 2090;

// BS 2000-01-01 is AD 1943-04-14 (checked against the library in tests).
const EPOCH_UNIX_DAY = Date.UTC(1943, 3, 14) / DAY_MS;
// 1970-01-01 (Unix day 0) was a Thursday.
const UNIX_DAY0_WEEKDAY = 4;

const LIBRARY_MONTH_KEYS = [
  "Baisakh",
  "Jestha",
  "Asar",
  "Shrawan",
  "Bhadra",
  "Aswin",
  "Kartik",
  "Mangsir",
  "Poush",
  "Magh",
  "Falgun",
  "Chaitra",
] as const;

// monthStart[(year - BS_MIN_YEAR) * 12 + (month - 1)] = day index (0 = BS 2000-01-01) of the
// month's first day. The final entry is one past the last supported day.
const monthStart: number[] = [0];
for (let year = BS_MIN_YEAR; year <= BS_MAX_YEAR; year++) {
  const lengths = dateConfigMap[String(year)];
  /* v8 ignore next */
  if (!lengths) throw new Error(`nepali-date-converter has no month table for BS ${year}`);
  for (const key of LIBRARY_MONTH_KEYS) {
    monthStart.push(read(monthStart, monthStart.length - 1) + lengths[key]);
  }
}
const TOTAL_DAYS = read(monthStart, monthStart.length - 1);

// Everyday names, as Buwa says them (ui-ux §8 uses "असोज" / "Asoj"). // i18n-review
const MONTH_NAMES: Record<DateLocale, readonly string[]> = {
  ne: ["बैशाख", "जेठ", "असार", "साउन", "भदौ", "असोज", "कात्तिक", "मंसिर", "पुस", "माघ", "फागुन", "चैत"],
  en: [
    "Baisakh",
    "Jeth",
    "Asar",
    "Saun",
    "Bhadau",
    "Asoj",
    "Kartik",
    "Mangsir",
    "Push",
    "Magh",
    "Fagun",
    "Chait",
  ],
};
const WEEKDAY_NAMES: Record<DateLocale, readonly string[]> = {
  ne: ["आइतबार", "सोमबार", "मङ्गलबार", "बुधबार", "बिहीबार", "शुक्रबार", "शनिबार"],
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
};
const DEVANAGARI_DIGITS = [..."०१२३४५६७८९"];

const DATE_BS_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Reads an index that the callers have already range-checked (keeps noUncheckedIndexedAccess honest). */
function read<T>(values: readonly T[], index: number): T {
  const value = values[index];
  /* v8 ignore next */
  if (value === undefined) throw new RangeError(`Internal date table index ${index} out of range`);
  return value;
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

function monthSlot(year: number, month: number): number {
  return (year - BS_MIN_YEAR) * 12 + (month - 1);
}

/** Days in a BS month (month 1–12). Throws outside BS 2000–2090. */
export function daysInMonthBs(year: number, month: number): number {
  if (!Number.isInteger(year) || year < BS_MIN_YEAR || year > BS_MAX_YEAR) {
    throw new RangeError(`BS year ${year} is outside the supported ${BS_MIN_YEAR}–${BS_MAX_YEAR}`);
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError(`BS month ${month} must be 1–12`);
  }
  const slot = monthSlot(year, month);
  return read(monthStart, slot + 1) - read(monthStart, slot);
}

/** Parses `"YYYY-MM-DD"` into parts; throws `RangeError` if it isn't a real BS date in range. */
export function parseBs(dateBs: DateBs): BsParts {
  const match = DATE_BS_PATTERN.exec(dateBs);
  if (!match) throw new RangeError(`"${dateBs}" is not a YYYY-MM-DD BS date`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (day < 1 || day > daysInMonthBs(year, month)) {
    throw new RangeError(`"${dateBs}" has no day ${day}`);
  }
  return { year, month, day };
}

/** True when `value` is a zero-padded, real BS date within 2000–2090 (architecture §5.3 invariant 6). */
export function isValidBs(value: string): boolean {
  try {
    parseBs(value);
    return true;
  } catch {
    return false;
  }
}

function toDayIndex(dateBs: DateBs): number {
  const { year, month, day } = parseBs(dateBs);
  return read(monthStart, monthSlot(year, month)) + day - 1;
}

function fromDayIndex(index: number): DateBs {
  if (!Number.isInteger(index) || index < 0 || index >= TOTAL_DAYS) {
    throw new RangeError(`Date is outside BS ${BS_MIN_YEAR}–${BS_MAX_YEAR}`);
  }
  // Binary search for the last month that starts on or before `index`.
  let lo = 0;
  let hi = monthStart.length - 2;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (read(monthStart, mid) <= index) lo = mid;
    else hi = mid - 1;
  }
  const year = BS_MIN_YEAR + Math.floor(lo / 12);
  const month = (lo % 12) + 1;
  const day = index - read(monthStart, lo) + 1;
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

/** The BS date in Nepal at the instant `ms` (UTC epoch ms). */
export function adMsToBs(ms: number): DateBs {
  const nptUnixDay = Math.floor((ms + NPT_OFFSET_MS) / DAY_MS);
  return fromDayIndex(nptUnixDay - EPOCH_UNIX_DAY);
}

/**
 * Today's BS date in Nepal. `now` is required so callers pass their clock explicitly;
 * Convex queries must not call this (architecture §7.2: the client passes `dateBs`).
 */
export function todayBs(now: number): DateBs {
  return adMsToBs(now);
}

/** UTC epoch ms of 00:00 NPT on `dateBs`; stored as `transactions.dateAd`. */
export function bsToAdMs(dateBs: DateBs): number {
  return (EPOCH_UNIX_DAY + toDayIndex(dateBs)) * DAY_MS - NPT_OFFSET_MS;
}

/** Adds (or with a negative `days`, subtracts) whole days. */
export function addDaysBs(dateBs: DateBs, days: number): DateBs {
  if (!Number.isInteger(days)) throw new RangeError(`days must be an integer, got ${days}`);
  return fromDayIndex(toDayIndex(dateBs) + days);
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function diffDaysBs(from: DateBs, to: DateBs): number {
  return toDayIndex(to) - toDayIndex(from);
}

/** Weekday of a BS date, 0 = Sunday (आइतबार) … 6 = Saturday (शनिबार). */
export function weekdayOf(dateBs: DateBs): number {
  const unixDay = EPOCH_UNIX_DAY + toDayIndex(dateBs);
  return (((unixDay + UNIX_DAY0_WEEKDAY) % 7) + 7) % 7;
}

/** `"2083-06-07"` → `"2083-06"`. */
export function monthOf(dateBs: DateBs): MonthBs {
  parseBs(dateBs);
  return dateBs.slice(0, 7);
}

/** Fiscal year label: Shrawan (month 4) starts a new year. `"2083-06-07"` → `"2083/84"`. */
export function fiscalYearOf(dateBs: DateBs): string {
  const { year, month } = parseBs(dateBs);
  const startYear = month >= 4 ? year : year - 1;
  return `${startYear}/${pad((startYear + 1) % 100, 2)}`;
}

/** Replaces Latin digits with Devanagari ones (dates only; amounts stay Latin per F-10). */
export function toDevanagariDigits(text: string): string {
  return text.replace(/[0-9]/g, (digit) => read(DEVANAGARI_DIGITS, Number(digit)));
}

export type BsFormatStyle = "long" | "dayMonth" | "weekdayDayMonth";

/**
 * F-10: `"७ असोज २०८३"` / `"7 Asoj 2083"` (long), `"७ असोज"` (dayMonth, list headers),
 * `"बुधबार, ७ असोज"` (weekdayDayMonth, the Today header). Devanagari digits in Nepali only.
 */
export function formatBs(
  dateBs: DateBs,
  locale: DateLocale,
  style: BsFormatStyle = "long",
): string {
  const { year, month, day } = parseBs(dateBs);
  const monthName = read(MONTH_NAMES[locale], month - 1);
  let text: string;
  switch (style) {
    case "long":
      text = `${day} ${monthName} ${year}`;
      break;
    case "dayMonth":
      text = `${day} ${monthName}`;
      break;
    case "weekdayDayMonth":
      text = `${read(WEEKDAY_NAMES[locale], weekdayOf(dateBs))}, ${day} ${monthName}`;
      break;
  }
  return locale === "ne" ? toDevanagariDigits(text) : text;
}

/** The first and last supported BS dates, for pickers and the range alarm test. */
export const BS_FIRST_DATE: DateBs = fromDayIndex(0);
export const BS_LAST_DATE: DateBs = fromDayIndex(TOTAL_DAYS - 1);
