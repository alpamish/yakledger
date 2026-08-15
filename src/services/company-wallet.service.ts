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
  payrollId?: string | null
) {
  await tx.walletTransaction.create({
    data: {
      walletId,
      type,
      amount,
      note: note ?? null,
      payrollId: payrollId ?? null,
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

export const companyWalletService = {
  async list() {
    return db.wallet.findMany({
      orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
    });
  },

  async listActive() {
    return db.wallet.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "asc" },
    });
  },

  async get(id: string) {
    return db.wallet.findUnique({
      where: { id },
      include: {
        transactions: { orderBy: { createdAt: "desc" } },
      },
    });
  },

  async create(data: {
    name: string;
    type?: string;
    currency?: string;
    initialBalance?: number;
    createdBy: string;
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
      // Re-read so the returned wallet reflects the seeded balance.
      return tx.wallet.findUnique({ where: { id: wallet.id } });
    });
  },

  async update(
    id: string,
    data: { name?: string; type?: string; currency?: string }
  ) {
    return db.wallet.update({ where: { id }, data });
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
    if (wallet.balance < amount) {
      throw new Error(
        `Insufficient balance in wallet "${wallet.name}" (${wallet.balance} ${wallet.currency}). Fund it before approving payroll.`
      );
    }
    await apply(tx, walletId, "PAYROLL", -amount, createdBy, "Payroll salary payment", payrollId);
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