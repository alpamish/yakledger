import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

export async function POST(request: NextRequest) {
  try {
    const result = await requirePermission(request, "employees:view");
    if ("status" in result) return result;

    const { ids } = await request.json();

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { success: false, error: "Employee IDs are required" },
        { status: 400 }
      );
    }

    const employees = await db.employee.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        fullName: true,
        jobTitle: true,
        department: true,
        salary: true,
        workHoursPerDay: true,
        overtimeRate: true,
        hireDate: true,
        status: true,
        quitingDate: true,
        createdAt: true,
        cashAccount: {
          select: { currentBalance: true },
        },
      },
    });

    const expenseTotalsPromises = ids.map(async (id) => {
      const [paidBy, paidTo, salaryPaid, rewards, advances] = await Promise.all([
        db.expense.aggregate({
          where: { paidById: id },
          _sum: { amount: true },
        }),
        db.expense.aggregate({
          where: { paidToId: id },
          _sum: { amount: true },
        }),
        db.expense.aggregate({
          where: { paidToId: id, category: "SALARY" },
          _sum: { amount: true },
        }),
        db.expense.aggregate({
          where: { paidToId: id, category: { in: ["REWARD", "BONUS"] } },
          _sum: { amount: true },
        }),
        db.cashTransaction.aggregate({
          where: { employeeId: id, type: "ADVANCE" },
          _sum: { amount: true },
        }),
      ]);

      return {
        id,
        totalExpensesPaidBy: paidBy._sum.amount ?? 0,
        totalExpensesPaidTo: paidTo._sum.amount ?? 0,
        totalSalaryPaid: salaryPaid._sum.amount ?? 0,
        totalRewards: rewards._sum.amount ?? 0,
        totalAdvanceReceived: advances._sum.amount ?? 0,
      };
    });

    const expenseTotals = await Promise.all(expenseTotalsPromises);

    const expenseTotalsMap = Object.fromEntries(
      expenseTotals.map((e) => [e.id, e])
    );

    const data = await Promise.all(
      employees.map(async (emp) => {
        const totals = expenseTotalsMap[emp.id] ?? {
          totalExpensesPaidBy: 0,
          totalExpensesPaidTo: 0,
          totalSalaryPaid: 0,
          totalRewards: 0,
          totalAdvanceReceived: 0,
        };

        const hireDateObj = new Date(emp.hireDate);
        const currentDate = new Date();
        const isActive = emp.status === "ACTIVE";
        const endDate = isActive
          ? currentDate
          : emp.quitingDate
            ? new Date(emp.quitingDate)
            : currentDate;

        const attendanceRecords = await db.attendance.findMany({
          where: {
            employeeId: emp.id,
            date: {
              gte: hireDateObj,
              lte: endDate,
            },
            status: { in: ["PRESENT", "HALF_DAY"] },
          },
          select: { status: true, date: true, overtimeHours: true },
        });

        let daysWorked: number;
        let totalOvertimeHours = 0;

        if (attendanceRecords.length > 0) {
          // Use attendance data
          let presentDays = 0;
          let halfDays = 0;
          for (const r of attendanceRecords) {
            if (r.status === "PRESENT") presentDays++;
            else if (r.status === "HALF_DAY") halfDays++;
            totalOvertimeHours += r.overtimeHours ?? 0;
          }
          daysWorked = presentDays + halfDays * 0.5;
        } else {
          // Fallback: calculate from hire date to today
          daysWorked = Math.max(
            0,
            Math.floor(
              (endDate.getTime() - hireDateObj.getTime()) / (1000 * 60 * 60 * 24)
            )
          );
        }

        const dailySalary = emp.salary / 30;
        const hourlySalary = emp.workHoursPerDay && emp.workHoursPerDay > 0
          ? dailySalary / emp.workHoursPerDay
          : dailySalary / 9;
        const overtimePay = totalOvertimeHours * hourlySalary * (emp.overtimeRate ?? 1.25);
        const earnedSalary = dailySalary * daysWorked + overtimePay;
        const walletBalance = emp.cashAccount?.currentBalance ?? 0;
        const netBalance =
          totals.totalExpensesPaidTo + totals.totalAdvanceReceived -
          totals.totalExpensesPaidBy;

        return {
          id: emp.id,
          fullName: emp.fullName,
          jobTitle: emp.jobTitle,
          department: emp.department,
          salary: emp.salary,
          dailySalary,
          daysWorked,
          earnedSalary,
          totalExpensesPaidBy: totals.totalExpensesPaidBy,
          totalExpensesPaidTo: totals.totalExpensesPaidTo,
          totalSalaryPaid: totals.totalSalaryPaid,
          totalRewards: totals.totalRewards,
          totalAdvanceReceived: totals.totalAdvanceReceived,
          walletBalance,
          totalOvertimeHours,
          overtimePay,
          netBalance,
        };
      })
    );

    const totals = data.reduce(
      (acc, emp) => {
        acc.totalSalary += emp.salary;
        acc.totalEarnedSalary += emp.earnedSalary;
        acc.totalExpensesPaidBy += emp.totalExpensesPaidBy;
        acc.totalExpensesPaidTo += emp.totalExpensesPaidTo;
        acc.totalSalaryPaid += emp.totalSalaryPaid;
        acc.totalRewards += emp.totalRewards;
        acc.totalAdvanceReceived += emp.totalAdvanceReceived;
        acc.totalWalletBalance += emp.walletBalance;
        acc.totalOvertimeHours += emp.totalOvertimeHours;
        acc.totalOvertimePay += emp.overtimePay;
        acc.totalNetBalance += emp.netBalance;
        return acc;
      },
      {
        totalSalary: 0,
        totalEarnedSalary: 0,
        totalExpensesPaidBy: 0,
        totalExpensesPaidTo: 0,
        totalSalaryPaid: 0,
        totalRewards: 0,
        totalAdvanceReceived: 0,
        totalWalletBalance: 0,
        totalOvertimeHours: 0,
        totalOvertimePay: 0,
        totalNetBalance: 0,
        employeeCount: data.length,
      }
    );

    return NextResponse.json({
      success: true,
      data: { employees: data, totals },
    });
  } catch (error) {
    console.error("Financial summary error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch financial summary" },
      { status: 500 }
    );
  }
}
