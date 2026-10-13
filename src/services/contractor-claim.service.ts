// Contractor claim service (Phase 4) — all claim money math lives here.
//
// A claim turns APPROVED work (timesheets with snapshotted contract rates)
// into a payable document:
//   gross = Σ line amounts (hours × snapshotted rate)
//   net   = gross − retention − Σ deductions − Σ advance recoveries
// Approval posts the liability to the contractor ledger exactly once
// (postedAt guard) and applies outstanding-advance recovery FIFO.
//
// Status flow:
//   DRAFT → SUBMITTED → VERIFIED → FINANCE_REVIEW → APPROVED → POSTED
//   (approve posts the ledger entry, so APPROVED and POSTED are set together)
//   any pre-post state → REJECTED / VOID
// Approved/posted claims are immutable: corrections go through reverseClaim.
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { round2 } from "@/lib/money";
import { APPROVED as FRAMEWORK_APPROVED } from "@/lib/access-control";
import { generateBusinessNumber, CLAIM_NUMBER } from "@/lib/business-number";
import { writeLedgerEntry, recomputeBalance } from "@/services/contractor-ledger.service";

/** Claim workflow states (stored as strings for SQLite/PG parity). */
export const CLAIM_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "VERIFIED",
  "FINANCE_REVIEW",
  "APPROVED",
  "POSTED",
  "PARTIALLY_PAID",
  "PAID",
  "REJECTED",
  "VOID",
] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

/** States from which no further edit is allowed (immutable financial record). */
export const FINAL_CLAIM_STATUSES: ClaimStatus[] = [
  "APPROVED",
  "POSTED",
  "PARTIALLY_PAID",
  "PAID",
  "REJECTED",
  "VOID",
];

export const DEDUCTION_TYPES = [
  "FUEL",
  "PENALTY",
  "MATERIALS",
  "ACCOMMODATION",
  "FOOD",
  "TRANSPORT",
  "TAX",
  "OTHER",
] as const;
export type DeductionType = (typeof DEDUCTION_TYPES)[number];

export class ClaimError extends Error {
  constructor(
    message: string,
    public readonly status: number = 400
  ) {
    super(message);
    this.name = "ClaimError";
  }
}

export interface ClaimLineInput {
  sourceType?: "TIMESHEET" | "MANUAL" | "VARIATION";
  timesheetId?: string | null;
  description: string;
  quantity: number;
  unitLabel?: string | null;
  rateLabel?: string | null;
  rateAmount: number;
  amount?: number | null;
}

/**
 * Build a claim from APPROVED timesheets of one contract.
 * - Every timesheet must be APPROVED, belong to the contract, not be void,
 *   and not already be claimed by a non-void claim.
 * - Line amounts use the timesheet's SNAPSHOT rate (rateAmount), so later
 *   rate changes never rewrite the claim.
 */
