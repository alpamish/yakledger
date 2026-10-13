// Contractor advance service (Phase 4).
//
// An advance is cash handed to a contractor before a claim exists. It reduces
// what the company owes (ADVANCE_DISBURSED, negative) and is recovered
// automatically when claims are approved: approveAndPostClaim walks the
// outstanding advances FIFO, recovering `recoveryPercent` of each claim's net
// payable and writing ADVANCE_RECOVERY entries.
import { db } from "@/lib/db";
import { round2 } from "@/lib/money";
import { generateBusinessNumber, ADVANCE_NUMBER } from "@/lib/business-number";
import { writeLedgerEntry } from "@/services/contractor-ledger.service";
import { companyWalletService } from "@/services/company-wallet.service";

export const ADVANCE_STATUSES = [
  "OUTSTANDING",
  "PARTIALLY_RECOVERED",
  "RECOVERED",
  "WRITTEN_OFF",
] as const;
export type AdvanceStatus = (typeof ADVANCE_STATUSES)[number];

export class AdvanceError extends Error {
  constructor(
    message: string,
    public readonly status: number = 400
  ) {
    super(message);
    this.name = "AdvanceError";
  }
}

export interface CreateAdvanceInput {
  contractorId: string;
  contractId?: string | null;
  amount: number;
  date: Date;
  recoveryPercent?: number | null;
  walletId?: string | null;
  notes?: string | null;
  userId: string;
}

/**
 * Disburse an advance: Expense cash-out + ADVANCE_DISBURSED ledger entry,
 * atomically. Cash leaves the company, so the contractor's debt drops.
 */
export async function createAdvance(input: CreateAdvanceInput) {
  const {
    contractorId,
    contractId = null,
    amount,
    date,
    recoveryPercent = null,
    walletId = null,
    notes = null,
    userId,
  } = input;

  if (amount <= 0) throw new AdvanceError("Advance amount must be positive");
  if (recoveryPercent != null && (recoveryPercent <= 0 || recoveryPercent > 100)) {
    throw new AdvanceError("Recovery percent must be between 0 and 100");
  }

  const contractor = await db.contractor.findUnique({
    where: { id: contractorId },
    select: { id: true, contractorName: true },
  });
  if (!contractor) throw new AdvanceError("Contractor not found", 404);

  return db.$transaction(async (tx) => {
    const advanceNumber = await generateBusinessNumber(tx, ADVANCE_NUMBER);

    const expense = await tx.expense.create({
      data: {
        title: `Contractor advance ${advanceNumber} — ${contractor.contractorName}`,
        amount,
        category: "MISCELLANEOUS",
        paymentMethod: walletId ? "CASH" : "CASH",
        expenseDate: date,
        paidTo: contractor.contractorName,
        paidBy: `Contractor advance ${advanceNumber}`,
        walletId,
        deductFromWallet: !!walletId,
        notes: notes ?? `Advance to ${contractor.contractorName}`,
        createdBy: userId,
        approvalStatus: "APPROVED",
        approvedById: userId,
        approvedAt: new Date(),
      },
    });

    if (walletId) {
      await companyWalletService.deductForExpense(
        tx,
        walletId,
        amount,
        userId,
        expense.id,
        `Contractor advance ${advanceNumber}`
      );
    }

    const advance = await tx.contractorAdvance.create({
      data: {
        advanceNumber,
        contractorId,
        contractId,
        amount,
        date,
        recoveryPercent,
        walletId,
        expenseId: expense.id,
        notes,
        createdBy: userId,
      },
    });

    // Cash out the door: reduces what the company owes the contractor.
    await writeLedgerEntry(tx, {
      contractorId,
      contractId,
      advanceId: advance.id,
      type: "ADVANCE_DISBURSED",
      amount: -amount,
      reference: `Advance ${advanceNumber}`,
      occurredAt: date,
      createdBy: userId,
    });

    await tx.auditLog.create({
      data: {
        action: "CREATE",
        entity: "ContractorAdvance",
        entityId: advance.id,
        details: `Disbursed advance ${advanceNumber}: ${amount} to ${contractor.contractorName}${recoveryPercent ? ` (recover ${recoveryPercent}% per claim)` : ""}`,
        userId,
      },
    });

    return advance;
  });
}

/**
 * Write off the remaining balance of an advance (it will never be recovered).
 * The loss stays on the ledger as a WRITE_OFF entry.
 */
export async function writeOffAdvance(input: {
  advanceId: string;
  reason: string;
  userId: string;
}) {
  const { advanceId, reason, userId } = input;

  return db.$transaction(async (tx) => {
    const advance = await tx.contractorAdvance.findUnique({ where: { id: advanceId } });
    if (!advance) throw new AdvanceError("Advance not found", 404);
    if (advance.status === "RECOVERED") {
      throw new AdvanceError("A fully recovered advance cannot be written off", 409);
    }
    if (advance.status === "WRITTEN_OFF") {
      throw new AdvanceError("Advance is already written off", 409);
    }

    const remaining = round2(advance.amount - advance.recoveredAmount);
    const now = new Date();

    await tx.contractorAdvance.update({
      where: { id: advanceId },
      data: { status: "WRITTEN_OFF", writtenOffAt: now },
    });

    // The forgiven remainder was effectively owed back to the company (the
    // disbursement reduced the balance more than the recoveries restored it).
    // Writing it off brings the contractor ledger back to zero: +remaining.
    await writeLedgerEntry(tx, {
      contractorId: advance.contractorId,
      contractId: advance.contractId,
      advanceId,
      type: "WRITE_OFF",
      amount: remaining,
      reference: `Wrote off ${remaining} of ${advance.advanceNumber}: ${reason}`,
      occurredAt: now,
      createdBy: userId,
    });

    await tx.auditLog.create({
      data: {
        action: "UPDATE",
        entity: "ContractorAdvance",
        entityId: advanceId,
        details: `Wrote off advance ${advance.advanceNumber} (remaining ${remaining}): ${reason}`,
        userId,
      },
    });

    return { ...advance, status: "WRITTEN_OFF" as const, writtenOffAt: now };
  });
}
