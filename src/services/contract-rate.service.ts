// Effective-dated contract rate resolution.
//
// The single source of truth for "what rate applies to this work on this
// date". Contract rates are effective-dated: a rate change adds a NEW row with
// a later effectiveFrom (or closes the old row with effectiveTo) — it never
// mutates history. Approved work snapshots its resolved rate onto the
// Timesheet (contractId/contractRateId/rateLabel/rateAmount), so later rate
// changes can never rewrite what work was billed at.
import { db } from "@/lib/db";
import { resolveHourlyRate, type RateTierLike, type MachineryLike } from "@/lib/contractor-rate";

type DbClient = typeof db | import("@prisma/client").Prisma.TransactionClient;

/** A contract rate row projected into the shared resolver's shape. */
export interface ContractRateLike extends RateTierLike {
  id: string;
  contractId: string;
  label: string;
  rateType: string;
  amount: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  isDefault: boolean;
  approvedAt: Date | null;
}

export interface ResolvedRate {
  source: "CONTRACT_RATE" | "MACHINERY_RATE" | "NONE";
  label: string | null;
  /** The effective hourly rate in AFN. */
  hourlyRate: number;
  /** The raw amount and unit of the winning rate (for snapshots/receipts). */
  amount: number;
  rateType: string | null;
  unitLabel: string | null;
  contractRateId: string | null;
}

const NONE: ResolvedRate = {
  source: "NONE",
  label: null,
  hourlyRate: 0,
  amount: 0,
  rateType: null,
  unitLabel: null,
  contractRateId: null,
};

/**
 * Map a stored ContractRate to the resolver's RateTierLike shape. The rate
 * amount is projected into the hourly/daily/monthly slot matching its type so
 * the shared `resolveHourlyRate` math (with configured workHours/days) applies
 * uniformly — no hard-coded 9 anywhere.
 */
export function contractRateToTier(rate: {
  rateType: string;
  amount: number;
  contract?: { workHoursPerDay?: number | null; contractDaysPerMonth?: number | null } | null;
}): RateTierLike {
  const workHours = rate.contract?.workHoursPerDay ?? null;
  const days = rate.contract?.contractDaysPerMonth ?? null;
  switch (rate.rateType) {
    case "HOURLY":
      return { hourlyRate: rate.amount, dailyRate: 0, monthlyRate: 0, workHoursPerDay: workHours, contractDaysPerMonth: days };
    case "DAILY":
      return { hourlyRate: 0, dailyRate: rate.amount, monthlyRate: 0, workHoursPerDay: workHours, contractDaysPerMonth: days };
    case "MONTHLY":
      return { hourlyRate: 0, dailyRate: 0, monthlyRate: rate.amount, workHoursPerDay: workHours, contractDaysPerMonth: days };
    case "UNIT":
      // Unit rates are not time-derived; they resolve to 0 hourly and are
      // billed per-unit by the claim builder.
      return { hourlyRate: 0, dailyRate: 0, monthlyRate: 0, workHoursPerDay: workHours, contractDaysPerMonth: days };
    default:
      return { hourlyRate: 0, dailyRate: 0, monthlyRate: 0, workHoursPerDay: workHours, contractDaysPerMonth: days };
  }
}

/**
 * Resolve the approved contract rate for `label` (or the contract's default
 * rate when label is null) effective on `at`. Only APPROVED rates count.
 * Returns null when the contract has no matching effective rate.
 */
export async function resolveContractRate(
  client: DbClient,
  contractId: string,
  label: string | null,
  at: Date
): Promise<ContractRateLike | null> {
  const rates = await client.contractRate.findMany({
    where: {
      contractId,
      approvedAt: { not: null },
      effectiveFrom: { lte: at },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: at } }],
      ...(label ? { label } : { isDefault: true }),
    },
    include: { contract: { select: { workHoursPerDay: true, contractDaysPerMonth: true } } },
    orderBy: { effectiveFrom: "desc" },
    take: 1,
  });

  const rate = rates[0];
  if (!rate) return null;
  return {
    id: rate.id,
    contractId: rate.contractId,
    label: rate.label,
    rateType: rate.rateType,
    amount: rate.amount,
    effectiveFrom: rate.effectiveFrom,
    effectiveTo: rate.effectiveTo,
    isDefault: rate.isDefault,
    approvedAt: rate.approvedAt,
    ...contractRateToTier({ rateType: rate.rateType, amount: rate.amount, contract: rate.contract }),
  };
}

/**
 * Full rate resolution for one timesheet: contract rate (effective-dated,
 * approved) when a contract is given, else the machinery's default rate tier,
 * else the machinery's own rates via the shared resolver. Always returns the
 * label + rateType so callers can snapshot them.
 */
export async function resolveRateForWork(input: {
  client: DbClient;
  contractId?: string | null;
  machineryId?: string | null;
  label?: string | null;
  at: Date;
  machinery?: MachineryLike | null;
}): Promise<ResolvedRate> {
  const { client, contractId, machineryId, label = null, at } = input;

  if (contractId) {
    const rate = await resolveContractRate(client, contractId, label, at);
    if (rate) {
      const hourlyRate = resolveHourlyRate({
        rateTier: rate,
        machinery: input.machinery ?? undefined,
      });
      return {
        source: "CONTRACT_RATE",
        label: rate.label,
        hourlyRate,
        amount: rate.amount,
        rateType: rate.rateType,
        unitLabel: null,
        contractRateId: rate.id,
      };
    }
  }

  // Legacy/no-contract fallback: machinery default rate tier, then machinery.
  if (machineryId) {
    const defaultTier = await client.machineryRate.findFirst({
      where: { machineryId, isDefault: true },
    });
    const hourlyRate = resolveHourlyRate({
      rateTier: defaultTier
        ? {
            hourlyRate: defaultTier.hourlyRate,
            dailyRate: defaultTier.dailyRate,
            monthlyRate: defaultTier.monthlyRate,
            workHoursPerDay: defaultTier.workHoursPerDay,
            contractDaysPerMonth: defaultTier.contractDaysPerMonth,
          }
        : null,
      machinery: input.machinery ?? undefined,
    });
    if (hourlyRate > 0) {
      return {
        source: "MACHINERY_RATE",
        label: defaultTier?.rateName ?? null,
        hourlyRate,
        amount: defaultTier?.hourlyRate ?? 0,
        rateType: "HOURLY",
        unitLabel: null,
        contractRateId: null,
      };
    }
  }

  return NONE;
}
