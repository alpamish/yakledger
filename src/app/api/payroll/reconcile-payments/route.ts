import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permissions";
import { reconcilePayrollPaymentsFromExpenses } from "@/services/payroll-reconcile.service";

/**
 * POST /api/payroll/reconcile-payments
 *
 * Marks approved/partially paid payrolls as paid (or partially paid) when the
 * salary was recorded as an approved SALARY expense instead of through the
 * payroll payment flow. Updates only the settlement counters — it never
 * creates a PayrollPayment, CashTransaction, Expense or AccountingEntry.
 *
 * Body (all optional):
 *   { dryRun?: boolean, payrollIds?: string[] }
 */
export async function POST(request: NextRequest) {
  const result = await requirePermission(request, "employees:payroll:manage");
  if ("status" in result) return result;

  try {
    let body: unknown = {};
    try {
      body = await request.json();
    } catch {
      // Empty body is valid: reconcile every candidate payroll.
    }

    const payload =
      body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const payrollIds = Array.isArray(payload.payrollIds)
      ? payload.payrollIds.filter(
          (id): id is string => typeof id === "string" && id.length > 0
        )
      : undefined;

    const summary = await reconcilePayrollPaymentsFromExpenses({
      dryRun: payload.dryRun === true,
      payrollIds,
    });

    return NextResponse.json({ success: true, data: summary });
  } catch (error) {
    console.error("Payroll expense reconciliation error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to reconcile payroll payments from expenses" },
      { status: 500 }
    );
  }
}
