// Contractor reporting service (Phase 6, Batch A).
//
// Every function here is READ-ONLY aggregation over rows that already exist.
// No money math is re-implemented: balances come from the ledger service,
// outstanding from the claim engine, retention/advances/deductions from their
// owning tables. This guarantees the reports reconcile with the contractor
// profile, the PDFs, and the ledger statement (release gate §9).
//
// Scope: each function takes a Prisma `contractorWhere` filter produced by the
// route via buildAccessScope(user, "contractor"), so an out-of-scope
// contractor is never aggregated (its rows are filtered out at the query).
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { round2 } from "@/lib/money";
import { recomputeBalance } from "@/services/contractor-ledger.service";
import type {
  AdvanceRecoveryReport,
  AdvanceRecoveryReportRow,
  ClaimsPaymentsReport,
  ClaimsPaymentsReportRow,
  ContractSummaryReport,
  ContractSummaryRow,
  DeductionsReport,
  DeductionsReportRow,
  PayableAgingReport,
  PayableAgingRow,
  RetentionReport,
  RetentionReportRow,
  StatementLine,
  StatementReport,
  StatementTypeTotals,
} from "@/types/contractor";

type ContractorWhere = Prisma.ContractorWhereInput;

const MS_PER_DAY = 24 * 60 * 60 * 1000;
type AgingBucket = "current" | "0-30" | "31-60" | "61-90" | "90+";

function startOfDayUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function parseDate(value: string | undefined | null): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function windowOf(from?: string, to?: string) {
  const fromDate = parseDate(from);
  const toDate = parseDate(to);
  return {
    from: fromDate ? fromDate.toISOString() : null,
    to: toDate ? toDate.toISOString() : null,
    fromDate,
    toDate,
  };
}

/** In-period occurrence filter shared by every date-windowed report. */
function occurredInRange(fromDate?: Date, toDate?: Date) {
  return {
    ...(fromDate || toDate
      ? {
          occurredAt: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: toDate } : {}),
          },
        }
      : {}),
  };
}

// ── Contractor statement ────────────────────────────────────────────────────

export async function getStatementReport(
  contractorId: string,
  opts: { from?: string; to?: string } = {}
): Promise<StatementReport | null> {
  const contractor = await db.contractor.findUnique({
    where: { id: contractorId },
    select: { id: true, contractorName: true },
  });
  if (!contractor) return null;

  const { from, to, fromDate, toDate } = windowOf(opts.from, opts.to);

  // Opening balance = sum of everything strictly before the window start.
  // With no `from`, the window is the whole history → opening is 0.
  const openingAgg = fromDate
    ? await db.contractorLedgerEntry.aggregate({
        where: { contractorId, occurredAt: { lt: fromDate } },
        _sum: { amount: true },
      })
    : { _sum: { amount: null } };
  const openingBalance = round2(openingAgg._sum.amount ?? 0);

  const inRange = occurredInRange(fromDate, toDate);

  // Statement reads in chronological order (oldest first) — how a printed
  // statement is expected to run, unlike the screen's reverse-chronological
  // ledger tab.
  const [entries, grouped] = await Promise.all([
    db.contractorLedgerEntry.findMany({
      where: { contractorId, ...inRange },
      orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
    }),
    db.contractorLedgerEntry.groupBy({
      by: ["type"],
      where: { contractorId, ...inRange },
      _sum: { amount: true },
    }),
  ]);

  const totalsByType: StatementTypeTotals = {};
  let running = openingBalance;
  const lines: StatementLine[] = entries.map((e) => {
    running = round2(running + e.amount);
    totalsByType[e.type] = round2((totalsByType[e.type] ?? 0) + e.amount);
    return {
      id: e.id,
      occurredAt: e.occurredAt.toISOString(),
      type: e.type,
      reference: e.reference,
      amount: round2(e.amount),
      balanceAfter: running,
      claimId: e.claimId,
      paymentId: e.paymentId,
      advanceId: e.advanceId,
    };
  });

  // Cross-check the group-by totals against the line walk (same source rows).
  for (const g of grouped) {
    totalsByType[g.type] = round2(g._sum.amount ?? 0);
  }

  return {
    contractorId,
    contractorName: contractor.contractorName,
    from,
    to,
    openingBalance,
    closingBalance: running,
    currentBalance: await recomputeBalance(contractorId),
    lines,
    totalsByType,
    totalInPeriod: round2(running - openingBalance),
  };
}

