import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission, checkUserPermission } from "@/lib/permissions";
import { buildAccessScope, withScope } from "@/lib/access-control";
import { updateContractRateSchema } from "@/lib/validation/contract";

type Params = { params: Promise<{ id: string; rateId: string }> };

async function findScopedRate(user: { id: string; role: string }, contractId: string, rateId: string) {
  const scope = await buildAccessScope(user, "contract");
  const contract = await db.contractorContract.findFirst({
    where: withScope({ id: contractId }, scope),
    select: { id: true, contractNumber: true, status: true },
  });
  if (!contract) return null;
  const rate = await db.contractRate.findFirst({
    where: { id: rateId, contractId },
  });
  return { contract, rate };
}

// PUT /api/contracts/[id]/rates/[rateId] - edit a rate.
// Amount/effective-date changes reset approval (the change must be re-approved);
// metadata edits by approvers keep approval.
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const result = await requirePermission(request, "contracts:edit");
    if ("status" in result) return result;
    const user = result.user;

    const { id, rateId } = await params;
    const found = await findScopedRate(user, id, rateId);
    if (!found?.rate) {
      return NextResponse.json({ success: false, error: "Rate not found" }, { status: 404 });
    }
    if (found.contract.status === "COMPLETED" || found.contract.status === "TERMINATED") {
      return NextResponse.json(
        { success: false, error: `A ${found.contract.status.toLowerCase()} contract's rates cannot be changed` },
        { status: 400 }
      );
    }

    const body = await request.json();
    const parsed = updateContractRateSchema.safeParse(body);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
      return NextResponse.json({ success: false, error: errors.join(", ") }, { status: 400 });
    }
    const data = parsed.data;

    const effectiveFrom = data.effectiveFrom ?? found.rate.effectiveFrom;
    const effectiveTo = data.effectiveTo !== undefined ? data.effectiveTo : found.rate.effectiveTo;
    if (effectiveTo && effectiveTo < effectiveFrom) {
      return NextResponse.json(
        { success: false, error: "effectiveTo must be on or after effectiveFrom" },
        { status: 400 }
      );
    }

    const canApprove = await checkUserPermission(user.id, user.role, "contracts:approve");
    const moneyChanged =
      (data.amount !== undefined && data.amount !== found.rate.amount) ||
      (data.effectiveFrom !== undefined && data.effectiveFrom.getTime() !== found.rate.effectiveFrom.getTime()) ||
      (data.effectiveTo !== undefined &&
        (data.effectiveTo?.getTime() ?? null) !== (found.rate.effectiveTo?.getTime() ?? null)) ||
      (data.rateType !== undefined && data.rateType !== found.rate.rateType);

    const rate = await db.$transaction(async (tx) => {
      if (data.isDefault) {
        await tx.contractRate.updateMany({
          where: { contractId: id, isDefault: true, id: { not: rateId } },
          data: { isDefault: false },
        });
      }

      const updated = await tx.contractRate.update({
        where: { id: rateId },
        data: {
          ...(data.label !== undefined ? { label: data.label } : {}),
          ...(data.rateType !== undefined ? { rateType: data.rateType } : {}),
          ...(data.unitLabel !== undefined ? { unitLabel: data.unitLabel ?? null } : {}),
          ...(data.amount !== undefined ? { amount: data.amount } : {}),
          ...(data.notes !== undefined ? { notes: data.notes ?? null } : {}),
          ...(data.isDefault !== undefined ? { isDefault: data.isDefault } : {}),
          effectiveFrom,
          effectiveTo: effectiveTo ?? null,
          // A commercial change made by a non-approver goes back to pending.
          ...(moneyChanged && !canApprove ? { approvedAt: null, approvedById: null } : {}),
        },
      });

      await tx.auditLog.create({
        data: {
          action: "UPDATE",
          entity: "ContractRate",
          entityId: rateId,
          details: `Updated rate ${updated.label} on ${found.contract.contractNumber}${moneyChanged && !canApprove ? " (re-approval required)" : ""}`,
          userId: user.id,
        },
      });

      return updated;
    });

    return NextResponse.json({ success: true, data: rate });
  } catch (error) {
    console.error("PUT /api/contracts/[id]/rates/[rateId] error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/contracts/[id]/rates/[rateId]
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const result = await requirePermission(request, "contracts:edit");
    if ("status" in result) return result;
    const user = result.user;

    const { id, rateId } = await params;
    const found = await findScopedRate(user, id, rateId);
    if (!found?.rate) {
      return NextResponse.json({ success: false, error: "Rate not found" }, { status: 404 });
    }

    // Timesheets that snapshotted this rate must keep pointing at it.
    const usedBy = await db.timesheet.count({ where: { contractRateId: rateId } });
    if (usedBy > 0) {
      return NextResponse.json(
        {
          success: false,
          error: "This rate is referenced by recorded timesheets and cannot be deleted. Close it with an effectiveTo date instead.",
        },
        { status: 400 }
      );
    }

    await db.$transaction(async (tx) => {
      await tx.contractRate.delete({ where: { id: rateId } });
      await tx.auditLog.create({
        data: {
          action: "DELETE",
          entity: "ContractRate",
          entityId: rateId,
          details: `Deleted rate ${found.rate!.label} from ${found.contract.contractNumber}`,
          userId: user.id,
        },
      });
    });

    return NextResponse.json({ success: true, data: { id: rateId } });
  } catch (error) {
    console.error("DELETE /api/contracts/[id]/rates/[rateId] error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