export async function createClaimFromTimesheets(input: {
  contractId: string;
  timesheetIds: string[];
  title?: string;
  periodStart?: Date;
  periodEnd?: Date;
  notes?: string | null;
  userId: string;
}) {
  const { contractId, timesheetIds, userId } = input;
  if (timesheetIds.length === 0) {
    throw new ClaimError("At least one timesheet is required");
  }

  const contract = await db.contractorContract.findUnique({
    where: { id: contractId },
    select: { id: true, contractorId: true, contractNumber: true, retentionPercent: true },
  });
  if (!contract) throw new ClaimError("Contract not found", 404);

  const timesheets = await db.timesheet.findMany({
    where: { id: { in: timesheetIds } },
    include: { contractor: { select: { id: true } } },
  });
  if (timesheets.length !== timesheetIds.length) {
    throw new ClaimError("One or more timesheets not found", 404);
  }

  for (const ts of timesheets) {
    if (ts.contractId !== contractId) {
      throw new ClaimError(
        `Timesheet ${ts.id} belongs to a different contract`,
        400
      );
    }
    if (ts.approvalStatus !== FRAMEWORK_APPROVED) {
      throw new ClaimError(
        `Timesheet on ${ts.date.toISOString().slice(0, 10)} is not approved and cannot be claimed`,
        400
      );
    }
  }

  // Reject timesheets already claimed by a non-void claim.
  const existingLines = await db.contractorClaimLine.findMany({
    where: {
      timesheetId: { in: timesheetIds },
      claim: { status: { not: "VOID" } },
    },
    select: { timesheetId: true, claimId: true },
  });
  if (existingLines.length > 0) {
    const claimNumbers = await db.contractorClaim.findMany({
      where: { id: { in: [...new Set(existingLines.map((l) => l.claimId))] } },
      select: { claimNumber: true },
    });
    throw new ClaimError(
      `Some timesheets are already claimed (${claimNumbers.map((c) => c.claimNumber).join(", ")})`,
      409
    );
  }

  // Lines: use the snapshot rate stamped at timesheet creation.
  const lines: ClaimLineInput[] = timesheets.map((ts) => {
    const rateAmount = ts.rateAmount ?? 0;
    return {
      sourceType: "TIMESHEET" as const,
      timesheetId: ts.id,
      description: `Work on ${ts.date.toISOString().slice(0, 10)}${ts.machineryId ? " (machinery)" : ""}`,
      quantity: ts.totalHours,
      unitLabel: "hour",
      rateLabel: ts.rateLabel,
      rateAmount,
      amount: round2(ts.totalHours * rateAmount),
    };
  });

  const grossAmount = round2(lines.reduce((s, l) => s + (l.amount ?? round2(l.quantity * l.rateAmount)), 0));
  const retentionPercent = contract.retentionPercent;
  const retentionAmount = round2((grossAmount * retentionPercent) / 100);

  const dates = timesheets.map((ts) => ts.date.getTime());
  const periodStart = input.periodStart ?? new Date(Math.min(...dates));
  const periodEnd = input.periodEnd ?? new Date(Math.max(...dates));

  return db.$transaction(async (tx) => {
    const claimNumber = await generateBusinessNumber(tx, CLAIM_NUMBER);
    const netAmount = round2(grossAmount - retentionAmount);

    const claim = await tx.contractorClaim.create({
      data: {
        claimNumber,
        contractorId: contract.contractorId,
        contractId,
        title: input.title ?? `Claim ${claimNumber}`,
        periodStart,
        periodEnd,
        grossAmount,
        retentionPercent,
        retentionAmount,
        deductionsTotal: 0,
        advanceRecoveryTotal: 0,
        netAmount,
        status: "DRAFT",
        notes: input.notes ?? null,
        createdBy: userId,
        lines: {
          create: lines.map((l) => ({
            sourceType: l.sourceType ?? "TIMESHEET",
            timesheetId: l.timesheetId ?? null,
            description: l.description,
            quantity: l.quantity,
            unitLabel: l.unitLabel ?? null,
            rateLabel: l.rateLabel ?? null,
            rateAmount: l.rateAmount,
            amount: l.amount ?? round2(l.quantity * l.rateAmount),
          })),
        },
      },
      include: { lines: true },
    });

    await tx.auditLog.create({
      data: {
        action: "CREATE",
        entity: "ContractorClaim",
        entityId: claim.id,
        details: `Created claim ${claimNumber} (gross ${grossAmount}, retention ${retentionAmount}, net ${netAmount})`,
        userId,
      },
    });

    return claim;
  });
}

/** Recompute the claim's money totals from its lines/deductions/recoveries. */
async function recomputeClaimTotals(claimId: string, tx: Prisma.TransactionClient) {
  const claim = await tx.contractorClaim.findUniqueOrThrow({
    where: { id: claimId },
    include: { lines: true, deductions: true, advanceRecoveries: true },
  });

  const grossAmount = round2(claim.lines.reduce((s, l) => s + l.amount, 0));
  const retentionAmount = round2((grossAmount * claim.retentionPercent) / 100);
  const deductionsTotal = round2(claim.deductions.reduce((s, d) => s + d.amount, 0));
  const advanceRecoveryTotal = round2(claim.advanceRecoveries.reduce((s, r) => s + r.amount, 0));
  // netAmount is the claim's own payable and deliberately excludes advance
  // recovery — recovery only redirects cash (cash payable =
  // netAmount − advanceRecoveryTotal). Subtracting it here would make
  // getOutstandingByContractor/allocatePayment double-subtract it.
  const netAmount = round2(grossAmount - retentionAmount - deductionsTotal);

  if (netAmount < 0) {
    throw new ClaimError(
      `Deductions (${round2(retentionAmount + deductionsTotal)}) exceed gross (${grossAmount}); net would be negative`,
      400
    );
  }

  return tx.contractorClaim.update({
    where: { id: claimId },
    data: { grossAmount, retentionAmount, deductionsTotal, advanceRecoveryTotal, netAmount },
  });
}

