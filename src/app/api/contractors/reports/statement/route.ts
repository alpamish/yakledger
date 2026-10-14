import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission, type AuthUser } from "@/lib/permissions";
import { buildAccessScope, withScope } from "@/lib/access-control";
import { getStatementReport } from "@/services/contractor-reports.service";

async function findContractor(user: AuthUser, id: string) {
  const scope = await buildAccessScope(user, "contractor");
  return db.contractor.findFirst({
    where: withScope({ id }, scope),
    select: { id: true },
  });
}

// GET /api/contractors/reports/statement - printable contractor statement
// (period window, chronological lines, opening/closing balance, type totals)
export async function GET(request: NextRequest) {
  try {
    const result = await requirePermission(request, "reports:view");
    if ("status" in result) return result;
    const user = result.user;

    const { searchParams } = new URL(request.url);
    const contractorId = searchParams.get("contractorId");
    if (!contractorId) {
      return NextResponse.json(
        { success: false, error: "contractorId is required" },
        { status: 400 }
      );
    }

    const contractor = await findContractor(user, contractorId);
    if (!contractor) {
      return NextResponse.json({ success: false, error: "Contractor not found" }, { status: 404 });
    }

    const report = await getStatementReport(contractorId, {
      from: searchParams.get("from") ?? undefined,
      to: searchParams.get("to") ?? undefined,
    });
    if (!report) {
      return NextResponse.json({ success: false, error: "Contractor not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: report });
  } catch (error) {
    console.error("GET /api/contractors/reports/statement error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
