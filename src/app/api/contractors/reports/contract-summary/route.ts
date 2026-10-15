import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/permissions";
import { buildAccessScope } from "@/lib/access-control";
import { getContractSummaryReport } from "@/services/contractor-reports.service";

// GET /api/contractors/reports/contract-summary - per-contract budget vs
// approved work vs approved variations vs paid. Budget/variations are
// point-in-time (not windowed); claims window by periodEnd and retention
// releases by date, matching the other contractor finance reports.
export async function GET(request: NextRequest) {
  try {
    const result = await requirePermission(request, "reports:view");
    if ("status" in result) return result;
    const user = result.user;

    const scope = (await buildAccessScope(user, "contractor")) as Prisma.ContractorWhereInput;

    const { searchParams } = new URL(request.url);
    const report = await getContractSummaryReport(scope, {
      from: searchParams.get("from") ?? undefined,
      to: searchParams.get("to") ?? undefined,
    });

    return NextResponse.json({ success: true, data: report });
  } catch (error) {
    console.error("GET /api/contractors/reports/contract-summary error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