/**
 * Edit a draft claim's metadata (title/period/notes). Money fields are
 * derived from lines/deductions and cannot be set directly. Only DRAFT
 * claims are editable — once submitted the workflow owns the record.
 */
export async function updateClaimDraft(
  claimId: string,
  data: { title?: string; periodStart?: Date; periodEnd?: Date; notes?: string | null },
  userId: string
) {
  return db.$transaction(async (tx) => {
    const claim = await tx.contractorClaim.findUnique({ where: { id: claimId } });
    if (!claim) throw new ClaimError("Claim not found", 404);
    if (claim.status !== "DRAFT") {
      throw new ClaimError(`A ${claim.status.toLowerCase()} claim cannot be edited`, 409);
    }

    const periodStart = data.periodStart ?? claim.periodStart;
    const periodEnd = data.periodEnd ?? claim.periodEnd;
    if (periodEnd < periodStart) {
      throw new ClaimError("periodEnd must be on or after periodStart");
    }

    const updated = await tx.contractorClaim.update({
      where: { id: claimId },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
        periodStart,
        periodEnd,
      },
    });

    await tx.auditLog.create({
      data: {
        action: "UPDATE",
        entity: "ContractorClaim",
        entityId: claimId,
        details: `Updated draft claim ${claim.claimNumber}`,
        userId,
      },
    });

    return updated;
  });
}

/** Add a deduction to a draft claim. */
export async function addDeduction(input: {
  claimId: string;
  type: DeductionType;
  description: string;
  amount: number;
  userId: string;
}) {
  const { claimId, type, description, amount, userId } = input;
  if (amount <= 0) throw new ClaimError("Deduction amount must be positive");

  return db.$transaction(async (tx) => {
    const claim = await tx.contractorClaim.findUnique({ where: { id: claimId } });
    if (!claim) throw new ClaimError("Claim not found", 404);
    if (claim.status !== "DRAFT") {
      throw new ClaimError("Deductions can only be added while the claim is a draft", 409);
    }

    await tx.contractorDeduction.create({
      data: { claimId, type, description, amount, appliedBy: userId },
    });
    const updated = await recomputeClaimTotals(claimId, tx);

    await tx.auditLog.create({
      data: {
        action: "UPDATE",
        entity: "ContractorClaim",
        entityId: claimId,
        details: `Added deduction ${type} ${amount} to ${claim.claimNumber}`,
        userId,
      },
    });

    return updated;
  });
}

/** Remove a deduction from a draft claim. */
export async function removeDeduction(input: {
  claimId: string;
  deductionId: string;
  userId: string;
}) {
  const { claimId, deductionId, userId } = input;
  return db.$transaction(async (tx) => {
    const claim = await tx.contractorClaim.findUnique({ where: { id: claimId } });
    if (!claim) throw new ClaimError("Claim not found", 404);
    if (claim.status !== "DRAFT") {
      throw new ClaimError("Deductions can only be changed while the claim is a draft", 409);
    }
    const deduction = await tx.contractorDeduction.findFirst({
      where: { id: deductionId, claimId },
    });
    if (!deduction) throw new ClaimError("Deduction not found", 404);

    await tx.contractorDeduction.delete({ where: { id: deductionId } });
    return recomputeClaimTotals(claimId, tx);
  });
}

/** Guarded status transition shared by submit/verify/financeReview. */
async function transition(
  claimId: string,
  from: ClaimStatus[],
  to: ClaimStatus,
  userId: string,
  extra?: (tx: Prisma.TransactionClient, claim: { id: string; claimNumber: string }) => Promise<void>
) {
  return db.$transaction(async (tx) => {
    const claim = await tx.contractorClaim.findUnique({ where: { id: claimId } });
    if (!claim) throw new ClaimError("Claim not found", 404);
    if (!from.includes(claim.status as ClaimStatus)) {
      throw new ClaimError(
        `Cannot move claim from ${claim.status} to ${to}`,
        409
      );
    }

    const updated = await tx.contractorClaim.update({
      where: { id: claimId },
      data: {
        status: to,
        ...(to === "SUBMITTED"
          ? { approvalStatus: "PENDING", submittedById: userId }
          : {}),
        ...(to === "VERIFIED" ? { verifiedById: userId } : {}),
        ...(to === "FINANCE_REVIEW" ? { financeReviewedById: userId } : {}),
      },
    });

    if (extra) await extra(tx, claim);

    await tx.auditLog.create({
      data: {
        action: "UPDATE",
        entity: "ContractorClaim",
        entityId: claimId,
        details: `Claim ${claim.claimNumber}: ${claim.status} → ${to}`,
        userId,
      },
    });

    return updated;
  });
}

