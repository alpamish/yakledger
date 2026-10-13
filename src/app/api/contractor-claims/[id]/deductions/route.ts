import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission, type AuthUser } from "@/lib/permissions";
import { buildAccessScope, withScope } from "@/lib/access-control";
import { ClaimError, addDeduction, removeDeduction } from "@/services/contractor-claim.service";

type Params = { params: Promise<{ id: string }> };

async function findClaim(user: AuthUser, id: string) {
  const contractorScope = await buildAccessScope(user, "contractor");
  return db.contractorClaim.findFirst({
    where: withScope({ id }, { contractor: contractorScope }),
    select: { id: true, claimNumber: true, status: true },
  });
}

const deductionSchema = z.object({
  type: z.enum(["FUEL", "PENALTY", "MATERIALS", "ACCOMMODATION", "FOOD", "TRANSPORT", "TAX", "OTHER"]),
  description: z.string().min(1, "Description is required").max(500),
  amount: z.number().positive("Amount must be positive"),
});

// POST /api/contractor-claims/[id]/deductions - add a deduction (draft only)
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const result = await requirePermission(request, "contractors:claims:edit");
    if ("status" in result) return result;
    const user = result.user;

    const { id } = await params;
    const claim = await findClaim(user, id);
    if (!claim) {
      return NextResponse.json({ success: false, error: "Claim not found" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = deductionSchema.safeParse(body);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
      return NextResponse.json({ success: false, error: errors.join(", ") }, { status: 400 });
    }

    const updated = await addDeduction({
      claimId: id,
      type: parsed.data.type,
      description: parsed.data.description,
      amount: parsed.data.amount,
      userId: user.id,
    });
    return NextResponse.json({ success: true, data: updated }, { status: 201 });
  } catch (error) {
    if (error instanceof ClaimError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error("POST /api/contractor-claims/[id]/deductions error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/contractor-claims/[id]/deductions - remove by query ?deductionId=
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const result = await requirePermission(request, "contractors:claims:edit");
    if ("status" in result) return result;
    const user = result.user;

    const { id } = await params;
    const claim = await findClaim(user, id);
    if (!claim) {
      return NextResponse.json({ success: false, error: "Claim not found" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const deductionId = searchParams.get("deductionId");
    if (!deductionId) {
      return NextResponse.json({ success: false, error: "deductionId is required" }, { status: 400 });
    }

    const updated = await removeDeduction({ claimId: id, deductionId, userId: user.id });
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    if (error instanceof ClaimError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error("DELETE /api/contractor-claims/[id]/deductions error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
