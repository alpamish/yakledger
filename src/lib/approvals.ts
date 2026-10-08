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
    const employeeId = record.employeeId as string;
    const type = record.type as string;
    const id = record.id as string;
    if (!employeeId) return;

    // Approving an advance pays it out: record the payment method and post the
    // company financial transaction (Plan-payroll.pdf §2 action 5). May throw
    // (e.g. company wallet has insufficient funds) so the approval rolls back.
    if (type === "ADVANCE") {
      await walletService.markAdvancePaid(id, userId, undefined, tx ?? db);
    }

    // The approved row itself already carries the balance effect — only
    // recompute, never write a compensating DEBIT row (that would double count).
    try {
      await walletService.recomputeBalance(employeeId, tx);
    } catch (err) {
      console.warn(`Wallet effect for ${entity} approval failed:`, err);
    }
  } else if (cfg.type === "transfer") {
    const fromEmployeeId = record.fromEmployeeId as string;
    const toEmployeeId = record.toEmployeeId as string;
    if (!fromEmployeeId || !toEmployeeId) return;
    // Transfer rows are counted by the balance recompute directly.
    try {
      await walletService.recomputeBalance(fromEmployeeId, tx);
      await walletService.recomputeBalance(toEmployeeId, tx);
    } catch (err) {
      console.warn(`Wallet effect for ${entity} approval failed:`, err);
    }
  }
}
