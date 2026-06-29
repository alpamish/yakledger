import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

const bulkActionSchema = z.object({
  ids: z.array(z.string()).min(1, "At least one ID is required"),
  action: z.enum(["delete", "activate", "deactivate"]),
});

// POST /api/employees/bulk-action - Bulk actions on employees
export async function POST(request: NextRequest) {
  try {
    const result = await requirePermission(request, "employees:edit");
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
        const deleted = await db.employee.deleteMany({
          where: { id: { in: ids } },
        });
        affected = deleted.count;
        // Create audit log
        await db.auditLog.create({
          data: {
            action: "BULK_DELETE",
            entity: "Employee",
            details: `Bulk deleted ${affected} employee(s)`,
            userId: user.id,
          },
        });
        break;
      }
      case "activate": {
        const updated = await db.employee.updateMany({
          where: { id: { in: ids } },
          data: { status: "ACTIVE" },
        });
        affected = updated.count;
        await db.auditLog.create({
          data: {
            action: "BULK_ACTIVATE",
            entity: "Employee",
            details: `Bulk activated ${affected} employee(s)`,
            userId: user.id,
          },
        });
        break;
      }
      case "deactivate": {
        const updated = await db.employee.updateMany({
          where: { id: { in: ids } },
          data: { status: "INACTIVE" },
        });
        affected = updated.count;
        await db.auditLog.create({
          data: {
            action: "BULK_DEACTIVATE",
            entity: "Employee",
            details: `Bulk deactivated ${affected} employee(s)`,
            userId: user.id,
          },
        });
        break;
      }
    }

    return NextResponse.json({
      success: true,
      data: { affected },
      message: `Successfully ${action}d ${affected} employee(s)`,
    });
  } catch (error) {
    console.error("Bulk action error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to perform bulk action" },
      { status: 500 }
    );
  }
}
