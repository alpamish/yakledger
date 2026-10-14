import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/permissions";
import { buildAccessScope } from "@/lib/access-control";
import { getPayableAgingReport } from "@/services/contractor-reports.service";

// GET /api/contractors/reports/payable-aging - portfolio aging of unpaid claims
// (buckets by days since periodEnd against `asOf`, defaults to today)
export async function GET(request: NextRequest) {
  try {
    const result = await requirePermission(request, "reports:view");
    if ("status" in result) return result;
    const user = result.user;

    const scope = (await buildAccessScope(user, "contractor")) as Prisma.ContractorWhereInput;

    const { searchParams } = new URL(request.url);
    const asOf = searchParams.get("asOf") ?? undefined;

    const report = await getPayableAgingReport(scope, asOf);
    return NextResponse.json({ success: true, data: report });
  } catch (error) {
    console.error("GET /api/contractors/reports/payable-aging error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
