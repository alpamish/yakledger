import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permissions";
import { buildAccessScope } from "@/lib/access-control";
import { db } from "@/lib/db";

// Dashboard headline figure: outstanding unpaid salary liability
// (Plan-payroll.pdf §1 "Dashboard shows outstanding unpaid salary liability").
// A payroll contributes while it is approved but not yet fully paid:
// remaining = line net pay − payments already recorded.
export async function GET(request: NextRequest) {
  const result = await requirePermission(request, "employees:payroll:view");
  if ("status" in result) return result;
  const user = result.user;

  try {
    const scope = await buildAccessScope(user, "employee");
    const where: any = { status: { in: ["APPROVED", "PARTIALLY_PAID"] } };
    if (Object.keys(scope).length > 0) {
      const scopedEmployeeIds = await db.employee
        .findMany({ where: scope, select: { id: true } })
        .then((rows) => rows.map((r) => r.id));
      where.employeeId = { in: scopedEmployeeIds };
    }

    const rows = await db.payroll.findMany({
      where,
      select: {
        totalPaidMinor: true,
        lines: { select: { netPayMinor: true } },
      },
    });

    let outstandingSalaryMinor = 0;
    let unpaidPayrolls = 0;
    for (const p of rows) {
      const remaining = Math.max(
        (p.lines[0]?.netPayMinor ?? 0) - p.totalPaidMinor,
        0
      );
      if (remaining > 0) {
        outstandingSalaryMinor += remaining;
        unpaidPayrolls += 1;
      }
    }

    return NextResponse.json({
      success: true,
      data: { outstandingSalaryMinor, unpaidPayrolls },
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        success: false,
        error: e?.message || "Failed to load payroll summary",
      },
      { status: 400 }
    );
  }
}
