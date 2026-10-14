// Fuel variance service (Phase 3).
//
// Expected fuel = machinery.hourlyConsumptionRate × worked hours (normal +
// overtime from the machine's daily log) per machinery/day; actual fuel is
// the FuelUsage rows logged that day. Rows without a daily log or without a
// consumption rate have expected = null (no variance computable) — surfaced
// so ops can see logging coverage gaps.
import { db } from "@/lib/db";
import { round2 } from "@/lib/money";

export interface FuelVarianceFilters {
  /** Scope where clause for Machinery rows (from buildAccessScope). Empty = full visibility. */
  machineryScope?: Record<string, unknown>;
  machineryId?: string;
  from?: Date;
  to?: Date;
}

interface VarianceRow {
  machineryId: string;
  machineryName: string;
  date: string;
  workedHours: number | null;
  consumptionRate: number;
  expectedLiters: number | null;
  actualLiters: number;
  variance: number | null;
  loggedDays: number;
  expectedDays: number;
}

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function getFuelVariance(filters: FuelVarianceFilters) {
  const { machineryScope = {}, machineryId, from, to } = filters;

  const usageWhere: Record<string, unknown> = {
    machineryId: { not: null },
    ...(from ? { date: { ...(to ? { lte: to } : {}), gte: from } } : to ? { date: { lte: to } } : {}),
  };
  if (machineryId) usageWhere.machineryId = machineryId;
  if (Object.keys(machineryScope).length > 0) usageWhere.machinery = machineryScope;

  const usages = await db.fuelUsage.findMany({
    where: usageWhere,
    select: {
      machineryId: true,
      date: true,
      quantity: true,
    },
    orderBy: { date: "asc" },
  });

  const machineryIds = Array.from(new Set(usages.map((u: any) => u.machineryId)));
  if (machineryIds.length === 0) {
    return { rows: [], summary: [] };
  }

  const [machines, logs] = await Promise.all([
    db.machinery.findMany({
      where: { id: { in: machineryIds } },
      select: { id: true, machineryName: true, hourlyConsumptionRate: true },
    }),
    db.machineryDailyLog.findMany({
      where: {
        machineryId: { in: machineryIds },
        ...(from ? { date: { ...(to ? { lte: to } : {}), gte: from } } : to ? { date: { lte: to } } : {}),
      },
      select: {
        machineryId: true,
        date: true,
        normalHours: true,
        overtimeHours: true,
      },
    }),
  ]);

  const machineById = new Map<string, any>(
    machines.map((m: any) => [m.id, m] as [string, any])
  );
  const logByKey = new Map<string, any>(
    logs.map((l: any) => [`${l.machineryId}|${dateKey(new Date(l.date))}`, l] as [string, any])
  );

  // Aggregate actual liters per machinery/day first (multiple fuel rows/day).
  const dayAgg = new Map<string, { actual: number }>();
  for (const u of usages) {
    const key = `${u.machineryId}|${dateKey(new Date(u.date))}`;
    const agg = dayAgg.get(key) ?? { actual: 0 };
    agg.actual += u.quantity;
    dayAgg.set(key, agg);
  }

  const rows: VarianceRow[] = [];
  const summaryById = new Map<
    string,
    {
      machineryId: string;
      machineryName: string;
      consumptionRate: number;
      actualLiters: number;
      expectedLiters: number;
      variance: number;
      totalDays: number;
      loggedDays: number;
      expectedDays: number;
    }
  >();

  for (const [key, agg] of dayAgg) {
    const [mid, date] = key.split("|");
    const machine = machineById.get(mid);
    if (!machine) continue;
    const log = logByKey.get(key);
    const workedHours =
      log != null ? round2((log.normalHours ?? 0) + (log.overtimeHours ?? 0)) : null;
    const rate = machine.hourlyConsumptionRate ?? 0;
    const expectedLiters = workedHours != null && rate > 0 ? round2(rate * workedHours) : null;
    const actualLiters = round2(agg.actual);
    const variance = expectedLiters != null ? round2(actualLiters - expectedLiters) : null;

    rows.push({
      machineryId: mid,
      machineryName: machine.machineryName,
      date,
      workedHours,
      consumptionRate: rate,
      expectedLiters,
      actualLiters,
      variance,
      loggedDays: workedHours != null ? 1 : 0,
      expectedDays: expectedLiters != null ? 1 : 0,
    });

    const s = summaryById.get(mid) ?? {
      machineryId: mid,
      machineryName: machine.machineryName,
      consumptionRate: rate,
      actualLiters: 0,
      expectedLiters: 0,
      variance: 0,
      totalDays: 0,
      loggedDays: 0,
      expectedDays: 0,
    };
    s.totalDays += 1;
    s.actualLiters += actualLiters;
    if (expectedLiters != null) {
      s.expectedLiters += expectedLiters;
      s.variance += variance ?? 0;
      s.expectedDays += 1;
    }
    s.loggedDays += workedHours != null ? 1 : 0;
    summaryById.set(mid, s);
  }

  rows.sort((a, b) => (a.date === b.date ? a.machineryName.localeCompare(b.machineryName) : a.date < b.date ? -1 : 1));

  const summary = Array.from(summaryById.values()).map((s) => ({
    ...s,
    actualLiters: round2(s.actualLiters),
    expectedLiters: round2(s.expectedLiters),
    variance: round2(s.variance),
    // Percent of fuel days that had a daily log AND a consumption rate.
    coveragePercent: s.totalDays > 0 ? Math.round((s.expectedDays / s.totalDays) * 100) : 0,
  }));

  return { rows, summary };
}
