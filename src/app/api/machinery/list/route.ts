import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

// GET /api/machinery/list - Simple machinery list for dropdowns
export async function GET(request: NextRequest) {
  const result = await requirePermission(request, "machinery:view");
  if ("status" in result) return result;
  try {
    const { searchParams } = new URL(request.url);
    const statusesParam = searchParams.get("status");
    const statuses = statusesParam ? statusesParam.split(",").filter(Boolean) : undefined;

    const where: Record<string, unknown> = {};
    if (statuses && statuses.length > 0) {
      where.status = { in: statuses };
    }

    const machinery = await db.machinery.findMany({
      where,
      select: {
        id: true,
        machineryName: true,
        machineryType: true,
        plateNumber: true,
        driverName: true,
        status: true,
        assignedContractorId: true,
        model: true,
        fuelType: true,
        hourlyConsumptionRate: true,
        hourlyRate: true,
        dailyRate: true,
        monthlyRate: true,
        contractDaysPerMonth: true,
        workHoursPerDay: true,
        contractStartDate: true,
        contractEndDate: true,
        assignedContractor: {
          select: {
            contractorName: true,
            contractorType: true,
          },
        },
      },
      orderBy: { machineryName: "asc" },
    });

    return NextResponse.json({
      success: true,
      data: machinery,
    });
  } catch (error) {
    console.error("Machinery list error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch machinery list" },
      { status: 500 }
    );
  }
}
