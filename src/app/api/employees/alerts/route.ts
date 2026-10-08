import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permissions";
import { buildAccessScope, withScope } from "@/lib/access-control";
import { ALLOCATING_PAYROLL_STATUSES } from "@/lib/payroll-status";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  const result = await requirePermission(request, "employees:view");
  if ("status" in result) return result;
  const user = result.user;

  try {
    const scope = await buildAccessScope(user, "employee");
    const in30 = new Date();
    in30.setDate(in30.getDate() + 30);

    const activeWhere = withScope({ status: "ACTIVE" }, scope);

    const [expiringContracts, expiringDocuments, upcomingSalary, newHires, recentTerminations, overdueAdvances, totalActive, totalEmployees] =
      await Promise.all([
        db.employeeContract.findMany({
          where: {
            status: "ACTIVE",
            endDate: { gte: new Date(), lte: in30 },
            employee: activeWhere,
          },
          include: { employee: { select: { id: true, fullName: true } } },
          orderBy: { endDate: "asc" },
          take: 10,
        }),
        db.employeeDocument.findMany({
          where: {
            expiryDate: { gte: new Date(), lte: in30 },
            employee: activeWhere,
          },
          include: { employee: { select: { id: true, fullName: true } } },
          orderBy: { expiryDate: "asc" },
          take: 10,
        }),
        db.salaryHistory.findMany({
          where: {
            effectiveFrom: { gt: new Date() },
            employee: activeWhere,
          },
          include: { employee: { select: { id: true, fullName: true } } },
          orderBy: { effectiveFrom: "asc" },
          take: 10,
        }),
        db.employee.findMany({
          where: withScope(
            { hireDate: { gte: new Date(Date.now() - 30 * 864e5) } },
            scope
          ),
          select: { id: true, fullName: true, hireDate: true },
          orderBy: { hireDate: "desc" },
          take: 10,
        }),
        db.employee.findMany({
          where: withScope(
            { terminationDate: { gte: new Date(Date.now() - 30 * 864e5) } },
            scope
          ),
          select: { id: true, fullName: true, terminationDate: true },
          orderBy: { terminationDate: "desc" },
          take: 10,
        }),
        db.cashTransaction.findMany({
          where: {
            type: "ADVANCE",
            approvalStatus: "APPROVED",
            dueDate: { lt: new Date() },
            employee: activeWhere,
          },
          include: {
            employee: { select: { id: true, fullName: true } },
            payrollAllocations: {
              where: {
                payroll: { status: { in: [...ALLOCATING_PAYROLL_STATUSES] } },
              },
              select: { amountMinor: true },
            },
          },
          orderBy: { dueDate: "asc" },
          take: 10,
        }),
        db.employee.count({ where: activeWhere }),
        db.employee.count({ where: scope }),
      ]);

    const overdueAdvanceAlerts = overdueAdvances.filter((a) => {
      const allocatedMinor = a.payrollAllocations.reduce(
        (s, x) => s + x.amountMinor,
        0
      );
      return allocatedMinor < Math.round(a.amount * 100);
    });

    const alerts = [
      ...expiringContracts.map((c) => ({
        type: "CONTRACT_EXPIRING",
        severity: "warning",
        message: `Contract for ${c.employee.fullName} expires ${c.endDate?.toISOString().slice(0, 10)}`,
        employeeId: c.employeeId,
        dueDate: c.endDate,
      })),
      ...expiringDocuments.map((d) => ({
        type: "DOCUMENT_EXPIRING",
        severity: "warning",
        message: `${d.documentType} for ${d.employee.fullName} expires ${d.expiryDate?.toISOString().slice(0, 10)}`,
        employeeId: d.employeeId,
        dueDate: d.expiryDate,
      })),
      ...upcomingSalary.map((s) => ({
        type: "SALARY_CHANGE_UPCOMING",
        severity: "info",
        message: `Salary change for ${s.employee.fullName} effective ${s.effectiveFrom.toISOString().slice(0, 10)}`,
        employeeId: s.employeeId,
        dueDate: s.effectiveFrom,
      })),
      // Warning only: an overdue advance is never deducted or converted
      // automatically (Plan-payroll.pdf §2 action 2).
      ...overdueAdvanceAlerts.map((a) => ({
        type: "ADVANCE_OVERDUE",
        severity: "warning",
        message: `Overdue advance of ${a.amount} AFN for ${a.employee.fullName} (due ${a.dueDate?.toISOString().slice(0, 10)})`,
        employeeId: a.employeeId,
        dueDate: a.dueDate,
      })),
    ];

    return NextResponse.json({
      success: true,
      data: {
        alerts,
        metrics: {
          totalEmployees,
          totalActive,
          expiringContracts: expiringContracts.length,
          expiringDocuments: expiringDocuments.length,
          upcomingSalaryChanges: upcomingSalary.length,
          overdueAdvances: overdueAdvanceAlerts.length,
          newHires: newHires.length,
          recentTerminations: recentTerminations.length,
        },
        newHires,
        recentTerminations,
        expiringContracts,
        expiringDocuments,
        upcomingSalary,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: "Failed to fetch HR alerts" },
      { status: 500 }
    );
  }
}
