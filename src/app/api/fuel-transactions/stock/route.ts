import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  const result = await requirePermission(request, "fuelUsage:view");
  if ("status" in result) return result;
  try {
    const { searchParams } = new URL(request.url);
    const containerId = searchParams.get("containerId") || undefined;

    if (containerId) {
      const transactions = await db.fuelTransaction.findMany({
        where: {
          OR: [
            { containerId },
            { destinationContainerId: containerId },
          ],
        },
      });

      let balance = 0;
      let totalPurchased = 0;
      let totalTransferredIn = 0;
      let totalTransferredOut = 0;
      let totalIssued = 0;

      for (const t of transactions) {
        if (t.type === "PURCHASE" && t.containerId === containerId) {
          totalPurchased += t.quantity;
          balance += t.quantity;
        } else if (t.type === "TRANSFER" && t.destinationContainerId === containerId) {
          totalTransferredIn += t.quantity;
          balance += t.quantity;
        } else if (t.type === "TRANSFER" && t.containerId === containerId) {
          totalTransferredOut += t.quantity;
          balance -= t.quantity;
        } else if (t.type === "ISSUE" && t.containerId === containerId) {
          totalIssued += t.quantity;
          balance -= t.quantity;
        }
      }

      const container = await db.asset.findUnique({
        where: { id: containerId },
        select: { id: true, name: true, fuelType: true, fuelCapacity: true, fuelLocation: true, isMainContainer: true },
      });

      const usagePercent = container?.fuelCapacity && container.fuelCapacity > 0
        ? Math.round((balance / container.fuelCapacity) * 100)
        : 0;

      return NextResponse.json({
        success: true,
        data: {
          containerId: container?.id,
          containerName: container?.name,
          fuelLocation: container?.fuelLocation,
          isMainContainer: container?.isMainContainer ?? false,
          fuelType: container?.fuelType,
          fuelCapacity: container?.fuelCapacity,
          totalPurchased,
          totalTransferredIn,
          totalTransferredOut,
          totalIssued,
          balance,
          usagePercent,
        },
      });
    }

    const fuelPurchases = await db.fuelTransaction.groupBy({
      by: ["fuelType", "type"],
      _sum: { quantity: true },
    });

    const stockMap: Record<string, { purchased: number; issued: number; transferredIn: number; transferredOut: number }> = {};
    for (const f of fuelPurchases) {
      const key = f.fuelType;
      if (!stockMap[key]) stockMap[key] = { purchased: 0, issued: 0, transferredIn: 0, transferredOut: 0 };
      if (f.type === "PURCHASE") stockMap[key].purchased += f._sum.quantity || 0;
      if (f.type === "ISSUE") stockMap[key].issued += f._sum.quantity || 0;
      if (f.type === "TRANSFER") stockMap[key].transferredOut += f._sum.quantity || 0;
    }

    const stock = Object.entries(stockMap).map(([fuelType, v]) => ({
      fuelType,
      totalPurchased: v.purchased,
      totalIssued: v.issued,
      balance: v.purchased - v.issued - v.transferredOut,
    }));

    const containers = await db.asset.findMany({
      where: { category: "FUEL", status: "ACTIVE" },
      select: { id: true, name: true, fuelType: true, fuelCapacity: true, fuelLocation: true, isMainContainer: true },
    });

    const containerStock = await Promise.all(
      containers.map(async (c) => {
        const containerTransactions = await db.fuelTransaction.findMany({
          where: {
            OR: [
              { containerId: c.id },
              { destinationContainerId: c.id },
            ],
          },
        });

        let balance = 0;
        let totalPurchased = 0;
        let totalTransferredIn = 0;
        let totalTransferredOut = 0;
        let totalIssued = 0;

        for (const t of containerTransactions) {
          if (t.type === "PURCHASE" && t.containerId === c.id) {
            totalPurchased += t.quantity;
            balance += t.quantity;
          } else if (t.type === "TRANSFER" && t.destinationContainerId === c.id) {
            totalTransferredIn += t.quantity;
            balance += t.quantity;
          } else if (t.type === "TRANSFER" && t.containerId === c.id) {
            totalTransferredOut += t.quantity;
            balance -= t.quantity;
          } else if (t.type === "ISSUE" && t.containerId === c.id) {
            totalIssued += t.quantity;
            balance -= t.quantity;
          }
        }

        const usagePercent = c.fuelCapacity && c.fuelCapacity > 0
          ? Math.round((balance / c.fuelCapacity) * 100)
          : 0;

        return {
          containerId: c.id,
          containerName: c.name,
          fuelLocation: c.fuelLocation,
          isMainContainer: c.isMainContainer,
          fuelType: c.fuelType,
          fuelCapacity: c.fuelCapacity,
          totalPurchased,
          totalTransferredIn,
          totalTransferredOut,
          totalIssued,
          balance,
          usagePercent,
        };
      })
    );

    return NextResponse.json({
      success: true,
      data: {
        stock,
        containerStock,
      },
    });
  } catch (error) {
    console.error("Fuel stock error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch fuel stock" }, { status: 500 });
  }
}
