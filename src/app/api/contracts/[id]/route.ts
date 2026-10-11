import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission, type AuthUser } from "@/lib/permissions";
import { buildAccessScope, withScope } from "@/lib/access-control";
import { updateContractSchema } from "@/lib/validation/contract";

type Params = { params: Promise<{ id: string }> };

async function findContract(user: AuthUser, id: string) {
  const scope = await buildAccessScope(user, "contract");
  return db.contractorContract.findFirst({
    where: withScope({ id }, scope),
    include: {
      contractor: {
        select: { id: true, contractorName: true, contractorNumber: true, status: true },
      },
      rates: { orderBy: [{ label: "asc" }, { effectiveFrom: "desc" }] },
      variations: { orderBy: { createdAt: "desc" } },
    },
  });
}

// GET /api/contracts/[id] - full contract detail (rates + variations)
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const result = await requirePermission(request, "contracts:view");
    if ("status" in result) return result;
    const user = result.user;

    const { id } = await params;
    const contract = await findContract(user, id);
    if (!contract) {
      return NextResponse.json({ success: false, error: "Contract not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: contract });
  } catch (error) {
    console.error("GET /api/contracts/[id] error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

// PUT /api/contracts/[id] - update a contract
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const result = await requirePermission(request, "contracts:edit");
    if ("status" in result) return result;
    const user = result.user;

    const { id } = await params;
    const existing = await findContract(user, id);
    if (!existing) {
      return NextResponse.json({ success: false, error: "Contract not found" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = updateContractSchema.safeParse(body);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
      return NextResponse.json({ success: false, error: errors.join(", ") }, { status: 400 });
    }
    const data = parsed.data;

    // Completed/terminated contracts are frozen: only status transitions out
    // of those states (no content edits) are allowed through this route.
    if (existing.status === "COMPLETED" || existing.status === "TERMINATED") {
      return NextResponse.json(
        { success: false, error: `A ${existing.status.toLowerCase()} contract cannot be edited` },
        { status: 400 }
      );
    }

    const startDate = data.startDate ?? existing.startDate;
    const endDate = data.endDate !== undefined ? data.endDate : existing.endDate;
    if (endDate && endDate < startDate) {
      return NextResponse.json(
        { success: false, error: "endDate must be on or after startDate" },
        { status: 400 }
      );
    }

    const { contractorId: _ignored, ...updateData } = data;
    void _ignored;

    const contract = await db.$transaction(async (tx) => {
      const updated = await tx.contractorContract.update({
        where: { id },
        data: {
          ...updateData,
          startDate,
          endDate: endDate ?? null,
        },
      });

      await tx.auditLog.create({
        data: {
          action: "UPDATE",
          entity: "ContractorContract",
          entityId: id,
          details: `Updated contract ${updated.contractNumber}`,
          userId: user.id,
        },
      });

      return updated;
    });

    return NextResponse.json({ success: true, data: contract });
  } catch (error) {
    console.error("PUT /api/contracts/[id] error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/contracts/[id] - delete a contract (only DRAFT, no work attached)
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const result = await requirePermission(request, "contracts:delete");
    if ("status" in result) return result;
    const user = result.user;

    const { id } = await params;
    const scope = await buildAccessScope(user, "contract");
    const contract = await db.contractorContract.findFirst({
      where: withScope({ id }, scope),
      select: { id: true, contractNumber: true, status: true, _count: { select: { timesheets: true } } },
    });
    if (!contract) {
      return NextResponse.json({ success: false, error: "Contract not found" }, { status: 404 });
    }

    // Commercial history must never be destroyed: contracts with recorded
    // work can only be terminated (status change), not deleted.
    if (contract._count.timesheets > 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            "This contract has recorded timesheets and cannot be deleted. Terminate it instead.",
        },
        { status: 400 }
      );
    }

    await db.$transaction(async (tx) => {
      await tx.contractorContract.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          action: "DELETE",
          entity: "ContractorContract",
          entityId: id,
          details: `Deleted contract ${contract.contractNumber}`,
          userId: user.id,
        },
      });
    });

    return NextResponse.json({ success: true, data: { id } });
  } catch (error) {
    console.error("DELETE /api/contracts/[id] error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
