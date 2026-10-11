// Shared, contract-aware rate resolution for the contractor module.
// Single source of truth for the "hours × hourly rate" revenue formula that
// was previously duplicated (and inconsistent) across:
//   - src/app/api/contractors/financial-report/route.ts (hard-coded /9 bug)
//   - src/components/contractor/contractor-profile.tsx (two copies)
//   - src/components/timesheet/timesheet-page.tsx
//
// Resolution never hard-codes 9 work-hours: it uses the rate tier's own
// workHoursPerDay/contractDaysPerMonth when present, else the machinery's.
// Pure functions — safe to use from both server routes and client components.

import { round2 } from "@/lib/money";

export const DEFAULT_WORK_HOURS_PER_DAY = 9;
export const DEFAULT_CONTRACT_DAYS_PER_MONTH = 28;

interface RateSource {
  hourlyRate: number;
  dailyRate: number;
  monthlyRate: number;
  workHoursPerDay?: number | null;
  contractDaysPerMonth?: number | null;
}

export interface MachineryLike extends RateSource {
  id?: string;
}

export interface RateTierLike extends RateSource {
  id?: string;
  machineryId?: string;
  isDefault?: boolean;
}

export interface TimesheetLike {
  machineryId?: string | null;
  machineryRateId?: string | null;
  totalHours?: number;
}

/** Effective hourly rate from one source: hourly > daily/workHours > monthly/(days×workHours). */
function hourlyFromSource(source: RateSource, fallback?: RateSource): number {
  if (source.hourlyRate > 0) return source.hourlyRate;

  const workHours =
    source.workHoursPerDay ??
    fallback?.workHoursPerDay ??
    DEFAULT_WORK_HOURS_PER_DAY;
  if (source.dailyRate > 0 && workHours > 0) return source.dailyRate / workHours;

  const days =
    source.contractDaysPerMonth ??
    fallback?.contractDaysPerMonth ??
    DEFAULT_CONTRACT_DAYS_PER_MONTH;
  if (source.monthlyRate > 0 && workHours > 0 && days > 0) {
    return source.monthlyRate / (days * workHours);
  }

  return 0;
}

/**
 * Resolve the effective hourly rate. The contract/rate tier (when present)
 * always wins over the machinery's own fields; within a source, an explicit
 * hourly rate beats a derived one (daily or monthly divided by configured
 * hours/days — never a hard-coded 9).
 */
export function resolveHourlyRate(input: {
  rateTier?: RateTierLike | null;
  machinery?: MachineryLike | null;
}): number {
  const { rateTier, machinery } = input;
  if (rateTier) {
    const fromTier = hourlyFromSource(rateTier, machinery ?? undefined);
    if (fromTier > 0) return fromTier;
  }
  if (machinery) return hourlyFromSource(machinery);
  return 0;
}

/** Find the rate tier a timesheet should bill at: its linked tier, else the machinery's default tier. */
export function findRateTier<T extends RateTierLike>(
  timesheet: TimesheetLike,
  rates: T[]
): T | null {
  if (timesheet.machineryRateId) {
    const linked = rates.find((r) => r.id === timesheet.machineryRateId);
    if (linked) return linked;
  }
  if (timesheet.machineryId) {
    return (
      rates.find(
        (r) => r.machineryId === timesheet.machineryId && r.isDefault
      ) ?? null
    );
  }
  return null;
}

/**
 * Effective hourly rate for one timesheet: linked rate tier, else the
 * machinery's default rate tier, else the machinery's own rates.
 */
export function resolveTimesheetHourlyRate(
  timesheet: TimesheetLike,
  rates: RateTierLike[],
  machinery: MachineryLike | null | undefined
): number {
  const tier = findRateTier(timesheet, rates);
  return resolveHourlyRate({
    rateTier: tier,
    machinery: machinery ?? undefined,
  });
}

/** Revenue for a timesheet at the given hourly rate, rounded to 2 decimals. */
export function computeTimesheetRevenue(
  totalHours: number | null | undefined,
  hourlyRate: number
): number {
  return round2((totalHours ?? 0) * hourlyRate);
}
