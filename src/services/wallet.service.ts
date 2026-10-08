import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { companyWalletService } from "@/services/company-wallet.service";
import type { LedgerEntry } from "@/types/expense";
import {
  resolveApprovalStatusOnCreate,
  type ApprovalStatus,
} from "@/lib/access-control";
import { ALLOCATING_PAYROLL_STATUSES } from "@/lib/payroll-status";

type Actor = { id: string; role: string };

const APPROVED = "APPROVED" as const;

function createAuditLog(userId: string, entityId: string, action: string, details: string) {
  return db.auditLog.create({
    data: { action, entity: "CashTransaction", entityId, details, userId },
  });
}

async function getOrCreateAccount(
  employeeId: string,
  client: Prisma.TransactionClient | typeof db = db
) {
  let account = await client.employeeCashAccount.findUnique({
    where: { employeeId },
  });
  if (!account) {
    account = await client.employeeCashAccount.create({
      data: { employeeId },
    });
  }
  return account;
}

async function recalculateBalance(employeeId: string, client: Prisma.TransactionClient | typeof db = db) {
  const advancesAgg = await client.cashTransaction.aggregate({
    _sum: { amount: true },
    where: { employeeId, type: "ADVANCE", approvalStatus: APPROVED },
  });

  const returnsAgg = await client.cashTransaction.aggregate({
    _sum: { amount: true },
    where: { employeeId, type: "RETURN", approvalStatus: APPROVED },
  });

  const salaryPaymentsAgg = await client.cashTransaction.aggregate({
    _sum: { amount: true },
    where: { employeeId, type: "SALARY_PAYMENT", approvalStatus: APPROVED },
  });

  const adjustmentsAgg = await client.cashTransaction.aggregate({
    _sum: { amount: true },
    where: { employeeId, type: "ADJUSTMENT", approvalStatus: APPROVED },
  });

  const deductionsAgg = await client.cashTransaction.aggregate({
    _sum: { amount: true },
    where: { employeeId, type: "DEBIT", approvalStatus: APPROVED },
  });

  const transfersFromAgg = await client.transfer.aggregate({
    _sum: { amount: true },
    where: { fromEmployeeId: employeeId, approvalStatus: APPROVED },
  });
  const transfersToAgg = await client.transfer.aggregate({
    _sum: { amount: true },
    where: { toEmployeeId: employeeId, approvalStatus: APPROVED },
  });

  // Approved payroll earnings are stored in minor units. A payroll keeps
  // counting as earned while it is being paid (APPROVED → PARTIALLY_PAID →
  // PAID); only drafts / reverted / cancelled payrolls drop out.
  const payrollGrossAgg = await client.payrollLine.aggregate({
    _sum: { grossPayMinor: true },
    where: {
      employeeId,
      payroll: { status: { in: [...ALLOCATING_PAYROLL_STATUSES] } },
    },
  });

  // Approved employee-paid company expenses reduce what the employee owes
  // (money they spent on the company's behalf). Honored only when the expense
  // was flagged to deduct from the wallet. Reimbursements pay that money back
  // to the employee, so they are added again — once an expense is reimbursed
  // the pair nets out to zero.
  const expensesPaidByAgg = await client.expense.aggregate({
    _sum: { amount: true },
    where: {
      paidById: employeeId,
      approvalStatus: APPROVED,
      deductFromWallet: { not: false },
    },
  });
  const reimbursementsAgg = await client.cashTransaction.aggregate({
    _sum: { amount: true },
    where: { employeeId, type: "REIMBURSEMENT", approvalStatus: APPROVED },
  });

  const totalAdvances = advancesAgg._sum.amount ?? 0;
  const totalReturns = returnsAgg._sum.amount ?? 0;
  const totalSalaryPayments = salaryPaymentsAgg._sum.amount ?? 0;
  const totalAdjustments = adjustmentsAgg._sum.amount ?? 0;
  const totalDeductions = deductionsAgg._sum.amount ?? 0;
  const totalTransfersOut = transfersFromAgg._sum.amount ?? 0;
  const totalTransfersIn = transfersToAgg._sum.amount ?? 0;
  const totalEarned = (payrollGrossAgg._sum.grossPayMinor ?? 0) / 100;
  const totalExpensesPaidBy = expensesPaidByAgg._sum.amount ?? 0;
  const totalReimbursements = reimbursementsAgg._sum.amount ?? 0;

  // Net received by employee (cash given to them) minus what they earned via
  // approved payroll and what they spent on approved company expenses, plus
  // reimbursements paid back to them.
  // Positive => employee owes the company.
  const balance =
    totalAdvances +
    totalSalaryPayments +
    totalAdjustments -
    totalReturns -
    totalDeductions -
    totalEarned +
    totalTransfersIn -
    totalTransfersOut -
    totalExpensesPaidBy +
    totalReimbursements;

  // Only update an existing account. Payroll approval/revert recomputes must
  // never create a wallet for an employee who has had no cash activity.
  const account = await client.employeeCashAccount.findUnique({
    where: { employeeId },
  });
  if (!account) return balance;
  await client.employeeCashAccount.update({
    where: { employeeId },
    data: { currentBalance: balance },
  });

  return balance;
}

