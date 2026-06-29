import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  try {
    const result = await requirePermission(request, "assets:view");
    if ("status" in result) return result;
    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get("includeInactive") === "true";

    const where: Record<string, unknown> = { category: "FUEL" };
    if (!includeInactive) where.status = "ACTIVE";

    const containers = await db.asset.findMany({
      where: where as never,
      select: {
        id: true,
        name: true,
        fuelType: true,
        fuelCapacity: true,
        fuelLocation: true,
        isMainContainer: true,
        status: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ isMainContainer: "desc" }, { name: "asc" }],
    });

    const containerStock = await Promise.all(
      containers.map(async (c) => {
        const transactions = await db.fuelTransaction.findMany({
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

        for (const t of transactions) {
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
          id: c.id,
          name: c.name,
          fuelType: c.fuelType,
          fuelCapacity: c.fuelCapacity,
          fuelLocation: c.fuelLocation,
          isMainContainer: c.isMainContainer,
          status: c.status,
          notes: c.notes,
          balance,
          usagePercent,
          totalPurchased,
          totalTransferredIn,
          totalTransferredOut,
          totalIssued,
        };
      })
    );

    return NextResponse.json({ success: true, data: containerStock });
  } catch (error) {
    console.error("Get fuel containers error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch fuel containers" }, { status: 500 });
  }
}
