import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/permissions";
import { loanService } from "@/services/loan.service";

const repaymentSchema = z.object({
  amountMinor: z.number().int().positive("Amount must be positive"),
  note: z.string().optional().nullable(),
});

// POST /api/loans/[id]/repayment - manual repayment (cash handed back).
// Exceeding the outstanding balance is rejected: HR decides how to settle
// the remainder (Plan-payroll.pdf §1 "Loans").
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await requirePermission(request, "cashAdvance:create");
    if ("status" in result) return result;
    const user = result.user;

    const { id } = await params;
    const body = await request.json();
    const parsed = repaymentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      );
    }

    const txn = await loanService.recordRepayment(
      { loanId: id, amountMinor: parsed.data.amountMinor, note: parsed.data.note },
      user
    );

    return NextResponse.json(
      { success: true, data: txn, message: "Repayment recorded" },
      { status: 201 }
    );
  } catch (error) {
    console.error("Loan repayment error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to record repayment" },
      { status: 400 }
    );
  }
}
