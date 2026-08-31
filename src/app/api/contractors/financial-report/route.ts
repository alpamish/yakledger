import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { buildAccessScope, buildListScope, withScope } from "@/lib/access-control";
import { format } from "date-fns";

export async function POST(request: NextRequest) {
  try {
    const result = await requirePermission(request, "contractors:view");
    if ("status" in result) return result;
    const user = result.user;

    const [machineryScope, timesheetScope, expenseScope, machineryRateScope] =
      await Promise.all([
        buildAccessScope(user, "machinery"),
        buildListScope(user, "timesheet"),
        buildListScope(user, "expense"),
        buildAccessScope(user, "machineryRate"),
      ]);

    const { dateFrom, dateTo } = await request.json();

    // Fetch all machinery with contractor info
    const machineryList = await db.machinery.findMany({
      where: machineryScope,
      include: {
        assignedContractor: {
          select: {
            id: true,
            contractorName: true,
          },
        },
      },
      orderBy: [
        { assignedContractor: { contractorName: "asc" } },
        { machineryName: "asc" },
      ],
    });

    if (machineryList.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    const machineryIds = machineryList.map((m) => m.id);
    const contractorIds = [
      ...new Set(machineryList.map((m) => m.assignedContractorId)),
    ];

    // Build date filter for timesheets and expenses
    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (dateFrom) dateFilter.gte = new Date(dateFrom + "T00:00:00");
    if (dateTo) dateFilter.lte = new Date(dateTo + "T23:59:59");

    // Fetch all timesheets for all machinery
    const timesheetWhere: Record<string, unknown> = {
      machineryId: { in: machineryIds },
    };
    if (Object.keys(dateFilter).length > 0) {
      timesheetWhere.date = dateFilter;
    }

    const timesheets = await db.timesheet.findMany({
      where: withScope(timesheetWhere, timesheetScope),
      select: {
        id: true,
        machineryId: true,
        date: true,
        totalHours: true,
      },
    });

    // Fetch all expenses paid to these contractors
    const expenseWhere: Record<string, unknown> = {
      paidToContractorId: { in: contractorIds },
    };
    if (Object.keys(dateFilter).length > 0) {
      expenseWhere.expenseDate = dateFilter;
    }

    const expenses = await db.expense.findMany({
      where: withScope(expenseWhere, expenseScope),
      select: {
        id: true,
        paidToContractorId: true,
        paidBy: true,
        paidTo: true,
        notes: true,
        amount: true,
        expenseDate: true,
      },
      orderBy: { expenseDate: "desc" },
    });

    // Fetch all default MachineryRates for the machinery list
    const defaultRates = await db.machineryRate.findMany({
      where: withScope({ machineryId: { in: machineryIds }, isDefault: true }, machineryRateScope),
      select: { machineryId: true, hourlyRate: true, rateName: true },
    });
    const rateByMachinery = new Map<string, { hourlyRate: number }>(defaultRates.map((r) => [r.machineryId, { hourlyRate: r.hourlyRate }]));

    // Map machineryId -> its timesheets
    const timesheetsByMachinery = new Map<string, typeof timesheets>();
    for (const ts of timesheets) {
      const existing = timesheetsByMachinery.get(ts.machineryId) ?? [];
      existing.push(ts);
      timesheetsByMachinery.set(ts.machineryId, existing);
    }

    // Pre-compute monthlyWork and totalMoney per machinery (first pass)
    const machineryMoneyMap = new Map<string, { monthlyWork: { monthLabel: string; totalHours: number; totalWorkDays: number | null; pricePerHour: number; totalPrice: number }[]; totalHours: number; totalMoney: number; computedHourlyRate: number }>();
    for (const m of machineryList) {
      const machineryTimesheets = timesheetsByMachinery.get(m.id) ?? [];
      const defaultRate = rateByMachinery.get(m.id);
      const computedHourlyRate = defaultRate
        ? defaultRate.hourlyRate
        : (m.dailyRate > 0 ? m.dailyRate / 9 : m.hourlyRate);

      const monthMap = new Map<string, number>();
      for (const ts of machineryTimesheets) {
        const key = format(ts.date, "yyyy-MM");
        const existing = monthMap.get(key) ?? 0;
        monthMap.set(key, existing + ts.totalHours);
      }

      const monthlyWork = Array.from(monthMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, totalHours]) => {
          const [year, monthIdx] = key.split("-").map(Number);
          const date = new Date(year, monthIdx - 1, 1);
          const monthLabel = format(date, "MMMM yyyy");
          const pricePerHour = computedHourlyRate;
          const totalPrice = totalHours * pricePerHour;
          return {
            monthLabel,
            totalHours: Math.round(totalHours * 100) / 100,
            totalWorkDays: m.contractDaysPerMonth,
            pricePerHour: Math.round(pricePerHour * 100) / 100,
            totalPrice: Math.round(totalPrice * 100) / 100,
          };
        });

      const totalHours = monthlyWork.reduce((s, r) => s + r.totalHours, 0);
      const totalMoney = monthlyWork.reduce((s, r) => s + r.totalPrice, 0);
      machineryMoneyMap.set(m.id, { monthlyWork, totalHours, totalMoney, computedHourlyRate });
    }

    // Group expenses by contractor and distribute proportionally across machinery
    const contractorExpensesMap = new Map<string, typeof expenses>();
    for (const e of expenses) {
      const ctrId = e.paidToContractorId;
      if (!ctrId) continue;
      const existing = contractorExpensesMap.get(ctrId) ?? [];
      existing.push(e);
      contractorExpensesMap.set(ctrId, existing);
    }

    const machineryDistributedExpenses = new Map<string, number>();
    for (const [ctrId, ctrExpenses] of contractorExpensesMap) {
      const ctrMachines = machineryList.filter((m) => m.assignedContractorId === ctrId);
      const ctrTotalMoney = ctrMachines.reduce((s, m) => s + (machineryMoneyMap.get(m.id)?.totalMoney ?? 0), 0);
      const ctrTotalExpense = ctrExpenses.reduce((s, e) => s + e.amount, 0);

      if (ctrTotalMoney <= 0 || ctrMachines.length === 0) {
        // No earnings: assign full expense to first machine
        if (ctrMachines.length > 0) {
          machineryDistributedExpenses.set(ctrMachines[0].id, ctrTotalExpense);
        }
        continue;
      }

      let runningTotal = 0;
      for (let i = 0; i < ctrMachines.length; i++) {
        const m = ctrMachines[i];
        if (i === ctrMachines.length - 1) {
          // Last machine gets the remainder to avoid rounding errors
          machineryDistributedExpenses.set(m.id, ctrTotalExpense - runningTotal);
        } else {
          const share = (machineryMoneyMap.get(m.id)?.totalMoney ?? 0) / ctrTotalMoney;
          const distributed = Math.round(ctrTotalExpense * share * 100) / 100;
          machineryDistributedExpenses.set(m.id, distributed);
          runningTotal += distributed;
        }
      }
    }

    // Build report data
    const reportData = machineryList.map((m) => {
      const agg = machineryMoneyMap.get(m.id) ?? { monthlyWork: [], totalHours: 0, totalMoney: 0, computedHourlyRate: 0 };
      const totalWithdrawals = machineryDistributedExpenses.get(m.id) ?? 0;
      const totalReceivable = agg.totalMoney - totalWithdrawals;

      const machineryPayments = expenses.filter(
        (e) => e.paidToContractorId === m.assignedContractorId
      );
      const payments = machineryPayments.map((e) => ({
        date: format(e.expenseDate, "yyyy/MM/dd"),
        giver: e.paidBy,
        receiver: e.paidTo,
        description: e.notes ?? "",
        amount: e.amount,
      }));

      return {
        machineryId: m.id,
        machineryName: m.machineryName,
        plateNumber: m.plateNumber,
        driverName: m.driverName,
        hourlyRate: Math.round(agg.computedHourlyRate * 100) / 100,
        dailyRate: m.dailyRate,
        contractorId: m.assignedContractorId,
        contractorName: m.assignedContractor?.contractorName ?? "",
        workHoursPerDay: m.workHoursPerDay,
        contractDaysPerMonth: m.contractDaysPerMonth,
        monthlyWork: agg.monthlyWork,
        summary: {
          totalHours: Math.round(agg.totalHours * 100) / 100,
          totalMoney: Math.round(agg.totalMoney * 100) / 100,
          totalWithdrawals: Math.round(totalWithdrawals * 100) / 100,
          totalReceivable: Math.round(totalReceivable * 100) / 100,
        },
        payments,
      };
    });

    return NextResponse.json({ success: true, data: reportData });
  } catch (error) {
    console.error("Financial report error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch financial report" },
      { status: 500 }
    );
  }
}