/**
 * Record an advance as paid (Plan-payroll.pdf §2 action 5): stores the payment
 * method and `paidAt`, posts the matching company financial transaction and —
 * when the advance is paid from a company wallet — debits that wallet.
 * Idempotent: an advance that is already paid is left alone.
 */
async function markAdvancePaid(
  txnId: string,
  userId: string,
  opts?: { paymentMethod?: string | null; walletId?: string | null },
  client: Prisma.TransactionClient | typeof db = db
) {
  const txn = await client.cashTransaction.findUnique({ where: { id: txnId } });
  if (!txn || txn.type !== "ADVANCE") return txn;
  if (txn.paidAt) return txn;

  const paymentMethod = opts?.paymentMethod ?? txn.paymentMethod ?? "CASH";
  const walletId = opts?.walletId ?? txn.walletId ?? null;

  if (paymentMethod === "COMPANY_WALLET" && !walletId) {
    throw new Error("Paying an advance from a company wallet requires a wallet");
  }

  const updated = await client.cashTransaction.update({
    where: { id: txnId },
    data: { paidAt: new Date(), paymentMethod, walletId },
  });

  // Negative amount = the company paid money out.
  await client.accountingEntry.create({
    data: {
      type: "ADVANCE_PAYMENT",
      amountMinor: -Math.round(txn.amount * 100),
      description: `Cash advance paid via ${paymentMethod}`,
      cashTransactionId: txnId,
      walletId,
      postedById: userId,
    },
  });

  if (paymentMethod === "COMPANY_WALLET" && walletId) {
    await companyWalletService.deductForAdvance(
      client,
      walletId,
      txn.amount,
      userId,
      `Cash advance for employee ${txn.employeeId}`
    );
  }

  return updated;
}

