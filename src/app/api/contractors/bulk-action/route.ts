import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  requirePermission,
  requireAnyPermission,
  checkUserPermission,
} from "@/lib/permissions";
import { buildAccessScope, withScope } from "@/lib/access-control";
import { contractorBulkActionSchema } from "@/lib/validation/contractor";
import {
  archiveOrDeleteContractor,
  getContractorHistoryCounts,
  totalHistory,
} from "@/services/contractor.service";

// POST /api/contractors/bulk-action - Bulk actions on contractors.
// - activate requires contractors:edit; suspend requires contractors:suspend
//   (Phase 5: suspension is a compliance-relevant lifecycle state)
// - delete requires contractors:delete OR contractors:archive and applies
//   archive-or-delete semantics; archive-only callers never hard-delete
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

    const result =
      action === "delete"
        ? await requireAnyPermission(request, [
            "contractors:delete",
            "contractors:archive",
          ])
        : await requirePermission(
            request,
            action === "suspend" ? "contractors:suspend" : "contractors:edit"
          );
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
          // Archive-only callers may never hard-delete: every target must
          // have history so the archive branch applies.
          const canDelete = await checkUserPermission(
            user.id,
            user.role,
            "contractors:delete"
          );
          if (!canDelete) {
            for (const t of targets) {
              const history = await getContractorHistoryCounts(tx, t.id);
              if (totalHistory(history) === 0) {
                throw new BulkDeleteForbiddenError();
              }
            }
          }
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
            data: {
              status,
              // Keep the lifecycle audit trail coherent with the single-
              // contractor lifecycle route. Bulk tools can't collect a
              // per-contractor reason; suspend reasons are recorded there.
              ...(action === "suspend"
                ? {
                    suspendedAt: new Date(),
                    suspendedReason: null,
                    statusChangedById: user.id,
                  }
                : {
                    suspendedAt: null,
                    suspendedReason: null,
                    blacklistedAt: null,
                    blacklistedReason: null,
                    statusChangedById: user.id,
                  }),
            },
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
    if (error instanceof BulkDeleteForbiddenError) {
      return NextResponse.json(
        {
          success: false,
          error:
            "At least one selected contractor has no history and would be permanently deleted, which requires the contractors:delete permission",
        },
        { status: 403 }
      );
    }
    console.error("Bulk action error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to perform bulk action" },
      { status: 500 }
    );
  }
}

/** Thrown inside the transaction when an archive-only caller targets a clean contractor. */
class BulkDeleteForbiddenError extends Error {
  constructor() {
    super("Hard delete requires contractors:delete");
    this.name = "BulkDeleteForbiddenError";
  }
}
