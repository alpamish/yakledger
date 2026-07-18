import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

const bulkActionSchema = z.object({
  ids: z.array(z.string()).min(1, "At least one ID is required"),
  action: z.enum(["delete", "activate", "suspend"]),
});

// POST /api/contractors/bulk-action - Bulk actions on contractors
export async function POST(request: NextRequest) {
  try {
    const result = await requirePermission(request, "contractors:delete");
    if ("status" in result) return result;
    const user = result.user;

    const body = await request.json();
    const parsed = bulkActionSchema.safeParse(body);

    if (!parsed.success) {
      const errors = parsed.error.issues.map((issue) => issue.message);
      return NextResponse.json(
        { success: false, error: errors.join(", ") },
        { status: 400 }
      );
    }

    const { ids, action } = parsed.data;

    let affected = 0;

    switch (action) {
      case "delete": {
        const deleted = await db.contractor.deleteMany({
          where: { id: { in: ids } },
        });
        affected = deleted.count;
        // Create audit log
        await db.auditLog.create({
          data: {
            action: "BULK_DELETE",
            entity: "Contractor",
            details: `Bulk deleted ${affected} contractor(s)`,
            userId: user.id,
          },
        });
        break;
      }
      case "activate": {
        const updated = await db.contractor.updateMany({
          where: { id: { in: ids } },
          data: { status: "ACTIVE" },
        });
        affected = updated.count;
        await db.auditLog.create({
          data: {
            action: "BULK_ACTIVATE",
            entity: "Contractor",
            details: `Bulk activated ${affected} contractor(s)`,
            userId: user.id,
          },
        });
        break;
      }
      case "suspend": {
        const updated = await db.contractor.updateMany({
          where: { id: { in: ids } },
          data: { status: "SUSPENDED" },
        });
        affected = updated.count;
        await db.auditLog.create({
          data: {
            action: "BULK_SUSPEND",
            entity: "Contractor",
            details: `Bulk suspended ${affected} contractor(s)`,
            userId: user.id,
          },
        });
        break;
      }
    }

    return NextResponse.json({
      success: true,
      data: { affected },
      message: `Successfully ${action === "activate" ? "activated" : action === "suspend" ? "suspended" : "deleted"} ${affected} contractor(s)`,
    });
  } catch (error) {
    console.error("Bulk action error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to perform bulk action" },
      { status: 500 }
    );
  }
}
