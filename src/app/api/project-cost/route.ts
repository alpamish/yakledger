import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { CATEGORY_LABELS, CATEGORY_COLORS } from "@/types/expense";
import { PROJECT_COST_COLORS, FUEL_TYPE_LABELS } from "@/types/project-cost";
import type {
  ProjectCostData,
  ProjectCostChartData,
  ProjectCostDetail,
  CostMonthlyTrend,
} from "@/types/project-cost";

function dateParam(dateStr: string | null): Date | undefined {
  if (!dateStr) return undefined;
  return new Date(dateStr);
}

function buildDateFilter(dateFrom: string | null, dateTo: string | null, field: string): Record<string, unknown> {
  const from = dateParam(dateFrom);
  const to = dateParam(dateTo);
  if (!from && !to) return {};
  const filter: Record<string, unknown> = {};
  if (from || to) {
    filter[field] = {};
    if (from) (filter[field] as Record<string, unknown>).gte = from;
    if (to) {
      const endOfDay = new Date(to);
      endOfDay.setHours(23, 59, 59, 999);
      (filter[field] as Record<string, unknown>).lte = endOfDay;
    }
  }
  return filter;
}

function getMonthKey(date: Date): string {
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short" });
}

function groupByMonth<T>(
  items: T[],
  dateAccessor: (item: T) => Date,
  valueAccessor: (item: T) => number
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const item of items) {
    const key = getMonthKey(dateAccessor(item));
    map[key] = (map[key] ?? 0) + valueAccessor(item);
  }
  return map;
}

function getMonthRange(monthsBack: number): Date[] {
  const now = new Date();
  const months: Date[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    months.push(new Date(now.getFullYear(), now.getMonth() - i, 1));
  }
  return months;
}

