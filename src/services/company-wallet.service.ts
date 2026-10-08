import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

/**
 * Company wallet service.
 *
 * Company wallets are cash/bank accounts the business draws from (e.g. to pay
 * salaries). Wallet `balance` is derived: it always equals the sum of the
 * wallet's `WalletTransaction` amounts, so it can be recomputed from the ledger.
 *
 * Signed transaction convention: `amount` is positive when it increases the
 * wallet balance and negative when it decreases it.
 */
type Tx = Prisma.TransactionClient;

async function apply(
  tx: Tx,
  walletId: string,
  type: string,
  amount: number,
  createdBy: string,
  note?: string,
  payrollId?: string | null,
  expenseId?: string | null
) {
  await tx.walletTransaction.create({
    data: {
      walletId,
      type,
      amount,
      note: note ?? null,
      payrollId: payrollId ?? null,
      expenseId: expenseId ?? null,
      createdBy,
    },
  });
  // Keep the stored balance in sync with the ledger.
  const agg = await tx.walletTransaction.aggregate({
    _sum: { amount: true },
    where: { walletId },
  });
  const balance = agg._sum.amount ?? 0;
  return tx.wallet.update({ where: { id: walletId }, data: { balance } });
}

const employeeSelect = {
  id: true,
  employee: { select: { id: true, fullName: true, jobTitle: true, department: true } },
};

const userSelect = {
  id: true,
  user: { select: { id: true, name: true, email: true, role: true } },
};

const ADMIN_ROLES = ["ADMIN", "MANAGER"];

function walletInclude() {
  return {
    employees: { select: employeeSelect },
    users: { select: userSelect },
  };
}

