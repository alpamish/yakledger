import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { companyWalletService } from "@/services/company-wallet.service";
import type { LedgerEntry } from "@/types/expense";
import {
  resolveApprovalStatusOnCreate,
  type ApprovalStatus,
} from "@/lib/access-control";

type Actor = { id: string; role: string };

const APPROVED = "APPROVED" as const;

function createAuditLog(userId: string, entityId: string, action: string, details: string) {
  return db.auditLog.create({
    data: { action, entity: "CashTransaction", entityId, details, userId },
  });
}

async function getOrCreateAccount(employeeId: string) {
  let account = await db.employeeCashAccount.findUnique({
    where: { employeeId },
  });
  if (!account) {
    account = await db.employeeCashAccount.create({
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

  // Approved payroll earnings are stored in minor units.
  const payrollGrossAgg = await client.payrollLine.aggregate({
    _sum: { grossPayMinor: true },
    where: { employeeId, payroll: { status: "APPROVED" } },
  });

  // Approved employee-paid company expenses reduce what the employee owes
  // (money they spent on the company's behalf). Honored only when the expense
  // was flagged to deduct from the wallet.
  const expensesPaidByAgg = await client.expense.aggregate({
    _sum: { amount: true },
    where: {
      paidById: employeeId,
      approvalStatus: APPROVED,
      deductFromWallet: { not: false },
    },
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

  // Net received by employee (cash given to them) minus what they earned via
  // approved payroll and what they spent on approved company expenses.
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
    totalExpensesPaidBy;

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

export const walletService = {
  async createAdvance(
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
        type: "ADVANCE",
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

    await createAuditLog(user.id, txn.id, "CREATE", `Cash advance of ${amount} to employee ${employeeId}`);

    return txn;
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

  async recomputeBalance(employeeId: string) {
    return recalculateBalance(employeeId);
  },

  /**
   * Ensure an employee cash account exists and refresh its derived balance.
   * Used when an approved employee-paid expense is created so the wallet
   * reflects the expense even before any cash-advance activity.
   */
  async reconcileForExpense(employeeId: string) {
    await getOrCreateAccount(employeeId);
    return recalculateBalance(employeeId);
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
      const increasesDebt = txn.type === "ADVANCE" || txn.type === "SALARY_PAYMENT" || txn.type === "ADJUSTMENT";
      entries.push({
        date: txn.createdAt,
        type: txn.type,
        description: txn.note ?? (txn.type === "ADVANCE" ? "Cash Advance" : txn.type === "RETURN" ? "Cash Return" : txn.type === "SALARY_PAYMENT" ? "Salary Payment" : "Adjustment"),
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
   */
  async transferToCompanyWallet(
    employeeId: string,
    walletId: string,
    amount: number,
    user: Actor,
    note?: string,
  ) {
    if (amount <= 0) throw new Error("Amount must be positive");

    const txn = await db.$transaction(async (tx) => {
      const account = await tx.employeeCashAccount.findUnique({
        where: { employeeId },
      });
      if (!account) {
        throw new Error("Employee does not have a wallet");
      }
      if (account.currentBalance < amount) {
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
      `Cash of ${amount} transferred from employee ${employeeId} to wallet ${walletId}`
    );

    return txn;
  },
};
