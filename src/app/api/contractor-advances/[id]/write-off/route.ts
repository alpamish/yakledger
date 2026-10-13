import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission, type AuthUser } from "@/lib/permissions";
import { buildAccessScope, withScope } from "@/lib/access-control";
import { writeOffAdvance, AdvanceError } from "@/services/contractor-advance.service";

type Params = { params: Promise<{ id: string }> };

const writeOffSchema = z.object({
  reason: z.string().min(1, "Reason is required").max(2000),
});

// POST /api/contractor-advances/[id]/write-off - forgive the remaining balance
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const result = await requirePermission(request, "contractors:advances:writeOff");
    if ("status" in result) return result;
    const user = result.user;

    const { id } = await params;
    const contractorScope = await buildAccessScope(user, "contractor");
    const advance = await db.contractorAdvance.findFirst({
      where: withScope({ id }, { contractor: contractorScope }),
      select: { id: true },
    });
    if (!advance) {
      return NextResponse.json({ success: false, error: "Advance not found" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = writeOffSchema.safeParse(body);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
      return NextResponse.json({ success: false, error: errors.join(", ") }, { status: 400 });
    }

    const updated = await writeOffAdvance({
      advanceId: id,
      reason: parsed.data.reason,
      userId: user.id,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    if (error instanceof AdvanceError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error("POST /api/contractor-advances/[id]/write-off error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
