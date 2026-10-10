import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permissions";
import { buildAccessScope, withScope } from "@/lib/access-control";
import { db } from "@/lib/db";
import { toMinor } from "@/lib/money";
import { createPayrollAdjustment } from "@/services/hr.service";
import { payrollAdjustmentSchema } from "@/lib/validations/hr";

/** List payroll adjustments (Plan-payroll.pdf §1 "Payroll Adjustments"). */
export async function GET(request: NextRequest) {
  const result = await requirePermission(request, "employees:payroll:view");
  if ("status" in result) return result;
  const user = result.user;

  try {
    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get("employeeId") || undefined;

    const scope = await buildAccessScope(user, "employee");
    const adjustments = await db.payrollAdjustment.findMany({
      where: withScope(
        employeeId ? { employeeId } : {},
        scope
      ),
      include: {
        employee: { select: { id: true, fullName: true } },
        createdBy: { select: { id: true, name: true } },
        payroll: { select: { id: true, status: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return NextResponse.json({ success: true, data: adjustments });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Failed to load adjustments" },
      { status: 400 }
    );
  }
}

/** Create a manual adjustment; open payrolls of the employee follow. */
export async function POST(request: NextRequest) {
  const result = await requirePermission(request, "employees:payroll:manage");
  if ("status" in result) return result;

  try {
    const body = await request.json();
    const parsed = payrollAdjustmentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: parsed.error.issues[0]?.message || "Invalid input",
        },
        { status: 400 }
      );
    }

    const d = parsed.data;
    const adjustment = await createPayrollAdjustment({
      employeeId: d.employeeId,
      kind: d.kind,
      ...(d.direction !== undefined && { direction: d.direction }),
      amountMinor: toMinor(d.amount),
      reason: d.reason,
      ...(d.note !== undefined && { note: d.note }),
      createdById: result.user.id,
    });

    return NextResponse.json({ success: true, data: adjustment });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Failed to create adjustment" },
      { status: 400 }
    );
  }
}