export const walletService = {
  markAdvancePaid,

  async createAdvance(
    employeeId: string,
    amount: number,
    user: Actor,
    opts?: {
      note?: string;
      referenceNumber?: string;
      dueDate?: Date | null;
      paymentMethod?: string | null;
      walletId?: string | null;
    }
  ) {
    if (amount <= 0) throw new Error("Amount must be positive");
    if (opts?.paymentMethod === "COMPANY_WALLET" && !opts?.walletId) {
      throw new Error("Paying an advance from a company wallet requires a wallet");
    }

    const account = await getOrCreateAccount(employeeId);

    const approvalStatus = resolveApprovalStatusOnCreate(user);
    const txn = await db.$transaction(async (tx) => {
      const created = await tx.cashTransaction.create({
        data: {
          employeeId,
          type: "ADVANCE",
          amount,
          note: opts?.note ?? null,
          referenceNumber: opts?.referenceNumber ?? null,
          dueDate: opts?.dueDate ?? null,
          paymentMethod: opts?.paymentMethod ?? null,
          walletId: opts?.walletId ?? null,
          createdBy: user.id,
          approvalStatus,
          approvedById: approvalStatus === APPROVED ? user.id : null,
          approvedAt: approvalStatus === APPROVED ? new Date() : null,
        },
      });
      if (approvalStatus === APPROVED) {
        // Born approved = the cash is handed over right away, so record the
        // payment and the company financial transaction atomically.
        await markAdvancePaid(
          created.id,
          user.id,
          { paymentMethod: opts?.paymentMethod, walletId: opts?.walletId },
          tx
        );
      }
      return created;
    });

    if (approvalStatus === APPROVED) {
      await recalculateBalance(employeeId);
    }

    await createAuditLog(user.id, txn.id, "CREATE", `Cash advance of ${amount} to employee ${employeeId}`);

    return db.cashTransaction.findUnique({ where: { id: txn.id } });
  },

  /**
   * Edit a cash advance. Editing a *paid* advance is an allowed exception
   * (Plan-payroll.pdf §2 action 3) for users holding `cashAdvance:edit`;
   * amount changes additionally trigger payroll recalculation / adjustment
   * (action 4) which the caller kicks off with the returned `amountChanged`.
   */
  async updateAdvance(
    txnId: string,
    user: Actor,
    updates: {
      amount?: number;
      note?: string | null;
      referenceNumber?: string | null;
      dueDate?: Date | null;
      paymentMethod?: string | null;
      walletId?: string | null;
    }
  ) {
    const existing = await db.cashTransaction.findUnique({ where: { id: txnId } });
    if (!existing) throw new Error("Transaction not found");
    if (existing.type !== "ADVANCE") {
      throw new Error("Only cash advances can be edited");
    }
    if (updates.amount !== undefined && updates.amount <= 0) {
      throw new Error("Amount must be positive");
    }

    const data: Prisma.CashTransactionUpdateInput = {};
    const changes: Record<string, string> = {};

    if (updates.amount !== undefined && updates.amount !== existing.amount) {
      data.amount = updates.amount;
      changes.amount = `${existing.amount} -> ${updates.amount}`;
    }
    if (updates.note !== undefined && (updates.note ?? null) !== existing.note) {
      data.note = updates.note ?? null;
      changes.note = `${existing.note ?? ""} -> ${updates.note ?? ""}`;
    }
    if (
      updates.referenceNumber !== undefined &&
      (updates.referenceNumber ?? null) !== existing.referenceNumber
    ) {
      data.referenceNumber = updates.referenceNumber ?? null;
      changes.referenceNumber = `${existing.referenceNumber ?? ""} -> ${updates.referenceNumber ?? ""}`;
    }
    if (updates.dueDate !== undefined) {
      const next = updates.dueDate ?? null;
      const prev = existing.dueDate ?? null;
      if ((next?.getTime() ?? null) !== (prev?.getTime() ?? null)) {
        data.dueDate = next;
        changes.dueDate = `${prev?.toISOString() ?? "-"} -> ${next?.toISOString() ?? "-"}`;
      }
    }

    const oldAmountMinor = Math.round(existing.amount * 100);
    const newAmountMinor =
      updates.amount !== undefined ? Math.round(updates.amount * 100) : oldAmountMinor;

    if (Object.keys(changes).length === 0) {
      return { transaction: existing, amountChanged: false, oldAmountMinor, newAmountMinor };
    }

    const updated = await db.$transaction(async (tx) => {
      const u = await tx.cashTransaction.update({
        where: { id: txnId },
        data: { ...data, editedById: user.id, editedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          action: "UPDATE",
          entity: "CashTransaction",
          entityId: txnId,
          details: `Edited cash advance: ${Object.entries(changes)
            .map(([k, v]) => `${k} (${v})`)
            .join(", ")}`,
          userId: user.id,
        },
      });
      return u;
    });

    if (existing.approvalStatus === APPROVED) {
      await recalculateBalance(existing.employeeId);
    }

    return {
      transaction: updated,
      amountChanged: changes.amount !== undefined,
      oldAmountMinor,
      newAmountMinor,
    };
  },

  async createReturn(
    employeeId: string,
    amount: number,
    user: Actor,
    note?: string,
    referenceNumber?: string
  ) {
    if (amount <= 0) throw new Error("Amount must be positive");

    const account = await getOrCreateAccount(employeeId);

    const approvalStatus = resolveApprovalStatusOnCreate(user);
    const txn = await db.cashTransaction.create({
      data: {
        employeeId,
        type: "RETURN",
        amount,
        note: note ?? null,
        referenceNumber: referenceNumber ?? null,
        createdBy: user.id,
        approvalStatus,
        approvedById: approvalStatus === APPROVED ? user.id : null,
        approvedAt: approvalStatus === APPROVED ? new Date() : null,
      },
    });

    if (approvalStatus === APPROVED) {
      await recalculateBalance(employeeId);
    }

    await createAuditLog(user.id, txn.id, "CREATE", `Cash return of ${amount} from employee ${employeeId}`);

    return txn;
  },

  async createAdjustment(
    employeeId: string,
    amount: number,
    user: Actor,
    note?: string,
  ) {
    const account = await getOrCreateAccount(employeeId);

    const approvalStatus = resolveApprovalStatusOnCreate(user);
    const txn = await db.cashTransaction.create({
      data: {
        employeeId,
        type: "ADJUSTMENT",
        amount,
        note: note ?? null,
        createdBy: user.id,
        approvalStatus,
        approvedById: approvalStatus === APPROVED ? user.id : null,
        approvedAt: approvalStatus === APPROVED ? new Date() : null,
      },
    });

    if (approvalStatus === APPROVED) {
      await recalculateBalance(employeeId);
    }

    await createAuditLog(user.id, txn.id, "CREATE", `Adjustment of ${amount} to employee ${employeeId} wallet`);

    return txn;
  },

  async createTransfer(
    fromEmployeeId: string,
    toEmployeeId: string,
    amount: number,
    user: Actor,
    note?: string,
  ) {
    if (fromEmployeeId === toEmployeeId) {
      throw new Error("Cannot transfer to the same employee");
    }
    if (amount <= 0) {
      throw new Error("Amount must be positive");
    }

    const fromAccount = await getOrCreateAccount(fromEmployeeId);
    const toAccount = await getOrCreateAccount(toEmployeeId);

    const referenceNumber = `TRF-${Date.now()}`;

    const approvalStatus = resolveApprovalStatusOnCreate(user);
    const transfer = await db.transfer.create({
      data: {
        fromEmployeeId,
        toEmployeeId,
        amount,
        note: note ?? null,
        referenceNumber,
        createdBy: user.id,
        approvalStatus,
        approvedById: approvalStatus === APPROVED ? user.id : null,
        approvedAt: approvalStatus === APPROVED ? new Date() : null,
      },
    });

    if (approvalStatus === APPROVED) {
      await recalculateBalance(fromEmployeeId);
      await recalculateBalance(toEmployeeId);
    }

    await createAuditLog(user.id, transfer.id, "CREATE", `Transfer of ${amount} from ${fromEmployeeId} to ${toEmployeeId}`);

    return transfer;
  },

  async createSalaryPayment(
    employeeId: string,
    amountMinor: number,
    userId: string,
    opts?: { note?: string; referenceNumber?: string; method?: string; payrollId?: string }
  ) {
    if (amountMinor <= 0) return null;
    const account = await getOrCreateAccount(employeeId);
    const amount = amountMinor / 100;

    const txn = await db.cashTransaction.create({
      data: {
        employeeId,
        type: "SALARY_PAYMENT",
        amount,
        note: opts?.note ?? (opts?.payrollId ? `Salary payment ${opts.payrollId}` : "Salary payment"),
        referenceNumber: opts?.referenceNumber ?? null,
        createdBy: userId,
        approvalStatus: APPROVED,
        approvedById: userId,
        approvedAt: new Date(),
      },
    });

    await recalculateBalance(employeeId);
    void account;
    return txn;
  },

  async deductFromWallet(employeeId: string, amount: number, userId: string) {
    if (amount <= 0) return;
    await getOrCreateAccount(employeeId);
    await db.cashTransaction.create({
      data: {
        employeeId,
        type: "DEBIT",
        amount,
        note: "Wallet deduction",
        createdBy: userId,
        approvalStatus: APPROVED,
        approvedById: userId,
        approvedAt: new Date(),
      },
    });
    await recalculateBalance(employeeId);
  },

  async addBackToWallet(employeeId: string, amount: number, userId: string) {
    if (amount <= 0) return;
    // Add-back reverses a deduction: record a negative DEBIT so the ledger
    // and derived balance both increase by `amount`.
    await getOrCreateAccount(employeeId);
    await db.cashTransaction.create({
      data: {
        employeeId,
        type: "DEBIT",
        amount: -amount,
        note: "Wallet add-back",
        createdBy: userId,
        approvalStatus: APPROVED,
        approvedById: userId,
        approvedAt: new Date(),
      },
    });
    await recalculateBalance(employeeId);
  },

  async getAccount(employeeId: string) {
    return db.employeeCashAccount.findUnique({
      where: { employeeId },
      include: { employee: { select: { id: true, fullName: true, jobTitle: true, department: true } } },
    });
  },

  async recomputeBalance(employeeId: string, client?: Prisma.TransactionClient) {
    return recalculateBalance(employeeId, client ?? db);
  },

  /**
   * Ensure an employee cash account exists and refresh its derived balance.
   * Used when an approved employee-paid expense is created so the wallet
   * reflects the expense even before any cash-advance activity.
   */
  async reconcileForExpense(employeeId: string, client?: Prisma.TransactionClient) {
    const cx = client ?? db;
    await getOrCreateAccount(employeeId, cx);
    return recalculateBalance(employeeId, cx);
  },

  async getLedger(employeeId: string): Promise<LedgerEntry[]> {
    const transactions = await db.cashTransaction.findMany({
      where: { employeeId, approvalStatus: APPROVED },
      orderBy: { createdAt: "asc" },
    });

    const expenses = await db.expense.findMany({
      where: { paidById: employeeId, approvalStatus: APPROVED },
      orderBy: { createdAt: "asc" },
    });

    const entries: { date: Date; type: LedgerEntry["type"]; description: string; amount: number }[] = [];

    for (const txn of transactions) {
      // Sign convention must match `recalculateBalance`: amounts that increase
      // what the employee owes (ADVANCE, SALARY_PAYMENT, ADJUSTMENT) are shown
      // positive; amounts that reduce it (RETURN, DEBIT) are shown negative.
      // A reimbursement is cash paid back to the employee, so like a payment
      // it increases their balance and cancels out the EXPENSE entry.
      const increasesDebt =
        txn.type === "ADVANCE" ||
        txn.type === "SALARY_PAYMENT" ||
        txn.type === "ADJUSTMENT" ||
        txn.type === "REIMBURSEMENT";
      entries.push({
        date: txn.createdAt,
        type: txn.type,
        description:
          txn.note ??
          (txn.type === "ADVANCE"
            ? "Cash Advance"
            : txn.type === "RETURN"
              ? "Cash Return"
              : txn.type === "SALARY_PAYMENT"
                ? "Salary Payment"
                : txn.type === "REIMBURSEMENT"
                  ? "Expense Reimbursement"
                  : "Adjustment"),
        amount: increasesDebt ? txn.amount : -txn.amount,
      });
    }

    for (const exp of expenses) {
      entries.push({
        date: exp.expenseDate,
        type: "EXPENSE",
        description: `${exp.title} (${exp.category})`,
        amount: -exp.amount,
      });
    }

    const transfersFrom = await db.transfer.findMany({
      where: { fromEmployeeId: employeeId, approvalStatus: APPROVED },
      include: { toEmployee: { select: { fullName: true } } },
      orderBy: { createdAt: "asc" },
    });
    const transfersTo = await db.transfer.findMany({
      where: { toEmployeeId: employeeId, approvalStatus: APPROVED },
      include: { fromEmployee: { select: { fullName: true } } },
      orderBy: { createdAt: "asc" },
    });

    for (const trf of transfersFrom) {
      entries.push({
        date: trf.createdAt,
        type: "TRANSFER",
        description: `Transfer to ${trf.toEmployee?.fullName ?? "Unknown"}${trf.note ? ` - ${trf.note}` : ""}`,
        amount: -trf.amount,
      });
    }
    for (const trf of transfersTo) {
      entries.push({
        date: trf.createdAt,
        type: "TRANSFER",
        description: `Transfer from ${trf.fromEmployee?.fullName ?? "Unknown"}${trf.note ? ` - ${trf.note}` : ""}`,
        amount: trf.amount,
      });
    }

    entries.sort((a, b) => a.date.getTime() - b.date.getTime());

    let running = 0;
    return entries.map((e, i) => {
      running += e.amount;
      return {
        id: `entry-${i}`,
        date: e.date.toISOString(),
        type: e.type,
        description: e.description,
        amount: e.amount,
        runningBalance: running,
      };
    });
  },

  async getFilteredLedger(
    employeeId: string,
    options?: { dateFrom?: string; dateTo?: string; page?: number; pageSize?: number }
  ): Promise<{ ledger: LedgerEntry[]; total: number; page: number; pageSize: number }> {
    const fullLedger = await this.getLedger(employeeId);

    let filtered = fullLedger;
    if (options?.dateFrom) {
      const from = new Date(options.dateFrom);
      from.setHours(0, 0, 0, 0);
      filtered = filtered.filter((e) => new Date(e.date) >= from);
    }
    if (options?.dateTo) {
      const to = new Date(options.dateTo);
      to.setHours(23, 59, 59, 999);
      filtered = filtered.filter((e) => new Date(e.date) <= to);
    }

    const total = filtered.length;
    const page = Math.max(1, options?.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, options?.pageSize ?? 10));
    const skip = (page - 1) * pageSize;
    const paginated = filtered.slice(skip, skip + pageSize);

    return { ledger: paginated, total, page, pageSize };
  },

  async getAccountWithLedger(employeeId: string) {
    const account = await this.getAccount(employeeId);
    const ledger = await this.getLedger(employeeId);
    return { account, ledger };
  },

  async getAllAccounts() {
    return db.employeeCashAccount.findMany({
      include: {
        employee: {
          select: { id: true, fullName: true, jobTitle: true, department: true, status: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    });
  },

  async reverseLastDeduction(employeeId: string, amount: number, userId: string) {
    return this.addBackToWallet(employeeId, amount, userId);
  },

  /**
   * Transfer cash held by an employee (their wallet balance) into a company
   * wallet. Records an approved RETURN on the employee ledger and credits the
   * company wallet with a TRANSFER_IN, atomically.
   *
   * When `force` is true the balance check is skipped, allowing the company to
   * receive cash even when the employee's balance is zero or negative (the
   * company already owes them). The employee balance will go further negative.
   */
  async transferToCompanyWallet(
    employeeId: string,
    walletId: string,
    amount: number,
    user: Actor,
    note?: string,
    force?: boolean,
  ) {
    if (amount <= 0) throw new Error("Amount must be positive");

    const txn = await db.$transaction(async (tx) => {
      const account = await tx.employeeCashAccount.findUnique({
        where: { employeeId },
      });
      if (!account) {
        throw new Error("Employee does not have a wallet");
      }
      if (!force && account.currentBalance < amount) {
        throw new Error("Insufficient employee wallet balance");
      }

      const wallet = await tx.wallet.findUnique({ where: { id: walletId } });
      if (!wallet) throw new Error("Selected wallet not found");

      const returned = await tx.cashTransaction.create({
        data: {
          employeeId,
          type: "RETURN",
          amount,
          note: note ?? `Transferred to wallet ${wallet.name}`,
          walletId,
          createdBy: user.id,
          approvalStatus: APPROVED,
          approvedById: user.id,
          approvedAt: new Date(),
        },
      });

      await companyWalletService.creditFromEmployee(
        tx,
        walletId,
        amount,
        user.id,
        `Transfer in from employee (${note ?? "wallet return"})`
      );

      await recalculateBalance(employeeId, tx);

      return returned;
    });

    await createAuditLog(
      user.id,
      txn.id,
      "CREATE",
      `Cash of ${amount} transferred from employee ${employeeId} to wallet ${walletId}${force ? " (forced)" : ""}`
    );

    return txn;
  },
};
