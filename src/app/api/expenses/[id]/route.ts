import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { walletService } from "@/services/wallet.service";
import { companyWalletService } from "@/services/company-wallet.service";
import {
  buildAccessScope,
  withScope,
  resolveApprovalStatusOnEdit,
  APPROVED,
  PENDING,
} from "@/lib/access-control";

// Schema for updating an expense (all fields optional)
const updateExpenseSchema = z.object({
  title: z.string().min(1, "Title is required").optional(),
  description: z.string().optional().nullable(),
  category: z
    .enum([
      "FUEL",
      "SALARY",
      "MAINTENANCE",
      "TRANSPORTATION",
      "MACHINERY",
      "MACHINERY_TRANSPORTATION",
      "FOOD",
      "MATERIALS",
      "EQUIPMENT_RENTAL",
      "OFFICE_EXPENSE",
      "REWARD",
      "BONUS",
      "MEDICATION",
      "MISCELLANEOUS",
    ])
    .optional(),
  amount: z.number().positive("Amount must be positive").optional(),
  paymentMethod: z
    .enum([
      "CASH",
      "BANK_TRANSFER",
      "CHECK",
      "CREDIT_CARD",
      "DEBIT_CARD",
      "MOBILE_PAYMENT",
      "OTHER",
    ])
    .optional(),
  paidTo: z.string().min(1, "Paid to is required").optional(),
  paidBy: z.string().min(1, "Paid by is required").optional(),
  expenseDate: z.string().min(1, "Expense date is required").optional(),
  attachment: z.string().optional().nullable(),
  tags: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  currency: z.string().optional().default("AFN"),
  paidById: z.string().optional().nullable(),
  paidToId: z.string().optional().nullable(),
  paidToContractorId: z.string().optional().nullable(),
  paidByContractorId: z.string().optional().nullable(),
  walletId: z.string().optional().nullable(),
  deductFromWallet: z.boolean().optional(),
});

// GET /api/expenses/[id] - Fetch a single expense
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await requirePermission(request, "expenses:view");
    if ("status" in result) return result;
    const user = result.user;

    const { id } = await params;

    const scope = await buildAccessScope(user, "expense");

    const expense = await db.expense.findFirst({
      where: withScope({ id }, scope),
      include: {
        creator: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            avatar: true,
          },
        },
        paidByEmployee: {
          select: {
            id: true,
            fullName: true,
            jobTitle: true,
            department: true,
          },
        },
        paidToEmployee: {
          select: {
            id: true,
            fullName: true,
            jobTitle: true,
            department: true,
          },
        },
        paidToContractor: {
          select: {
            id: true,
            contractorName: true,
            fatherName: true,
            contractorType: true,
          },
        },
        paidByContractor: {
          select: {
            id: true,
            contractorName: true,
            contractorType: true,
          },
        },
      },
    });

    if (!expense) {
      return NextResponse.json(
        { success: false, error: "Expense not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: expense });
  } catch (error) {
    console.error("GET /api/expenses/[id] error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch expense" },
      { status: 500 }
    );
  }
}

