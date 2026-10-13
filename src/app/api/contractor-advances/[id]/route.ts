import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission, type AuthUser } from "@/lib/permissions";
import { buildAccessScope, withScope } from "@/lib/access-control";

type Params = { params: Promise<{ id: string }> };

async function findAdvance(user: AuthUser, id: string) {
  const contractorScope = await buildAccessScope(user, "contractor");
  return db.contractorAdvance.findFirst({
    where: withScope({ id }, { contractor: contractorScope }),
    include: {
      contractor: { select: { id: true, contractorName: true, contractorNumber: true } },
      recoveries: { orderBy: { date: "asc" }, include: { claim: { select: { claimNumber: true, netAmount: true } } } },
    },
  });
}

const updateAdvanceSchema = z.object({
  recoveryPercent: z.number().min(0).max(100).nullable().nullish(),
  notes: z.string().max(5000).nullish(),
});

// GET /api/contractor-advances/[id] - advance detail
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const result = await requirePermission(request, "contractors:advances:view");
    if ("status" in result) return result;
    const user = result.user;

    const { id } = await params;
    const advance = await findAdvance(user, id);
    if (!advance) {
      return NextResponse.json({ success: false, error: "Advance not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: advance });
  } catch (error) {
    console.error("GET /api/contractor-advances/[id] error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

// PUT /api/contractor-advances/[id] - edit recovery terms / notes
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const result = await requirePermission(request, "contractors:advances:create");
    if ("status" in result) return result;
    const user = result.user;

    const { id } = await params;
    const existing = await findAdvance(user, id);
    if (!existing) {
      return NextResponse.json({ success: false, error: "Advance not found" }, { status: 404 });
    }
    if (existing.status === "WRITTEN_OFF") {
      return NextResponse.json(
        { success: false, error: "A written-off advance cannot be edited" },
        { status: 409 }
      );
    }

    const body = await request.json();
    const parsed = updateAdvanceSchema.safeParse(body);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
      return NextResponse.json({ success: false, error: errors.join(", ") }, { status: 400 });
    }
    const data = parsed.data;

    const advance = await db.$transaction(async (tx) => {
      const updated = await tx.contractorAdvance.update({
        where: { id },
        data: {
          ...(data.recoveryPercent !== undefined
            ? { recoveryPercent: data.recoveryPercent ?? null }
            : {}),
          ...(data.notes !== undefined ? { notes: data.notes ?? null } : {}),
        },
      });
      await tx.auditLog.create({
        data: {
          action: "UPDATE",
          entity: "ContractorAdvance",
          entityId: id,
          details: `Updated advance ${existing.advanceNumber}`,
          userId: user.id,
        },
      });
      return updated;
    });

    return NextResponse.json({ success: true, data: advance });
  } catch (error) {
    console.error("PUT /api/contractor-advances/[id] error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
