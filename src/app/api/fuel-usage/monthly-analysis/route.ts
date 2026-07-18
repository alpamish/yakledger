import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

const WARNING_THRESHOLD = 0.05;
const CRITICAL_THRESHOLD = 0.15;

const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function getMonthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function getMonthLabel(month: number): string {
  return MONTH_LABELS[month - 1] || `Month ${month}`;
}

interface FuelMonthlyGroup {
  machineryId: string;
  month: number;
  totalLiters: number;
  totalCost: number;
  recordCount: number;
}

interface TimesheetMonthlyGroup {
  machineryId: string;
  month: number;
  totalHours: number;
}

export async function GET(request: NextRequest) {
  const result = await requirePermission(request, "fuelUsage:view");
  if ("status" in result) return result;

  try {
    const { searchParams } = new URL(request.url);
    const machineryId = searchParams.get("machineryId") || undefined;
    const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()));
    const fuelTypeParam = searchParams.get("fuelType") || undefined;
    const dateFromParam = searchParams.get("dateFrom") || undefined;
    const dateToParam = searchParams.get("dateTo") || undefined;

    const currentYear = year;

    let startDate: Date;
    let endDate: Date;

    if (dateFromParam) {
      startDate = new Date(dateFromParam);
    } else {
      startDate = new Date(currentYear, 0, 1);
    }

    if (dateToParam) {
      endDate = new Date(dateToParam + "T23:59:59.999Z");
    } else {
      endDate = new Date(currentYear + 1, 0, 1);
    }

    const machineryFilter: Record<string, unknown> = {};
    if (machineryId) {
      machineryFilter.id = machineryId;
    }

    const allMachinery = await db.machinery.findMany({
      where: machineryFilter,
      include: {
        assignedContractor: {
          select: { contractorName: true },
        },
      },
      orderBy: { machineryName: "asc" },
    });

    if (allMachinery.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    const machineryIds = allMachinery.map((m) => m.id);
    const dateFilter: Record<string, unknown> = {
      date: { gte: startDate, lt: endDate } as Record<string, unknown>,
      machineryId: { in: machineryIds } as { in: string[] },
    };

    if (fuelTypeParam) {
      dateFilter.fuelType = fuelTypeParam;
    }

    const fuelQueryFilter = { ...dateFilter };

    const timesheetDateFilter = {
      date: { gte: startDate, lt: endDate } as Record<string, unknown>,
      machineryId: { in: machineryIds } as { in: string[] },
    };

    const [fuelUsageRecords, timesheetRecords] = await Promise.all([
      db.fuelUsage.findMany({
        where: fuelQueryFilter,
        select: {
          machineryId: true,
          date: true,
          quantity: true,
          totalCost: true,
        },
      }),
      db.timesheet.findMany({
        where: timesheetDateFilter,
        select: {
          machineryId: true,
          date: true,
          totalHours: true,
        },
      }),
    ]);

    const machineryMap = new Map(allMachinery.map((m) => [m.id, m]));

    const fuelByMachMonth = new Map<string, FuelMonthlyGroup>();
    const machDaysWithFuel = new Map<string, Set<string>>();

    for (const r of fuelUsageRecords) {
      if (!r.machineryId) continue;
      const month = r.date.getMonth() + 1;
      const monthKey = `${r.machineryId}_${month}`;

      const existing = fuelByMachMonth.get(monthKey);
      if (existing) {
        existing.totalLiters += r.quantity;
        existing.totalCost += r.totalCost;
        existing.recordCount += 1;
      } else {
        fuelByMachMonth.set(monthKey, {
          machineryId: r.machineryId,
          month,
          totalLiters: r.quantity,
          totalCost: r.totalCost,
          recordCount: 1,
        });
      }

      let days = machDaysWithFuel.get(r.machineryId);
      if (!days) {
        days = new Set();
        machDaysWithFuel.set(r.machineryId, days);
      }
      days.add(r.date.toISOString().split("T")[0]);
    }

    const tsByMachMonth = new Map<string, TimesheetMonthlyGroup>();

    for (const r of timesheetRecords) {
      if (!r.machineryId) continue;
      const month = r.date.getMonth() + 1;
      const monthKey = `${r.machineryId}_${month}`;

      const existing = tsByMachMonth.get(monthKey);
      if (existing) {
        existing.totalHours += r.totalHours;
      } else {
        tsByMachMonth.set(monthKey, {
          machineryId: r.machineryId,
          month,
          totalHours: r.totalHours,
        });
      }
    }

    // Pre-compute days per month per machinery (O(unique days) instead of O(days * months))
    const daysPerMachMonth = new Map<string, Map<number, number>>();
    for (const [machId, days] of machDaysWithFuel) {
      const monthCount = new Map<number, number>();
      for (const d of days) {
        const m = parseInt(d.split("-")[1], 10);
        monthCount.set(m, (monthCount.get(m) ?? 0) + 1);
      }
      daysPerMachMonth.set(machId, monthCount);
    }

    const results: Array<{
      machinery: Record<string, unknown>;
      year: number;
      monthlyData: Record<string, unknown>[];
      anomalies: Record<string, unknown>[];
    }> = [];

    for (const mach of allMachinery) {
      const monthlyData: Record<string, unknown>[] = [];
      const anomalies: Record<string, unknown>[] = [];
      let prevMonthLpH: number | null = null;
      let ytdLiters = 0;
      let ytdCost = 0;

      for (let month = 1; month <= 12; month++) {
        const monthKey = `${mach.id}_${month}`;
        const fuel = fuelByMachMonth.get(monthKey);
        const ts = tsByMachMonth.get(monthKey);

        const totalLiters = fuel?.totalLiters ?? 0;
        const totalCost = fuel?.totalCost ?? 0;
        const recordCount = fuel?.recordCount ?? 0;

        ytdLiters += totalLiters;
        ytdCost += totalCost;

        let totalHours: number;
        let hasTimesheetData: boolean;

        if (ts && ts.totalHours > 0) {
          totalHours = ts.totalHours;
          hasTimesheetData = true;
        } else {
          const dayCount = daysPerMachMonth.get(mach.id)?.get(month) ?? 0;
          totalHours = dayCount * mach.workHoursPerDay;
          hasTimesheetData = false;
        }

        const litersPerHour = totalHours > 0 ? totalLiters / totalHours : 0;
        const expectedRate = mach.hourlyConsumptionRate;
        const deviationPercent = expectedRate > 0
          ? ((litersPerHour - expectedRate) / expectedRate) * 100
          : 0;

        let monthOverMonthPercent: number | null = null;
        if (prevMonthLpH !== null && prevMonthLpH > 0) {
          monthOverMonthPercent = ((litersPerHour - prevMonthLpH) / prevMonthLpH) * 100;
        }

        monthlyData.push({
          month: getMonthKey(currentYear, month),
          monthLabel: getMonthLabel(month),
          totalLiters,
          totalCost,
          totalHours,
          litersPerHour,
          expectedRate,
          deviationPercent,
          prevMonthLitersPerHour: prevMonthLpH,
          monthOverMonthPercent,
          recordCount,
          hasTimesheetData,
          ytdLiters,
          ytdCost,
        });

        if (recordCount > 0 && expectedRate > 0 && totalLiters > 0) {
          const absDev = Math.abs(deviationPercent);
          if (absDev >= WARNING_THRESHOLD * 100) {
            const severity = absDev >= CRITICAL_THRESHOLD * 100 ? "critical" : "warning";
            const direction = deviationPercent > 0 ? "above" : "below";
            anomalies.push({
              type: "vs_expected",
              severity,
              message: `${mach.machineryName}${mach.plateNumber ? ` [${mach.plateNumber}]` : ''} used ${litersPerHour.toFixed(1)} L/hr in ${getMonthLabel(month)} vs expected ${expectedRate.toFixed(1)} L/hr (${Math.abs(deviationPercent).toFixed(1)}% ${direction})`,
              month: getMonthKey(currentYear, month),
              actualValue: litersPerHour,
              expectedValue: expectedRate,
              deviationPercent,
            });
          }
        }

        if (
          prevMonthLpH !== null &&
          prevMonthLpH > 0 &&
          recordCount > 0 &&
          monthOverMonthPercent !== null &&
          litersPerHour > 0
        ) {
          const absMom = Math.abs(monthOverMonthPercent);
          if (absMom >= WARNING_THRESHOLD * 100) {
            const severity = absMom >= CRITICAL_THRESHOLD * 100 ? "critical" : "warning";
            const direction = monthOverMonthPercent > 0 ? "increased" : "decreased";
            anomalies.push({
              type: "month_over_month",
              severity,
              message: `${mach.machineryName}${mach.plateNumber ? ` [${mach.plateNumber}]` : ''} consumption ${direction} from ${prevMonthLpH.toFixed(1)} L/hr to ${litersPerHour.toFixed(1)} L/hr between ${getMonthLabel(month - 1)} and ${getMonthLabel(month)} (${Math.abs(monthOverMonthPercent).toFixed(1)}% change)`,
              month: getMonthKey(currentYear, month),
              actualValue: litersPerHour,
              expectedValue: prevMonthLpH,
              deviationPercent: monthOverMonthPercent,
            });
          }
        }

        if (totalLiters > 0) {
          prevMonthLpH = litersPerHour;
        }
      }

      anomalies.sort((a, b) => {
        const severityOrder = { critical: 0, warning: 1 };
        const aOrder = severityOrder[a.severity as keyof typeof severityOrder] ?? 1;
        const bOrder = severityOrder[b.severity as keyof typeof severityOrder] ?? 1;
        if (aOrder !== bOrder) return aOrder - bOrder;
        const aDate = String(a.month || a.date || "");
        const bDate = String(b.month || b.date || "");
        return aDate.localeCompare(bDate);
      });

      const contractorName = (mach as Record<string, unknown>).assignedContractor
        ? ((mach as Record<string, unknown>).assignedContractor as Record<string, unknown>).contractorName as string
        : null;

      results.push({
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
        year: currentYear,
        monthlyData,
        anomalies,
      });

    }

    return NextResponse.json({ success: true, data: results });
  } catch (error) {
    console.error("Monthly analysis error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch monthly analysis" },
      { status: 500 }
    );
  }
}
