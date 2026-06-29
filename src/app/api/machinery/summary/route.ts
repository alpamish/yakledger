import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  const result = await requirePermission(request, "machinery:view");
  if ("status" in result) return result;
  try {
    const [
      totalMachinery,
      machineryByTypeRaw,
      machineryByStatusRaw,
      timesheetAgg,
      timesheetDaysAgg,
      fuelAgg,
    ] = await Promise.all([
      db.machinery.count(),

      db.machinery.groupBy({
        by: ["machineryType"],
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
      }),

      db.machinery.groupBy({
        by: ["status"],
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
      }),

      db.timesheet.aggregate({
        where: { machineryId: { not: null } },
        _sum: { totalHours: true },
      }),

      db.timesheet.findMany({
        where: { machineryId: { not: null } },
        select: { date: true },
        distinct: ["date"],
      }),

      db.fuelUsage.aggregate({
        where: { machineryId: { not: null } },
        _sum: { quantity: true, totalCost: true },
      }),
    ]);

    const machineryByType = machineryByTypeRaw.map((t) => ({
      machineryType: t.machineryType,
      count: t._count.id,
    }));

    const machineryByStatus = machineryByStatusRaw.map((s) => ({
      status: s.status,
      count: s._count.id,
    }));

    const totalTimesheetHours = timesheetAgg._sum.totalHours ?? 0;
    const totalTimesheetDays = timesheetDaysAgg.length;
    const totalFuelQuantity = fuelAgg._sum.quantity ?? 0;
    const totalFuelCost = fuelAgg._sum.totalCost ?? 0;

    const averageFuelPerHour = totalTimesheetHours > 0
      ? totalFuelQuantity / totalTimesheetHours
      : 0;
    const averageFuelPerDay = totalTimesheetDays > 0
      ? totalFuelQuantity / totalTimesheetDays
      : 0;

    return NextResponse.json({
      success: true,
      data: {
        totalMachinery,
        machineryByType,
        machineryByStatus,
        totalTimesheetHours,
        totalTimesheetDays,
        totalFuelQuantity,
        totalFuelCost,
        averageFuelPerHour,
        averageFuelPerDay,
      },
    });
  } catch (error) {
    console.error("Machinery summary error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch machinery summary" },
      { status: 500 }
    );
  }
}
