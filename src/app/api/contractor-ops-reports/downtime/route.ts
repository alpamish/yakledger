import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/permissions";
import { buildAccessScope } from "@/lib/access-control";
import { getDowntimeReport } from "@/services/contractor-ops-report.service";

// GET /api/contractor-ops-reports/downtime - downtime records per machinery
// and reason (open records clamped to the window), chargeable split
export async function GET(request: NextRequest) {
  try {
    const result = await requirePermission(request, "reports:view");
    if ("status" in result) return result;
    const user = result.user;

    const scope = (await buildAccessScope(user, "machinery")) as Prisma.MachineryWhereInput;

    const { searchParams } = new URL(request.url);
    const report = await getDowntimeReport(scope, {
      from: searchParams.get("from") ?? undefined,
      to: searchParams.get("to") ?? undefined,
    });

    return NextResponse.json({ success: true, data: report });
  } catch (error) {
    console.error("GET /api/contractor-ops-reports/downtime error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
