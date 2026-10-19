import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permissions";
import { getPeriodExpensesMinor } from "@/services/hr.service";
import { fromMinor } from "@/lib/money";

/**
 * GET /api/payroll/period-expenses?employeeId=...&periodStart=...&periodEnd=...
 *
 * Total of the employee's outstanding paid expenses inside the period — what
 * a deduct-inclusive payroll would include. Used by the Generate Payroll form
 * to show the amount before the user chooses to deduct it or not.
 */
export async function GET(request: NextRequest) {
  const result = await requirePermission(request, "employees:payroll:view");
  if ("status" in result) return result;

  const { searchParams } = new URL(request.url);
  const employeeId = searchParams.get("employeeId");
  const periodStart = searchParams.get("periodStart");
  const periodEnd = searchParams.get("periodEnd");

  if (!employeeId || !periodStart || !periodEnd) {
    return NextResponse.json(
      { success: false, error: "employeeId, periodStart and periodEnd are required" },
      { status: 400 }
    );
  }

  try {
    const { totalMinor, count } = await getPeriodExpensesMinor(
      employeeId,
      periodStart,
      periodEnd
    );
    return NextResponse.json({
      success: true,
      data: { totalMinor, total: fromMinor(totalMinor), count },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to fetch expenses";
    const status = message === "Invalid period" ? 400 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
