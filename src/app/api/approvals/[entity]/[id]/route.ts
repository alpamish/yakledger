import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { APPROVED, REJECTED, APPROVAL_ENTITIES } from "@/lib/access-control";
import { ENTITY_CONFIG, applyWalletEffect } from "@/lib/approvals";

const actionSchema = z.object({
  action: z.enum(["approve", "reject"]),
  note: z.string().optional().nullable(),
});

// POST /api/approvals/[entity]/[id] - Approve or reject a pending record
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ entity: string; id: string }> }
) {
  try {
    const { entity, id } = await params;

    if (!APPROVAL_ENTITIES.has(entity) || !ENTITY_CONFIG[entity]) {
      return NextResponse.json({ success: false, error: "Unknown entity" }, { status: 400 });
    }

    const cfg = ENTITY_CONFIG[entity];
    const result = await requirePermission(request, cfg.permission);
    if ("status" in result) return result;
    const user = result.user;

    const body = await request.json();
    const parsed = actionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      );
    }

    const { action, note } = parsed.data;

    const model = db[cfg.model as keyof typeof db] as unknown as {
      findUnique: (args: { where: { id: string } }) => Promise<Record<string, unknown> | null>;
      update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
    };

    const record = await model.findUnique({ where: { id } });
    if (!record) {
      return NextResponse.json({ success: false, error: "Record not found" }, { status: 404 });
    }

    if (record.approvalStatus === APPROVED) {
      return NextResponse.json({ success: false, error: "Record is already approved" }, { status: 400 });
    }

    const newStatus = action === "approve" ? APPROVED : REJECTED;

    const updated = await model.update({
      where: { id },
      data: {
        approvalStatus: newStatus,
        approvedById: user.id,
        approvedAt: new Date(),
        approvalNote: note ?? null,
      },
    });

    await db.auditLog.create({
      data: {
        action: action === "approve" ? "APPROVE" : "REJECT",
        entity: cfg.auditEntity,
        entityId: id,
        details: `${action === "approve" ? "Approved" : "Rejected"} ${entity} ${id}${note ? ` - ${note}` : ""}`,
        userId: user.id,
      },
    });

    if (action === "approve") {
      await applyWalletEffect(entity, record, user.id);
    }

    return NextResponse.json({
      success: true,
      data: updated,
      message: action === "approve" ? "Record approved successfully" : "Record rejected",
    });
  } catch (error) {
    console.error("Approval action error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to process approval" },
      { status: 500 }
    );
  }
}
