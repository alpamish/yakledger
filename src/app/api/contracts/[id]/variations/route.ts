import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { buildAccessScope, withScope } from "@/lib/access-control";
import { createVariationSchema } from "@/lib/validation/contract";

type Params = { params: Promise<{ id: string }> };

async function findScopedContract(user: { id: string; role: string }, id: string) {
  const scope = await buildAccessScope(user, "contract");
  return db.contractorContract.findFirst({
    where: withScope({ id }, scope),
    select: { id: true, contractNumber: true, status: true, value: true },
  });
}

// GET /api/contracts/[id]/variations - list variations
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

    const variations = await db.contractVariation.findMany({
      where: { contractId: id },
      orderBy: { createdAt: "desc" },
      include: { approver: { select: { id: true, name: true } } },
    });

    return NextResponse.json({ success: true, data: variations });
  } catch (error) {
    console.error("GET /api/contracts/[id]/variations error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/contracts/[id]/variations - propose a variation (requires approval)
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
        { success: false, error: `A ${contract.status.toLowerCase()} contract cannot be varied` },
        { status: 400 }
      );
    }

    const body = await request.json();
    const parsed = createVariationSchema.safeParse(body);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
      return NextResponse.json({ success: false, error: errors.join(", ") }, { status: 400 });
    }
    const data = parsed.data;

    if (data.rateLabel && data.newAmount === undefined) {
      return NextResponse.json(
        { success: false, error: "newAmount is required when rateLabel is set" },
        { status: 400 }
      );
    }

    const variation = await db.$transaction(async (tx) => {
      const count = await tx.contractVariation.count({ where: { contractId: id } });
      const created = await tx.contractVariation.create({
        data: {
          contractId: id,
          variationNumber: `V${count + 1}`,
          description: data.description,
          valueChange: data.valueChange,
          rateLabel: data.rateLabel ?? null,
          newAmount: data.newAmount ?? null,
          effectiveFrom: data.effectiveFrom,
          createdBy: user.id,
        },
      });

      await tx.auditLog.create({
        data: {
          action: "CREATE",
          entity: "ContractVariation",
          entityId: created.id,
          details: `Proposed variation ${created.variationNumber} on ${contract.contractNumber} (value change ${data.valueChange})`,
          userId: user.id,
        },
      });

      return created;
    });

    return NextResponse.json({ success: true, data: variation }, { status: 201 });
  } catch (error) {
    console.error("POST /api/contracts/[id]/variations error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