// PUT /api/expenses/[id] - Update an expense
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await requirePermission(request, "expenses:edit");
    if ("status" in result) return result;
    const user = result.user;

    const { id } = await params;

    const scope = await buildAccessScope(user, "expense");

    // Check if expense exists AND the user has access to it
    const existingExpense = await db.expense.findFirst({
      where: withScope({ id }, scope),
    });

    if (!existingExpense) {
      return NextResponse.json(
        { success: false, error: "Expense not found" },
        { status: 404 }
      );
    }

    // Payroll-generated salary expenses are owned by the payroll ledger and
    // must be corrected by reverting the payroll, not by editing here.
    if (existingExpense.payrollId) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Payroll-generated salary expenses cannot be edited. Revert the payroll instead.",
        },
        { status: 400 }
      );
    }

    const body = await request.json();
    const parsed = updateExpenseSchema.safeParse(body);

    if (!parsed.success) {
      const errors = parsed.error.issues.map((issue) => issue.message);
      return NextResponse.json(
        { success: false, error: errors.join(", ") },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Company wallet and employee-wallet deductions are mutually exclusive.
    // Guard against the resulting state (existing values combined with incoming).
    const effectiveWalletId =
      data.walletId !== undefined ? data.walletId : existingExpense.walletId;
    const effectiveDeductFromWallet =
      data.deductFromWallet !== undefined ? data.deductFromWallet : existingExpense.deductFromWallet;
    if (effectiveWalletId && effectiveDeductFromWallet !== false) {
      return NextResponse.json(
        {
          success: false,
          error: "Select either a company wallet or an employee wallet deduction, not both.",
        },
        { status: 400 }
      );
    }

    // At least one of a company wallet or a paying employee must be selected.
    const effectivePaidById =
      data.paidById !== undefined ? data.paidById : existingExpense.paidById;
    if (!effectiveWalletId && !effectivePaidById) {
      return NextResponse.json(
        {
          success: false,
          error: "Select either a company wallet or a paying employee.",
        },
        { status: 400 }
      );
    }

    // Build update data object
    const updateData: Record<string, unknown> = {};
    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.category !== undefined) updateData.category = data.category;
    if (data.amount !== undefined) updateData.amount = data.amount;
    if (data.paymentMethod !== undefined) updateData.paymentMethod = data.paymentMethod;
    if (data.paidTo !== undefined) updateData.paidTo = data.paidTo;
    if (data.paidBy !== undefined) updateData.paidBy = data.paidBy;
    if (data.expenseDate !== undefined) updateData.expenseDate = new Date(data.expenseDate);
    if (data.attachment !== undefined) updateData.attachment = data.attachment;
    if (data.tags !== undefined) updateData.tags = data.tags;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.currency !== undefined) updateData.currency = data.currency;
    if (data.paidById !== undefined) updateData.paidById = data.paidById;
    if (data.paidToId !== undefined) updateData.paidToId = data.paidToId;
    if (data.paidToContractorId !== undefined) updateData.paidToContractorId = data.paidToContractorId;
    if (data.paidByContractorId !== undefined) updateData.paidByContractorId = data.paidByContractorId;
    if (data.walletId !== undefined) updateData.walletId = data.walletId;
    if (data.deductFromWallet !== undefined) updateData.deductFromWallet = data.deductFromWallet;

    const newApprovalStatus = resolveApprovalStatusOnEdit(user, existingExpense.approvalStatus);
    updateData.approvalStatus = newApprovalStatus;
    if (newApprovalStatus === PENDING) {
      updateData.approvedById = null;
      updateData.approvedAt = null;
    } else if (newApprovalStatus === APPROVED) {
      updateData.approvedById = user.id;
      updateData.approvedAt = new Date();
    }

    const wasApproved = existingExpense.approvalStatus === APPROVED;
    const staysApproved = newApprovalStatus === APPROVED;

    const oldPaidById = existingExpense.paidById;
    const newPaidById = data.paidById !== undefined ? data.paidById : oldPaidById;
    const oldDeductFromWallet = existingExpense.deductFromWallet;
    const newDeductFromWallet = data.deductFromWallet !== undefined ? data.deductFromWallet : oldDeductFromWallet;
    const oldAmount = existingExpense.amount;
    const newAmount = data.amount !== undefined ? data.amount : oldAmount;
    const oldWalletId = existingExpense.walletId;
    const newWalletId = data.walletId !== undefined ? data.walletId : oldWalletId;

    const expense = await db.$transaction(async (tx) => {
      const updated = await tx.expense.update({
        where: { id },
        data: updateData,
        include: {
          creator: {
            select: {
              id: true,
              email: true,
              name: true,
              role: true,
              avatar: true,
            },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          action: "UPDATE",
          entity: "Expense",
          entityId: updated.id,
          details: `Updated expense: ${updated.title}`,
          userId: user.id,
        },
      });

      // Wallet adjustments only ever apply to approved expenses.
      if (wasApproved && !staysApproved) {
        // Re-submission: refund the company wallet; deduction re-applies on
        // re-approval.
        if (oldWalletId) {
          await companyWalletService.reverseExpenseDeduction(tx, oldWalletId, oldAmount, user.id, id);
        }
      } else if (wasApproved && staysApproved) {
        // Company wallet: refund old wallet if changed, then deduct new wallet.
        if (oldWalletId && oldWalletId !== newWalletId) {
          await companyWalletService.reverseExpenseDeduction(tx, oldWalletId, oldAmount, user.id, id);
        }
        if (newWalletId) {
          if (!oldWalletId || oldWalletId !== newWalletId) {
            await companyWalletService.deductForExpense(tx, newWalletId, newAmount, user.id, id);
          } else {
            const diff = newAmount - oldAmount;
            if (diff > 0) {
              await companyWalletService.deductForExpense(tx, newWalletId, diff, user.id, id);
            } else if (diff < 0) {
              await companyWalletService.reverseExpenseDeduction(tx, newWalletId, Math.abs(diff), user.id, id);
            }
          }
        }
      }

      // Reconcile employee wallets that may have changed (paidById changed, the
      // deduction flag changed, or the amount changed). Only relevant for
      // approved expenses.
      if (wasApproved || staysApproved) {
        const affected = new Set<string>();
        if (oldDeductFromWallet !== false && oldPaidById) affected.add(oldPaidById);
        if (newDeductFromWallet !== false && newPaidById) affected.add(newPaidById);
        for (const empId of affected) {
          try { await walletService.reconcileForExpense(empId, tx); }
          catch (e) { console.warn("Wallet reconcile on update failed:", e); }
        }
      }

      return updated;
    });

    return NextResponse.json({
      success: true,
      data: expense,
      message: "Expense updated successfully",
    });
  } catch (error) {
    console.error("Update expense error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update expense" },
      { status: 500 }
    );
  }
}

