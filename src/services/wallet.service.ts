import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import type { LedgerEntry } from "@/types/expense";

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

async function recalculateBalance(employeeId: string) {
  const advancesAgg = await db.cashTransaction.aggregate({
    _sum: { amount: true },
    where: { employeeId, type: "ADVANCE" },
  });

  const returnsAgg = await db.cashTransaction.aggregate({
    _sum: { amount: true },
    where: { employeeId, type: "RETURN" },
  });

  const expensesAgg = await db.expense.aggregate({
    _sum: { amount: true },
    where: { paidById: employeeId },
  });

  const transfersFromAgg = await db.transfer.aggregate({
    _sum: { amount: true },
    where: { fromEmployeeId: employeeId },
  });
  const transfersToAgg = await db.transfer.aggregate({
    _sum: { amount: true },
    where: { toEmployeeId: employeeId },
  });

  const totalAdvances = advancesAgg._sum.amount ?? 0;
  const totalReturns = returnsAgg._sum.amount ?? 0;
  const totalExpenses = expensesAgg._sum.amount ?? 0;
  const totalTransfersOut = transfersFromAgg._sum.amount ?? 0;
  const totalTransfersIn = transfersToAgg._sum.amount ?? 0;

  const balance = totalAdvances - totalExpenses - totalReturns + totalTransfersIn - totalTransfersOut;

  await db.employeeCashAccount.update({
    where: { employeeId },
    data: { currentBalance: balance },
  });

  return balance;
}

export const walletService = {
  async createAdvance(
    employeeId: string,
    amount: number,
    userId: string,
    note?: string,
    referenceNumber?: string
  ) {
    if (amount <= 0) throw new Error("Amount must be positive");

    const account = await getOrCreateAccount(employeeId);

    const txn = await db.cashTransaction.create({
      data: {
        employeeId,
        type: "ADVANCE",
        amount,
        note: note ?? null,
        referenceNumber: referenceNumber ?? null,
        createdById: userId,
      },
    });

    const newBalance = account.currentBalance + amount;
    await db.employeeCashAccount.update({
      where: { id: account.id },
      data: { currentBalance: newBalance },
    });

    await createAuditLog(userId, txn.id, "CREATE", `Cash advance of ${amount} to employee ${employeeId}`);

    return txn;
  },

  async createReturn(
    employeeId: string,
    amount: number,
    userId: string,
    note?: string,
    referenceNumber?: string
  ) {
    if (amount <= 0) throw new Error("Amount must be positive");

    const account = await getOrCreateAccount(employeeId);

    const txn = await db.cashTransaction.create({
      data: {
        employeeId,
        type: "RETURN",
        amount,
        note: note ?? null,
        referenceNumber: referenceNumber ?? null,
        createdById: userId,
      },
    });

    const newBalance = account.currentBalance - amount;
    await db.employeeCashAccount.update({
      where: { id: account.id },
      data: { currentBalance: newBalance },
    });

    await createAuditLog(userId, txn.id, "CREATE", `Cash return of ${amount} from employee ${employeeId}`);

    return txn;
  },

  async createAdjustment(
    employeeId: string,
    amount: number,
    userId: string,
    note?: string,
  ) {
    const account = await getOrCreateAccount(employeeId);

    const txn = await db.cashTransaction.create({
      data: {
        employeeId,
        type: "ADJUSTMENT",
        amount,
        note: note ?? null,
        createdById: userId,
      },
    });

    const newBalance = account.currentBalance + amount;
    await db.employeeCashAccount.update({
      where: { id: account.id },
      data: { currentBalance: newBalance },
    });

    await createAuditLog(userId, txn.id, "CREATE", `Adjustment of ${amount} to employee ${employeeId} wallet`);

    return txn;
  },

  async createTransfer(
    fromEmployeeId: string,
    toEmployeeId: string,
    amount: number,
    userId: string,
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

    const transfer = await db.transfer.create({
      data: {
        fromEmployeeId,
        toEmployeeId,
        amount,
        note: note ?? null,
        referenceNumber,
        createdById: userId,
      },
    });

    await db.employeeCashAccount.update({
      where: { id: fromAccount.id },
      data: { currentBalance: { decrement: amount } },
    });

    await db.employeeCashAccount.update({
      where: { id: toAccount.id },
      data: { currentBalance: { increment: amount } },
    });

    await createAuditLog(userId, transfer.id, "CREATE", `Transfer of ${amount} from ${fromEmployeeId} to ${toEmployeeId}`);

    return transfer;
  },

  async deductFromWallet(employeeId: string, amount: number, userId: string) {
    if (amount <= 0) return;
    const account = await getOrCreateAccount(employeeId);
    const newBalance = account.currentBalance - amount;
    await db.employeeCashAccount.update({
      where: { id: account.id },
      data: { currentBalance: newBalance },
    });
  },

  async addBackToWallet(employeeId: string, amount: number, userId: string) {
    if (amount <= 0) return;
    const account = await getOrCreateAccount(employeeId);
    const newBalance = account.currentBalance + amount;
    await db.employeeCashAccount.update({
      where: { id: account.id },
      data: { currentBalance: newBalance },
    });
  },

  async getAccount(employeeId: string) {
    return db.employeeCashAccount.findUnique({
      where: { employeeId },
      include: { employee: { select: { id: true, fullName: true, jobTitle: true, department: true } } },
    });
  },

  async getLedger(employeeId: string): Promise<LedgerEntry[]> {
    const transactions = await db.cashTransaction.findMany({
      where: { employeeId },
      orderBy: { createdAt: "asc" },
    });

    const expenses = await db.expense.findMany({
      where: { paidById: employeeId },
      orderBy: { createdAt: "asc" },
    });

    const entries: { date: Date; type: LedgerEntry["type"]; description: string; amount: number }[] = [];

    for (const txn of transactions) {
      entries.push({
        date: txn.createdAt,
        type: txn.type,
        description: txn.note ?? (txn.type === "ADVANCE" ? "Cash Advance" : txn.type === "RETURN" ? "Cash Return" : "Adjustment"),
        amount: txn.type === "ADVANCE" ? txn.amount : -txn.amount,
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
      where: { fromEmployeeId: employeeId },
      include: { toEmployee: { select: { fullName: true } } },
      orderBy: { createdAt: "asc" },
    });
    const transfersTo = await db.transfer.findMany({
      where: { toEmployeeId: employeeId },
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
};
