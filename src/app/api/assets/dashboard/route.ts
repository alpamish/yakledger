import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { buildAccessScope, withScope } from "@/lib/access-control";

export async function GET(request: NextRequest) {
  const result = await requirePermission(request, "assets:view");
  if ("status" in result) return result;
  const user = result.user;
  try {
    const assetScope = await buildAccessScope(user, "asset");
    const maintenanceScope = await buildAccessScope(user, "maintenance");
    const fuelTxnScope = await buildAccessScope(user, "fuelTransaction");
    const [totalAssets, assetsByCategory, assetsByStatus, underMaintenanceCount, monthlyMaintenance, monthlyFuel, totalValue] =
      await Promise.all([
        db.asset.count({ where: withScope({}, assetScope) }),
        db.asset.groupBy({ where: withScope({}, assetScope), by: ["category"], _count: true }),
        db.asset.groupBy({ where: withScope({}, assetScope), by: ["status"], _count: true }),
        db.asset.count({ where: withScope({ status: "UNDER_REPAIR" }, assetScope) }),
        db.maintenanceRecord.groupBy({
          by: ["serviceDate"],
          _sum: { cost: true },
          where: withScope(
            { serviceDate: { gte: new Date(new Date().getFullYear(), new Date().getMonth() - 11, 1) } },
            maintenanceScope
          ),
        }),
        db.fuelTransaction.groupBy({
          by: ["date"],
          where: withScope(
            {
              type: "ISSUE",
              date: { gte: new Date(new Date().getFullYear(), new Date().getMonth() - 11, 1) },
            },
            fuelTxnScope
          ),
          _sum: { quantity: true },
        }),
        db.asset.aggregate({ where: withScope({}, assetScope), _sum: { currentValue: true } }),
      ]);

    const fuelPurchases = await db.fuelTransaction.groupBy({
      by: ["fuelType", "type"],
      where: withScope({}, fuelTxnScope),
      _sum: { quantity: true },
    });

    const fuelStockMap: Record<string, { purchased: number; issued: number; transferredOut: number }> = {};
    for (const f of fuelPurchases) {
      const key = f.fuelType;
      if (!fuelStockMap[key]) fuelStockMap[key] = { purchased: 0, issued: 0, transferredOut: 0 };
      if (f.type === "PURCHASE") fuelStockMap[key].purchased += f._sum.quantity || 0;
      if (f.type === "ISSUE") fuelStockMap[key].issued += f._sum.quantity || 0;
      if (f.type === "TRANSFER") fuelStockMap[key].transferredOut += f._sum.quantity || 0;
    }
    const fuelStock = Object.entries(fuelStockMap).map(([fuelType, v]) => ({
      fuelType,
      totalPurchased: v.purchased,
      totalIssued: v.issued,
      balance: v.purchased - v.issued - v.transferredOut,
    }));

    const monthlyMaintenanceCost = monthlyMaintenance.reduce(
      (acc: Record<string, number>, r) => {
        const month = r.serviceDate.toISOString().slice(0, 7);
        acc[month] = (acc[month] || 0) + (r._sum.cost || 0);
        return acc;
      },
      {} as Record<string, number>
    );

    const monthlyFuelConsumption = monthlyFuel.reduce(
      (acc: Record<string, number>, r) => {
        const month = r.date.toISOString().slice(0, 7);
        acc[month] = (acc[month] || 0) + (r._sum.quantity || 0);
        return acc;
      },
      {} as Record<string, number>
    );

    // Fill missing months
    const months: string[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      months.push(d.toISOString().slice(0, 7));
    }

    return NextResponse.json({
      success: true,
      data: {
        totalAssets,
        assetsByCategory,
        assetsByStatus,
        fuelStock,
        underMaintenanceCount,
        monthlyMaintenanceCost: months.map((m) => ({ month: m, cost: monthlyMaintenanceCost[m] || 0 })),
        monthlyFuelConsumption: months.map((m) => ({ month: m, quantity: monthlyFuelConsumption[m] || 0 })),
        totalAssetValue: totalValue._sum.currentValue || 0,
      },
    });
  } catch (error) {
    console.error("Asset dashboard error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch dashboard" }, { status: 500 });
  }
}
