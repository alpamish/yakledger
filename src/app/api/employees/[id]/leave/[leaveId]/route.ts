import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permissions";
import { db } from "@/lib/db";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; leaveId: string }> }
) {
  const { id, leaveId } = await params;
  const result = await requirePermission(request, "employees:leave:manage");
  if ("status" in result) return result;
  const user = result.user;

  try {
    const body = await request.json().catch(() => ({}));
    const { status, approvalNote } = body as {
      status?: string;
      approvalNote?: string;
    };
    if (!status || !["APPROVED", "REJECTED"].includes(status)) {
      return NextResponse.json(
        { success: false, error: "Valid status (APPROVED/REJECTED) required" },
        { status: 400 }
      );
    }

    const updated = await db.$transaction(async (tx) => {
      const leave = await tx.employeeLeave.update({
        where: { id: leaveId },
        data: {
          status,
          approvalNote: approvalNote ?? null,
          approvedById: user.id,
          approvedAt: new Date(),
        },
      });
      await tx.employeeAuditEvent.create({
        data: {
          employeeId: id,
          action: "LEAVE_" + status,
          field: "leave",
          newValue: leaveId,
          reason: approvalNote,
          performedById: user.id,
        },
      });
      return leave;
    });
    return NextResponse.json({ success: true, data: updated });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Failed to update leave" },
      { status: 400 }
    );
  }
}
