import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

const ATTENDANCE_STATUSES = ["PRESENT", "ABSENT", "HALF_DAY", "LEAVE", "HOLIDAY"] as const;
const VALID_STATUSES = new Set(ATTENDANCE_STATUSES);

// PUT /api/attendance/[id] - Update attendance record
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await requirePermission(request, "employees:edit");
    if ("status" in result) return result;

    const { id } = await params;
    const body = await request.json();
    const { status, notes } = body;

    if (status && !VALID_STATUSES.has(status)) {
      return NextResponse.json(
        { success: false, error: `Invalid status. Must be one of: ${ATTENDANCE_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }

    const existing = await db.attendance.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Attendance record not found" },
        { status: 404 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (status) updateData.status = status;
    if (notes !== undefined) updateData.notes = notes;

    const record = await db.attendance.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ success: true, data: record });
  } catch (error) {
    console.error("Attendance update error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update attendance record" },
      { status: 500 }
    );
  }
}

// DELETE /api/attendance/[id] - Delete attendance record
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await requirePermission(request, "employees:delete");
    if ("status" in result) return result;

    const { id } = await params;

    const existing = await db.attendance.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Attendance record not found" },
        { status: 404 }
      );
    }

    await db.attendance.delete({ where: { id } });

    return NextResponse.json({ success: true, message: "Attendance record deleted" });
  } catch (error) {
    console.error("Attendance delete error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete attendance record" },
      { status: 500 }
    );
  }
}