// ── Payable aging (portfolio) ───────────────────────────────────────────────

export async function getPayableAgingReport(
  contractorWhere: ContractorWhere,
  asOf: string | undefined = undefined
): Promise<PayableAgingReport> {
  const asOfDate = startOfDayUtc(parseDate(asOf) ?? new Date());

  // Posted claims that still owe money, across every in-scope contractor.
  const claims = await db.contractorClaim.findMany({
    where: {
      contractor: contractorWhere,
      status: { in: ["POSTED", "PARTIALLY_PAID", "PAID"] },
      postedAt: { not: null },
    },
    select: {
      contractorId: true,
      claimNumber: true,
      netAmount: true,
      paidAmount: true,
      advanceRecoveryTotal: true,
      periodEnd: true,
      contractor: { select: { contractorName: true } },
    },
  });

  const byContractor = new Map<
    string,
    { name: string; buckets: Record<AgingBucket, number>; total: number; claimCount: number }
  >();

  const totals: Record<AgingBucket, number> = {
    current: 0,
    "0-30": 0,
    "31-60": 0,
    "61-90": 0,
    "90+": 0,
  };
  let grandTotal = 0;

  for (const c of claims) {
    // Same outstanding formula as the claim engine (advance recovery already
    // reduced the cash payable).
    const outstanding = round2(c.netAmount - c.advanceRecoveryTotal - c.paidAmount);
    if (outstanding <= 0) continue;

    const ageDays = Math.floor((asOfDate.getTime() - c.periodEnd.getTime()) / MS_PER_DAY);
    const bucket: AgingBucket =
      ageDays < 0 ? "current" : ageDays <= 30 ? "0-30" : ageDays <= 60 ? "31-60" : ageDays <= 90 ? "61-90" : "90+";

    let row = byContractor.get(c.contractorId);
    if (!row) {
      row = {
        name: c.contractor?.contractorName ?? "Unknown",
        buckets: { current: 0, "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 },
        total: 0,
        claimCount: 0,
      };
      byContractor.set(c.contractorId, row);
    }
    row.buckets[bucket] = round2(row.buckets[bucket] + outstanding);
    row.total = round2(row.total + outstanding);
    row.claimCount += 1;

    totals[bucket] = round2(totals[bucket] + outstanding);
    grandTotal = round2(grandTotal + outstanding);
  }

  const rows: PayableAgingRow[] = [...byContractor.entries()]
    .map(([contractorId, r]) => ({
      contractorId,
      contractorName: r.name,
      buckets: r.buckets,
      total: r.total,
      claimCount: r.claimCount,
    }))
    .sort((a, b) => b.total - a.total);

  return { asOf: asOfDate.toISOString(), rows, totals, grandTotal };
}

// ── Retention held / released ───────────────────────────────────────────────

export async function getRetentionReport(
  contractorWhere: ContractorWhere,
  opts: { from?: string; to?: string } = {}
): Promise<RetentionReport> {
  const { from, to, fromDate, toDate } = windowOf(opts.from, opts.to);
  const claimWhere = {
    contractor: contractorWhere,
    // Retention is snapshotted at claim time and only materialises for claims
    // that actually reached the ledger (posted or later).
    status: { in: ["POSTED", "PARTIALLY_PAID", "PAID"] },
    postedAt: { not: null },
    ...(fromDate || toDate
      ? {
          periodEnd: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: toDate } : {}),
          },
        }
      : {}),
  };

  const [perClaim, releases] = await Promise.all([
    // Same rows for the per-contractor rollup and the held total.
    db.contractorClaim.findMany({
      where: claimWhere,
      select: {
        contractorId: true,
        retentionAmount: true,
        contractor: { select: { contractorName: true } },
      },
    }),
    db.retentionRelease.findMany({
      where: {
        claim: { contractor: contractorWhere },
        ...(fromDate || toDate
          ? {
              date: {
                ...(fromDate ? { gte: fromDate } : {}),
                ...(toDate ? { lte: toDate } : {}),
              },
            }
          : {}),
      },
      select: { amount: true, claim: { select: { contractorId: true, contractor: { select: { contractorName: true } } } } },
    }),
  ]);

  const byContractor = new Map<string, { name: string; held: number; released: number; balance: number; claimCount: number }>();
  const ensure = (id: string, name: string) => {
    let r = byContractor.get(id);
    if (!r) {
      r = { name, held: 0, released: 0, balance: 0, claimCount: 0 };
      byContractor.set(id, r);
    }
    return r;
  };

  for (const c of perClaim) {
    const r = ensure(c.contractorId, c.contractor?.contractorName ?? "Unknown");
    r.held = round2(r.held + c.retentionAmount);
    r.claimCount += 1;
  }
  for (const rel of releases) {
    const cid = rel.claim.contractorId;
    const r = ensure(cid, rel.claim.contractor?.contractorName ?? "Unknown");
    r.released = round2(r.released + rel.amount);
  }
  for (const r of byContractor.values()) {
    r.balance = round2(r.held - r.released);
  }

  const rows: RetentionReportRow[] = [...byContractor.entries()]
    .map(([contractorId, r]) => ({
      contractorId,
      contractorName: r.name,
      held: r.held,
      released: r.released,
      balance: r.balance,
      claimCount: r.claimCount,
    }))
    .sort((a, b) => b.balance - a.balance);
  const totalHeld = round2(perClaim.reduce((s, c) => s + c.retentionAmount, 0));
  const totalReleased = round2(releases.reduce((s, r) => s + r.amount, 0));

  return { from, to, rows, totalHeld, totalReleased, totalBalance: round2(totalHeld - totalReleased) };
}

