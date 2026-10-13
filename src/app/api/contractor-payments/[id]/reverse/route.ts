import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission, type AuthUser } from "@/lib/permissions";
import { buildAccessScope, withScope } from "@/lib/access-control";
import { reversePayment, PaymentError } from "@/services/contractor-payment.service";

type Params = { params: Promise<{ id: string }> };

const reverseSchema = z.object({
  reason: z.string().min(1, "Reason is required").max(2000),
});

// POST /api/contractor-payments/[id]/reverse - bounce/reverse a payment
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const result = await requirePermission(request, "contractors:payments:reverse");
    if ("status" in result) return result;
    const user = result.user;

    const { id } = await params;
    const contractorScope = await buildAccessScope(user, "contractor");
    const payment = await db.contractorPayment.findFirst({
      where: withScope({ id }, { contractor: contractorScope }),
      select: { id: true },
    });
    if (!payment) {
      return NextResponse.json({ success: false, error: "Payment not found" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = reverseSchema.safeParse(body);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
      return NextResponse.json({ success: false, error: errors.join(", ") }, { status: 400 });
    }

    const updated = await reversePayment({
      paymentId: id,
      reason: parsed.data.reason,
      userId: user.id,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    if (error instanceof PaymentError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error("POST /api/contractor-payments/[id]/reverse error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
