import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission, type AuthUser } from "@/lib/permissions";
import { buildAccessScope, withScope } from "@/lib/access-control";
import { allocatePayment, removeAllocation, PaymentError } from "@/services/contractor-payment.service";

type Params = { params: Promise<{ id: string }> };

async function findPayment(user: AuthUser, id: string) {
  const contractorScope = await buildAccessScope(user, "contractor");
  return db.contractorPayment.findFirst({
    where: withScope({ id }, { contractor: contractorScope }),
    select: { id: true, paymentNumber: true, status: true, amount: true },
  });
}

const allocateSchema = z.object({
  allocations: z
    .array(
      z.object({
        claimId: z.string().min(1),
        amount: z.number().positive("Allocation amount must be positive"),
      })
    )
    .min(1, "At least one allocation is required"),
});

// POST /api/contractor-payments/[id]/allocations - distribute across claims
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const result = await requirePermission(request, "contractors:payments:create");
    if ("status" in result) return result;
    const user = result.user;

    const { id } = await params;
    const payment = await findPayment(user, id);
    if (!payment) {
      return NextResponse.json({ success: false, error: "Payment not found" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = allocateSchema.safeParse(body);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
      return NextResponse.json({ success: false, error: errors.join(", ") }, { status: 400 });
    }

    const claims = await allocatePayment({
      paymentId: id,
      allocations: parsed.data.allocations,
      userId: user.id,
    });

    return NextResponse.json({ success: true, data: claims }, { status: 201 });
  } catch (error) {
    if (error instanceof PaymentError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error("POST /api/contractor-payments/[id]/allocations error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/contractor-payments/[id]/allocations?allocationId=
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const result = await requirePermission(request, "contractors:payments:create");
    if ("status" in result) return result;
    const user = result.user;

    const { id } = await params;
    const payment = await findPayment(user, id);
    if (!payment) {
      return NextResponse.json({ success: false, error: "Payment not found" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const allocationId = searchParams.get("allocationId");
    if (!allocationId) {
      return NextResponse.json({ success: false, error: "allocationId is required" }, { status: 400 });
    }

    const removed = await removeAllocation({ paymentId: id, allocationId, userId: user.id });
    return NextResponse.json({ success: true, data: removed });
  } catch (error) {
    if (error instanceof PaymentError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error("DELETE /api/contractor-payments/[id]/allocations error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
