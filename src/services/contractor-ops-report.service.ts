// Machinery & project ops reporting service (Phase 6, Batch B).
//
// Read-only aggregates over MachineryDailyLog, DowntimeRecord, and the
// contract/claim/payment tables. No money math is re-implemented — figures
// come straight from the owning rows and are only summed + rounded, so ops
// reports reconcile with the contractor finance reports and the ledger.
//
// Scoping: machinery reports take a Machinery scope from
// buildAccessScope(user, "machinery"); the project-cost report takes a
// Contractor scope from buildAccessScope(user, "contractor").
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { round2 } from "@/lib/money";
import type {
  DowntimeReasonSummary,
  DowntimeReport,
  DowntimeReportRow,
  ProjectCostReport,
  ProjectCostReportRow,
  UtilizationReport,
  UtilizationReportRow,
} from "@/types/contractor";

type MachineryWhere = Prisma.MachineryWhereInput;
type ContractorWhere = Prisma.ContractorWhereInput;

const MS_PER_HOUR = 60 * 60 * 1000;

/** In-window date filter shared by the machinery reports. */
function dateInRange(fromDate?: Date, toDate?: Date) {
  return {
    ...(fromDate || toDate
      ? {
          date: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: toDate } : {}),
          },
        }
      : {}),
  };
}

/** Clip a downtime record's span to [from, to]; open records clamp to `to` or now. */
function clippedHours(start: Date, end: Date | null, fromDate?: Date, toDate?: Date): number {
  const effectiveStart = fromDate && start < fromDate ? fromDate : start;
  const rangeEnd = toDate ?? new Date();
  const effectiveEnd = end && end < rangeEnd ? end : rangeEnd;
  const ms = effectiveEnd.getTime() - effectiveStart.getTime();
  return ms > 0 ? ms / MS_PER_HOUR : 0;
}

function parseDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function windowOf(from?: string, to?: string) {
  return { from: from ?? null, to: to ?? null, fromDate: parseDate(from), toDate: parseDate(to) };
}

// ── Machinery utilization ───────────────────────────────────────────────────

export async function getUtilizationReport(
  machineryScope: MachineryWhere,
  opts: { from?: string; to?: string } = {}
): Promise<UtilizationReport> {
  const { from, to, fromDate, toDate } = windowOf(opts.from, opts.to);

  const machineryWhere: MachineryWhere = { ...machineryScope };

  const [machines, logs, downtimes] = await Promise.all([
    db.machinery.findMany({
      where: machineryWhere,
      select: {
        id: true,
        machineryName: true,
        machineryType: true,
        plateNumber: true,
        assignedContractor: { select: { contractorName: true } },
      },
      orderBy: { machineryName: "asc" },
    }),
    db.machineryDailyLog.findMany({
      where: { machinery: machineryWhere, ...dateInRange(fromDate, toDate) },
      select: {
        machineryId: true,
        normalHours: true,
        overtimeHours: true,
        idleHours: true,
        breakdownHours: true,
      },
    }),
    db.downtimeRecord.findMany({
      where: { machinery: machineryWhere, start: { gte: fromDate ?? new Date(0) } },
      select: { machineryId: true, start: true, end: true, chargeable: true },
    }),
  ]);

  // Daily-log rollup per machinery (findMany + JS aggregation, matching the
  // fuel-variance service — Prisma groupBy inference is unreliable here).
  const logByMachine = new Map<
    string,
    { loggedDays: number; normalHours: number; overtimeHours: number; idleHours: number; breakdownHours: number }
  >();
  for (const l of logs) {
    const agg = logByMachine.get(l.machineryId) ?? {
      loggedDays: 0,
      normalHours: 0,
      overtimeHours: 0,
      idleHours: 0,
      breakdownHours: 0,
    };
    agg.loggedDays += 1;
    agg.normalHours += l.normalHours;
    agg.overtimeHours += l.overtimeHours;
    agg.idleHours += l.idleHours;
    agg.breakdownHours += l.breakdownHours;
    logByMachine.set(l.machineryId, agg);
  }

  const downtimeByMachine = new Map<string, { total: number; chargeable: number }>();
  for (const d of downtimes) {
    const hours = clippedHours(d.start, d.end, fromDate, toDate);
    if (hours <= 0) continue;
    const agg = downtimeByMachine.get(d.machineryId) ?? { total: 0, chargeable: 0 };
    agg.total += hours;
    if (d.chargeable) agg.chargeable += hours;
    downtimeByMachine.set(d.machineryId, agg);
  }

  const rows: UtilizationReportRow[] = machines.map((m) => {
    const l = logByMachine.get(m.id);
    const normal = round2(l?.normalHours ?? 0);
    const overtime = round2(l?.overtimeHours ?? 0);
    const worked = round2(normal + overtime);
    const idle = round2(l?.idleHours ?? 0);
    const breakdown = round2(l?.breakdownHours ?? 0);
    const dt = downtimeByMachine.get(m.id) ?? { total: 0, chargeable: 0 };
    const downtime = round2(dt.total);
    const chargeable = round2(dt.chargeable);
    const denominator = round2(worked + idle + downtime);

    return {
      machineryId: m.id,
      machineryName: m.machineryName,
      machineryType: m.machineryType,
      plateNumber: m.plateNumber,
      assignedContractorName: m.assignedContractor?.contractorName ?? null,
      loggedDays: l?.loggedDays ?? 0,
      normalHours: normal,
      overtimeHours: overtime,
      workedHours: worked,
      idleHours: idle,
      breakdownHours: breakdown,
      downtimeHours: downtime,
      chargeableDowntimeHours: chargeable,
      utilizationPercent: denominator > 0 ? Math.round((worked / denominator) * 100) : null,
    };
  });

  const sum = (k: keyof Omit<UtilizationReportRow, "utilizationPercent">) =>
    round2(rows.reduce((s, r) => s + (r[k] as number), 0));

  const totals = {
    loggedDays: rows.reduce((s, r) => s + r.loggedDays, 0),
    normalHours: sum("normalHours"),
    overtimeHours: sum("overtimeHours"),
    workedHours: sum("workedHours"),
    idleHours: sum("idleHours"),
    breakdownHours: sum("breakdownHours"),
    downtimeHours: sum("downtimeHours"),
    chargeableDowntimeHours: sum("chargeableDowntimeHours"),
  };
  const totalDenominator = round2(totals.workedHours + totals.idleHours + totals.downtimeHours);

  return {
    from,
    to,
    rows,
    totals: {
      ...totals,
      utilizationPercent:
        totalDenominator > 0 ? Math.round((totals.workedHours / totalDenominator) * 100) : null,
    },
  };
}

