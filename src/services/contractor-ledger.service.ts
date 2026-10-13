// Contractor financial ledger (Phase 4).
//
// Every liability/cash event writes a signed ContractorLedgerEntry:
//   positive → increases what the company owes the contractor
//   negative → decreases it (payments, advance disbursements)
// The balance is ALWAYS derived by summing the ledger inside the same
// $transaction that writes the entry (mirrors companyWalletService.apply);
// `balanceAfter` is a stored projection for statement display, never trusted.
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { round2 } from "@/lib/money";

type DbClient = Prisma.TransactionClient | typeof db;

export const LEDGER_ENTRY_TYPES = [
  "CLAIM_POSTED",
  "CLAIM_REVERSAL",
  "RETENTION_HELD",
  "RETENTION_RELEASED",
  "ADVANCE_DISBURSED",
  "ADVANCE_RECOVERY",
  "PAYMENT",
  "PAYMENT_REVERSAL",
  "WRITE_OFF",
] as const;
export type LedgerEntryType = (typeof LEDGER_ENTRY_TYPES)[number];

export interface LedgerWrite {
  contractorId: string;
  contractId?: string | null;
  claimId?: string | null;
  paymentId?: string | null;
  advanceId?: string | null;
  retentionReleaseId?: string | null;
  type: LedgerEntryType;
  /** Signed: positive increases the company's debt to the contractor. */
  amount: number;
  reference?: string | null;
  occurredAt: Date;
  createdBy: string;
}

/**
 * Recompute the contractor's balance from the ledger sum.
 * Returns the current balance (rounded to 2 decimals).
 */
export async function recomputeBalance(
  contractorId: string,
  client: DbClient = db
): Promise<number> {
  const agg = await client.contractorLedgerEntry.aggregate({
    _sum: { amount: true },
    where: { contractorId },
  });
  return round2(agg._sum.amount ?? 0);
}

/**
 * Write a ledger entry and stamp the recomputed balance-after, atomically.
 * MUST be called inside the caller's $transaction so the entry, the balance
 * projection, and the domain mutation commit together.
 */
export async function writeLedgerEntry(
  tx: Prisma.TransactionClient,
  entry: LedgerWrite
) {
  const created = await tx.contractorLedgerEntry.create({
    data: { ...entry, balanceAfter: 0 },
  });

  // Balance after = sum of ALL entries for this contractor, recomputed from
  // the ledger (the just-created entry is included).
  const agg = await tx.contractorLedgerEntry.aggregate({
    _sum: { amount: true },
    where: { contractorId: entry.contractorId },
  });
  const balanceAfter = round2(agg._sum.amount ?? 0);

  return tx.contractorLedgerEntry.update({
    where: { id: created.id },
    data: { balanceAfter },
  });
}

export interface StatementRow {
  id: string;
  type: LedgerEntryType;
  amount: number;
  balanceAfter: number;
  reference: string | null;
  occurredAt: Date;
  claimId: string | null;
  paymentId: string | null;
  advanceId: string | null;
}

/** Paginated ledger statement, newest first. */
export async function getStatement(
  contractorId: string,
  opts: { page?: number; pageSize?: number; from?: Date; to?: Date } = {}
) {
  const { page = 1, pageSize = 50, from, to } = opts;
  const where: Prisma.ContractorLedgerEntryWhereInput = {
    contractorId,
    ...(from || to
      ? {
          occurredAt: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          },
        }
      : {}),
  };

  const [total, entries] = await Promise.all([
    db.contractorLedgerEntry.count({ where }),
    db.contractorLedgerEntry.findMany({
      where,
      orderBy: { occurredAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    data: entries as StatementRow[],
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    balance: await recomputeBalance(contractorId),
  };
}

export interface OutstandingClaim {
  claimId: string;
  claimNumber: string;
  title: string;
  netAmount: number;
  paidAmount: number;
  advanceRecoveryTotal: number;
  outstanding: number;
  retentionAmount: number;
  periodEnd: Date;
  status: string;
}

/** Per-claim outstanding for a contractor (claims that still owe money). */
export async function getOutstandingByContractor(contractorId: string) {
  const claims = await db.contractorClaim.findMany({
    where: {
      contractorId,
      status: { in: ["POSTED", "PARTIALLY_PAID", "PAID"] },
      postedAt: { not: null },
    },
    orderBy: { periodEnd: "asc" },
    select: {
      id: true,
      claimNumber: true,
      title: true,
      netAmount: true,
      paidAmount: true,
      advanceRecoveryTotal: true,
      retentionAmount: true,
      periodEnd: true,
      status: true,
    },
  });

  const rows: OutstandingClaim[] = claims.map((c) => ({
    claimId: c.id,
    claimNumber: c.claimNumber,
    title: c.title,
    netAmount: c.netAmount,
    paidAmount: c.paidAmount,
    advanceRecoveryTotal: c.advanceRecoveryTotal,
    // Advance recovery already reduced the cash payable of this claim.
    outstanding: round2(c.netAmount - c.advanceRecoveryTotal - c.paidAmount),
    retentionAmount: c.retentionAmount,
    periodEnd: c.periodEnd,
    status: c.status,
  }));

  return {
    claims: rows,
    totalOutstanding: round2(rows.reduce((s, r) => s + r.outstanding, 0)),
    totalRetention: round2(rows.reduce((s, r) => s + r.retentionAmount, 0)),
  };
}

export interface AgingBucket {
  bucket: "current" | "0-30" | "31-60" | "61-90" | "90+";
  amount: number;
  claimNumbers: string[];
}

/** Aging of unpaid claim net amounts against `currentDate`. */
export async function getAging(
  contractorId: string,
  currentDate: Date = new Date()
): Promise<{ buckets: AgingBucket[]; total: number }> {
  const { claims } = await getOutstandingByContractor(contractorId);

  const buckets: Record<AgingBucket["bucket"], { amount: number; claimNumbers: string[] }> = {
    current: { amount: 0, claimNumbers: [] },
    "0-30": { amount: 0, claimNumbers: [] },
    "31-60": { amount: 0, claimNumbers: [] },
    "61-90": { amount: 0, claimNumbers: [] },
    "90+": { amount: 0, claimNumbers: [] },
  };

  for (const c of claims) {
    if (c.outstanding <= 0) continue;
    const ageDays = Math.floor(
      (currentDate.getTime() - c.periodEnd.getTime()) / (1000 * 60 * 60 * 24)
    );
    const bucket: AgingBucket["bucket"] =
      ageDays <= 0 ? "current" : ageDays <= 30 ? "0-30" : ageDays <= 60 ? "31-60" : ageDays <= 90 ? "61-90" : "90+";
    buckets[bucket].amount = round2(buckets[bucket].amount + c.outstanding);
    buckets[bucket].claimNumbers.push(c.claimNumber);
  }

  return {
    buckets: (Object.entries(buckets) as [AgingBucket["bucket"], { amount: number; claimNumbers: string[] }][]).map(
      ([bucket, v]) => ({ bucket, ...v })
    ),
    total: round2(claims.reduce((s, c) => s + c.outstanding, 0)),
  };
}
