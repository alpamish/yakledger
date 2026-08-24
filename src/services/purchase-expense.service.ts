import { Prisma } from "@prisma/client";
import { companyWalletService } from "./company-wallet.service";
import { resolveApprovalStatusOnCreate, APPROVED } from "@/lib/access-control";

type Tx = Prisma.TransactionClient;

export interface CreatePurchaseExpenseInput {
  title: string;
  category: string;
  amount: number;
  paymentMethod: string;
  paidTo: string;
  paidBy: string;
  expenseDate: Date;
  notes?: string | null;
  walletId?: string | null;
  assetId?: string | null;
  fuelTransactionId?: string | null;
}

export async function createPurchaseExpense(
  tx: Tx,
  user: { id: string; role: string },
  input: CreatePurchaseExpenseInput
) {
  const approvalStatus = resolveApprovalStatusOnCreate(user);

  const created = await tx.expense.create({
    data: {
      title: input.title,
      category: input.category,
      amount: input.amount,
      paymentMethod: input.paymentMethod,
      paidTo: input.paidTo,
      paidBy: input.paidBy,
      expenseDate: input.expenseDate,
      notes: input.notes ?? null,
      currency: "AFN",
      createdBy: user.id,
      approvalStatus,
      approvedById: approvalStatus === APPROVED ? user.id : null,
      approvedAt: approvalStatus === APPROVED ? new Date() : null,
      walletId: input.walletId ?? null,
      deductFromWallet: false,
      assetId: input.assetId ?? null,
      fuelTransactionId: input.fuelTransactionId ?? null,
    },
  });

  await tx.auditLog.create({
    data: {
      action: "CREATE",
      entity: "Expense",
      entityId: created.id,
      details: `Created purchase expense: ${created.title} (AFN ${created.amount})`,
      userId: user.id,
    },
  });

  if (approvalStatus === APPROVED && input.walletId) {
    await companyWalletService.deductForExpense(
      tx,
      input.walletId,
      input.amount,
      user.id,
      created.id,
      `Expense: ${created.title}`
    );
  }

  return created;
}

export function assetCategoryToExpenseCategory(category: string): string {
  switch (category) {
    case "VEHICLE":
      return "TRANSPORTATION";
    case "MACHINERY":
      return "MACHINERY";
    case "FUEL":
      return "FUEL";
    case "FURNITURE":
    case "LAPTOP":
    case "ELECTRONICS":
    case "OFFICE_EQUIPMENT":
      return "OFFICE_EXPENSE";
    default:
      return "MISCELLANEOUS";
  }
}