// ── Machinery downtime ──────────────────────────────────────────────────────

export async function getDowntimeReport(
  machineryScope: MachineryWhere,
  opts: { from?: string; to?: string } = {}
): Promise<DowntimeReport> {
  const { from, to, fromDate, toDate } = windowOf(opts.from, opts.to);

  const [machines, records] = await Promise.all([
    db.machinery.findMany({
      where: machineryScope,
      select: {
        id: true,
        machineryName: true,
        machineryType: true,
        assignedContractor: { select: { contractorName: true } },
      },
      orderBy: { machineryName: "asc" },
    }),
    db.downtimeRecord.findMany({
      where: { machinery: machineryScope, start: { gte: fromDate ?? new Date(0) } },
      select: {
        machineryId: true,
        start: true,
        end: true,
        reason: true,
        chargeable: true,
      },
    }),
  ]);

  const byMachine = new Map<
    string,
    { recordCount: number; totalHours: number; chargeableHours: number; reasons: Map<string, DowntimeReasonSummary> }
  >();

  for (const r of records) {
    const hours = clippedHours(r.start, r.end, fromDate, toDate);
    if (hours <= 0) continue;

    let agg = byMachine.get(r.machineryId);
    if (!agg) {
      agg = { recordCount: 0, totalHours: 0, chargeableHours: 0, reasons: new Map() };
      byMachine.set(r.machineryId, agg);
    }
    agg.recordCount += 1;
    agg.totalHours += hours;
    if (r.chargeable) agg.chargeableHours += hours;

    let reason = agg.reasons.get(r.reason);
    if (!reason) {
      reason = { reason: r.reason, recordCount: 0, hours: 0, chargeableHours: 0 };
      agg.reasons.set(r.reason, reason);
    }
    reason.recordCount += 1;
    reason.hours += hours;
    if (r.chargeable) reason.chargeableHours += hours;
  }

  const rows: DowntimeReportRow[] = machines
    .filter((m) => byMachine.has(m.id))
    .map((m) => {
      const agg = byMachine.get(m.id)!;
      return {
        machineryId: m.id,
        machineryName: m.machineryName,
        machineryType: m.machineryType,
        assignedContractorName: m.assignedContractor?.contractorName ?? null,
        recordCount: agg.recordCount,
        totalHours: round2(agg.totalHours),
        chargeableHours: round2(agg.chargeableHours),
        byReason: [...agg.reasons.values()]
          .map((r) => ({ ...r, hours: round2(r.hours), chargeableHours: round2(r.chargeableHours) }))
          .sort((a, b) => b.hours - a.hours),
      };
    })
    .sort((a, b) => b.totalHours - a.totalHours);

  // Portfolio-level reason rollup across every machine.
  const reasonTotals = new Map<string, DowntimeReasonSummary>();
  for (const row of rows) {
    for (const r of row.byReason) {
      const t = reasonTotals.get(r.reason) ?? { reason: r.reason, recordCount: 0, hours: 0, chargeableHours: 0 };
      t.recordCount += r.recordCount;
      t.hours = round2(t.hours + r.hours);
      t.chargeableHours = round2(t.chargeableHours + r.chargeableHours);
      reasonTotals.set(r.reason, t);
    }
  }

  return {
    from,
    to,
    rows,
    totalHours: round2(rows.reduce((s, r) => s + r.totalHours, 0)),
    chargeableHours: round2(rows.reduce((s, r) => s + r.chargeableHours, 0)),
    byReason: [...reasonTotals.values()].sort((a, b) => b.hours - a.hours),
  };
}

