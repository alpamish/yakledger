import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

const bulkActionSchema = z.object({
  ids: z.array(z.string()).min(1, "At least one ID is required"),
  action: z.enum(["updateStatus"]),
  value: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const result = await requirePermission(request, "machinery:edit");
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

    const { ids, action, value } = parsed.data;

    let affected = 0;

    switch (action) {
      case "updateStatus": {
        if (!value) {
          return NextResponse.json(
            { success: false, error: "Status value is required" },
            { status: 400 }
          );
        }
        const updated = await db.machinery.updateMany({
          where: { id: { in: ids } },
          data: { status: value },
        });
        affected = updated.count;
        await db.auditLog.create({
          data: {
            action: "BULK_UPDATE_STATUS",
            entity: "Machinery",
            details: `Bulk updated ${affected} machinery status to ${value}`,
            userId: user.id,
          },
        });
        break;
      }
    }

    return NextResponse.json({
      success: true,
      data: { affected },
      message: `Successfully updated status of ${affected} machinery record(s)`,
    });
  } catch (error) {
    console.error("Bulk action error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to perform bulk action" },
      { status: 500 }
    );
  }
}
