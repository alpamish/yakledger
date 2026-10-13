import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission, type AuthUser } from "@/lib/permissions";
import { buildAccessScope, withScope } from "@/lib/access-control";
import { getStatement } from "@/services/contractor-ledger.service";

type Params = { params: Promise<{ id: string }> };

async function findContractor(user: AuthUser, id: string) {
  const scope = await buildAccessScope(user, "contractor");
  return db.contractor.findFirst({
    where: withScope({ id }, scope),
    select: { id: true, contractorName: true, contractorNumber: true },
  });
}

// GET /api/contractors/[id]/ledger - paginated ledger statement + balance
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const result = await requirePermission(request, "contractors:view");
    if ("status" in result) return result;
    const user = result.user;

    const { id } = await params;
    const contractor = await findContractor(user, id);
    if (!contractor) {
      return NextResponse.json({ success: false, error: "Contractor not found" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const pageSize = Math.min(
      200,
      Math.max(1, parseInt(searchParams.get("pageSize") || "50", 10) || 50)
    );
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");

    const statement = await getStatement(id, {
      page,
      pageSize,
      from: fromParam ? new Date(fromParam) : undefined,
      to: toParam ? new Date(toParam) : undefined,
    });

    return NextResponse.json({
      success: true,
      data: { contractor, ...statement },
    });
  } catch (error) {
    console.error("GET /api/contractors/[id]/ledger error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
