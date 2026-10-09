import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

const updateLoanSchema = z.object({
  autoDeduct: z.boolean().optional(),
  monthlyInstallmentMinor: z.number().int().positive().nullable().optional(),
  dueDate: z.coerce.date().nullable().optional(),
  note: z.string().nullable().optional(),
});

// PATCH /api/loans/[id] - edit loan terms (schedule / auto-deduct / note).
// Money fields (principal, balance) are never edited here: they move only
// through repayments and payroll allocations.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await requirePermission(request, "cashAdvance:edit");
    if ("status" in result) return result;

    const { id } = await params;
    const loan = await db.loan.findUnique({ where: { id } });
    if (!loan) {
      return NextResponse.json({ success: false, error: "Loan not found" }, { status: 404 });
    }
    if (loan.status === "PAID" || loan.status === "CANCELLED") {
      return NextResponse.json(
        { success: false, error: "A paid or cancelled loan cannot be edited" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const parsed = updateLoanSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      );
    }

    const updated = await db.loan.update({ where: { id }, data: parsed.data });
    return NextResponse.json({ success: true, data: updated, message: "Loan updated" });
  } catch (error) {
    console.error("Update loan error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to update loan" },
      { status: 500 }
    );
  }
}
