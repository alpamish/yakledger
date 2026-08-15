import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permissions";
import { buildAccessScope } from "@/lib/access-control";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  const result = await requirePermission(request, "employees:payroll:view");
  if ("status" in result) return result;
  const user = result.user;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || undefined;
  const periodStart = searchParams.get("periodStart") || undefined;
  const periodEnd = searchParams.get("periodEnd") || undefined;
  const format = searchParams.get("format") || "csv";

  try {
    const scope = await buildAccessScope(user, "employee");
    const scopedEmployeeIds = await db.employee
      .findMany({ where: scope, select: { id: true } })
      .then((rows) => rows.map((r) => r.id));

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (periodStart) where.periodStart = { gte: new Date(periodStart) };
    if (periodEnd) where.periodEnd = { lte: new Date(periodEnd) };
    if (Object.keys(scope).length > 0) where.employeeId = { in: scopedEmployeeIds };

    const rows = await db.payroll.findMany({
      where,
      include: {
        employee: {
          select: { id: true, fullName: true, employeeNumber: true, department: true },
        },
        lines: true,
        wallet: { select: { id: true, name: true, currency: true } },
        approvedBy: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { periodStart: "desc" },
    });

    if (format === "json") {
      return NextResponse.json({ success: true, data: rows });
    }

    const header = [
      "Employee No",
      "Employee",
      "Department",
      "Period Start",
      "Period End",
      "Status",
      "Gross (AFN)",
      "Already Received (AFN)",
      "Previous Debt (AFN)",
      "Net Payable (AFN)",
      "Payment Status",
      "Remaining Debt (AFN)",
    ];
    const escape = (v: unknown) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const csvLines = rows.flatMap((p) =>
      (p.lines ?? []).map((l) =>
        [
          p.employee.employeeNumber ?? "",
          p.employee.fullName,
          p.employee.department ?? "",
          p.periodStart.toISOString().slice(0, 10),
          p.periodEnd.toISOString().slice(0, 10),
          p.status,
          (l.grossPayMinor ?? 0) / 100,
          (l.amountAlreadyReceivedMinor ?? 0) / 100,
          (l.previousDebtMinor ?? 0) / 100,
          (l.netPayableMinor ?? 0) / 100,
          l.paymentStatus ?? "",
          (l.remainingEmployeeDebtMinor ?? 0) / 100,
        ]
          .map(escape)
          .join(",")
      )
    );

    const csv = [header.map(escape).join(","), ...csvLines].join("\n");

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="payroll-export.csv"',
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to export payroll" },
      { status: 500 }
    );
  }
}
