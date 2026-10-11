import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission, checkUserPermission } from "@/lib/permissions";
import { buildAccessScope, withScope } from "@/lib/access-control";
import { createContractRateSchema } from "@/lib/validation/contract";

type Params = { params: Promise<{ id: string }> };

async function findScopedContract(user: { id: string; role: string }, id: string) {
  const scope = await buildAccessScope(user, "contract");
  return db.contractorContract.findFirst({
    where: withScope({ id }, scope),
    select: { id: true, contractNumber: true, status: true, workHoursPerDay: true, contractDaysPerMonth: true },
  });
}

// GET /api/contracts/[id]/rates - list rates for a contract
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const result = await requirePermission(request, "contracts:view");
    if ("status" in result) return result;
    const user = result.user;

    const { id } = await params;
    const contract = await findScopedContract(user, id);
    if (!contract) {
      return NextResponse.json({ success: false, error: "Contract not found" }, { status: 404 });
    }

    const rates = await db.contractRate.findMany({
      where: { contractId: id },
      orderBy: [{ label: "asc" }, { effectiveFrom: "desc" }],
      include: { approver: { select: { id: true, name: true } } },
    });

    return NextResponse.json({ success: true, data: rates });
  } catch (error) {
    console.error("GET /api/contracts/[id]/rates error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/contracts/[id]/rates - add an effective-dated rate tier.
// Rate changes are prospective only: a new row with a later effectiveFrom;
// existing rows are never mutated with new amounts.
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const result = await requirePermission(request, "contracts:edit");
    if ("status" in result) return result;
    const user = result.user;

    const { id } = await params;
    const contract = await findScopedContract(user, id);
    if (!contract) {
      return NextResponse.json({ success: false, error: "Contract not found" }, { status: 404 });
    }
    if (contract.status === "COMPLETED" || contract.status === "TERMINATED") {
      return NextResponse.json(
        { success: false, error: `A ${contract.status.toLowerCase()} contract's rates cannot be changed` },
        { status: 400 }
      );
    }

    const body = await request.json();
    const parsed = createContractRateSchema.safeParse(body);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
      return NextResponse.json({ success: false, error: errors.join(", ") }, { status: 400 });
    }
    const data = parsed.data;

    if (data.effectiveTo && data.effectiveTo < data.effectiveFrom) {
      return NextResponse.json(
        { success: false, error: "effectiveTo must be on or after effectiveFrom" },
        { status: 400 }
      );
    }

    // Approvers' rates take effect immediately; everyone else's await approval.
    const canApprove = await checkUserPermission(user.id, user.role, "contracts:approve");

    const rate = await db.$transaction(async (tx) => {
      if (data.isDefault) {
        await tx.contractRate.updateMany({
          where: { contractId: id, label: data.label, isDefault: true },
          data: { isDefault: false },
        });
      }

      const created = await tx.contractRate.create({
        data: {
          contractId: id,
          label: data.label,
          rateType: data.rateType,
          unitLabel: data.unitLabel ?? null,
          amount: data.amount,
          effectiveFrom: data.effectiveFrom,
          effectiveTo: data.effectiveTo ?? null,
          isDefault: data.isDefault,
          notes: data.notes ?? null,
          approvedAt: canApprove ? new Date() : null,
          approvedById: canApprove ? user.id : null,
          createdBy: user.id,
        },
      });

      await tx.auditLog.create({
        data: {
          action: "CREATE",
          entity: "ContractRate",
          entityId: created.id,
          details: `Added rate ${created.label} (${created.rateType} ${created.amount}) to ${contract.contractNumber}${canApprove ? " [approved]" : " [pending approval]"}`,
          userId: user.id,
        },
      });

      return created;
    });

    return NextResponse.json({ success: true, data: rate }, { status: 201 });
  } catch (error) {
    console.error("POST /api/contracts/[id]/rates error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
