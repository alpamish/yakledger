import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

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

    // Verify expenses exist
    const expenses = await db.expense.findMany({
      where: { id: { in: ids } },
      select: { id: true, title: true, amount: true },
    });

    if (expenses.length === 0) {
      return NextResponse.json(
        { success: false, error: "No expenses found with the given IDs" },
        { status: 404 }
      );
    }

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
        where: { id: { in: ids } },
      });
    });

    return NextResponse.json({
      success: true,
      data: { deletedCount: deleted.count },
      message: `${deleted.count} expense(s) deleted successfully`,
    });
  } catch (error) {
    console.error("Bulk delete expenses error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete expenses" },
      { status: 500 }
    );
  }
}
