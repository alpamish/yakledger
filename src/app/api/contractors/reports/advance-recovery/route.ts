import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/permissions";
import { buildAccessScope } from "@/lib/access-control";
import { getAdvanceRecoveryReport } from "@/services/contractor-reports.service";

// GET /api/contractors/reports/advance-recovery - advances disbursed vs
// recovered vs written off vs outstanding per contractor in the window
export async function GET(request: NextRequest) {
  try {
    const result = await requirePermission(request, "reports:view");
    if ("status" in result) return result;
    const user = result.user;

    const scope = (await buildAccessScope(user, "contractor")) as Prisma.ContractorWhereInput;

    const { searchParams } = new URL(request.url);
    const report = await getAdvanceRecoveryReport(scope, {
      from: searchParams.get("from") ?? undefined,
      to: searchParams.get("to") ?? undefined,
    });

    return NextResponse.json({ success: true, data: report });
  } catch (error) {
    console.error("GET /api/contractors/reports/advance-recovery error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
