import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { buildAccessScope, withScope } from "@/lib/access-control";
import { getComplianceStatus } from "@/services/contractor-compliance.service";

// GET /api/contractors/[id]/compliance — aggregated compliance view: expired /
// expiring blocking docs, unverified bank accounts, live authorizations, and
// whether payments are currently blocked (same verdict as the payment gate).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await requirePermission(request, "contractors:view");
    if ("status" in result) return result;
    const user = result.user;

    const { id } = await params;
    const scope = await buildAccessScope(user, "contractor");
    const contractor = await db.contractor.findFirst({
      where: withScope({ id }, scope),
      select: { id: true },
    });
    if (!contractor) {
      return NextResponse.json({ success: false, error: "Contractor not found" }, { status: 404 });
    }

    const status = await getComplianceStatus(id);
    if (!status) {
      return NextResponse.json({ success: false, error: "Contractor not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: status });
  } catch (error) {
    console.error("GET /api/contractors/[id]/compliance error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
