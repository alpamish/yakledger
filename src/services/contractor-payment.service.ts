// Contractor payment service (Phase 4).
//
// Cash moves exactly once per payment, atomically with the ledger:
//   recordPayment → Expense (paidToContractorId, D4) [+ wallet deduction]
//                 + ContractorPayment + PAYMENT ledger entry
//   allocatePayment → distributes a payment across posted claims
//                    (partial allowed), updates claim paidAmount/status
//   reversePayment → BOUNCED/REVERSED with compensating entries (never deletes)
// Idempotency: an `Idempotency-Key` stored on the payment row makes retries
// return the original payment instead of double-posting.
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { round2 } from "@/lib/money";
import { generateBusinessNumber, PAYMENT_NUMBER } from "@/lib/business-number";
import { writeLedgerEntry } from "@/services/contractor-ledger.service";
import { companyWalletService } from "@/services/company-wallet.service";

export const PAYMENT_METHODS = ["CASH", "BANK_TRANSFER", "CHEQUE"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = ["PENDING", "COMPLETED", "BOUNCED", "REVERSED"] as const;

export class PaymentError extends Error {
  constructor(
    message: string,
    public readonly status: number = 400
  ) {
    super(message);
    this.name = "PaymentError";
  }
}

export interface RecordPaymentInput {
  contractorId: string;
  contractId?: string | null;
  amount: number;
  paymentDate: Date;
  method: PaymentMethod;
  walletId?: string | null;
  authorizedById?: string | null;
  notes?: string | null;
  idempotencyKey?: string | null;
  userId: string;
  /** Expense category for the cash-out row (must be a valid Category value). */
  category?: string;
}

/**
 * Record a payment to a contractor: creates the Expense cash-out row (D4),
 * deducts the wallet when requested, writes the PAYMENT ledger entry, all in
 * one $transaction. Retries with the same idempotencyKey return the original.
 */
export async function recordPayment(input: RecordPaymentInput) {
  const {
    contractorId,
    contractId = null,
    amount,
    paymentDate,
    method,
    walletId = null,
    authorizedById = null,
    notes = null,
    idempotencyKey = null,
    userId,
    // Closest valid Category value; PG enforces the enum.
    category = "EQUIPMENT_RENTAL",
  } = input;

  if (amount <= 0) throw new PaymentError("Payment amount must be positive");

  // Idempotency short-circuit: same key → return the original payment.
  if (idempotencyKey) {
    const existing = await db.contractorPayment.findUnique({
      where: { idempotencyKey },
    });
    if (existing) return { payment: existing, idempotent: true as const };
  }

  const contractor = await db.contractor.findUnique({
    where: { id: contractorId },
    select: { id: true, contractorName: true },
  });
  if (!contractor) throw new PaymentError("Contractor not found", 404);

  return db.$transaction(async (tx) => {
    const paymentNumber = await generateBusinessNumber(tx, PAYMENT_NUMBER);

    // 1. Expense row for the cash-out (D4: payments reuse the expense model
    // so existing wallet/report plumbing keeps working).
    const expense = await tx.expense.create({
      data: {
        title: `Contractor payment ${paymentNumber} — ${contractor.contractorName}`,
        amount,
        category,
        paymentMethod: method === "CASH" ? "CASH" : method === "BANK_TRANSFER" ? "BANK_TRANSFER" : "CHECK",
        expenseDate: paymentDate,
        paidTo: contractor.contractorName,
        paidBy: `Contractor payment ${paymentNumber}`,
        paidToContractorId: contractorId,
        walletId: method === "CASH" ? walletId : null,
        deductFromWallet: method === "CASH" && !!walletId,
        notes: notes ?? `Payment to ${contractor.contractorName}`,
        createdBy: userId,
        approvalStatus: "APPROVED",
        approvedById: userId,
        approvedAt: new Date(),
      },
    });

    // 2. Wallet deduction for cash payments (inside the same transaction).
    if (method === "CASH" && walletId) {
      try {
        await companyWalletService.deductForExpense(
          tx,
          walletId,
          amount,
          userId,
          expense.id,
          `Contractor payment ${paymentNumber}`
        );
      } catch (err) {
        // Wallet problems (missing/inactive/insufficient balance) are
        // client-fixable conditions, not server errors.
        throw new PaymentError(err instanceof Error ? err.message : "Wallet deduction failed");
      }
    }

    // 3. The payment row.
    const payment = await tx.contractorPayment.create({
      data: {
        paymentNumber,
        contractorId,
        contractId,
        amount,
        paymentDate,
        method,
        walletId: method === "CASH" ? walletId : null,
        authorizedById,
        expenseId: expense.id,
        status: "COMPLETED",
        idempotencyKey,
        notes,
        createdBy: userId,
      },
    });

    // 4. Ledger: paying cash reduces what the company owes the contractor.
    await writeLedgerEntry(tx, {
      contractorId,
      contractId,
      paymentId: payment.id,
      type: "PAYMENT",
      amount: -amount,
      reference: `Payment ${paymentNumber}`,
      occurredAt: paymentDate,
      createdBy: userId,
    });

    await tx.auditLog.create({
      data: {
        action: "CREATE",
        entity: "ContractorPayment",
        entityId: payment.id,
        details: `Recorded payment ${paymentNumber}: ${amount} to ${contractor.contractorName} (${method})`,
        userId,
      },
    });

    return { payment, idempotent: false as const };
  });
}

export interface AllocateInput {
  paymentId: string;
  allocations: Array<{ claimId: string; amount: number }>;
  userId: string;
}

/**
 * Distribute a payment across posted claims. The sum of allocations cannot
 * exceed the payment amount nor any claim's outstanding balance. Updates each
 * claim's paidAmount and marks PARTIALLY_PAID/PAID.
 */
export async function allocatePayment(input: AllocateInput) {
  const { paymentId, allocations, userId } = input;
  if (allocations.length === 0) throw new PaymentError("At least one allocation is required");
  for (const a of allocations) {
    if (a.amount <= 0) throw new PaymentError("Allocation amounts must be positive");
  }

  return db.$transaction(async (tx) => {
    const payment = await tx.contractorPayment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new PaymentError("Payment not found", 404);
    if (payment.status !== "COMPLETED") {
      throw new PaymentError(`Cannot allocate a ${payment.status.toLowerCase()} payment`, 409);
    }

    const existingAllocations = await tx.paymentAllocation.aggregate({
      _sum: { amount: true },
      where: { paymentId },
    });
    const alreadyAllocated = existingAllocations._sum.amount ?? 0;
    const freeAmount = round2(payment.amount - alreadyAllocated);
    const requestedTotal = round2(allocations.reduce((s, a) => s + a.amount, 0));
    if (requestedTotal > freeAmount) {
      throw new PaymentError(
        `Allocations (${requestedTotal}) exceed the unallocated part of the payment (${freeAmount})`,
        400
      );
    }

    const results: Array<{ id: string }> = [];
    for (const a of allocations) {
      const claim = await tx.contractorClaim.findUnique({ where: { id: a.claimId } });
      if (!claim) throw new PaymentError(`Claim ${a.claimId} not found`, 404);
      if (claim.contractorId !== payment.contractorId) {
        throw new PaymentError(
          `Claim ${claim.claimNumber} belongs to a different contractor`,
          400
        );
      }
      if (!["POSTED", "PARTIALLY_PAID"].includes(claim.status)) {
        throw new PaymentError(
          `Claim ${claim.claimNumber} is not payable (status ${claim.status})`,
          409
        );
      }
      const outstanding = round2(claim.netAmount - claim.advanceRecoveryTotal - claim.paidAmount);
      if (a.amount > outstanding) {
        throw new PaymentError(
          `Allocation (${a.amount}) exceeds the outstanding balance of ${claim.claimNumber} (${outstanding})`,
          400
        );
      }

      await tx.paymentAllocation.create({
        data: { paymentId, claimId: a.claimId, amount: a.amount },
      });

      const newPaid = round2(claim.paidAmount + a.amount);
      const cashPayable = round2(claim.netAmount - claim.advanceRecoveryTotal);
      const fullyPaid = newPaid >= cashPayable;
      const updatedClaim = await tx.contractorClaim.update({
        where: { id: a.claimId },
        data: {
          paidAmount: newPaid,
          status: fullyPaid ? "PAID" : "PARTIALLY_PAID",
        },
      });
      results.push(updatedClaim);

      await tx.auditLog.create({
        data: {
          action: "UPDATE",
          entity: "ContractorClaim",
          entityId: a.claimId,
          details: `Allocated ${a.amount} from payment ${payment.paymentNumber} to ${claim.claimNumber} (paid ${newPaid}/${cashPayable})`,
          userId,
        },
      });
    }

    return results;
  });
}

/** Undo an allocation (draft-level correction before reversal). */
export async function removeAllocation(input: {
  paymentId: string;
  allocationId: string;
  userId: string;
}) {
  const { paymentId, allocationId, userId } = input;
  return db.$transaction(async (tx) => {
    const allocation = await tx.paymentAllocation.findFirst({
      where: { id: allocationId, paymentId },
      include: { claim: true, payment: true },
    });
    if (!allocation) throw new PaymentError("Allocation not found", 404);
    if (allocation.payment.status !== "COMPLETED") {
      throw new PaymentError("Cannot modify allocations of a reversed payment", 409);
    }

    const claim = allocation.claim;
    const newPaid = round2(Math.max(0, claim.paidAmount - allocation.amount));
    await tx.contractorClaim.update({
      where: { id: claim.id },
      data: {
        paidAmount: newPaid,
        status: newPaid <= 0 ? "POSTED" : "PARTIALLY_PAID",
      },
    });
    await tx.paymentAllocation.delete({ where: { id: allocationId } });

    await tx.auditLog.create({
      data: {
        action: "UPDATE",
        entity: "ContractorPayment",
        entityId: paymentId,
        details: `Removed allocation ${allocationId} (${allocation.amount}) from claim ${claim.claimNumber}`,
        userId,
      },
    });

    return { id: allocationId };
  });
}

/**
 * Reverse a payment (BOUNCED/REVERSED). Never deletes: allocations are
 * unwound, the wallet is credited back, a compensating PAYMENT_REVERSAL
 * ledger entry is written, and the linked expense is reversed.
 */
export async function reversePayment(input: {
  paymentId: string;
  reason: string;
  userId: string;
}) {
  const { paymentId, reason, userId } = input;

  return db.$transaction(async (tx) => {
    const payment = await tx.contractorPayment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new PaymentError("Payment not found", 404);
    if (payment.status !== "COMPLETED") {
      throw new PaymentError(`A ${payment.status.toLowerCase()} payment cannot be reversed`, 409);
    }

    // 1. Unwind allocations.
    const allocations = await tx.paymentAllocation.findMany({ where: { paymentId } });
    for (const alloc of allocations) {
      const claim = await tx.contractorClaim.findUnique({ where: { id: alloc.claimId } });
      if (!claim) continue;
      const newPaid = round2(Math.max(0, claim.paidAmount - alloc.amount));
      await tx.contractorClaim.update({
        where: { id: claim.id },
        data: {
          paidAmount: newPaid,
          status: newPaid <= 0 ? "POSTED" : "PARTIALLY_PAID",
        },
      });
    }
    await tx.paymentAllocation.deleteMany({ where: { paymentId } });

    // 2. Credit the wallet back for cash payments.
    if (payment.walletId && payment.expenseId) {
      await companyWalletService.reverseExpenseDeduction(
        tx,
        payment.walletId,
        payment.amount,
        userId,
        payment.expenseId
      );
    }

    // 3. Compensating ledger entry — never delete the original.
    await writeLedgerEntry(tx, {
      contractorId: payment.contractorId,
      contractId: payment.contractId,
      paymentId,
      type: "PAYMENT_REVERSAL",
      amount: payment.amount,
      reference: `Reversal of ${payment.paymentNumber}: ${reason}`,
      occurredAt: new Date(),
      createdBy: userId,
    });

    const updated = await tx.contractorPayment.update({
      where: { id: paymentId },
      data: { status: "REVERSED" },
    });

    await tx.auditLog.create({
      data: {
        action: "UPDATE",
        entity: "ContractorPayment",
        entityId: paymentId,
        details: `Reversed payment ${payment.paymentNumber} (${payment.amount}): ${reason}`,
        userId,
      },
    });

    return updated;
  });
}