// ── Per-project contractor cost ─────────────────────────────────────────────

export async function getProjectCostReport(
  contractorWhere: ContractorWhere,
  opts: { from?: string; to?: string } = {}
): Promise<ProjectCostReport> {
  const { from, to, fromDate, toDate } = windowOf(opts.from, opts.to);

  const contracts = await db.contractorContract.findMany({
    where: { contractor: contractorWhere },
    select: {
      id: true,
      title: true,
      projectName: true,
      value: true,
      contractorId: true,
      contractor: { select: { contractorName: true } },
    },
  });

  const claims = await db.contractorClaim.findMany({
    where: {
      contractor: contractorWhere,
      postedAt: { not: null },
      status: { in: ["POSTED", "PARTIALLY_PAID", "PAID"] },
      ...(fromDate || toDate
        ? {
            periodEnd: {
              ...(fromDate ? { gte: fromDate } : {}),
              ...(toDate ? { lte: toDate } : {}),
            },
          }
        : {}),
    },
    select: {
      contractId: true,
      netAmount: true,
      retentionAmount: true,
      advanceRecoveryTotal: true,
      paidAmount: true,
    },
  });

  const byContract = new Map<string, ProjectCostReportRow>();
  for (const c of contracts) {
    byContract.set(c.id, {
      contractId: c.id,
      contractTitle: c.title,
      projectName: c.projectName,
      contractorId: c.contractorId,
      contractorName: c.contractor?.contractorName ?? "Unknown",
      contractValue: round2(c.value),
      claimCount: 0,
      approvedNet: 0,
      retentionHeld: 0,
      advanceRecovered: 0,
      paidAmount: 0,
      outstanding: 0,
    });
  }

  for (const claim of claims) {
    // A claim always belongs to a contract; guard against one deleted out of scope.
    const row = byContract.get(claim.contractId);
    if (!row) continue;
    row.claimCount += 1;
    row.approvedNet = round2(row.approvedNet + claim.netAmount);
    row.retentionHeld = round2(row.retentionHeld + claim.retentionAmount);
    row.advanceRecovered = round2(row.advanceRecovered + claim.advanceRecoveryTotal);
    row.paidAmount = round2(row.paidAmount + claim.paidAmount);
  }

  for (const row of byContract.values()) {
    row.outstanding = round2(row.approvedNet - row.advanceRecovered - row.paidAmount);
  }

  const rows = [...byContract.values()].sort((a, b) => b.approvedNet - a.approvedNet);

  const sum = (k: "contractValue" | "approvedNet" | "retentionHeld" | "advanceRecovered" | "paidAmount" | "outstanding") =>
    round2(rows.reduce((s, r) => s + r[k], 0));

  return {
    from,
    to,
    rows,
    totals: {
      claimCount: rows.reduce((s, r) => s + r.claimCount, 0),
      contractValue: sum("contractValue"),
      approvedNet: sum("approvedNet"),
      retentionHeld: sum("retentionHeld"),
      advanceRecovered: sum("advanceRecovered"),
      paidAmount: sum("paidAmount"),
      outstanding: sum("outstanding"),
    },
  };
}
