import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission, type AuthUser } from "@/lib/permissions";
import { buildAccessScope, withScope } from "@/lib/access-control";
import { getOutstandingByContractor, getAging } from "@/services/contractor-ledger.service";

type Params = { params: Promise<{ id: string }> };

async function findContractor(user: AuthUser, id: string) {
  const scope = await buildAccessScope(user, "contractor");
  return db.contractor.findFirst({
    where: withScope({ id }, scope),
    select: { id: true, contractorName: true, contractorNumber: true },
  });
}

// GET /api/contractors/[id]/outstanding - per-claim outstanding + aging
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const result = await requirePermission(request, "contractors:claims:view");
    if ("status" in result) return result;
    const user = result.user;

    const { id } = await params;
    const contractor = await findContractor(user, id);
    if (!contractor) {
      return NextResponse.json({ success: false, error: "Contractor not found" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const asOf = searchParams.get("asOf") ? new Date(searchParams.get("asOf")!) : new Date();

    const [outstanding, aging, balance] = await Promise.all([
      getOutstandingByContractor(id),
      getAging(id, asOf),
      db.contractorLedgerEntry.aggregate({
        _sum: { amount: true },
        where: { contractorId: id },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        contractor,
        ...outstanding,
        aging,
        balance: Math.round((balance._sum.amount ?? 0) * 100) / 100,
      },
    });
  } catch (error) {
    console.error("GET /api/contractors/[id]/outstanding error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