export async function GET(request: NextRequest) {
  const result = await requirePermission(request, "projectCost:view");
  if ("status" in result) return result;

  try {
    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");

    const dateFilter = buildDateFilter(dateFrom, dateTo, "expenseDate");
    const fuelDateFilter = buildDateFilter(dateFrom, dateTo, "date");
    const timesheetDateFilter = buildDateFilter(dateFrom, dateTo, "date");
    const cashDateFilter = buildDateFilter(dateFrom, dateTo, "createdAt");

    const [
      totalExpAgg,
      salaryAgg,
      contractorAgg,
      fuelPurchaseAgg,
      fuelByTypeAgg,
      assetAgg,
      advanceAgg,
      returnAgg,
      transferAgg,
      allTimesheets,
      activeEmps,
      attendanceRecs,
      machineryList,
      rawExpenses,
      rawFuelPurchases,
    ] = await Promise.all([
      db.expense.aggregate({ where: dateFilter as never, _sum: { amount: true } }),

      db.expense.aggregate({
        where: { ...dateFilter, category: "SALARY" } as never,
        _sum: { amount: true },
      }),

      db.expense.aggregate({
        where: { ...dateFilter, paidToContractorId: { not: null } } as never,
        _sum: { amount: true },
      }),

      db.fuelTransaction.aggregate({
        where: { ...fuelDateFilter, type: "PURCHASE" } as never,
        _sum: { totalCost: true },
      }),

      db.fuelTransaction.groupBy({
        by: ["fuelType"],
        where: { ...fuelDateFilter, type: "PURCHASE" } as never,
        _sum: { totalCost: true },
      }),

      db.asset.aggregate({ _sum: { purchasePrice: true } }),

      db.cashTransaction.aggregate({
        where: { ...cashDateFilter, type: "ADVANCE" } as never,
        _sum: { amount: true },
      }),

      db.cashTransaction.aggregate({
        where: { ...cashDateFilter, type: "RETURN" } as never,
        _sum: { amount: true },
      }),

      db.transfer.aggregate({
        where: cashDateFilter as never,
        _sum: { amount: true },
      }),

      db.timesheet.findMany({
        where: timesheetDateFilter as never,
        select: {
          totalHours: true,
          date: true,
          machineryId: true,
          contractorId: true,
          machineryRate: { select: { hourlyRate: true } },
        },
      }),

      db.employee.findMany({
        where: { status: "ACTIVE" },
        select: { id: true, fullName: true, salary: true },
      }),

      db.attendance.findMany({
        where: {
          employee: { status: "ACTIVE" },
          ...timesheetDateFilter,
          status: { in: ["PRESENT", "HALF_DAY"] },
        } as never,
        select: { employeeId: true, status: true, date: true },
      }),

      db.machinery.findMany({
        select: { assignedContractorId: true },
      }),

      db.expense.findMany({
        where: dateFilter as never,
        select: {
          amount: true,
          expenseDate: true,
          category: true,
          paidToContractorId: true,
          paidById: true,
          paidToEmployee: { select: { id: true, fullName: true } },
          paidToContractor: { select: { id: true, contractorName: true } },
        },
      }),

      db.fuelTransaction.findMany({
        where: { ...fuelDateFilter, type: "PURCHASE" } as never,
        select: { totalCost: true, date: true, fuelType: true },
      }),
    ]);

    // ── 1. Expenses ──────────────────────────────────────────────
    const totalExpensesAmount = totalExpAgg._sum.amount ?? 0;

    // ── 2. Machinery Cost ────────────────────────────────────────
    const machineryContractorIds = [
      ...new Set(machineryList.map((m) => m.assignedContractorId)),
    ];
    let machineryPaid = 0;
    if (machineryContractorIds.length > 0) {
      const paidResult = await db.expense.aggregate({
        where: {
          ...dateFilter,
          paidToContractorId: { in: machineryContractorIds },
        } as never,
        _sum: { amount: true },
      });
      machineryPaid = paidResult._sum.amount ?? 0;
    }

    const machineryTimesheets = allTimesheets.filter((ts) => ts.machineryId);
    const machineryComputedCost = machineryTimesheets.reduce((sum, ts) => {
      const hourlyRate = ts.machineryRate?.hourlyRate ?? 0;
      return sum + ts.totalHours * hourlyRate;
    }, 0);
    const machineryUnpaid = Math.max(0, machineryComputedCost - machineryPaid);
    const machineryTotal = machineryPaid + machineryUnpaid;

    // ── 3. Employee Salaries ─────────────────────────────────────
    const salaryPaid = salaryAgg._sum.amount ?? 0;
    const attendanceCount: Record<string, { present: number; halfDay: number }> = {};
    for (const rec of attendanceRecs) {
      if (!attendanceCount[rec.employeeId]) {
        attendanceCount[rec.employeeId] = { present: 0, halfDay: 0 };
      }
      if (rec.status === "PRESENT") attendanceCount[rec.employeeId].present++;
      if (rec.status === "HALF_DAY") attendanceCount[rec.employeeId].halfDay++;
    }
    let totalEarnedSalary = 0;
    const perEmployeeEarned: Record<string, number> = {};
    for (const emp of activeEmps) {
      const att = attendanceCount[emp.id];
      if (att) {
        const dailySalary = emp.salary / 30;
        const days = att.present + att.halfDay * 0.5;
        const earned = dailySalary * days;
        perEmployeeEarned[emp.id] = earned;
        totalEarnedSalary += earned;
      }
    }
    const salaryUnpaid = Math.max(0, totalEarnedSalary - salaryPaid);
    const salaryTotal = salaryPaid + salaryUnpaid;

    // ── 4. Contractor Payments ───────────────────────────────────
    const contractorPaid = contractorAgg._sum.amount ?? 0;
    const contractorComputedCost = allTimesheets.reduce((sum, ts) => {
      const hourlyRate = ts.machineryRate?.hourlyRate ?? 0;
      return sum + ts.totalHours * hourlyRate;
    }, 0);
    const contractorRemaining = Math.max(0, contractorComputedCost - contractorPaid);
    const contractorTotal = contractorPaid + contractorRemaining;

    // ── 5. Fuel Cost ─────────────────────────────────────────────
    const fuelTotal = fuelPurchaseAgg._sum.totalCost ?? 0;
    const fuelByTypeList = fuelByTypeAgg.map((f) => ({
      fuelType: f.fuelType,
      total: f._sum.totalCost ?? 0,
    }));

    // ── Expense Breakdown ──────────────────────────────────────────
    const expenseCategoryMap: Record<string, { amount: number; count: number }> = {};
    for (const e of rawExpenses) {
      const cat = e.category;
      if (!expenseCategoryMap[cat]) expenseCategoryMap[cat] = { amount: 0, count: 0 };
      expenseCategoryMap[cat].amount += e.amount;
      expenseCategoryMap[cat].count++;
    }
    const expenseBreakdown = Object.entries(expenseCategoryMap)
      .map(([category, data]) => ({
        category,
        amount: data.amount,
        color: CATEGORY_COLORS[category as keyof typeof CATEGORY_COLORS] ?? "#78716c",
        count: data.count,
      }))
      .sort((a, b) => b.amount - a.amount);

    // ── 6. Asset Purchases ───────────────────────────────────────
    const assetPurchaseTotal = assetAgg._sum.purchasePrice ?? 0;

    // ── 7. Cash Advances ─────────────────────────────────────────
    const advanceTotal = advanceAgg._sum.amount ?? 0;
    const returnTotal = returnAgg._sum.amount ?? 0;
    const advanceRemaining = Math.max(0, advanceTotal - returnTotal);

    // ── 8. Wallet Transfers ──────────────────────────────────────
    const transferTotal = transferAgg._sum.amount ?? 0;

    // ── Per-Entity Details ───────────────────────────────────────
    const employeeSalaryDetails: ProjectCostDetail[] = activeEmps
      .map((emp) => {
        const earned = perEmployeeEarned[emp.id] ?? 0;
        const paid = rawExpenses
          .filter((e) => e.category === "SALARY" && e.paidToId === emp.id)
          .reduce((s, e) => s + e.amount, 0);
        return {
          name: emp.fullName,
          paid,
          unpaid: Math.max(0, earned - paid),
          total: earned,
        };
      })
      .filter((d) => d.total > 0);

    const machineryDetailMap: Record<string, ProjectCostDetail> = {};
    for (const ts of machineryTimesheets) {
      const cId = ts.contractorId;
      if (!cId) continue;
      if (!machineryDetailMap[cId]) {
        const contractor = rawExpenses.find((e) => e.paidToContractorId === cId)
          ?.paidToContractor?.contractorName;
        machineryDetailMap[cId] = {
          name: contractor ?? `Contractor ${cId.slice(0, 8)}`,
          paid: 0,
          unpaid: 0,
          total: 0,
        };
      }
      const hourlyRate = ts.machineryRate?.hourlyRate ?? 0;
      machineryDetailMap[cId].total += ts.totalHours * hourlyRate;
    }
    for (const exp of rawExpenses) {
      if (!exp.paidToContractorId) continue;
      if (!machineryContractorIds.includes(exp.paidToContractorId)) continue;
      if (!machineryDetailMap[exp.paidToContractorId]) {
        machineryDetailMap[exp.paidToContractorId] = {
          name: exp.paidToContractor?.contractorName ?? `Contractor ${exp.paidToContractorId.slice(0, 8)}`,
          paid: 0,
          unpaid: 0,
          total: 0,
        };
      }
      machineryDetailMap[exp.paidToContractorId].paid += exp.amount;
      machineryDetailMap[exp.paidToContractorId].total += exp.amount;
    }
    for (const key of Object.keys(machineryDetailMap)) {
      const d = machineryDetailMap[key];
      d.unpaid = Math.max(0, d.total - d.paid);
    }
    const machineryDetails = Object.values(machineryDetailMap).filter((d) => d.total > 0);

    const contractorDetailMap: Record<string, ProjectCostDetail> = {};
    for (const exp of rawExpenses) {
      if (!exp.paidToContractorId) continue;
      if (!contractorDetailMap[exp.paidToContractorId]) {
        contractorDetailMap[exp.paidToContractorId] = {
          name: exp.paidToContractor?.contractorName ?? `Contractor ${exp.paidToContractorId.slice(0, 8)}`,
          paid: 0,
          unpaid: 0,
          total: 0,
        };
      }
      contractorDetailMap[exp.paidToContractorId].paid += exp.amount;
    }
    for (const ts of allTimesheets) {
      const cId = ts.contractorId;
      if (!cId) continue;
      if (!contractorDetailMap[cId]) {
        contractorDetailMap[cId] = {
          name: `Contractor ${cId.slice(0, 8)}`,
          paid: 0,
          unpaid: 0,
          total: 0,
        };
      }
      const hourlyRate = ts.machineryRate?.hourlyRate ?? 0;
      contractorDetailMap[cId].total += ts.totalHours * hourlyRate;
    }
    for (const key of Object.keys(contractorDetailMap)) {
      const d = contractorDetailMap[key];
      d.unpaid = Math.max(0, d.total - d.paid);
    }
    const contractorDetails = Object.values(contractorDetailMap).filter((d) => d.total > 0);

    const advanceDetailMap: Record<string, ProjectCostDetail> = {};
    const allAdvances = await db.cashTransaction.findMany({
      where: { ...cashDateFilter, type: { in: ["ADVANCE", "RETURN"] } } as never,
      select: { amount: true, type: true, employee: { select: { id: true, fullName: true } } },
    });
    for (const txn of allAdvances) {
      const empId = txn.employee?.id;
      if (!empId) continue;
      if (!advanceDetailMap[empId]) {
        advanceDetailMap[empId] = {
          name: txn.employee?.fullName ?? empId,
          paid: 0,
          unpaid: 0,
          total: 0,
        };
      }
      if (txn.type === "ADVANCE") {
        advanceDetailMap[empId].paid += txn.amount;
        advanceDetailMap[empId].total += txn.amount;
      } else {
        advanceDetailMap[empId].unpaid += txn.amount;
      }
    }
    for (const key of Object.keys(advanceDetailMap)) {
      const d = advanceDetailMap[key];
      const origTotal = d.paid;
      d.unpaid = Math.max(0, origTotal - d.unpaid);
      d.total = d.paid;
      d.paid = Math.max(0, origTotal - (origTotal - d.unpaid));
    }
    const advanceDetails = Object.values(advanceDetailMap).filter((d) => d.total > 0);

    const fuelDetails: ProjectCostDetail[] = fuelByTypeList.map((f) => ({
      name: FUEL_TYPE_LABELS[f.fuelType] ?? f.fuelType,
      paid: 0,
      unpaid: 0,
      total: f.total,
    }));

    // ── Monthly Trend ────────────────────────────────────────────
    const expenseMonthMap = groupByMonth(
      rawExpenses as { expenseDate: Date; amount: number }[],
      (e) => new Date(e.expenseDate),
      (e) => e.amount
    );
    const fuelMonthMap = groupByMonth(
      (rawFuelPurchases as { date: Date; totalCost: number }[]).filter((f) => f.totalCost != null),
      (f) => new Date(f.date),
      (f) => f.totalCost!
    );
    const machineryMonthMap = groupByMonth(
      machineryTimesheets as { date: Date; totalHours: number; machineryRate?: { hourlyRate: number } | null }[],
      (ts) => new Date(ts.date),
      (ts) => {
        const hourlyRate = ts.machineryRate?.hourlyRate ?? 0;
        return ts.totalHours * hourlyRate;
      }
    );
    const contractorMonthMap = groupByMonth(
      allTimesheets as { date: Date; totalHours: number; machineryRate?: { hourlyRate: number } | null }[],
      (ts) => new Date(ts.date),
      (ts) => {
        const hourlyRate = ts.machineryRate?.hourlyRate ?? 0;
        return ts.totalHours * hourlyRate;
      }
    );

    const months = getMonthRange(6);
    const monthlyTrend: CostMonthlyTrend[] = months.map((m) => {
      const key = getMonthKey(m);
      return {
        month: key,
        expenses: expenseMonthMap[key] ?? 0,
        fuelCost: fuelMonthMap[key] ?? 0,
        machineryCost: machineryMonthMap[key] ?? 0,
        contractorCost: contractorMonthMap[key] ?? 0,
      };
    });

    // ── Chart Data ───────────────────────────────────────────────
    const sections: { key: string; label: string; value: number }[] = [
      { key: "expenses", label: "Expenses", value: totalExpensesAmount },
      { key: "machinery", label: "Machinery Cost", value: machineryTotal },
      { key: "employeeSalaries", label: "Employee Salaries", value: salaryTotal },
      { key: "contractorPayments", label: "Contractor Payments", value: contractorTotal },
      { key: "fuelCost", label: "Fuel Cost", value: fuelTotal },
      { key: "assetPurchases", label: "Asset Purchases", value: assetPurchaseTotal },
      { key: "cashAdvances", label: "Cash Advances", value: advanceTotal },
    ];

    const byCategory: ProjectCostChartData[] = sections
      .filter((s) => s.value > 0)
      .map((s) => ({
        name: s.label,
        value: s.value,
        color: PROJECT_COST_COLORS[s.key] ?? "#78716c",
      }));

    const data: ProjectCostData = {
      expenses: { total: totalExpensesAmount },
      machinery: { paid: machineryPaid, unpaid: machineryUnpaid, total: machineryTotal },
      employeeSalaries: { paid: salaryPaid, unpaid: salaryUnpaid, total: salaryTotal },
      contractorPayments: { paid: contractorPaid, remaining: contractorRemaining, total: contractorTotal },
      fuelCost: { total: fuelTotal, byFuelType: fuelByTypeList },
      assetPurchases: { total: assetPurchaseTotal },
      cashAdvances: { total: advanceTotal, remaining: advanceRemaining },
      walletTransfers: { total: transferTotal },
      details: {
        employeeSalaries: employeeSalaryDetails,
        machinery: machineryDetails,
        contractorPayments: contractorDetails,
        cashAdvances: advanceDetails,
        fuelCost: fuelDetails,
      },
      monthlyTrend,
      byCategory,
      expenseBreakdown,
      lastUpdated: new Date().toISOString(),
    };

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Project cost error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch project cost data" },
      { status: 500 }
    );
  }
}
