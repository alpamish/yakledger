import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission, type AuthUser } from "@/lib/permissions";
import { buildAccessScope, withScope } from "@/lib/access-control";

type Params = { params: Promise<{ id: string }> };

async function findPayment(user: AuthUser, id: string) {
  const contractorScope = await buildAccessScope(user, "contractor");
  return db.contractorPayment.findFirst({
    where: withScope({ id }, { contractor: contractorScope }),
    include: {
      contractor: { select: { id: true, contractorName: true, contractorNumber: true } },
      allocations: {
        orderBy: { createdAt: "asc" },
        include: { claim: { select: { id: true, claimNumber: true, title: true, netAmount: true, paidAmount: true } } },
      },
    },
  });
}

// GET /api/contractor-payments/[id] - payment detail with allocations
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const result = await requirePermission(request, "contractors:payments:view");
    if ("status" in result) return result;
    const user = result.user;

    const { id } = await params;
    const payment = await findPayment(user, id);
    if (!payment) {
      return NextResponse.json({ success: false, error: "Payment not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: payment });
  } catch (error) {
    console.error("GET /api/contractor-payments/[id] error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
