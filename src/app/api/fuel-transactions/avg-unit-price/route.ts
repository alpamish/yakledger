import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  const result = await requirePermission(request, "fuelUsage:view");
  if ("status" in result) return result;
  try {
    const { searchParams } = new URL(request.url);
    const fuelType = searchParams.get("fuelType");

    if (!fuelType) {
      return NextResponse.json(
        { success: false, error: "fuelType query parameter is required" },
        { status: 400 }
      );
    }

    const aggregation = await db.fuelTransaction.aggregate({
      where: { type: "PURCHASE", fuelType },
      _sum: { quantity: true, totalCost: true },
    });

    const totalQty = aggregation._sum?.quantity || 0;
    const totalCost = aggregation._sum?.totalCost || 0;
    const avgUnitPrice = totalQty > 0 ? totalCost / totalQty : 0;

    return NextResponse.json({
      success: true,
      data: { fuelType, avgUnitPrice },
    });
  } catch (error) {
    console.error("Error fetching average unit price:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch average unit price" },
      { status: 500 }
    );
  }
}
