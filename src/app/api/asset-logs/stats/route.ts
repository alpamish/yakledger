import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  const result = await requirePermission(request, "assets:view");
  if ("status" in result) return result;
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    const [totalLogs, monthLogs, yearLogs, assetSummaries] = await Promise.all([
      db.assetLog.count().catch((e) => { console.error("totalLogs error:", e); return 0; }),
      db.assetLog.count({ where: { date: { gte: startOfMonth } } }).catch((e) => { console.error("monthLogs error:", e); return 0; }),
      db.assetLog.findMany({
        where: { date: { gte: startOfYear } },
        select: {
          distanceTraveled: true,
          fuelConsumed: true,
          engineHoursUsed: true,
          date: true,
        },
      }).catch((e) => { console.error("yearLogs error:", e); return []; }),
      db.assetLog.groupBy({
        by: ["assetId"],
        _count: true,
        _sum: { distanceTraveled: true, fuelConsumed: true, engineHoursUsed: true },
        where: { date: { gte: startOfYear } },
      }).catch((e) => { console.error("assetSummaries error:", e); return []; }),
    ]);

    const totalDistance = yearLogs.reduce((s, l) => s + (l.distanceTraveled || 0), 0);
    const totalFuel = yearLogs.reduce((s, l) => s + (l.fuelConsumed || 0), 0);
    const totalEngineHours = yearLogs.reduce((s, l) => s + (l.engineHoursUsed || 0), 0);

    const avgFuelEfficiency = totalFuel > 0 ? totalDistance / totalFuel : 0;

    // Monthly breakdown
    const monthlyMap: Record<string, { distance: number }> = {};
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), i, 1);
      monthlyMap[d.toISOString().slice(0, 7)] = { distance: 0 };
    }
    for (const l of yearLogs) {
      if (l.distanceTraveled) {
        const m = l.date.toISOString().slice(0, 7);
        if (monthlyMap[m]) monthlyMap[m].distance += l.distanceTraveled;
      }
    }
    const monthlyDistance = Object.entries(monthlyMap).map(([month, v]) => ({ month, distance: v.distance }));

    // Asset summaries with names
    const assetIds = assetSummaries.map((a) => a.assetId);
    const assets = await db.asset.findMany({
      where: { id: { in: assetIds } },
      select: { id: true, name: true },
    });
    const assetNameMap = Object.fromEntries(assets.map((a) => [a.id, a.name]));

    const assetSummary = assetSummaries.map((a) => ({
      assetId: a.assetId,
      assetName: assetNameMap[a.assetId] || "Unknown",
      totalDistance: a._sum?.distanceTraveled ?? 0,
      totalFuel: a._sum?.fuelConsumed ?? 0,
      totalHours: a._sum?.engineHoursUsed ?? 0,
      logCount: a._count,
    }));

    return NextResponse.json({
      success: true,
      data: {
        totalLogs,
        monthLogs,
        totalDistance,
        totalFuelConsumed: totalFuel,
        totalEngineHours,
        avgFuelEfficiency,
        monthlyDistance,
        assetSummary,
      },
    });
  } catch (error) {
    console.error("Asset log stats error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch stats" }, { status: 500 });
  }
}