export const companyWalletService = {
  async list() {
    return db.wallet.findMany({
      orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
      include: walletInclude(),
    });
  },

  async listForUser(userId: string, role: string) {
    if (ADMIN_ROLES.includes(role)) {
      return this.list();
    }
    return db.wallet.findMany({
      where: {
        OR: [
          { users: { some: { userId } } },
          { users: { none: {} } },
        ],
      },
      orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
      include: walletInclude(),
    });
  },

  async listActive() {
    return db.wallet.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "asc" },
      include: walletInclude(),
    });
  },

  async listActiveForEmployee(employeeId: string) {
    return db.wallet.findMany({
      where: {
        isActive: true,
        OR: [
          { employees: { none: {} } },
          { employees: { some: { employeeId } } },
        ],
      },
      orderBy: { createdAt: "asc" },
      include: walletInclude(),
    });
  },

  async hasUserAccess(walletId: string, userId: string, role: string): Promise<boolean> {
    if (ADMIN_ROLES.includes(role)) return true;
    const wallet = await db.wallet.findUnique({
      where: { id: walletId },
      include: { users: { select: { userId: true } } },
    });
    if (!wallet) return false;
    if (wallet.users.length === 0) return true;
    return wallet.users.some((wu) => wu.userId === userId);
  },

  async get(id: string) {
    return db.wallet.findUnique({
      where: { id },
      include: {
        transactions: { orderBy: { createdAt: "desc" } },
        ...walletInclude(),
      },
    });
  },

  async listTransactions(params: {
    walletId?: string;
    allowedWalletIds?: string[];
    type?: string;
    from?: string;
    to?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));

    const where: Prisma.WalletTransactionWhereInput = {};
    if (params.walletId) {
      where.walletId = params.walletId;
    } else if (params.allowedWalletIds) {
      where.walletId = { in: params.allowedWalletIds };
    }
    if (params.type) where.type = params.type;
    if (params.from || params.to) {
      where.createdAt = {};
      if (params.from) (where.createdAt as Prisma.DateTimeFilter).gte = new Date(params.from);
      if (params.to) (where.createdAt as Prisma.DateTimeFilter).lte = new Date(params.to);
    }
    if (params.search) where.note = { contains: params.search };

    const [data, total] = await Promise.all([
      db.walletTransaction.findMany({
        where,
        include: { wallet: { select: { id: true, name: true, currency: true } } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.walletTransaction.count({ where }),
    ]);

    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  },

  async create(data: {
    name: string;
    type?: string;
    currency?: string;
    initialBalance?: number;
    createdBy: string;
    employeeIds?: string[];
    userIds?: string[];
  }) {
    return db.$transaction(async (tx) => {
      const wallet = await tx.wallet.create({
        data: {
          name: data.name,
          type: data.type ?? "CASH",
          currency: data.currency ?? "AFN",
          balance: 0,
        },
      });
      const initial = data.initialBalance ?? 0;
      if (initial !== 0) {
        await apply(
          tx,
          wallet.id,
          initial > 0 ? "FUNDING" : "ADJUSTMENT",
          initial,
          data.createdBy,
          "Initial balance"
        );
      }
      if (data.employeeIds && data.employeeIds.length > 0) {
        await tx.walletEmployee.createMany({
          data: data.employeeIds.map((employeeId) => ({
            walletId: wallet.id,
            employeeId,
          })),
        });
      }
      if (data.userIds && data.userIds.length > 0) {
        await tx.walletUser.createMany({
          data: data.userIds.map((userId) => ({
            walletId: wallet.id,
            userId,
          })),
        });
      }
      return tx.wallet.findUnique({
        where: { id: wallet.id },
        include: walletInclude(),
      });
    });
  },

  async update(
    id: string,
    data: { name?: string; type?: string; currency?: string; employeeIds?: string[]; userIds?: string[] }
  ) {
    const { employeeIds, userIds, ...walletData } = data;
    return db.$transaction(async (tx) => {
      const updated = await tx.wallet.update({ where: { id }, data: walletData });
      if (employeeIds !== undefined) {
        await tx.walletEmployee.deleteMany({ where: { walletId: id } });
        if (employeeIds.length > 0) {
          await tx.walletEmployee.createMany({
            data: employeeIds.map((employeeId) => ({
              walletId: id,
              employeeId,
            })),
          });
        }
      }
      if (userIds !== undefined) {
        await tx.walletUser.deleteMany({ where: { walletId: id } });
        if (userIds.length > 0) {
          await tx.walletUser.createMany({
            data: userIds.map((userId) => ({
              walletId: id,
              userId,
            })),
          });
        }
      }
      return tx.wallet.findUnique({
        where: { id },
        include: walletInclude(),
      });
    });
  },

  async assignEmployees(walletId: string, employeeIds: string[]) {
    return db.$transaction(async (tx) => {
      await tx.walletEmployee.deleteMany({ where: { walletId } });
      if (employeeIds.length > 0) {
        await tx.walletEmployee.createMany({
          data: employeeIds.map((employeeId) => ({
            walletId,
            employeeId,
          })),
        });
      }
      return tx.wallet.findUnique({
        where: { id: walletId },
        include: walletInclude(),
      });
    });
  },

  async setActive(id: string, isActive: boolean) {
    return db.wallet.update({ where: { id }, data: { isActive } });
  },

  async fund(id: string, amount: number, createdBy: string, note?: string) {
    if (amount <= 0) throw new Error("Amount must be positive");
    return db.$transaction((tx) =>
      apply(tx, id, "FUNDING", amount, createdBy, note ?? "Wallet funding")
    );
  },

  async adjust(id: string, amount: number, createdBy: string, note?: string) {
    if (amount === 0) throw new Error("Amount must not be zero");
    return db.$transaction((tx) =>
      apply(tx, id, "ADJUSTMENT", amount, createdBy, note ?? "Manual adjustment")
    );
  },

  async transfer(
    fromId: string,
    toId: string,
    amount: number,
    createdBy: string,
    note?: string
  ) {
    if (fromId === toId) throw new Error("Cannot transfer to the same wallet");
    if (amount <= 0) throw new Error("Amount must be positive");
    return db.$transaction(async (tx) => {
      const from = await tx.wallet.findUnique({ where: { id: fromId } });
      if (!from) throw new Error("Source wallet not found");
      if (from.balance < amount) {
        throw new Error(`Insufficient balance in wallet "${from.name}"`);
      }
      await apply(tx, fromId, "TRANSFER_OUT", -amount, createdBy, note ?? "Transfer out");
      await apply(tx, toId, "TRANSFER_IN", amount, createdBy, note ?? "Transfer in");
      return true;
    });
  },

  /**
   * Deduct `amount` from a wallet as a payroll salary payment. Call inside the
   * payroll approval transaction. Validates the wallet is active and has
   * sufficient balance; throws otherwise.
   */
  async deductForPayroll(
    tx: Tx,
    walletId: string,
    amount: number,
    payrollId: string,
    createdBy: string
  ) {
    if (amount <= 0) return;
    const wallet = await tx.wallet.findUnique({ where: { id: walletId } });
    if (!wallet) throw new Error("Selected wallet not found");
    if (!wallet.isActive) {
      throw new Error(`Wallet "${wallet.name}" is inactive`);
    }
    const agg = await tx.walletTransaction.aggregate({
      _sum: { amount: true },
      where: { walletId },
    });
    const currentBalance = agg._sum.amount ?? 0;
    if (currentBalance < amount) {
      throw new Error(
        `Insufficient balance in wallet "${wallet.name}" (${currentBalance} ${wallet.currency}). Fund it before approving payroll.`
      );
    }
    await apply(tx, walletId, "PAYROLL", -amount, createdBy, "Payroll salary payment", payrollId);
  },

  /**
   * Deduct `amount` from a wallet for a cash advance paid to an employee.
   * Call inside the advance payment transaction. Validates the wallet is active
   * and has sufficient balance; throws otherwise.
   */
  async deductForAdvance(
    tx: Tx,
    walletId: string,
    amount: number,
    createdBy: string,
    note?: string
  ) {
    if (amount <= 0) return;
    const wallet = await tx.wallet.findUnique({ where: { id: walletId } });
    if (!wallet) throw new Error("Selected wallet not found");
    if (!wallet.isActive) {
      throw new Error(`Wallet "${wallet.name}" is inactive`);
    }
    const agg = await tx.walletTransaction.aggregate({
      _sum: { amount: true },
      where: { walletId },
    });
    const currentBalance = agg._sum.amount ?? 0;
    if (currentBalance < amount) {
      throw new Error(
        `Insufficient balance in wallet "${wallet.name}" (${currentBalance} ${wallet.currency}). Fund it before paying the advance.`
      );
    }
    await apply(
      tx,
      walletId,
      "ADVANCE",
      -amount,
      createdBy,
      note ?? "Cash advance payment"
    );
  },

  /**
   * Reverse any wallet deductions made for a payroll. Call inside the payroll
   * revert transaction.
   */
  async reversePayrollDeduction(tx: Tx, payrollId: string, createdBy: string) {
    const rows = await tx.walletTransaction.findMany({
      where: { payrollId, type: "PAYROLL" },
    });
    for (const r of rows) {
      await apply(
        tx,
        r.walletId,
        "REVERSAL",
        -r.amount,
        createdBy,
        "Payroll reverted",
        payrollId
      );
    }
  },

  /**
   * Credit a wallet with cash transferred in from an employee wallet. Call
   * inside a transaction so it can be paired with the employee's RETURN ledger
   * entry atomically. Validates the wallet exists and is active.
   */
  async creditFromEmployee(
    tx: Tx,
    walletId: string,
    amount: number,
    createdBy: string,
    note?: string
  ) {
    if (amount <= 0) throw new Error("Amount must be positive");
    const wallet = await tx.wallet.findUnique({ where: { id: walletId } });
    if (!wallet) throw new Error("Selected wallet not found");
    if (!wallet.isActive) {
      throw new Error(`Wallet "${wallet.name}" is inactive`);
    }
    return apply(tx, walletId, "TRANSFER_IN", amount, createdBy, note ?? "Transfer in from employee");
  },

  /**
   * Deduct `amount` from a wallet for an approved expense. Call inside the
   * expense create/update transaction. Validates the wallet is active and has
   * sufficient balance; throws otherwise so the expense is not saved.
   */
  async deductForExpense(
    tx: Tx,
    walletId: string,
    amount: number,
    createdBy: string,
    expenseId: string,
    note?: string
  ) {
    if (amount <= 0) throw new Error("Amount must be positive");
    const wallet = await tx.wallet.findUnique({ where: { id: walletId } });
    if (!wallet) throw new Error("Selected wallet not found");
    if (!wallet.isActive) {
      throw new Error(`Wallet "${wallet.name}" is inactive`);
    }
    // Recompute balance from the ledger instead of relying on the cached field,
    // which may be stale under concurrent writes.
    const agg = await tx.walletTransaction.aggregate({
      _sum: { amount: true },
      where: { walletId },
    });
    const currentBalance = agg._sum.amount ?? 0;
    if (currentBalance < amount) {
      throw new Error(
        `Insufficient balance in wallet "${wallet.name}" (${currentBalance} ${wallet.currency}). Fund it before deducting this expense.`
      );
    }
    await apply(tx, walletId, "EXPENSE", -amount, createdBy, note ?? "Expense payment", null, expenseId);
  },

  /**
   * Credit a wallet back for an expense that was previously deducted (e.g.
   * the expense was edited or deleted). Call inside the expense update/delete
   * transaction so it stays atomic with the expense mutation.
   */
  async reverseExpenseDeduction(
    tx: Tx,
    walletId: string,
    amount: number,
    createdBy: string,
    expenseId: string
  ) {
    if (amount <= 0) return;
    const wallet = await tx.wallet.findUnique({ where: { id: walletId } });
    if (!wallet) return;
    await apply(tx, walletId, "REVERSAL", amount, createdBy, "Expense reverted", null, expenseId);
  },

  async recomputeBalance(id: string) {
    return db.$transaction(async (tx) => {
      const agg = await tx.walletTransaction.aggregate({
        _sum: { amount: true },
        where: { walletId: id },
      });
      const balance = agg._sum.amount ?? 0;
      await tx.wallet.update({ where: { id }, data: { balance } });
      return balance;
    });
  },
};