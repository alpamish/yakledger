import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { walletService } from "@/services/wallet.service";
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
});

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

      return updated;
    });

    // Wallet adjustments only ever apply to approved expenses.
    const oldPaidById = existingExpense.paidById;
    const newPaidById = data.paidById !== undefined ? data.paidById : oldPaidById;
    const oldAmount = existingExpense.amount;
    const newAmount = data.amount !== undefined ? data.amount : oldAmount;

    if (wasApproved && !staysApproved) {
      // Re-submission: refund the wallet; deduction re-applies on re-approval.
      if (oldPaidById) {
        try { await walletService.addBackToWallet(oldPaidById, oldAmount, user.id); }
        catch (e) { console.warn("Wallet refund on re-submission failed:", e); }
      }
    } else if (wasApproved && staysApproved) {
      // Refund the old employee if paidById changed
      if (oldPaidById && oldPaidById !== newPaidById) {
        try { await walletService.addBackToWallet(oldPaidById, oldAmount, user.id); }
        catch (e) { console.warn("Wallet refund on paidById change failed:", e); }
      }

      if (newPaidById) {
        if (!oldPaidById || oldPaidById !== newPaidById) {
          // Deduct full amount for a newly assigned employee
          try { await walletService.deductFromWallet(newPaidById, newAmount, user.id); }
          catch (e) { console.warn("Wallet deduction on paidById change failed:", e); }
        } else {
          // Same employee — adjust by the diff only
          const diff = newAmount - oldAmount;
          if (diff > 0) {
            try { await walletService.deductFromWallet(newPaidById, diff, user.id); }
            catch (e) { console.warn("Wallet deduction on update failed:", e); }
          } else if (diff < 0) {
            try { await walletService.addBackToWallet(newPaidById, Math.abs(diff), user.id); }
            catch (e) { console.warn("Wallet add-back on update failed:", e); }
          }
        }
      }
    }

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

    await db.$transaction(async (tx) => {
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

    // If expense was approved and paid by an employee, add back to their wallet (best-effort)
    if (existingExpense.approvalStatus === APPROVED && existingExpense.paidById) {
      try {
        await walletService.addBackToWallet(existingExpense.paidById, existingExpense.amount, user.id);
      } catch (walletErr) {
        console.warn("Wallet add-back failed:", walletErr);
      }
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