// DELETE /api/expenses/[id] - Delete an expense
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await requirePermission(request, "expenses:delete");
    if ("status" in result) return result;
    const user = result.user;

    const { id } = await params;

    const scope = await buildAccessScope(user, "expense");

    // Check if expense exists AND the user has access to it
    const existingExpense = await db.expense.findFirst({
      where: withScope({ id }, scope),
    });

    if (!existingExpense) {
      return NextResponse.json(
        { success: false, error: "Expense not found" },
        { status: 404 }
      );
    }

    // Payroll-generated salary expenses are reconciled against the wallet
    // ledger; removing them directly would desync it.
    if (existingExpense.payrollId) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Payroll-generated salary expenses cannot be deleted. Revert the payroll instead.",
        },
        { status: 400 }
      );
    }

    // If expense was approved and deducted from a company wallet, credit it back.
    // Done inside the transaction BEFORE deleting the expense so the reversal
    // transaction can still reference the expenseId.
    const walletToRefund = existingExpense.approvalStatus === APPROVED ? existingExpense.walletId : null;

    await db.$transaction(async (tx) => {
      if (walletToRefund) {
        await companyWalletService.reverseExpenseDeduction(
          tx,
          walletToRefund,
          existingExpense.amount,
          user.id,
          id
        );
      }

      await tx.auditLog.create({
        data: {
          action: "DELETE",
          entity: "Expense",
          entityId: id,
          details: `Deleted expense: ${existingExpense.title} ($${existingExpense.amount})`,
          userId: user.id,
        },
      });

      await tx.expense.delete({
        where: { id },
      });
    });

    // Reconcile the paying employee's wallet (deleting the expense removes it
    // from the derived balance).
    if (
      existingExpense.approvalStatus === APPROVED &&
      existingExpense.paidById &&
      existingExpense.deductFromWallet !== false
    ) {
      try { await walletService.reconcileForExpense(existingExpense.paidById); }
      catch (e) { console.warn("Wallet reconcile on delete failed:", e); }
    }

    return NextResponse.json({
      success: true,
      message: "Expense deleted successfully",
    });
  } catch (error) {
    console.error("Delete expense error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete expense" },
      { status: 500 }
    );
  }
}
