import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { APPROVED, APPROVAL_ENTITIES } from "@/lib/access-control";
import { ENTITY_CONFIG, applyWalletEffect } from "@/lib/approvals";

const bulkApproveSchema = z.object({
  items: z
    .array(
      z.object({
        entity: z.string().min(1),
        id: z.string().min(1),
      })
    )
    .min(1, "At least one item is required"),
});

type ApprovalModel = {
  findUnique: (args: { where: { id: string } }) => Promise<Record<string, unknown> | null>;
  update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
};

// POST /api/approvals/bulk - Approve multiple pending records at once
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = bulkApproveSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      );
    }

    const { items } = parsed.data;

    let approved = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const { entity, id } of items) {
      try {
        if (!APPROVAL_ENTITIES.has(entity) || !ENTITY_CONFIG[entity]) {
          skipped++;
          errors.push(`${entity}:${id} - unknown entity`);
          continue;
        }

        const cfg = ENTITY_CONFIG[entity];
        const result = await requirePermission(request, cfg.permission);
        if ("status" in result) {
          skipped++;
          errors.push(`${entity}:${id} - insufficient permissions`);
          continue;
        }
        const user = result.user;

        const model = db[cfg.model as keyof typeof db] as unknown as ApprovalModel;

        const record = await model.findUnique({ where: { id } });
        if (!record) {
          skipped++;
          errors.push(`${entity}:${id} - not found`);
          continue;
        }

        if (record.approvalStatus === APPROVED) {
          skipped++;
          continue;
        }

        await model.update({
          where: { id },
          data: {
            approvalStatus: APPROVED,
            approvedById: user.id,
            approvedAt: new Date(),
          },
        });

        await db.auditLog.create({
          data: {
            action: "APPROVE",
            entity: cfg.auditEntity,
            entityId: id,
            details: `Approved ${entity} ${id} (bulk)`,
            userId: user.id,
          },
        });

        await applyWalletEffect(entity, record, user.id);
        approved++;
      } catch (err) {
        console.error(`Bulk approval failed for ${entity}:${id}:`, err);
        skipped++;
        errors.push(`${entity}:${id} - ${err instanceof Error ? err.message : "error"}`);
      }
    }

    return NextResponse.json({
      success: true,
      data: { approved, skipped, errors },
      message: `${approved} approved, ${skipped} skipped`,
    });
  } catch (error) {
    console.error("Bulk approval error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to process bulk approval" },
      { status: 500 }
    );
  }
}
