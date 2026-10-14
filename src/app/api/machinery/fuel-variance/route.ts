import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permissions";
import { buildAccessScope } from "@/lib/access-control";
import { getFuelVariance } from "@/services/fuel-variance.service";

// GET /api/machinery/fuel-variance - expected (consumption rate × worked
// hours from daily logs) vs actual FuelUsage per machinery/day, plus a
// per-machine summary. Optional filters: machineryId, from, to.
export async function GET(request: NextRequest) {
  try {
    const result = await requirePermission(request, "machinery:view");
    if ("status" in result) return result;
    const user = result.user;

    const { searchParams } = new URL(request.url);
    const machineryId = searchParams.get("machineryId") || undefined;
    const from = searchParams.get("from") || undefined;
    const to = searchParams.get("to") || undefined;

    const machineryScope = await buildAccessScope(user, "machinery");

    const data = await getFuelVariance({
      machineryScope,
      machineryId,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("GET /api/machinery/fuel-variance error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
