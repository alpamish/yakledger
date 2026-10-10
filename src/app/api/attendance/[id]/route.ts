import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { buildAccessScope, withScope, resolveApprovalStatusOnEdit, APPROVED } from "@/lib/access-control";
import { computeAttendanceHours, recalculatePayrollsForAttendance } from "@/services/hr.service";

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
    const user = result.user;

    const { id } = await params;
    const body = await request.json();
    const { status, notes, overtimeHours, checkInTime, checkOutTime } = body;

    if (status && !VALID_STATUSES.has(status)) {
      return NextResponse.json(
        { success: false, error: `Invalid status. Must be one of: ${ATTENDANCE_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }

    if (overtimeHours !== undefined && overtimeHours !== null) {
      const ot = Number(overtimeHours);
      if (isNaN(ot) || ot < 0) {
        return NextResponse.json(
          { success: false, error: "overtimeHours must be a non-negative number" },
          { status: 400 }
        );
      }
    }

    const existing = await db.attendance.findFirst({
      where: withScope({ id }, await buildAccessScope(user, "attendance")),
      select: { approvalStatus: true, employeeId: true },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Attendance record not found" },
        { status: 404 }
      );
    }

    const explicitOt =
      overtimeHours !== undefined && overtimeHours !== null ? Number(overtimeHours) : null;
    const { workedHours, overtimeHours: computedOt } = await computeAttendanceHours(
      existing.employeeId,
      checkInTime ?? null,
      checkOutTime ?? null,
      explicitOt
    );

    const updateData: Record<string, unknown> = {};
    if (status) updateData.status = status;
    if (notes !== undefined) updateData.notes = notes;
    updateData.overtimeHours = computedOt;
    updateData.workedHours = workedHours;
    if (checkInTime !== undefined) updateData.checkInTime = checkInTime ? new Date(checkInTime) : null;
    if (checkOutTime !== undefined) updateData.checkOutTime = checkOutTime ? new Date(checkOutTime) : null;

    const approvalStatus = resolveApprovalStatusOnEdit(user, existing.approvalStatus);
    updateData.approvalStatus = approvalStatus;
    updateData.approvedById = approvalStatus === APPROVED ? user.id : null;
    updateData.approvedAt = approvalStatus === APPROVED ? new Date() : null;

    const record = await db.attendance.update({
      where: { id },
      data: updateData,
    });

    // Approved attendance automatically recalculates the affected payrolls —
    // including when an approved record is edited or its approval revoked.
    if (existing.approvalStatus === APPROVED || record.approvalStatus === APPROVED) {
      try {
        await recalculatePayrollsForAttendance({
          employeeId: record.employeeId,
          dates: [record.date],
          userId: user.id,
        });
      } catch (error) {
        console.error("Attendance payroll recalculation error:", error);
      }
    }

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
    const user = result.user;

    const { id } = await params;

    const existing = await db.attendance.findFirst({
      where: withScope({ id }, await buildAccessScope(user, "attendance")),
      select: { id: true, approvalStatus: true, employeeId: true, date: true },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Attendance record not found" },
        { status: 404 }
      );
    }

    await db.attendance.delete({ where: { id } });

    // Removing approved attendance changes the payroll's attendance figures
    // too, so the affected payrolls are brought up to date.
    if (existing.approvalStatus === APPROVED) {
      try {
        await recalculatePayrollsForAttendance({
          employeeId: existing.employeeId,
          dates: [existing.date],
          userId: user.id,
        });
      } catch (error) {
        console.error("Attendance payroll recalculation error:", error);
      }
    }

    return NextResponse.json({ success: true, message: "Attendance record deleted" });
  } catch (error) {
    console.error("Attendance delete error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete attendance record" },
      { status: 500 }
    );
  }
}
