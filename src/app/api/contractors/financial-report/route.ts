import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { format } from "date-fns";

export async function POST(request: NextRequest) {
  try {
    const result = await requirePermission(request, "contractors:view");
    if ("status" in result) return result;

    const { dateFrom, dateTo } = await request.json();

    // Fetch all machinery with contractor info
    const machineryList = await db.machinery.findMany({
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
      where: timesheetWhere,
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
      where: expenseWhere,
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
      where: { machineryId: { in: machineryIds }, isDefault: true },
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

    // Map machineryId -> expenses paid to its contractor
    const machineryExpensesMap = new Map<string, typeof expenses>();
    for (const m of machineryList) {
      const ctrId = m.assignedContractorId;
      const ctrExpenses = expenses.filter((e) => e.paidToContractorId === ctrId);
      machineryExpensesMap.set(m.id, ctrExpenses);
    }

    // Build report data
    const reportData = machineryList.map((m) => {
      const machineryTimesheets = timesheetsByMachinery.get(m.id) ?? [];
      const machineryPayments = machineryExpensesMap.get(m.id) ?? [];

      // Calculate hourly rate: prefer default MachineryRate, fallback to machinery fields
      const defaultRate = rateByMachinery.get(m.id);
      const computedHourlyRate = defaultRate
        ? defaultRate.hourlyRate
        : (m.dailyRate > 0 ? m.dailyRate / 9 : m.hourlyRate);

      // Group timesheets by year+month
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
      const totalWithdrawals = machineryPayments.reduce((s, e) => s + e.amount, 0);
      const totalReceivable = totalMoney - totalWithdrawals;

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
        hourlyRate: Math.round(computedHourlyRate * 100) / 100,
        dailyRate: m.dailyRate,
        contractorId: m.assignedContractorId,
        contractorName: m.assignedContractor?.contractorName ?? "",
        workHoursPerDay: m.workHoursPerDay,
        contractDaysPerMonth: m.contractDaysPerMonth,
        monthlyWork,
        summary: {
          totalHours: Math.round(totalHours * 100) / 100,
          totalMoney: Math.round(totalMoney * 100) / 100,
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