export const submitClaim = (claimId: string, userId: string) =>
  transition(claimId, ["DRAFT"], "SUBMITTED", userId);

export const verifyClaim = (claimId: string, userId: string) =>
  transition(claimId, ["SUBMITTED"], "VERIFIED", userId);

export const financeReviewClaim = (claimId: string, userId: string) =>
  transition(claimId, ["VERIFIED"], "FINANCE_REVIEW", userId);

export const rejectClaim = (claimId: string, userId: string, note?: string) =>
  db.$transaction(async (tx) => {
    const claim = await tx.contractorClaim.findUnique({ where: { id: claimId } });
    if (!claim) throw new ClaimError("Claim not found", 404);
    if (!["SUBMITTED", "VERIFIED", "FINANCE_REVIEW"].includes(claim.status)) {
      throw new ClaimError(`Cannot reject a claim in status ${claim.status}`, 409);
    }
    const updated = await tx.contractorClaim.update({
      where: { id: claimId },
      data: {
        status: "REJECTED",
        approvalStatus: "REJECTED",
        approvedById: userId,
        approvedAt: new Date(),
        approvalNote: note ?? null,
      },
    });
    await tx.auditLog.create({
      data: {
        action: "REJECT",
        entity: "ContractorClaim",
        entityId: claimId,
        details: `Rejected claim ${claim.claimNumber}${note ? `: ${note}` : ""}`,
        userId,
      },
    });
    return updated;
  });

/**
 * Void a claim that never posted a liability (draft/rejected).
 * Posted claims cannot be voided — use reverseClaim.
 */
export const voidClaim = (claimId: string, userId: string) =>
  db.$transaction(async (tx) => {
    const claim = await tx.contractorClaim.findUnique({ where: { id: claimId } });
    if (!claim) throw new ClaimError("Claim not found", 404);
    if (claim.postedAt) {
      throw new ClaimError(
        "A posted claim cannot be voided; reverse it instead",
        409
      );
    }
    if (["VOID", "PAID", "PARTIALLY_PAID"].includes(claim.status)) {
      throw new ClaimError(`Cannot void a claim in status ${claim.status}`, 409);
    }
    const updated = await tx.contractorClaim.update({
      where: { id: claimId },
      data: { status: "VOID", voidedAt: new Date() },
    });
    await tx.auditLog.create({
      data: {
        action: "UPDATE",
        entity: "ContractorClaim",
        entityId: claimId,
        details: `Voided claim ${claim.claimNumber}`,
        userId,
      },
    });
    return updated;
  });

/**
 * Approve + post: sets APPROVED/POSTED, applies advance recovery (FIFO),
 * and writes CLAIM_POSTED (+ RETENTION_HELD) ledger entries — exactly once.
 * Callable from FINANCE_REVIEW (full flow) or APPROVED-for-admin shortcut.
 */
