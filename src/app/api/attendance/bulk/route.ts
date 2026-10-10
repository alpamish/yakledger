import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { buildAccessScope, withScope, resolveApprovalStatusOnCreate, resolveApprovalStatusOnEdit, APPROVED } from "@/lib/access-control";
import { recalculatePayrollsForAttendance } from "@/services/hr.service";
import { format } from "date-fns";

const ATTENDANCE_STATUSES = ["PRESENT", "ABSENT", "HALF_DAY", "LEAVE", "HOLIDAY"] as const;
const VALID_STATUSES = new Set(ATTENDANCE_STATUSES);

// POST /api/attendance/bulk - Create/update attendance for multiple employees on same date
export async function POST(request: NextRequest) {
  try {
    const result = await requirePermission(request, "employees:create");
    if ("status" in result) return result;
    const user = result.user;

    const body = await request.json();
    const { records } = body;

    if (!Array.isArray(records) || records.length === 0) {
      return NextResponse.json(
        { success: false, error: "Records array is required and must not be empty" },
        { status: 400 }
      );
    }

    // Validate all records are for today only
    const today = format(new Date(), 'yyyy-MM-dd');
    const nonTodayRecords = records.filter((r: { date?: string }) => r.date && r.date !== today);
    if (nonTodayRecords.length > 0) {
      return NextResponse.json(
        { success: false, error: "Bulk attendance is only allowed for the current date" },
        { status: 400 }
      );
    }

    let created = 0;
    let updated = 0;
    // Dates whose approval state is (or was) APPROVED, per employee — these
    // are the ones that can change a payroll's attendance figures.
    const affected = new Map<string, string[]>();
    const noteAffected = (employeeId: string, date: string, involved: boolean) => {
      if (!involved) return;
      const dates = affected.get(employeeId) ?? [];
      dates.push(date);
      affected.set(employeeId, dates);
    };

    for (const record of records) {
      const { employeeId, date, status, notes } = record;

      if (!employeeId || !date || !status) continue;
      if (!VALID_STATUSES.has(status)) continue;

      const existing = await db.attendance.findUnique({
        where: { employeeId_date: { employeeId, date: new Date(date) } },
        select: { id: true, approvalStatus: true },
      });

      if (existing) {
        const scopedExisting = await db.attendance.findFirst({
          where: withScope({ id: existing.id }, await buildAccessScope(user, "attendance")),
          select: { id: true },
        });
        if (!scopedExisting) continue;
        const approvalStatus = resolveApprovalStatusOnEdit(user, existing.approvalStatus);
        await db.attendance.update({
          where: { id: existing.id },
          data: {
            status,
            notes: notes ?? null,
            approvalStatus,
            approvedById: approvalStatus === APPROVED ? user.id : null,
            approvedAt: approvalStatus === APPROVED ? new Date() : null,
          },
        });
        noteAffected(employeeId, date, approvalStatus === APPROVED || existing.approvalStatus === APPROVED);
        updated++;
      } else {
        const approvalStatus = resolveApprovalStatusOnCreate(user);
        await db.attendance.create({
          data: {
            employeeId,
            date: new Date(date),
            status,
            notes: notes ?? null,
            createdBy: user.id,
            approvalStatus,
            approvedById: approvalStatus === APPROVED ? user.id : null,
            approvedAt: approvalStatus === APPROVED ? new Date() : null,
          },
        });
        noteAffected(employeeId, date, approvalStatus === APPROVED);
        created++;
      }
    }

    // Approved attendance automatically recalculates the affected payrolls;
    // a recalculation failure must never fail the bulk write itself.
    for (const [employeeId, dates] of affected) {
      try {
        await recalculatePayrollsForAttendance({ employeeId, dates, userId: user.id });
      } catch (error) {
        console.error("Attendance payroll recalculation error:", error);
      }
    }

    return NextResponse.json({
      success: true,
      data: { created, updated, total: records.length },
    });
  } catch (error) {
    console.error("Bulk attendance error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create bulk attendance records" },
      { status: 500 }
    );
  }
}
