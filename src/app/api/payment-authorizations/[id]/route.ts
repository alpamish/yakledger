import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { buildAccessScope, withScope } from "@/lib/access-control";

const updateAuthorizationSchema = z.object({
  receiverName: z.string().min(1).max(200).optional(),
  validFrom: z.string().min(1).optional(),
  validTo: z.string().min(1).nullable().optional(),
  maxAmount: z.number().min(0).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
});

// PUT /api/payment-authorizations/[id]
// Live authorizations are editable; revoked ones are immutable history
// (payments already snapshotted their terms).
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await requirePermission(request, "contractors:authorize");
    if ("status" in result) return result;
    const user = result.user;

    const { id } = await params;
    const scope = await buildAccessScope(user, "contractor");
    const authorization = await db.paymentAuthorization.findFirst({
      where: withScope({ id }, scope),
      select: { id: true, revokedAt: true, validFrom: true, validTo: true },
    });
    if (!authorization) {
      return NextResponse.json(
        { success: false, error: "Authorization not found" },
        { status: 404 }
      );
    }
    if (authorization.revokedAt) {
      return NextResponse.json(
        { success: false, error: "Revoked authorizations cannot be edited" },
        { status: 409 }
      );
    }

    const body = await request.json();
    const parsed = updateAuthorizationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      );
    }
    const data = parsed.data;
    const validFrom = data.validFrom ? new Date(data.validFrom) : authorization.validFrom;
    const validTo =
      data.validTo !== undefined ? (data.validTo ? new Date(data.validTo) : null) : authorization.validTo;
    if (validTo && validTo < validFrom) {
      return NextResponse.json(
        { success: false, error: "Valid-to date cannot be before valid-from" },
        { status: 400 }
      );
    }

    const updated = await db.paymentAuthorization.update({
      where: { id },
      data: {
        ...(data.receiverName ? { receiverName: data.receiverName.trim() } : {}),
        ...(data.validFrom ? { validFrom } : {}),
        ...(data.validTo !== undefined ? { validTo } : {}),
        ...(data.maxAmount !== undefined ? { maxAmount: data.maxAmount } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
      },
    });
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("PUT /api/payment-authorizations/[id] error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