// ── Advance recovery ────────────────────────────────────────────────────────

export async function getAdvanceRecoveryReport(
  contractorWhere: ContractorWhere,
  opts: { from?: string; to?: string } = {}
): Promise<AdvanceRecoveryReport> {
  const { from, to, fromDate, toDate } = windowOf(opts.from, opts.to);

  const advances = await db.contractorAdvance.findMany({
    where: {
      contractor: contractorWhere,
      ...(fromDate || toDate
        ? {
            date: {
              ...(fromDate ? { gte: fromDate } : {}),
              ...(toDate ? { lte: toDate } : {}),
            },
          }
        : {}),
    },
    select: {
      contractorId: true,
      amount: true,
      recoveredAmount: true,
      status: true,
      contractor: { select: { contractorName: true } },
    },
  });

  // WRITTEN_OFF advances are no longer collectible — surface them separately
  // so "outstanding" only reflects money we still expect to recover.
  const byContractor = new Map<
    string,
    { name: string; disbursed: number; recovered: number; writtenOff: number; outstanding: number }
  >();

  for (const a of advances) {
    let r = byContractor.get(a.contractorId);
    if (!r) {
      r = { name: a.contractor?.contractorName ?? "Unknown", disbursed: 0, recovered: 0, writtenOff: 0, outstanding: 0 };
      byContractor.set(a.contractorId, r);
    }
    const recovered = round2(a.status === "WRITTEN_OFF" ? 0 : a.recoveredAmount);
    const writtenOff = round2(a.status === "WRITTEN_OFF" ? a.amount - a.recoveredAmount : 0);
    r.disbursed = round2(r.disbursed + a.amount);
    r.recovered = round2(r.recovered + recovered);
    r.writtenOff = round2(r.writtenOff + writtenOff);
    r.outstanding = round2(r.outstanding + (a.status === "WRITTEN_OFF" ? 0 : a.amount - a.recoveredAmount));
  }

  const rows: AdvanceRecoveryReportRow[] = [...byContractor.entries()]
    .map(([contractorId, r]) => ({ contractorId, contractorName: r.name, ...r }))
    .sort((a, b) => b.outstanding - a.outstanding);

  const sum = (k: "disbursed" | "recovered" | "writtenOff" | "outstanding") =>
    round2(rows.reduce((s, r) => s + r[k], 0));

  return {
    from,
    to,
    rows,
    totalDisbursed: sum("disbursed"),
    totalRecovered: sum("recovered"),
    totalWrittenOff: sum("writtenOff"),
    totalOutstanding: sum("outstanding"),
  };
}

