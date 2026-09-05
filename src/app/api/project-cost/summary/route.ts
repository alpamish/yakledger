import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { buildAccessScope, withScope, approvedOnly } from "@/lib/access-control";

export async function GET(request: NextRequest) {
  const result = await requirePermission(request, "projectCost:view");
  if ("status" in result) return result;
  const user = result.user;

  try {
    const [expenseScope, fuelScope] = await Promise.all([
      buildAccessScope(user, "expense"),
      buildAccessScope(user, "fuelTransaction"),
    ]);

    const scopedExpenses = (extra: Record<string, unknown> = {}) =>
      withScope({ ...approvedOnly(), ...extra }, expenseScope);
    const scopedFuel = (extra: Record<string, unknown> = {}) =>
      withScope({ ...extra }, fuelScope);

    // ── 1. Fuel Purchased ────────────────────────────────────────
    const [fuelPurchaseAgg, fuelByTypeAgg] = await Promise.all([
      db.fuelTransaction.aggregate({
        where: scopedFuel({ type: "PURCHASE" }) as never,
        _sum: { totalCost: true },
      }),
      db.fuelTransaction.groupBy({
        by: ["fuelType"],
        where: scopedFuel({ type: "PURCHASE" }) as never,
        _sum: { totalCost: true },
      }),
    ]);
    const totalFuel = fuelPurchaseAgg._sum.totalCost ?? 0;
    const fuelBreakdown = fuelByTypeAgg.map((f) => ({
      fuelType: f.fuelType,
      total: f._sum.totalCost ?? 0,
    }));

    // ── 2. Machinery Cost (timesheets only) ──────────────────────
    const machineryList = await db.machinery.findMany({
      select: { assignedContractorId: true },
    });
    const machineryContractorIds = [
      ...new Set(machineryList.map((m) => m.assignedContractorId)),
    ];

    const machineryTimesheets = await db.timesheet.findMany({
      where: { machineryId: { not: null } } as never,
      select: {
        totalHours: true,
        contractorId: true,
        machineryRate: { select: { hourlyRate: true } },
        contractor: { select: { contractorName: true } },
      },
    });

    const machineryDetailMap: Record<
      string,
      { name: string; totalHours: number; hourlyRate: number; total: number; paid: number }
    > = {};
    for (const ts of machineryTimesheets) {
      const cId = ts.contractorId;
      if (!cId) continue;
      if (!machineryDetailMap[cId]) {
        machineryDetailMap[cId] = {
          name: ts.contractor?.contractorName ?? `Contractor ${cId.slice(0, 8)}`,
          totalHours: 0,
          hourlyRate: ts.machineryRate?.hourlyRate ?? 0,
          total: 0,
          paid: 0,
        };
      }
      const hourlyRate = ts.machineryRate?.hourlyRate ?? 0;
      machineryDetailMap[cId].totalHours += ts.totalHours;
      machineryDetailMap[cId].total += ts.totalHours * hourlyRate;
    }

    // Add paid amounts from expenses
    if (machineryContractorIds.length > 0) {
      const paidExpenses = await db.expense.findMany({
        where: scopedExpenses({
          paidToContractorId: { in: machineryContractorIds },
        }) as never,
        select: { paidToContractorId: true, amount: true },
      });
      for (const exp of paidExpenses) {
        const cId = exp.paidToContractorId;
        if (!cId || !machineryDetailMap[cId]) continue;
        machineryDetailMap[cId].paid += exp.amount;
      }
    }

    const machineryDetails = Object.values(machineryDetailMap)
      .map((d) => ({
        ...d,
        unpaid: Math.max(0, d.total - d.paid),
      }))
      .filter((d) => d.total > 0);

    const totalMachinery = machineryDetails.reduce((s, d) => s + d.total, 0);
    const machineryPaid = machineryDetails.reduce((s, d) => s + d.paid, 0);
    const machineryRemaining = Math.max(0, totalMachinery - machineryPaid);

    // ── 3. Employee Salaries ─────────────────────────────────────
    const allEmployees = await db.employee.findMany({
      select: { id: true, fullName: true, salary: true, status: true, hireDate: true },
    });
    const activeEmployees = allEmployees.filter((e) => e.status === "ACTIVE");
    const inactiveEmployees = allEmployees.filter((e) => e.status !== "ACTIVE");

    // Active employees: salary/30 * days since hireDate
    const now = new Date();
    let totalActiveEarned = 0;
    const activeDetails: { id: string; name: string; status: string; total: number; paid: number; unpaid: number }[] = [];
    for (const emp of activeEmployees) {
      const hireDate = new Date(emp.hireDate);
      const daysSinceHire = Math.max(0, Math.floor((now.getTime() - hireDate.getTime()) / (1000 * 60 * 60 * 24)));
      const earned = (emp.salary / 30) * daysSinceHire;
      totalActiveEarned += earned;
      activeDetails.push({
        id: emp.id,
        name: emp.fullName,
        status: "ACTIVE",
        total: earned,
        paid: 0,
        unpaid: earned,
      });
    }

    // Inactive employees: sum of paid salary expenses
    const inactiveIds = inactiveEmployees.map((e) => e.id);
    let totalInactivePaid = 0;
    const inactiveDetails: { id: string; name: string; status: string; total: number; paid: number; unpaid: number }[] = [];
    if (inactiveIds.length > 0) {
      const salaryExpenses = await db.expense.findMany({
        where: scopedExpenses({
          category: "SALARY",
          paidToId: { in: inactiveIds },
        }) as never,
        select: { paidToId: true, amount: true },
      });
      const paidMap: Record<string, number> = {};
      for (const exp of salaryExpenses) {
        if (!exp.paidToId) continue;
        paidMap[exp.paidToId] = (paidMap[exp.paidToId] ?? 0) + exp.amount;
      }
      for (const emp of inactiveEmployees) {
        const paid = paidMap[emp.id] ?? 0;
        totalInactivePaid += paid;
        inactiveDetails.push({
          id: emp.id,
          name: emp.fullName,
          status: emp.status,
          total: paid,
          paid,
          unpaid: 0,
        });
      }
    }

    // Paid amounts for active employees
    const activeIds = activeEmployees.map((e) => e.id);
    if (activeIds.length > 0) {
      const activeSalaryExpenses = await db.expense.findMany({
        where: scopedExpenses({
          category: "SALARY",
          paidToId: { in: activeIds },
        }) as never,
        select: { paidToId: true, amount: true },
      });
      for (const exp of activeSalaryExpenses) {
        if (!exp.paidToId) continue;
        const detail = activeDetails.find((d) => d.id === exp.paidToId);
        if (detail) {
          detail.paid += exp.amount;
          detail.unpaid = Math.max(0, detail.total - detail.paid);
        }
      }
    }

    const salaryDetails = [...activeDetails, ...inactiveDetails]
      .map(({ id: _, ...rest }) => rest)
      .filter((d) => d.total > 0);
    const totalSalary = totalActiveEarned + totalInactivePaid;
    const salaryPaid = salaryDetails.reduce((s, d) => s + d.paid, 0);
    const salaryRemaining = Math.max(0, totalSalary - salaryPaid);

    // ── 4. Total Expenses (all approved − machineryPaid − salaryPaid) ──
    const allExpensesAgg = await db.expense.aggregate({
      where: withScope({ ...approvedOnly() } as never, expenseScope),
      _sum: { amount: true },
    });
    const allExpensesTotal = allExpensesAgg._sum.amount ?? 0;

    const totalExpenses = allExpensesTotal - machineryPaid - salaryPaid;

    // Category breakdown: all expenses minus machinery contractor + employee paid
    const rawExpenses = await db.expense.findMany({
      where: withScope({ ...approvedOnly() } as never, expenseScope) as never,
      select: { amount: true, category: true, paidToContractorId: true, paidToId: true },
    });
    const expenseCatMap: Record<string, number> = {};
    for (const e of rawExpenses) {
      if (machineryContractorIds.includes(e.paidToContractorId ?? "") || e.paidToId != null)
        continue;
      expenseCatMap[e.category] = (expenseCatMap[e.category] ?? 0) + e.amount;
    }
    const expenseBreakdown = Object.entries(expenseCatMap)
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);

    const grandTotal = totalFuel + totalMachinery + totalSalary + totalExpenses;

    return NextResponse.json({
      success: true,
      data: {
        totalFuel,
        totalMachinery,
        machineryPaid,
        machineryRemaining,
        totalSalary,
        salaryPaid,
        salaryRemaining,
        totalExpenses,
        grandTotal,
        fuelBreakdown,
        machineryDetails,
        salaryDetails,
        expenseBreakdown,
        lastUpdated: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Project cost summary error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch project cost summary" },
      { status: 500 }
    );
  }
}