export async function approveAndPostClaim(claimId: string, userId: string, note?: string) {
  return db.$transaction(async (tx) => {
    const claim = await tx.contractorClaim.findUniqueOrThrow({
      where: { id: claimId },
      include: { lines: true },
    });
    if (!["SUBMITTED", "VERIFIED", "FINANCE_REVIEW", "APPROVED"].includes(claim.status)) {
      throw new ClaimError(`Cannot approve a claim in status ${claim.status}`, 409);
    }
    if (claim.postedAt) {
      throw new ClaimError("Claim liability was already posted", 409);
    }

    // 1. Advance recovery FIFO on outstanding advances.
    const advances = await tx.contractorAdvance.findMany({
      where: {
        contractorId: claim.contractorId,
        status: { in: ["OUTSTANDING", "PARTIALLY_RECOVERED"] },
      },
      orderBy: { date: "asc" },
    });

    let remainingNet = round2(claim.netAmount);
    let recoveryTotal = 0;
    const now = new Date();

    for (const advance of advances) {
      if (remainingNet <= 0) break;
      // Recover per the advance's configured percent of the claim's net
      // payable, capped at the advance's outstanding balance.
      const percent = advance.recoveryPercent ?? 0;
      if (percent <= 0) continue;
      const byPercent = round2((claim.netAmount * percent) / 100);
      const advanceOutstanding = round2(advance.amount - advance.recoveredAmount);
      const amount = round2(Math.min(byPercent, advanceOutstanding, remainingNet));
      if (amount <= 0) continue;

      await tx.advanceRecovery.create({
        data: { advanceId: advance.id, claimId, amount, date: now },
      });

      const newRecovered = round2(advance.recoveredAmount + amount);
      await tx.contractorAdvance.update({
        where: { id: advance.id },
        data: {
          recoveredAmount: newRecovered,
          status: newRecovered >= advance.amount ? "RECOVERED" : "PARTIALLY_RECOVERED",
        },
      });

      await writeLedgerEntry(tx, {
        contractorId: claim.contractorId,
        contractId: claim.contractId,
        claimId,
        advanceId: advance.id,
        type: "ADVANCE_RECOVERY",
        // Zero on the debt ledger: the disbursement entry already reduced the
        // balance when the cash was handed over. Recovery only redirects this
        // claim's cash payable (tracked via advanceRecoveryTotal), so writing
        // a non-zero amount here would double-subtract.
        amount: 0,
        reference: `Advance ${advance.advanceNumber} recovered via ${claim.claimNumber} (${amount})`,
        occurredAt: now,
        createdBy: userId,
      });

      remainingNet = round2(remainingNet - amount);
      recoveryTotal = round2(recoveryTotal + amount);
    }

    // 2. Recovery is tracked separately: claim.netAmount stays the claim's
    // own net payable; the ADVANCE_RECOVERY ledger entries below reduce the
    // cash actually owed. (Cash payable = netAmount − advanceRecoveryTotal.)
    if (recoveryTotal > 0) {
      await tx.contractorClaim.update({
        where: { id: claimId },
        data: { advanceRecoveryTotal: recoveryTotal },
      });
    }

    // 3. Post the liability: CLAIM_POSTED for net payable + RETENTION_HELD
    // (retention is a separate liability until released).
    await writeLedgerEntry(tx, {
      contractorId: claim.contractorId,
      contractId: claim.contractId,
      claimId,
      type: "CLAIM_POSTED",
      amount: claim.netAmount,
      reference: `Claim ${claim.claimNumber} posted`,
      occurredAt: now,
      createdBy: userId,
    });

    if (claim.retentionAmount > 0) {
      await writeLedgerEntry(tx, {
        contractorId: claim.contractorId,
        contractId: claim.contractId,
        claimId,
        type: "RETENTION_HELD",
        // Retention adds to the company's debt (it's owed, just later).
        amount: claim.retentionAmount,
        reference: `Retention held on ${claim.claimNumber}`,
        occurredAt: now,
        createdBy: userId,
      });
    }

    // 4. Mark posted + approved; stamp the approval framework fields.
    const updated = await tx.contractorClaim.update({
      where: { id: claimId },
      data: {
        status: "POSTED",
        approvalStatus: FRAMEWORK_APPROVED,
        approvedById: userId,
        approvedAt: now,
        approvalNote: note ?? null,
        postedAt: now,
      },
    });

    await tx.auditLog.create({
      data: {
        action: "APPROVE",
        entity: "ContractorClaim",
        entityId: claimId,
        details: `Approved & posted claim ${claim.claimNumber}: net ${claim.netAmount}, retention ${claim.retentionAmount}, advance recovery ${recoveryTotal}`,
        userId,
      },
    });

    return { ...updated, balanceAfter: await recomputeBalance(claim.contractorId, tx) };
  });
}

/**
 * Reverse a posted claim (correction path — never edit history).
 * Requires zero allocations (fully unpaid) or a force flag is NOT provided:
 * paid claims must have their payments reversed first.
 */
