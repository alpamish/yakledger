/**
 * Attendance dates are calendar days, not instants. The whole app stores them
 * as UTC midnight (`2026-10-19T00:00:00.000Z`) so that a `@@unique([employeeId,
 * date])` lookup can never miss because of a time-of-day or timezone shift.
 *
 * Always go through these helpers instead of `new Date(dayString)`: the plain
 * constructor treats a bare `YYYY-MM-DD` as UTC, which silently becomes the
 * previous day for users west of UTC and makes server/client "today" disagree
 * for a few hours every day.
 */

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parse `YYYY-MM-DD` into a UTC-midnight Date, or null when invalid. */
export function parseDateOnly(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const match = DATE_ONLY_RE.exec(value.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  // Reject impossible days such as 2026-02-31.
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

export function isValidDateOnly(value: unknown): value is string {
  return parseDateOnly(value) !== null;
}

/** Normalise a Date or day-string to `YYYY-MM-DD` (UTC calendar day). */
export function formatDateOnly(value: Date | string): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (DATE_ONLY_RE.test(trimmed)) return trimmed;
    const parsed = parseDateOnly(trimmed.slice(0, 10));
    if (parsed) return trimmed.slice(0, 10);
    const date = new Date(trimmed);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
  }
  return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
}

/** The business-local calendar day (server timezone). */
export function todayDateOnly(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDateOnlyDays(day: string, days: number): string {
  const date = parseDateOnly(day);
  if (!date) return day;
  date.setUTCDate(date.getUTCDate() + days);
  return formatDateOnly(date);
}

/**
 * Inclusive list of calendar days between two `YYYY-MM-DD` values.
 * Returns `[]` for invalid input or a reversed range (never throws), and caps
 * the result so a typo can't ask the API for 20 years of records.
 */
export function eachDateOnly(from: string, to: string, maxDays = 366): string[] {
  const start = parseDateOnly(from);
  const end = parseDateOnly(to);
  if (!start || !end || end.getTime() < start.getTime()) return [];

  const days: string[] = [];
  const cursor = new Date(start.getTime());
  while (cursor.getTime() <= end.getTime() && days.length < maxDays) {
    days.push(formatDateOnly(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

export function startOfMonthDateOnly(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

export function endOfMonthDateOnly(day: string): string {
  const date = parseDateOnly(startOfMonthDateOnly(day));
  if (!date) return day;
  date.setUTCMonth(date.getUTCMonth() + 1);
  date.setUTCDate(0);
  return formatDateOnly(date);
}

/**
 * Combine a calendar day with an `HH:mm` clock time into an instant.
 * The clock time is interpreted in the server's business timezone.
 */
export function combineDateAndTime(day: string, time: string): Date | null {
  const date = parseDateOnly(day);
  if (!date) return null;
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(time.trim());
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;

  return new Date(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    hours,
    minutes,
    0,
    0
  );
}

/**
 * Accept either a full ISO timestamp (browser supplied) or a bare `HH:mm`
 * clock time for the given day. Returns null when the value cannot be used.
 */
export function toAttendanceInstant(day: string, value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== "string" || value.trim() === "") return null;

  const trimmed = value.trim();
  if (trimmed.includes("T") || trimmed.includes(" ") || trimmed.endsWith("Z")) {
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return combineDateAndTime(day, trimmed);
}

/** `HH:mm` for a stored instant, for form inputs. */
export function toClockTime(value: Date | string | null | undefined): string {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}
