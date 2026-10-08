import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permissions";
import { getEmployeeStatement } from "@/services/hr.service";
import { buildAccessScope, withScope } from "@/lib/access-control";
import { db } from "@/lib/db";

/**
 * Dedicated employee financial statement (Plan-payroll.pdf §2 action 10):
 * salary, payments, advances, deductions, transfers, reimbursements and
 * corrections with debit/credit totals and the net balance.
 *
 * Query params: `from` / `to` (YYYY-MM-DD) to limit the listed period.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requirePermission(request, "employees:payroll:view");
  if ("status" in result) return result;
  const user = result.user;
  const { id } = await params;
  try {
    const scope = await buildAccessScope(user, "employee");
    const employee = await db.employee.findFirst({
      where: withScope({ id }, scope),
      select: { id: true },
    });
    if (!employee) {
      return NextResponse.json(
        { success: false, error: "Employee not found" },
        { status: 404 }
      );
    }

    const url = new URL(request.url);
    const statement = await getEmployeeStatement(id, {
      dateFrom: url.searchParams.get("from"),
      dateTo: url.searchParams.get("to"),
    });
    return NextResponse.json({ success: true, data: statement });
  } catch (e: any) {
    return NextResponse.json(
      {
        success: false,
        error: e?.message || "Failed to load statement",
      },
      { status: 500 }
    );
  }
}
