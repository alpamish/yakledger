// Shared timesheet hour calculation.
// Replaces the three copies previously inlined in
// src/app/api/timesheets/route.ts, [id]/route.ts, and bulk/route.ts.
//
// Behavior contract (unchanged from the original route helpers): hours are
// derived from the morning segment (startTime → lunchStart) and the afternoon
// segment (lunchEnd → endTime). Missing or invalid time strings contribute 0.

const MINUTES_PER_HOUR = 60;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Parse an "HH:mm" string into minutes since midnight; null when missing/invalid. */
export function parseTimeMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const [h, m] = value.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  return h * MINUTES_PER_HOUR + m;
}

/** Hours in one segment (start → end). 0 when either side is invalid or end <= start. */
export function calculateSegmentHours(
  start: string | null | undefined,
  end: string | null | undefined
): number {
  const s = parseTimeMinutes(start);
  const e = parseTimeMinutes(end);
  if (s === null || e === null || e <= s) return 0;
  return round2((e - s) / MINUTES_PER_HOUR);
}

/**
 * Total worked hours for a day: morning (start → lunchStart) plus afternoon
 * (lunchEnd → end). Lunch boundaries are required for hours to be counted.
 */
export function calculateTotalHours(
  startTime: string | null | undefined,
  lunchStart: string | null | undefined,
  lunchEnd: string | null | undefined,
  endTime: string | null | undefined
): number {
  const morning = calculateSegmentHours(startTime, lunchStart);
  const afternoon = calculateSegmentHours(lunchEnd, endTime);
  return round2(morning + afternoon);
}

/**
 * Total hours plus overtime derived against the machinery's configured
 * work-hours-per-day (never a hard-coded 9).
 */
export function calculateHoursWithOvertime(
  startTime: string | null | undefined,
  lunchStart: string | null | undefined,
  lunchEnd: string | null | undefined,
  endTime: string | null | undefined,
  workHoursPerDay: number
): { totalHours: number; overtimeHours: number } {
  const totalHours = calculateTotalHours(startTime, lunchStart, lunchEnd, endTime);
  const effectiveWorkHours = workHoursPerDay > 0 ? workHoursPerDay : 0;
  const overtimeHours = Math.max(0, round2(totalHours - effectiveWorkHours));
  return { totalHours, overtimeHours };
}
