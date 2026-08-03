import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { buildAccessScope, withScope, APPROVED } from "@/lib/access-control";

export async function GET(request: NextRequest) {
  const result = await requirePermission(request, "machinery:view");
  if ("status" in result) return result;
  const user = result.user;
  try {
    const machScope = await buildAccessScope(user, "machinery");
    const [
      totalMachinery,
      machineryByTypeRaw,
      machineryByStatusRaw,
      timesheetAgg,
      timesheetDaysAgg,
      fuelAgg,
    ] = await Promise.all([
      db.machinery.count({ where: withScope({}, machScope) }),

      db.machinery.groupBy({
        where: withScope({}, machScope),
        by: ["machineryType"],
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
      }),

      db.machinery.groupBy({
        where: withScope({}, machScope),
        by: ["status"],
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
      }),

      db.timesheet.aggregate({
        where: withScope(
          { machineryId: { not: null }, approvalStatus: APPROVED },
          await buildAccessScope(user, "timesheet")
        ),
        _sum: { totalHours: true },
      }),

      db.timesheet.findMany({
        where: withScope(
          { machineryId: { not: null }, approvalStatus: APPROVED },
          await buildAccessScope(user, "timesheet")
        ),
        select: { date: true },
        distinct: ["date"],
      }),

      db.fuelUsage.aggregate({
        where: withScope(
          { machineryId: { not: null }, approvalStatus: APPROVED },
          await buildAccessScope(user, "fuelUsage")
        ),
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