export async function reverseClaim(claimId: string, userId: string, reason: string) {
  return db.$transaction(async (tx) => {
    const claim = await tx.contractorClaim.findUniqueOrThrow({ where: { id: claimId } });
    if (!claim.postedAt) {
      throw new ClaimError("Only a posted claim can be reversed", 409);
    }
    if (claim.paidAmount > 0) {
      throw new ClaimError(
        "A claim with payments must have those payments reversed first",
        409
      );
    }

    const now = new Date();

    // Reverse the ledger: negate CLAIM_POSTED and RETENTION_HELD.
    await writeLedgerEntry(tx, {
      contractorId: claim.contractorId,
      contractId: claim.contractId,
      claimId,
      type: "CLAIM_REVERSAL",
      amount: -claim.netAmount,
      reference: `Reversal of ${claim.claimNumber}: ${reason}`,
      occurredAt: now,
      createdBy: userId,
    });
    if (claim.retentionAmount > 0) {
      await writeLedgerEntry(tx, {
        contractorId: claim.contractorId,
        contractId: claim.contractId,
        claimId,
        type: "RETENTION_RELEASED",
        amount: -claim.retentionAmount,
        reference: `Retention reversal on ${claim.claimNumber}: ${reason}`,
        occurredAt: now,
        createdBy: userId,
      });
    }

    // Restore advance recovery bookkeeping.
    const recoveries = await tx.advanceRecovery.findMany({ where: { claimId } });
    for (const rec of recoveries) {
      const advance = await tx.contractorAdvance.findUniqueOrThrow({
        where: { id: rec.advanceId },
      });
      const newRecovered = round2(Math.max(0, advance.recoveredAmount - rec.amount));
      await tx.contractorAdvance.update({
        where: { id: advance.id },
        data: {
          recoveredAmount: newRecovered,
          status: newRecovered <= 0 ? "OUTSTANDING" : "PARTIALLY_RECOVERED",
        },
      });
    }
    await tx.advanceRecovery.deleteMany({ where: { claimId } });

    const updated = await tx.contractorClaim.update({
      where: { id: claimId },
      data: { status: "VOID", voidedAt: now, advanceRecoveryTotal: 0 },
    });

    await tx.auditLog.create({
      data: {
        action: "UPDATE",
        entity: "ContractorClaim",
        entityId: claimId,
        details: `Reversed posted claim ${claim.claimNumber}: ${reason}`,
        userId,
      },
    });

    return updated;
  });
}

/**
 * Release retention held on a posted claim. Retention is a separate
 * liability — releasing it pays out cash, so callers (the route) pair this
 * with a payment; here we only move the ledger.
 */
export async function releaseRetention(input: {
  claimId: string;
  amount: number;
  date: Date;
  reason: string;
  userId: string;
}) {
  const { claimId, amount, date, reason, userId } = input;
  if (amount <= 0) throw new ClaimError("Release amount must be positive");

  return db.$transaction(async (tx) => {
    const claim = await tx.contractorClaim.findUniqueOrThrow({ where: { id: claimId } });
    if (!claim.postedAt) {
      throw new ClaimError("Retention can only be released on a posted claim", 409);
    }
    const alreadyReleased = await tx.retentionRelease.aggregate({
      _sum: { amount: true },
      where: { claimId },
    });
    const released = alreadyReleased._sum.amount ?? 0;
    const remaining = round2(claim.retentionAmount - released);
    if (amount > remaining) {
      throw new ClaimError(
        `Only ${remaining} of retention remains on ${claim.claimNumber}`,
        400
      );
    }

    const entry = await tx.retentionRelease.create({
      data: { claimId, amount, date, reason, releasedBy: userId },
    });

    await writeLedgerEntry(tx, {
      contractorId: claim.contractorId,
      contractId: claim.contractId,
      claimId,
      retentionReleaseId: entry.id,
      type: "RETENTION_RELEASED",
      // Releasing pays out cash: reduces the company's remaining debt.
      amount: -amount,
      reference: `Retention release on ${claim.claimNumber}: ${reason}`,
      occurredAt: date,
      createdBy: userId,
    });

    await tx.auditLog.create({
      data: {
        action: "UPDATE",
        entity: "ContractorClaim",
        entityId: claimId,
        details: `Released retention ${amount} on ${claim.claimNumber}: ${reason}`,
        userId,
      },
    });

    return entry;
  });
}
