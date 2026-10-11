import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { buildAccessScope, withScope } from "@/lib/access-control";

type Params = { params: Promise<{ id: string; rateId: string }> };

// POST /api/contracts/[id]/rates/[rateId]/approve - approve a pending rate.
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const result = await requirePermission(request, "contracts:approve");
    if ("status" in result) return result;
    const user = result.user;

    const { id, rateId } = await params;
    const scope = await buildAccessScope(user, "contract");
    const contract = await db.contractorContract.findFirst({
      where: withScope({ id }, scope),
      select: { id: true, contractNumber: true },
    });
    if (!contract) {
      return NextResponse.json({ success: false, error: "Contract not found" }, { status: 404 });
    }

    const rate = await db.contractRate.findFirst({
      where: { id: rateId, contractId: id },
    });
    if (!rate) {
      return NextResponse.json({ success: false, error: "Rate not found" }, { status: 404 });
    }
    if (rate.approvedAt) {
      return NextResponse.json(
        { success: false, error: "Rate is already approved" },
        { status: 400 }
      );
    }

    const approved = await db.$transaction(async (tx) => {
      const updated = await tx.contractRate.update({
        where: { id: rateId },
        data: { approvedAt: new Date(), approvedById: user.id },
      });
      await tx.auditLog.create({
        data: {
          action: "APPROVE",
          entity: "ContractRate",
          entityId: rateId,
          details: `Approved rate ${updated.label} (${updated.rateType} ${updated.amount}) on ${contract.contractNumber}`,
          userId: user.id,
        },
      });
      return updated;
    });

    return NextResponse.json({ success: true, data: approved });
  } catch (error) {
    console.error("POST /api/contracts/[id]/rates/[rateId]/approve error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
