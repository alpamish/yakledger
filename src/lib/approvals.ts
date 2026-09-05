import { db } from "./db";
import { Prisma } from "@prisma/client";
import { walletService } from "@/services/wallet.service";
import { companyWalletService } from "@/services/company-wallet.service";

export interface ApprovalEntityConfig {
  model: string;
  permission: string;
  auditEntity: string;
  amountField?: string;
  wallet?: { type: string };
}

export const ENTITY_CONFIG: Record<string, ApprovalEntityConfig> = {
  expense: { model: "expense", permission: "expenses:approve", auditEntity: "Expense", amountField: "amount", wallet: { type: "expense" } },
  timesheet: { model: "timesheet", permission: "timesheets:approve", auditEntity: "Timesheet" },
  fuelUsage: { model: "fuelUsage", permission: "fuelUsage:approve", auditEntity: "FuelUsage", amountField: "totalCost" },
  cashTransaction: { model: "cashTransaction", permission: "cashAdvance:approve", auditEntity: "CashTransaction", amountField: "amount", wallet: { type: "cashTransaction" } },
  transfer: { model: "transfer", permission: "cashAdvance:approve", auditEntity: "Transfer", amountField: "amount", wallet: { type: "transfer" } },
  attendance: { model: "attendance", permission: "employees:approve", auditEntity: "Attendance" },
  assetLog: { model: "assetLog", permission: "assets:approve", auditEntity: "AssetLog" },
};

/**
 * Apply wallet effects for an approved entity. When `tx` is provided, company
 * wallet deductions and employee wallet reconciliation run inside that
 * transaction so the approval and wallet effects are atomic.
 */
export async function applyWalletEffect(
  entity: string,
  record: Record<string, unknown>,
  userId: string,
  tx?: Prisma.TransactionClient
): Promise<void> {
  const cfg = ENTITY_CONFIG[entity]?.wallet;
  if (!cfg) return;

  if (cfg.type === "expense") {
    const paidById = record.paidById as string | null;
    const deductFromWallet = record.deductFromWallet as boolean | null | undefined;
    const walletId = record.walletId as string | null;
    const amount = record.amount as number;
    const id = record.id as string;
    if (paidById && amount && deductFromWallet !== false) {
      try {
        await walletService.reconcileForExpense(paidById, tx);
      } catch (err) {
        console.warn(`Employee wallet reconcile for ${entity} approval failed:`, err);
      }
    }
    if (walletId && amount && id) {
      if (tx) {
        // Caller already owns the transaction — deduct inside it so the
        // approval and wallet deduction are atomic.
        await companyWalletService.deductForExpense(tx, walletId, amount, userId, id);
      } else {
        // Standalone call — wrap in its own transaction.
        await db.$transaction((innerTx) =>
          companyWalletService.deductForExpense(innerTx, walletId, amount, userId, id)
        );
      }
    }
  } else if (cfg.type === "cashTransaction") {
    try {
      const employeeId = record.employeeId as string;
      const amount = record.amount as number;
      const type = record.type as string;
      if (!employeeId || !amount) return;
      if (type === "ADVANCE" || type === "ADJUSTMENT") {
        await walletService.addBackToWallet(employeeId, amount, userId);
      } else if (type === "RETURN") {
        await walletService.deductFromWallet(employeeId, amount, userId);
      }
    } catch (err) {
      console.warn(`Wallet effect for ${entity} approval failed:`, err);
    }
  } else if (cfg.type === "transfer") {
    try {
      const fromEmployeeId = record.fromEmployeeId as string;
      const toEmployeeId = record.toEmployeeId as string;
      const amount = record.amount as number;
      if (fromEmployeeId && amount) {
        await walletService.deductFromWallet(fromEmployeeId, amount, userId);
      }
      if (toEmployeeId && amount) {
        await walletService.addBackToWallet(toEmployeeId, amount, userId);
      }
    } catch (err) {
      console.warn(`Wallet effect for ${entity} approval failed:`, err);
    }
  }
}
