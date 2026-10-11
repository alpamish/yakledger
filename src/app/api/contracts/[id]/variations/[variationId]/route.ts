import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { buildAccessScope, withScope } from "@/lib/access-control";

const decideSchema = z.object({
  action: z.enum(["approve", "reject"]),
  note: z.string().max(2000).optional(),
});

type Params = { params: Promise<{ id: string; variationId: string }> };

// POST /api/contracts/[id]/variations/[variationId] - approve/reject a variation.
// Approval applies the variation: contract value changes, and an optional rate
// change becomes a NEW effective-dated ContractRate row (history untouched).
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const result = await requirePermission(request, "contracts:approve");
    if ("status" in result) return result;
    const user = result.user;

    const { id, variationId } = await params;

    const body = await request.json();
    const parsed = decideSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      );
    }
    const { action, note } = parsed.data;

    const scope = await buildAccessScope(user, "contract");
    const contract = await db.contractorContract.findFirst({
      where: withScope({ id }, scope),
      select: { id: true, contractNumber: true, status: true },
    });
    if (!contract) {
      return NextResponse.json({ success: false, error: "Contract not found" }, { status: 404 });
    }

    const variation = await db.contractVariation.findFirst({
      where: { id: variationId, contractId: id },
    });
    if (!variation) {
      return NextResponse.json({ success: false, error: "Variation not found" }, { status: 404 });
    }
    if (variation.status !== "PENDING") {
      return NextResponse.json(
        { success: false, error: `Variation is already ${variation.status.toLowerCase()}` },
        { status: 400 }
      );
    }

    const approved = action === "approve";

    const updated = await db.$transaction(async (tx) => {
      const result = await tx.contractVariation.update({
        where: { id: variationId },
        data: {
          status: approved ? "APPROVED" : "REJECTED",
          approvedAt: new Date(),
          approvedById: user.id,
        },
      });

      if (approved) {
        // Apply the contract value change.
        if (variation.valueChange !== 0) {
          await tx.contractorContract.update({
            where: { id },
            data: { value: { increment: variation.valueChange } },
          });
        }

        // Apply an embedded rate change as a new effective-dated tier.
        if (variation.rateLabel && variation.newAmount != null) {
          await tx.contractRate.updateMany({
            where: { contractId: id, label: variation.rateLabel, isDefault: true },
            data: { isDefault: false },
          });
          await tx.contractRate.create({
            data: {
              contractId: id,
              label: variation.rateLabel,
              rateType: "HOURLY",
              amount: variation.newAmount,
              effectiveFrom: variation.effectiveFrom,
              isDefault: true,
              notes: `From variation ${variation.variationNumber}`,
              approvedAt: new Date(),
              approvedById: user.id,
              createdBy: variation.createdBy,
            },
          });
        }
      }

      await tx.auditLog.create({
        data: {
          action: approved ? "APPROVE" : "REJECT",
          entity: "ContractVariation",
          entityId: variationId,
          details: `${approved ? "Approved" : "Rejected"} variation ${variation.variationNumber} on ${contract.contractNumber}${note ? ` — ${note}` : ""}`,
          userId: user.id,
        },
      });

      return result;
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("POST /api/contracts/[id]/variations/[variationId] error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
