import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { companyWalletService } from "./company-wallet.service";
import { walletService } from "./wallet.service";
import { isPayrollPaymentMethod } from "@/lib/payroll-status";

/**
 * Reimbursements (Plan-payroll.pdf §2 action 7).
 *
 * An employee who fronts a company expense creates a company liability the
 * moment the expense is approved. Reimbursement is a separate payment — never
 * netted against salary payroll — and requires the expense to be approved
 * before it can be paid. Each reimbursement is its own cash transaction,
 * wallet debit (when paid from a company wallet) and accounting entry, and it
 * stays visible in the employee financial history.
 */

export type ReimbursementStatus =
  | "PENDING" // awaiting expense approval
  | "APPROVED" // approved, not yet paid back
  | "REIMBURSED" // paid back to the employee
  | "REJECTED";

export interface ReimbursementRecord {
  id: string;
  title: string;
  description: string | null;
  category: string;
  amount: number;
  amountMinor: number;
  currency: string;
  expenseDate: string;
  approvalStatus: string;
  reimbursedAt: string | null;
  reimbursedById: string | null;
  reimbursementMethod: string | null;
  status: ReimbursementStatus;
}

const expenseSelect = {
  id: true,
  title: true,
  description: true,
  category: true,
  amount: true,
  currency: true,
  expenseDate: true,
  approvalStatus: true,
  reimbursedAt: true,
  reimbursedById: true,
  reimbursementMethod: true,
} as const;

function toRecord(e: {
  id: string;
  title: string;
  description: string | null;
  category: string;
  amount: number;
  currency: string;
  expenseDate: Date;
  approvalStatus: string;
  reimbursedAt: Date | null;
  reimbursedById: string | null;
  reimbursementMethod: string | null;
}): ReimbursementRecord {
  const status: ReimbursementStatus =
    e.approvalStatus === "PENDING"
      ? "PENDING"
      : e.approvalStatus === "REJECTED"
        ? "REJECTED"
        : e.reimbursedAt
          ? "REIMBURSED"
          : "APPROVED";
  return {
    ...e,
    expenseDate: e.expenseDate.toISOString(),
    amountMinor: Math.round(e.amount * 100),
    reimbursedAt: e.reimbursedAt ? e.reimbursedAt.toISOString() : null,
    status,
  };
}

/** Employee-paid expenses and their reimbursement state, newest first. */
export async function listReimbursements(
  employeeId: string,
  opts?: { status?: ReimbursementStatus }
) {
  const expenses = await db.expense.findMany({
    where: { paidById: employeeId },
    orderBy: { expenseDate: "desc" },
    select: expenseSelect,
  });

  let records = expenses.map(toRecord);
  if (opts?.status) records = records.filter((r) => r.status === opts.status);

  const sumMinor = (pred: (r: ReimbursementRecord) => boolean) =>
    records.filter(pred).reduce((s, r) => s + r.amountMinor, 0);

  return {
    records,
    totals: {
      pendingMinor: sumMinor((r) => r.status === "PENDING"),
      approvedUnpaidMinor: sumMinor((r) => r.status === "APPROVED"),
      reimbursedMinor: sumMinor((r) => r.status === "REIMBURSED"),
    },
  };
}

export interface ReimbursementPaymentInput {
  employeeId: string;
  expenseIds: string[];
  paymentMethod: string;
  walletId?: string | null;
  paidById: string;
  note?: string | null;
}

/**
 * Pay an approved employee-paid expense back to the employee.
 *
 * All requested expenses must belong to the employee, be approved and not
 * already reimbursed. One cash transaction covers the batch; each expense gets
 * its own accounting entry so the journal stays expense-level auditable.
 */
export async function recordReimbursement(input: ReimbursementPaymentInput) {
  const expenseIds = [...new Set(input.expenseIds)];
  if (expenseIds.length === 0) throw new Error("No expenses selected");
  if (!isPayrollPaymentMethod(input.paymentMethod)) {
    throw new Error(`Unsupported payment method: ${input.paymentMethod}`);
  }
  if (input.paymentMethod === "COMPANY_WALLET" && !input.walletId) {
    throw new Error("Select a wallet to pay this reimbursement from");
  }

  const expenses = await db.expense.findMany({
    where: { id: { in: expenseIds } },
    select: { ...expenseSelect, paidById: true },
  });
  if (expenses.length !== expenseIds.length) {
    throw new Error("One or more expenses were not found");
  }

  const foreign = expenses.find((e) => e.paidById !== input.employeeId);
  if (foreign) {
    throw new Error(`Expense "${foreign.title}" does not belong to this employee`);
  }

  const alreadyPaid = expenses.filter((e) => e.reimbursedAt);
  if (alreadyPaid.length > 0) {
    throw new Error(
      `Already reimbursed: ${alreadyPaid.map((e) => `"${e.title}"`).join(", ")}`
    );
  }

  const unapproved = expenses.filter((e) => e.approvalStatus !== "APPROVED");
  if (unapproved.length > 0) {
    const labels = unapproved
      .map((e) => `"${e.title}" (${e.approvalStatus.toLowerCase()})`)
      .join(", ");
    throw new Error(`Reimbursement requires approval before payment: ${labels}`);
  }

  const invalid = expenses.filter((e) => !(e.amount > 0));
  if (invalid.length > 0) {
    throw new Error(`Expense "${invalid[0].title}" has no amount to reimburse`);
  }

  const totalMajor = expenses.reduce((s, e) => s + e.amount, 0);
  const totalMinor = expenses.reduce((s, e) => s + Math.round(e.amount * 100), 0);
  const now = new Date();
  const note =
    input.note ??
    `Reimbursement of ${expenses.length} expense${expenses.length > 1 ? "s" : ""}`;

  const transaction = await db.$transaction(async (tx) => {
    const txn = await tx.cashTransaction.create({
      data: {
        employeeId: input.employeeId,
        type: "REIMBURSEMENT",
        amount: totalMajor,
        note,
        paymentMethod: input.paymentMethod,
        walletId: input.paymentMethod === "COMPANY_WALLET" ? input.walletId : null,
        approvalStatus: "APPROVED",
        approvedById: input.paidById,
        approvedAt: now,
        createdBy: input.paidById,
      },
    });

    for (const expense of expenses) {
      if (input.paymentMethod === "COMPANY_WALLET") {
        await companyWalletService.deductForExpense(
          tx,
          input.walletId!,
          expense.amount,
          input.paidById,
          expense.id,
          `Reimbursement of "${expense.title}"`
        );
      }

      await tx.expense.update({
        where: { id: expense.id },
        data: {
          reimbursedAt: now,
          reimbursedById: input.paidById,
          reimbursementMethod: input.paymentMethod,
          reimbursementTransactionId: txn.id,
        },
      });

      await tx.accountingEntry.create({
        data: {
          type: "EXPENSE_REIMBURSEMENT",
          amountMinor: -Math.round(expense.amount * 100),
          description: `Reimbursement of expense "${expense.title}"`,
          expenseId: expense.id,
          walletId:
            input.paymentMethod === "COMPANY_WALLET" ? input.walletId : null,
          postedById: input.paidById,
        },
      });

      await tx.auditLog.create({
        data: {
          action: "EXPENSE_REIMBURSED",
          entity: "expense",
          entityId: expense.id,
          details: `${note} — ${input.paymentMethod}, ${totalMajor}`,
          userId: input.paidById,
        },
      });
    }

    return txn;
  });

  await walletService.recomputeBalance(input.employeeId);

  return {
    transaction,
    expenseIds,
    totalMajor,
    totalMinor,
    paymentMethod: input.paymentMethod,
  };
}
