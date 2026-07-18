import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

const WARNING_THRESHOLD = 0.05;
const CRITICAL_THRESHOLD = 0.15;

const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function getMonthLabel(month: number): string {
  return MONTH_LABELS[month - 1] || `Month ${month}`;
}

export async function GET(request: NextRequest) {
  const result = await requirePermission(request, "fuelUsage:view");
  if ("status" in result) return result;

  try {
    const { searchParams } = new URL(request.url);
    const machineryId = searchParams.get("machineryId");
    const monthParam = searchParams.get("month");

    if (!machineryId || !monthParam) {
      return NextResponse.json(
        { success: false, error: "machineryId and month are required" },
        { status: 400 }
      );
    }

    const parts = monthParam.split("-");
    if (parts.length !== 2) {
      return NextResponse.json(
        { success: false, error: "month must be in YYYY-MM format" },
        { status: 400 }
      );
    }

    const year = parseInt(parts[0], 10);
    const monthNum = parseInt(parts[1], 10);

    if (isNaN(year) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
      return NextResponse.json(
        { success: false, error: "Invalid month format" },
        { status: 400 }
      );
    }

    const mach = await db.machinery.findUnique({
      where: { id: machineryId },
      include: {
        assignedContractor: {
          select: { contractorName: true },
        },
      },
    });

    if (!mach) {
      return NextResponse.json(
        { success: false, error: "Machinery not found" },
        { status: 404 }
      );
    }

    const startDate = new Date(year, monthNum - 1, 1);
    const endDate = new Date(year, monthNum, 1);

    const fuelUsageRecords = await db.fuelUsage.findMany({
      where: {
        machineryId,
        date: { gte: startDate, lt: endDate },
      },
      select: {
        date: true,
        quantity: true,
        totalCost: true,
      },
      orderBy: { date: "asc" },
    });

    const timesheetRecords = await db.timesheet.findMany({
      where: {
        machineryId,
        date: { gte: startDate, lt: endDate },
      },
      select: {
        date: true,
        totalHours: true,
      },
    });

    const monthTotalLiters = fuelUsageRecords.reduce((s, r) => s + r.quantity, 0);
    const monthTotalCost = fuelUsageRecords.reduce((s, r) => s + r.totalCost, 0);

    const timesheetMap = new Map<string, number>();
    for (const r of timesheetRecords) {
      const dayKey = r.date.toISOString().split("T")[0];
      timesheetMap.set(dayKey, (timesheetMap.get(dayKey) || 0) + r.totalHours);
    }

    const tsMonthHours = timesheetRecords.reduce((s, r) => s + r.totalHours, 0);
    const fuelDaysSet = new Set(fuelUsageRecords.map((r) => r.date.toISOString().split("T")[0]));
    const monthHours = tsMonthHours;

    const monthlyAvgLpH = monthHours > 0 ? monthTotalLiters / monthHours : 0;

    const dailyData: Record<string, unknown>[] = [];
    const anomalies: Record<string, unknown>[] = [];

    const dayMap = new Map<string, { liters: number; cost: number }>();
    for (const r of fuelUsageRecords) {
      const dayKey = r.date.toISOString().split("T")[0];
      const existing = dayMap.get(dayKey);
      if (existing) {
        existing.liters += r.quantity;
        existing.cost += r.totalCost;
      } else {
        dayMap.set(dayKey, { liters: r.quantity, cost: r.totalCost });
      }
    }

    for (const [dateStr, dayFuel] of dayMap) {
      const hasDailyTs = timesheetMap.has(dateStr);
      const dayHours = hasDailyTs ? timesheetMap.get(dateStr)! : 0;

      const dayLpH = dayHours > 0 ? dayFuel.liters / dayHours : 0;
      const dayDeviation = monthlyAvgLpH > 0
        ? ((dayLpH - monthlyAvgLpH) / monthlyAvgLpH) * 100
        : 0;
      const isAbnormal = Math.abs(dayDeviation) >= WARNING_THRESHOLD * 100;

      dailyData.push({
        date: dateStr,
        totalLiters: dayFuel.liters,
        totalCost: dayFuel.cost,
        totalHours: dayHours,
        litersPerHour: dayLpH,
        monthlyAvgLitersPerHour: monthlyAvgLpH,
        deviationPercent: dayDeviation,
        isAbnormal,
        hasTimesheetData: hasDailyTs,
      });

      if (isAbnormal && dayHours > 0 && dayFuel.liters > 0 && monthlyAvgLpH > 0) {
        const severity = Math.abs(dayDeviation) >= CRITICAL_THRESHOLD * 100 ? "critical" : "warning";
        const direction = dayDeviation > 0 ? "above" : "below";
        anomalies.push({
          type: "day_deviation",
          severity,
          message: `${mach.machineryName}${mach.plateNumber ? ` [${mach.plateNumber}]` : ''} used ${dayLpH.toFixed(1)} L/hr on ${dateStr} vs monthly avg ${monthlyAvgLpH.toFixed(1)} L/hr (${Math.abs(dayDeviation).toFixed(1)}% ${direction})`,
          date: dateStr,
          month: monthParam,
          actualValue: dayLpH,
          expectedValue: monthlyAvgLpH,
          deviationPercent: dayDeviation,
        });
      }
    }

    dailyData.sort((a, b) => String(a.date).localeCompare(String(b.date)));

    anomalies.sort((a, b) => {
      const severityOrder = { critical: 0, warning: 1 };
      const aOrder = severityOrder[a.severity as keyof typeof severityOrder] ?? 1;
      const bOrder = severityOrder[b.severity as keyof typeof severityOrder] ?? 1;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return String(a.date || "").localeCompare(String(b.date || ""));
    });

    const contractorName = mach.assignedContractor?.contractorName ?? null;

    return NextResponse.json({
      success: true,
      data: {
        machinery: {
          id: mach.id,
          machineryName: mach.machineryName,
          machineryType: mach.machineryType,
          plateNumber: mach.plateNumber,
          driverName: mach.driverName,
          hourlyConsumptionRate: mach.hourlyConsumptionRate,
          workHoursPerDay: mach.workHoursPerDay,
          contractorName,
        },
        year,
        month: monthParam,
        monthLabel: getMonthLabel(monthNum),
        monthlyAvgLitersPerHour: monthlyAvgLpH,
        dailyData,
        anomalies,
      },
    });
  } catch (error) {
    console.error("Daily detail error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch daily breakdown" },
      { status: 500 }
    );
  }
}