// ── Deductions breakdown ────────────────────────────────────────────────────

export async function getDeductionsReport(
  contractorWhere: ContractorWhere,
  opts: { from?: string; to?: string } = {}
): Promise<DeductionsReport> {
  const { from, to, fromDate, toDate } = windowOf(opts.from, opts.to);

  const deductions = await db.contractorDeduction.findMany({
    where: {
      claim: {
        contractor: contractorWhere,
        ...(fromDate || toDate
          ? {
              periodEnd: {
                ...(fromDate ? { gte: fromDate } : {}),
                ...(toDate ? { lte: toDate } : {}),
              },
            }
          : {}),
      },
    },
    select: {
      type: true,
      amount: true,
      claim: { select: { contractorId: true, contractor: { select: { contractorName: true } } } },
    },
  });

  const byContractor = new Map<string, { name: string; byType: Record<string, number>; total: number; deductionCount: number }>();
  const totalsByType: Record<string, number> = {};
  let grandTotal = 0;

  for (const d of deductions) {
    const cid = d.claim.contractorId;
    let r = byContractor.get(cid);
    if (!r) {
      r = { name: d.claim.contractor?.contractorName ?? "Unknown", byType: {}, total: 0, deductionCount: 0 };
      byContractor.set(cid, r);
    }
    r.byType[d.type] = round2((r.byType[d.type] ?? 0) + d.amount);
    r.total = round2(r.total + d.amount);
    r.deductionCount += 1;
    totalsByType[d.type] = round2((totalsByType[d.type] ?? 0) + d.amount);
    grandTotal = round2(grandTotal + d.amount);
  }

  const rows: DeductionsReportRow[] = [...byContractor.entries()]
    .map(([contractorId, r]) => ({ contractorId, contractorName: r.name, ...r }))
    .sort((a, b) => b.total - a.total);

  return { from, to, rows, totalsByType, grandTotal };
}

// ── Claims & payments summary ───────────────────────────────────────────────

