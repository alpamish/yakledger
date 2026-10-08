import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permissions";
import { buildAccessScope, withScope } from "@/lib/access-control";
import { db } from "@/lib/db";
import { toMinor } from "@/lib/money";
import {
  generatePayroll,
  approvePayroll,
} from "@/services/hr.service";
import { payrollGenerateSchema } from "@/lib/validations/hr";

export async function GET(request: NextRequest) {
  const result = await requirePermission(request, "employees:payroll:view");
  if ("status" in result) return result;
  const user = result.user;

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || undefined;
    const search = searchParams.get("search") || undefined;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("pageSize") || "10"))
    );

    const scope = await buildAccessScope(user, "employee");
    const scopedEmployeeIds = await db.employee
      .findMany({ where: scope, select: { id: true } })
      .then((rows) => rows.map((r) => r.id));

    const where: any = {};
    if (status) where.status = status;
    if (search) {
      where.employee = {
        OR: [
          { fullName: { contains: search } },
          { employeeNumber: { contains: search } },
        ],
      };
    }
    if (scopedEmployeeIds.length || Object.keys(scope).length === 0) {
      // If scope restricts, limit to accessible employees
      if (Object.keys(scope).length > 0) where.employeeId = { in: scopedEmployeeIds };
    }

    const [rows, total] = await Promise.all([
      db.payroll.findMany({
        where,
        include: {
          employee: { select: { id: true, fullName: true, employeeNumber: true } },
          lines: true,
          wallet: { select: { id: true, name: true, currency: true } },
          createdBy: { select: { id: true, name: true } },
          approvedBy: { select: { id: true, name: true } },
        },
        orderBy: { periodStart: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.payroll.count({ where }),
    ]);

    const summary = rows.reduce(
      (acc, p) => {
        for (const l of p.lines ?? []) {
          acc.totalGrossMinor += l.grossPayMinor ?? 0;
          acc.totalAlreadyReceivedMinor += l.amountAlreadyReceivedMinor ?? 0;
          acc.totalPreviousDebtMinor += l.previousDebtMinor ?? 0;
          acc.totalNetPayableMinor += l.netPayableMinor ?? 0;
          acc.totalRemainingDebtMinor += l.remainingEmployeeDebtMinor ?? 0;
          acc.totalExpensesMinor += l.expensesPaidMinor ?? 0;
          if (l.paymentStatus === "PAID") acc.paidLines += 1;
          else acc.unpaidLines += 1; // UNPAID and PARTIALLY_PAID both still owe
        }
        return acc;
      },
      {
        totalGrossMinor: 0,
        totalAlreadyReceivedMinor: 0,
        totalPreviousDebtMinor: 0,
        totalNetPayableMinor: 0,
        totalRemainingDebtMinor: 0,
        totalExpensesMinor: 0,
        paidLines: 0,
        unpaidLines: 0,
      }
    );

    return NextResponse.json({
      success: true,
      data: {
        data: rows,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
        summary,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: "Failed to fetch payroll" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const result = await requirePermission(request, "employees:payroll:manage");
  if ("status" in result) return result;
  const user = result.user;

  try {
    const body = await request.json();
    const parsed = payrollGenerateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      );
    }
    const d = parsed.data;

    // Determine target employees
    let employeeIds: string[] = d.employeeIds ?? [];
    if (!employeeIds || employeeIds.length === 0) {
      const scope = await buildAccessScope(user, "employee");
      const all = await db.employee.findMany({
        where: withScope({ status: { not: "TERMINATED" } }, scope),
        select: { id: true },
      });
      employeeIds = all.map((e) => e.id);
    }

    const created: any[] = [];
    const skipped: string[] = [];
    const errors: string[] = [];

    // Parallelise independent employee generations for better throughput.
    const settled = await Promise.allSettled(
      employeeIds.map((empId) =>
        generatePayroll({
          employeeId: empId,
          periodStart: d.periodStart,
          periodEnd: d.periodEnd,
          createdById: user.id,
          allowancesMinor: d.allowancesMinor ? toMinor(d.allowancesMinor) : 0,
          bonusesMinor: d.bonusesMinor ? toMinor(d.bonusesMinor) : 0,
          deductionsMinor: d.deductionsMinor ? toMinor(d.deductionsMinor) : 0,
          walletId: d.walletId,
          deductExpenses: d.deductExpenses,
          workDays: d.workDays,
          type: d.type,
        })
      )
    );

    for (let i = 0; i < settled.length; i++) {
      const r = settled[i];
      if (r.status === "fulfilled") {
        const result = r.value;
        if (result.created) {
          created.push(result.payroll);
        } else {
          skipped.push(employeeIds[i]);
        }
      } else {
        errors.push(`${employeeIds[i]}: ${r.reason?.message || "error"}`);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        generated: created.length,
        skipped: skipped.length,
        errors,
      },
      message: `Generated ${created.length} payroll record(s)${
        skipped.length > 0 ? `, ${skipped.length} skipped (already exist)` : ""
      }`,
    });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Failed to generate payroll" },
      { status: 400 }
    );
  }
}
