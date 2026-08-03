import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

// DELETE /api/access/[id] - Revoke an access grant
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await requirePermission(request, "expenses:edit");
    if ("status" in result) return result;
    const user = result.user;

    const { id } = await params;

    const grant = await db.recordAccess.findUnique({ where: { id } });
    if (!grant) {
      return NextResponse.json({ success: false, error: "Grant not found" }, { status: 404 });
    }

    await db.recordAccess.delete({ where: { id } });

    await db.auditLog.create({
      data: {
        action: "REVOKE",
        entity: "RecordAccess",
        entityId: grant.entityId,
        details: `Revoked ${grant.accessType} access on ${grant.entity} ${grant.entityId} from user ${grant.userId}`,
        userId: user.id,
      },
    });

    return NextResponse.json({ success: true, message: "Access revoked successfully" });
  } catch (error) {
    console.error("Delete access grant error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to revoke access" },
      { status: 500 }
    );
  }
}
