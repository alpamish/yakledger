import { db } from "./db";
import { walletService } from "@/services/wallet.service";

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

export async function applyWalletEffect(
  entity: string,
  record: Record<string, unknown>,
  userId: string
): Promise<void> {
  const cfg = ENTITY_CONFIG[entity]?.wallet;
  if (!cfg) return;

  try {
    if (cfg.type === "expense") {
      const paidById = record.paidById as string | null;
      const amount = record.amount as number;
      if (paidById && amount) {
        await walletService.deductFromWallet(paidById, amount, userId);
      }
    } else if (cfg.type === "cashTransaction") {
      const employeeId = record.employeeId as string;
      const amount = record.amount as number;
      const type = record.type as string;
      if (!employeeId || !amount) return;
      if (type === "ADVANCE" || type === "ADJUSTMENT") {
        await walletService.addBackToWallet(employeeId, amount, userId);
      } else if (type === "RETURN") {
        await walletService.deductFromWallet(employeeId, amount, userId);
      }
    } else if (cfg.type === "transfer") {
      const fromEmployeeId = record.fromEmployeeId as string;
      const toEmployeeId = record.toEmployeeId as string;
      const amount = record.amount as number;
      if (fromEmployeeId && amount) {
        await walletService.deductFromWallet(fromEmployeeId, amount, userId);
      }
      if (toEmployeeId && amount) {
        await walletService.addBackToWallet(toEmployeeId, amount, userId);
      }
    }
  } catch (err) {
    console.warn(`Wallet effect for ${entity} approval failed:`, err);
  }
}
