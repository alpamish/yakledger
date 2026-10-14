import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { buildAccessScope, withScope } from "@/lib/access-control";

const revokeSchema = z.object({
  reason: z.string().max(1000).optional().nullable(),
});

// POST /api/payment-authorizations/[id]/revoke
// Revocation is permanent (no un-revoke): payments keep their snapshot, and
// the next payment no longer matches this authorization.
export async function POST(
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
      select: { id: true, authorizationNumber: true, revokedAt: true, contractor: { select: { contractorName: true } } },
    });
    if (!authorization) {
      return NextResponse.json(
        { success: false, error: "Authorization not found" },
        { status: 404 }
      );
    }
    if (authorization.revokedAt) {
      return NextResponse.json(
        { success: false, error: "Authorization is already revoked" },
        { status: 409 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const parsed = revokeSchema.safeParse(body);
    const reason = parsed.success ? parsed.data.reason?.trim() || null : null;

    const now = new Date();
    const updated = await db.paymentAuthorization.update({
      where: { id },
      data: { revokedAt: now, revokedById: user.id },
    });
    await db.auditLog.create({
      data: {
        action: "UPDATE",
        entity: "PaymentAuthorization",
        entityId: id,
        details: `Revoked authorization ${authorization.authorizationNumber} for ${authorization.contractor?.contractorName ?? "contractor"}${
          reason ? ` — ${reason}` : ""
        }`,
        userId: user.id,
      },
    });
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("POST /api/payment-authorizations/[id]/revoke error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
