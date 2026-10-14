import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { buildAccessScope, withScope } from "@/lib/access-control";
import {
  changeLifecycle,
  LifecycleError,
} from "@/services/contractor-lifecycle.service";

const lifecycleSchema = z.object({
  action: z.enum(["suspend", "blacklist", "reactivate"]),
  reason: z.string().max(1000).optional().nullable(),
});

// POST /api/contractors/[id]/lifecycle — suspend / blacklist / reactivate.
// Suspend & blacklist require a reason; ARCHIVED contractors are managed by
// the archive mechanics, not here (the service rejects them).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await requirePermission(request, "contractors:suspend");
    if ("status" in result) return result;
    const user = result.user;

    const { id } = await params;
    const scope = await buildAccessScope(user, "contractor");
    const contractor = await db.contractor.findFirst({
      where: withScope({ id }, scope),
      select: { id: true },
    });
    if (!contractor) {
      return NextResponse.json({ success: false, error: "Contractor not found" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = lifecycleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      );
    }

    const updated = await changeLifecycle({
      contractorId: id,
      action: parsed.data.action,
      reason: parsed.data.reason ?? null,
      userId: user.id,
    });
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    if (error instanceof LifecycleError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      );
    }
    console.error("POST /api/contractors/[id]/lifecycle error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
