import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { buildAccessScope, withScope } from "@/lib/access-control";
import { contractorBulkActionSchema } from "@/lib/validation/contractor";
import { archiveOrDeleteContractor } from "@/services/contractor.service";

// POST /api/contractors/bulk-action - Bulk actions on contractors.
// - activate/suspend require contractors:edit (status management, not deletion)
// - delete requires contractors:delete and applies archive-or-delete semantics
// All IDs are scoped to the caller's access before any mutation.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = contractorBulkActionSchema.safeParse(body);

    if (!parsed.success) {
      const errors = parsed.error.issues.map((issue) => issue.message);
      return NextResponse.json(
        { success: false, error: errors.join(", ") },
        { status: 400 }
      );
    }

    const { ids, action } = parsed.data;

    const permission = action === "delete" ? "contractors:delete" : "contractors:edit";
    const result = await requirePermission(request, permission);
    if ("status" in result) return result;
    const user = result.user;

    const scope = await buildAccessScope(user, "contractor");
    const scopedWhere = withScope({ id: { in: ids } }, scope);

    let affected = 0;

    switch (action) {
      case "delete": {
        // Archive contractors that still have history; hard-delete clean ones.
        // Never cascade-wipes timesheets, fuel, machinery, or payment links.
        const outcome = await db.$transaction(async (tx) => {
          const targets = await tx.contractor.findMany({
            where: scopedWhere,
            select: { id: true },
          });
          const targetIds = targets.map((t) => t.id);
          let deleted = 0;
          let archived = 0;
          for (const id of targetIds) {
            const res = await archiveOrDeleteContractor(tx, id);
            if (res.outcome === "DELETED") deleted++;
            else archived++;
          }
          await tx.auditLog.create({
            data: {
              action: "BULK_DELETE",
              entity: "Contractor",
              details: `Bulk removed ${targetIds.length} contractor(s): ${deleted} deleted, ${archived} archived`,
              userId: user.id,
            },
          });
          return { affected: targetIds.length, deleted, archived };
        });
        affected = outcome.affected;
        return NextResponse.json({
          success: true,
          data: { affected, deleted: outcome.deleted, archived: outcome.archived },
          message: `Removed ${affected} contractor(s): ${outcome.deleted} deleted, ${outcome.archived} archived (history preserved)`,
        });
      }
      case "activate":
      case "suspend": {
        const status = action === "activate" ? "ACTIVE" : "SUSPENDED";
        const outcome = await db.$transaction(async (tx) => {
          const updated = await tx.contractor.updateMany({
            where: scopedWhere,
            data: { status },
          });
          await tx.auditLog.create({
            data: {
              action: action === "activate" ? "BULK_ACTIVATE" : "BULK_SUSPEND",
              entity: "Contractor",
              details: `Bulk ${action === "activate" ? "activated" : "suspended"} ${updated.count} contractor(s)`,
              userId: user.id,
            },
          });
          return updated.count;
        });
        affected = outcome;
        break;
      }
    }

    return NextResponse.json({
      success: true,
      data: { affected },
      message: `Successfully ${action === "activate" ? "activated" : "suspended"} ${affected} contractor(s)`,
    });
  } catch (error) {
    console.error("Bulk action error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to perform bulk action" },
      { status: 500 }
    );
  }
}
