import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permissions";
import { buildAccessScope, withScope } from "@/lib/access-control";
import { db } from "@/lib/db";
import { toMinor } from "@/lib/money";
import {
  parsePayrollQuery,
  buildPayrollWhere,
  buildPayrollOrderBy,
} from "@/lib/payroll-filters";
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
    const q = parsePayrollQuery(searchParams);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("pageSize") || "10"))
    );

    const scope = await buildAccessScope(user, "employee");
    const employeeIds =
      Object.keys(scope).length > 0
        ? await db.employee
            .findMany({ where: scope, select: { id: true } })
            .then((rows) => rows.map((r) => r.id))
        : undefined;

    const where = buildPayrollWhere(q, { employeeIds });

    const [rows, total, lineAgg, paidLines, totalLines, settlementRows] =
      await Promise.all([
        db.payroll.findMany({
          where,
          include: {
            employee: { select: { id: true, fullName: true, employeeNumber: true } },
            lines: true,
            wallet: { select: { id: true, name: true, currency: true } },
            createdBy: { select: { id: true, name: true } },
            approvedBy: { select: { id: true, name: true } },
          },
          orderBy: buildPayrollOrderBy(q),
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        db.payroll.count({ where }),
        // Totals cover the whole filtered set, not just the current page.
        db.payrollLine.aggregate({
          _sum: {
            grossPayMinor: true,
            expensesPaidMinor: true,
            amountAlreadyReceivedMinor: true,
            previousDebtMinor: true,
            netPayableMinor: true,
            netPayMinor: true,
            remainingEmployeeDebtMinor: true,
          },
          where: { payroll: where },
        }),
        db.payrollLine.count({ where: { payroll: where, paymentStatus: "PAID" } }),
        db.payrollLine.count({ where: { payroll: where } }),
        // Minimal projection so we can total what has actually been paid and
        // the salary still outstanding per payroll (Prisma can't express the
        // per-row `max(netPay − paid, 0)` in an aggregate).
        db.payroll.findMany({
          where,
          select: {
            status: true,
            totalPaidMinor: true,
            lines: { select: { netPayMinor: true } },
          },
        }),
      ]);

    // Payrolls that have been approved (fully or partially paid) can still owe
    // salary; drafts are not yet a liability.
    const outstandingStatuses = new Set(["APPROVED", "PARTIALLY_PAID"]);
    const totalPaidMinor = settlementRows.reduce(
      (sum, p) => sum + (p.totalPaidMinor ?? 0),
      0
    );
    const totalOutstandingMinor = settlementRows.reduce((sum, p) => {
      if (!outstandingStatuses.has(p.status)) return sum;
      const netPay = p.lines?.reduce((s, l) => s + (l.netPayMinor ?? 0), 0) ?? 0;
      return sum + Math.max(netPay - (p.totalPaidMinor ?? 0), 0);
    }, 0);

    const summary = {
      totalGrossMinor: lineAgg._sum.grossPayMinor ?? 0,
      totalAlreadyReceivedMinor: lineAgg._sum.amountAlreadyReceivedMinor ?? 0,
      totalPreviousDebtMinor: lineAgg._sum.previousDebtMinor ?? 0,
      totalNetPayableMinor: lineAgg._sum.netPayableMinor ?? 0,
      // Amount actually payable to employees (floored per payroll at 0).
      totalPayableMinor: lineAgg._sum.netPayMinor ?? 0,
      // Everything the company has paid against the filtered set.
      totalPaidMinor,
      // Unpaid salary on approved / partially paid payrolls.
      totalOutstandingMinor,
      totalRemainingDebtMinor: lineAgg._sum.remainingEmployeeDebtMinor ?? 0,
      totalExpensesMinor: lineAgg._sum.expensesPaidMinor ?? 0,
      paidLines,
      // UNPAID and PARTIALLY_PAID both still owe.
      unpaidLines: Math.max(totalLines - paidLines, 0),
    };

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
