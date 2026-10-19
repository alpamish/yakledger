import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAnyPermission } from "@/lib/permissions";
import {
  buildAccessScope,
  withScope,
  resolveApprovalStatusOnEdit,
  APPROVED,
} from "@/lib/access-control";
import {
  computeAttendanceHours,
  recalculatePayrollsForAttendance,
} from "@/services/hr.service";
import { formatDateOnly, toAttendanceInstant } from "@/lib/attendance-date";

const ATTENDANCE_STATUSES = ["PRESENT", "ABSENT", "HALF_DAY", "LEAVE", "HOLIDAY"] as const;
const VALID_STATUSES = new Set(ATTENDANCE_STATUSES);

const EDIT_PERMISSIONS = ["employees:attendance:manage", "employees:edit"];
const DELETE_PERMISSIONS = ["employees:attendance:manage", "employees:delete"];

// PUT /api/attendance/[id] - Update attendance record
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await requireAnyPermission(request, EDIT_PERMISSIONS);
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
      select: {
        approvalStatus: true,
        employeeId: true,
        date: true,
        status: true,
        notes: true,
        overtimeHours: true,
        workedHours: true,
        checkInTime: true,
        checkOutTime: true,
      },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Attendance record not found" },
        { status: 404 }
      );
    }

    const day = formatDateOnly(existing.date);

    // Times can be cleared with null/""; omitted means "keep the stored value".
    const nextCheckIn =
      checkInTime === undefined
        ? existing.checkInTime
        : checkInTime
          ? toAttendanceInstant(day, checkInTime)
          : null;
    const nextCheckOut =
      checkOutTime === undefined
        ? existing.checkOutTime
        : checkOutTime
          ? toAttendanceInstant(day, checkOutTime)
          : null;
    if (
      (checkInTime !== undefined && checkInTime && !nextCheckIn) ||
      (checkOutTime !== undefined && checkOutTime && !nextCheckOut)
    ) {
      return NextResponse.json(
        { success: false, error: "checkInTime/checkOutTime must be HH:mm or a valid timestamp" },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (status) updateData.status = status;
    if (notes !== undefined) updateData.notes = notes;

    // Only touch the hour figures when the caller actually supplied hours or
    // clock times — a status/notes-only edit must not wipe overtime.
    const recomputeHours =
      checkInTime !== undefined ||
      checkOutTime !== undefined ||
      overtimeHours !== undefined;

    if (recomputeHours) {
      const hasOt = overtimeHours !== undefined;
      const explicitOt = hasOt
        ? overtimeHours === null
          ? null
          : Number(overtimeHours)
        : null;
      const { workedHours, overtimeHours: computedOt } = await computeAttendanceHours(
        existing.employeeId,
        nextCheckIn,
        nextCheckOut,
        explicitOt
      );
      // Overtime is only overwritten when the caller supplied it; changing the
      // clock times alone keeps the manually entered OT.
      updateData.overtimeHours = hasOt ? computedOt : existing.overtimeHours;
      updateData.workedHours = workedHours;
      if (checkInTime !== undefined) updateData.checkInTime = nextCheckIn;
      if (checkOutTime !== undefined) updateData.checkOutTime = nextCheckOut;
    }

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
    const result = await requireAnyPermission(request, DELETE_PERMISSIONS);
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