export async function getClaimsPaymentsReport(
  contractorWhere: ContractorWhere,
  opts: { from?: string; to?: string } = {}
): Promise<ClaimsPaymentsReport> {
  const { from, to, fromDate, toDate } = windowOf(opts.from, opts.to);

  const inPeriod = (field: string) =>
    fromDate || toDate
      ? {
          [field]: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: toDate } : {}),
          },
        }
      : {};

  const [claims, payments] = await Promise.all([
    db.contractorClaim.findMany({
      where: {
        contractor: contractorWhere,
        postedAt: { not: null },
        ...inPeriod("periodEnd"),
      },
      select: {
        contractorId: true,
        grossAmount: true,
        retentionAmount: true,
        deductionsTotal: true,
        netAmount: true,
        paidAmount: true,
        advanceRecoveryTotal: true,
        contractor: { select: { contractorName: true } },
      },
    }),
    db.contractorPayment.findMany({
      where: {
        contractor: contractorWhere,
        ...inPeriod("paymentDate"),
      },
      select: {
        contractorId: true,
        amount: true,
        status: true,
        contractor: { select: { contractorName: true } },
      },
    }),
  ]);

  const empty = (): Omit<ClaimsPaymentsReportRow, "contractorId" | "contractorName"> => ({
    claimCount: 0,
    grossAmount: 0,
    retentionAmount: 0,
    deductionsTotal: 0,
    netAmount: 0,
    paidAmount: 0,
    outstanding: 0,
    paymentCount: 0,
    paymentsTotal: 0,
    reversedTotal: 0,
  });

  const byContractor = new Map<string, { name: string; agg: ReturnType<typeof empty> }>();
  const ensure = (id: string, name: string) => {
    let r = byContractor.get(id);
    if (!r) {
      r = { name, agg: empty() };
      byContractor.set(id, r);
    }
    return r.agg;
  };

  for (const c of claims) {
    const a = ensure(c.contractorId, c.contractor?.contractorName ?? "Unknown");
    a.claimCount += 1;
    a.grossAmount = round2(a.grossAmount + c.grossAmount);
    a.retentionAmount = round2(a.retentionAmount + c.retentionAmount);
    a.deductionsTotal = round2(a.deductionsTotal + c.deductionsTotal);
    a.netAmount = round2(a.netAmount + c.netAmount);
    a.paidAmount = round2(a.paidAmount + c.paidAmount);
    a.outstanding = round2(a.outstanding + (c.netAmount - c.advanceRecoveryTotal - c.paidAmount));
  }

  // Reversed payments (status REVERSED) are excluded from net paid — they are
  // reported separately so the gross/reversed figures stay auditable.
  for (const p of payments) {
    const a = ensure(p.contractorId, p.contractor?.contractorName ?? "Unknown");
    if (p.status === "REVERSED") {
      a.reversedTotal = round2(a.reversedTotal + p.amount);
    } else {
      a.paymentCount += 1;
      a.paymentsTotal = round2(a.paymentsTotal + p.amount);
    }
  }

  const rows: ClaimsPaymentsReportRow[] = [...byContractor.entries()]
    .map(([contractorId, r]) => ({ contractorId, contractorName: r.name, ...r.agg }))
    .sort((a, b) => b.netAmount - a.netAmount);

  const totals = empty();
  for (const r of rows) {
    totals.claimCount += r.claimCount;
    totals.grossAmount = round2(totals.grossAmount + r.grossAmount);
    totals.retentionAmount = round2(totals.retentionAmount + r.retentionAmount);
    totals.deductionsTotal = round2(totals.deductionsTotal + r.deductionsTotal);
    totals.netAmount = round2(totals.netAmount + r.netAmount);
    totals.paidAmount = round2(totals.paidAmount + r.paidAmount);
    totals.outstanding = round2(totals.outstanding + r.outstanding);
    totals.paymentCount += r.paymentCount;
    totals.paymentsTotal = round2(totals.paymentsTotal + r.paymentsTotal);
    totals.reversedTotal = round2(totals.reversedTotal + r.reversedTotal);
  }

  return { from, to, rows, totals };
}

