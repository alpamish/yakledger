import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  const result = await requirePermission(request, "fuelUsage:view");
  if ("status" in result) return result;
  try {
    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get("dateFrom") || undefined;
    const dateTo = searchParams.get("dateTo") || undefined;

    const dateFilter: Record<string, unknown> = {};
    if (dateFrom || dateTo) {
      dateFilter.date = {};
      if (dateFrom) (dateFilter.date as Record<string, unknown>).gte = new Date(dateFrom);
      if (dateTo) (dateFilter.date as Record<string, unknown>).lte = new Date(dateTo + "T23:59:59.999Z");
    }

    const [aggregation, dailyGroup, typeGroup, fuelGroup, count] = await Promise.all([
      db.fuelUsage.aggregate({
        where: dateFilter,
        _sum: { quantity: true, totalCost: true },
        _avg: { unitPrice: true },
      }),
      db.fuelUsage.groupBy({
        by: ["date"],
        where: dateFilter,
        _sum: { quantity: true, totalCost: true },
        _count: true,
        orderBy: { date: "asc" },
      }),
      db.fuelUsage.groupBy({
        by: ["machineryId"],
        where: dateFilter,
        _sum: { quantity: true, totalCost: true },
      }),
      db.fuelUsage.groupBy({
        by: ["fuelType"],
        where: dateFilter,
        _sum: { quantity: true, totalCost: true },
      }),
      db.fuelUsage.count({ where: dateFilter }),
    ]);

    const dailyUsage = dailyGroup.map((d) => ({
      date: d.date.toISOString().split("T")[0],
      quantity: d._sum.quantity || 0,
      cost: d._sum.totalCost || 0,
    }));

    const machineryIds = typeGroup.map((t) => t.machineryId).filter(Boolean) as string[];
    const machineryMap: Record<string, string> = {};
    if (machineryIds.length > 0) {
      const machines = await db.machinery.findMany({
        where: { id: { in: machineryIds } },
        select: { id: true, machineryType: true },
      });
      for (const m of machines) {
        machineryMap[m.id] = m.machineryType;
      }
    }

    const byMachineryTypeMap: Record<string, { quantity: number; cost: number }> = {};
    for (const t of typeGroup) {
      if (!t.machineryId) continue;
      const type = machineryMap[t.machineryId] || "Unknown";
      if (!byMachineryTypeMap[type]) byMachineryTypeMap[type] = { quantity: 0, cost: 0 };
      byMachineryTypeMap[type].quantity += t._sum.quantity || 0;
      byMachineryTypeMap[type].cost += t._sum.totalCost || 0;
    }
    const byMachineryType = Object.entries(byMachineryTypeMap)
      .map(([machineryType, v]) => ({ machineryType, quantity: v.quantity, cost: v.cost }))
      .sort((a, b) => b.quantity - a.quantity);

    const byFuelType = fuelGroup
      .map((f) => ({
        fuelType: f.fuelType,
        quantity: f._sum.quantity || 0,
        cost: f._sum.totalCost || 0,
      }))
      .sort((a, b) => b.quantity - a.quantity);

    return NextResponse.json({
      success: true,
      data: {
        totalQuantity: aggregation._sum.quantity || 0,
        totalCost: aggregation._sum.totalCost || 0,
        avgUnitPrice: aggregation._avg.unitPrice || 0,
        recordCount: count,
        dailyUsage,
        byMachineryType,
        byFuelType,
      },
    });
  } catch (error) {
    console.error("Fuel usage summary error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch fuel usage summary" }, { status: 500 });
  }
}
