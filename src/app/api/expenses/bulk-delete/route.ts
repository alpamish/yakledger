import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { buildAccessScope, withScope } from "@/lib/access-control";
import { walletService } from "@/services/wallet.service";
import { APPROVED } from "@/lib/access-control";

const bulkDeleteSchema = z.object({
  ids: z
    .array(z.string().min(1, "Invalid expense ID"))
    .min(1, "At least one ID is required"),
});

// POST /api/expenses/bulk-delete - Bulk delete expenses
export async function POST(request: NextRequest) {
  try {
    const result = await requirePermission(request, "expenses:delete");
    if ("status" in result) return result;
    const user = result.user;

    const body = await request.json();
    const parsed = bulkDeleteSchema.safeParse(body);

    if (!parsed.success) {
      const errors = parsed.error.issues.map((issue) => issue.message);
      return NextResponse.json(
        { success: false, error: errors.join(", ") },
        { status: 400 }
      );
    }

    const { ids } = parsed.data;

    const scope = await buildAccessScope(user, "expense");

    // Verify expenses exist AND are accessible to the user
    const found = await db.expense.findMany({
      where: withScope({ id: { in: ids } }, scope),
      select: {
        id: true,
        title: true,
        amount: true,
        paidById: true,
        approvalStatus: true,
        payrollId: true,
      },
    });

    // Payroll-generated salary expenses belong to the payroll ledger and must
    // not be bulk-deleted (correct them by reverting the payroll instead).
    const expenses = found.filter((e) => !e.payrollId);
    const skipped = found.length - expenses.length;

    if (expenses.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            "The selected expenses are payroll-generated salary records and cannot be deleted. Revert the payroll instead.",
        },
        { status: 400 }
      );
    }

    const accessibleIds = expenses.map((e) => e.id);

    const deleted = await db.$transaction(async (tx) => {
      await tx.auditLog.createMany({
        data: expenses.map((expense) => ({
          action: "BULK_DELETE",
          entity: "Expense",
          entityId: expense.id,
          details: `Bulk deleted expense: ${expense.title} ($${expense.amount})`,
          userId: user.id,
        })),
      });

      return tx.expense.deleteMany({
        where: { id: { in: accessibleIds } },
      });
    });

    // Refund wallets for any approved, employee-paid expenses (best-effort)
    for (const expense of expenses) {
      if (expense.approvalStatus === APPROVED && expense.paidById) {
        try {
          await walletService.addBackToWallet(expense.paidById, expense.amount, user.id);
        } catch (walletErr) {
          console.warn("Wallet add-back failed:", walletErr);
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: { deletedCount: deleted.count, skipped },
      message:
        skipped > 0
          ? `${deleted.count} expense(s) deleted; ${skipped} payroll-generated record(s) skipped`
          : `${deleted.count} expense(s) deleted successfully`,
    });
  } catch (error) {
    console.error("Bulk delete expenses error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete expenses" },
      { status: 500 }
    );
  }
}