// ── Contract summary (budget vs approved work vs variations vs paid) ───────
//
// Budget and approved variations are point-in-time facts of the contract, so
// they ignore the window: `revisedValue` (current contract.value) always
// equals `baseValue` + `variationsTotal`. Approved work / retention / paid /
// outstanding are windowed exactly like the other Batch A reports, so this
// report's `outstanding` totals reconcile with payable aging and claims &
// payments (release gate §9).
export async function getContractSummaryReport(
  contractorWhere: ContractorWhere,
  opts: { from?: string; to?: string } = {}
): Promise<ContractSummaryReport> {
  const { from, to, fromDate, toDate } = windowOf(opts.from, opts.to);

  const [contracts, variations, claims, releases] = await Promise.all([
    db.contractorContract.findMany({
      where: { contractor: contractorWhere },
      select: {
        id: true,
        contractNumber: true,
        title: true,
        projectName: true,
        status: true,
        value: true,
        contractorId: true,
        contractor: { select: { contractorName: true } },
      },
      orderBy: { contractNumber: "asc" },
    }),
    db.contractVariation.findMany({
      where: { contract: { contractor: contractorWhere }, status: "APPROVED" },
      select: { contractId: true, valueChange: true },
    }),
    db.contractorClaim.findMany({
      where: {
        contract: { contractor: contractorWhere },
        status: { in: ["POSTED", "PARTIALLY_PAID", "PAID"] },
        postedAt: { not: null },
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
        grossAmount: true,
        deductionsTotal: true,
        retentionAmount: true,
        netAmount: true,
        advanceRecoveryTotal: true,
        paidAmount: true,
      },
    }),
    db.retentionRelease.findMany({
      where: {
        claim: { contract: { contractor: contractorWhere } },
        ...(fromDate || toDate
          ? {
              date: {
                ...(fromDate ? { gte: fromDate } : {}),
                ...(toDate ? { lte: toDate } : {}),
              },
            }
          : {}),
      },
      select: { amount: true, claim: { select: { contractId: true } } },
    }),
  ]);

  const byContract = new Map<string, ContractSummaryRow>();
  for (const c of contracts) {
    byContract.set(c.id, {
      contractId: c.id,
      contractNumber: c.contractNumber,
      title: c.title,
      projectName: c.projectName,
      status: c.status,
      contractorId: c.contractorId,
      contractorName: c.contractor?.contractorName ?? "Unknown",
      baseValue: round2(c.value),
      variationCount: 0,
      variationsTotal: 0,
      revisedValue: round2(c.value),
      claimCount: 0,
      approvedGross: 0,
      deductionsTotal: 0,
      approvedNet: 0,
      retentionHeld: 0,
      retentionReleased: 0,
      retentionBalance: 0,
      advanceRecovered: 0,
      paidAmount: 0,
      outstanding: 0,
    });
  }

  // Approved variations adjust the budget: current value already includes
  // them (the approval route increments contract.value), so back out the
  // original budget. Guards against a variation whose contract is out of scope.
  for (const v of variations) {
    const row = byContract.get(v.contractId);
    if (!row) continue;
    row.variationCount += 1;
    row.variationsTotal = round2(row.variationsTotal + v.valueChange);
  }
  for (const row of byContract.values()) {
    row.baseValue = round2(row.revisedValue - row.variationsTotal);
  }

  for (const claim of claims) {
    const row = byContract.get(claim.contractId);
    if (!row) continue; // claim on a contract deleted out of scope
    row.claimCount += 1;
    row.approvedGross = round2(row.approvedGross + claim.grossAmount);
    row.deductionsTotal = round2(row.deductionsTotal + claim.deductionsTotal);
    row.approvedNet = round2(row.approvedNet + claim.netAmount);
    row.retentionHeld = round2(row.retentionHeld + claim.retentionAmount);
    row.advanceRecovered = round2(row.advanceRecovered + claim.advanceRecoveryTotal);
    row.paidAmount = round2(row.paidAmount + claim.paidAmount);
    row.outstanding = round2(row.outstanding + (claim.netAmount - claim.advanceRecoveryTotal - claim.paidAmount));
  }

  for (const rel of releases) {
    const row = byContract.get(rel.claim.contractId);
    if (!row) continue;
    row.retentionReleased = round2(row.retentionReleased + rel.amount);
  }
  for (const row of byContract.values()) {
    row.retentionBalance = round2(row.retentionHeld - row.retentionReleased);
  }

  const rows: ContractSummaryRow[] = [...byContract.values()].sort((a, b) =>
    a.contractNumber.localeCompare(b.contractNumber)
  );

  const sum = (k: keyof Omit<ContractSummaryRow, "contractId" | "contractNumber" | "title" | "projectName" | "status" | "contractorId" | "contractorName">) =>
    round2(rows.reduce((s, r) => s + (r[k] as number), 0));

  return {
    from,
    to,
    rows,
    totals: {
      baseValue: sum("baseValue"),
      variationCount: rows.reduce((s, r) => s + r.variationCount, 0),
      variationsTotal: sum("variationsTotal"),
      revisedValue: sum("revisedValue"),
      claimCount: rows.reduce((s, r) => s + r.claimCount, 0),
      approvedGross: sum("approvedGross"),
      deductionsTotal: sum("deductionsTotal"),
      approvedNet: sum("approvedNet"),
      retentionHeld: sum("retentionHeld"),
      retentionReleased: sum("retentionReleased"),
      retentionBalance: sum("retentionBalance"),
      advanceRecovered: sum("advanceRecovered"),
      paidAmount: sum("paidAmount"),
      outstanding: sum("outstanding"),
    },
  };
}
