import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAnyPermission, checkUserPermission } from "@/lib/permissions";
import {
  buildListScope,
  buildAccessScope,
  withScope,
  resolveApprovalStatusOnCreate,
  resolveApprovalStatusOnEdit,
  APPROVED,
} from "@/lib/access-control";
import {
  computeAttendanceHours,
  recalculatePayrollsForAttendance,
} from "@/services/hr.service";
import {
  isValidDateOnly,
  parseDateOnly,
  toAttendanceInstant,
} from "@/lib/attendance-date";

const ATTENDANCE_STATUSES = ["PRESENT", "ABSENT", "HALF_DAY", "LEAVE", "HOLIDAY"] as const;

const VALID_STATUSES = new Set(ATTENDANCE_STATUSES);

const VIEW_PERMISSIONS = ["employees:view", "employees:attendance:view"];
const WRITE_PERMISSIONS = ["employees:attendance:manage", "employees:create"];
const EDIT_PERMISSIONS = ["employees:attendance:manage", "employees:edit"];

async function canAny(user: { id: string; role: string }, permissions: string[]) {
  for (const permission of permissions) {
    if (await checkUserPermission(user.id, user.role, permission)) return true;
  }
  return false;
}

// GET /api/attendance - List attendance records with filters
export async function GET(request: NextRequest) {
  try {
    const result = await requireAnyPermission(request, VIEW_PERMISSIONS);
    if ("status" in result) return result;
    const user = result.user;

    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get("employeeId");
    const search = searchParams.get("search");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const status = searchParams.get("status");
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
    const pageSize = Math.min(
      366,
      Math.max(1, parseInt(searchParams.get("pageSize") ?? "50"))
    );

    if ((dateFrom && !isValidDateOnly(dateFrom)) || (dateTo && !isValidDateOnly(dateTo))) {
      return NextResponse.json(
        { success: false, error: "dateFrom and dateTo must be YYYY-MM-DD" },
        { status: 400 }
      );
    }

    const where: Record<string, unknown> = {};

    if (employeeId) where.employeeId = employeeId;
    if (status) where.status = status;

    if (search) {
      where.employee = { fullName: { contains: search } };
    }

    if (dateFrom || dateTo) {
      const dateFilter: Record<string, Date> = {};
      const from = dateFrom ? parseDateOnly(dateFrom) : null;
      const to = dateTo ? parseDateOnly(dateTo) : null;
      if (from) dateFilter.gte = from;
      if (to) {
        const end = new Date(to);
        end.setUTCHours(23, 59, 59, 999);
        dateFilter.lte = end;
      }
      where.date = dateFilter;
    }

    const scopedWhere = withScope(where, await buildListScope(user, "attendance"));

    const [records, total] = await Promise.all([
      db.attendance.findMany({
        where: scopedWhere,
        orderBy: { date: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          employee: {
            select: { id: true, fullName: true, jobTitle: true, department: true },
          },
        },
      }),
      db.attendance.count({ where: scopedWhere }),
    ]);

    return NextResponse.json({
      success: true,
      data: { data: records, total },
    });
  } catch (error) {
    console.error("Attendance list error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch attendance records" },
      { status: 500 }
    );
  }
}

// POST /api/attendance - Create or update (upsert) attendance record
export async function POST(request: NextRequest) {
  try {
    const result = await requireAnyPermission(request, WRITE_PERMISSIONS);
    if ("status" in result) return result;
    const user = result.user;

    const body = await request.json();
    const { employeeId, date, status, notes, overtimeHours, checkInTime, checkOutTime } = body;

    if (!employeeId || !date || !status) {
      return NextResponse.json(
        { success: false, error: "employeeId, date, and status are required" },
        { status: 400 }
      );
    }

    if (!isValidDateOnly(date)) {
      return NextResponse.json(
        { success: false, error: "date must be a valid YYYY-MM-DD day" },
        { status: 400 }
      );
    }

    if (!VALID_STATUSES.has(status)) {
      return NextResponse.json(
        { success: false, error: `Invalid status. Must be one of: ${ATTENDANCE_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }

    const explicitOt =
      overtimeHours !== undefined && overtimeHours !== null ? Number(overtimeHours) : null;
    if (explicitOt !== null && (isNaN(explicitOt) || explicitOt < 0)) {
      return NextResponse.json(
        { success: false, error: "overtimeHours must be a non-negative number" },
        { status: 400 }
      );
    }

    const checkIn = checkInTime ? toAttendanceInstant(date, checkInTime) : null;
    const checkOut = checkOutTime ? toAttendanceInstant(date, checkOutTime) : null;
    if ((checkInTime && !checkIn) || (checkOutTime && !checkOut)) {
      return NextResponse.json(
        { success: false, error: "checkInTime/checkOutTime must be HH:mm or a valid timestamp" },
        { status: 400 }
      );
    }

    const { workedHours, overtimeHours: computedOt } = await computeAttendanceHours(
      employeeId,
      checkIn,
      checkOut,
      explicitOt
    );

    const day = parseDateOnly(date)!;

    // Upsert: create or update if record exists for same employee + date
    const existing = await db.attendance.findUnique({
      where: { employeeId_date: { employeeId, date: day } },
      select: { id: true, approvalStatus: true, createdBy: true },
    });

    let record;
    if (existing) {
      if (!(await canAny(user, EDIT_PERMISSIONS))) {
        return NextResponse.json(
          {
            success: false,
            error: "This day is already marked; editing attendance requires the manage permission",
          },
          { status: 403 }
        );
      }
      const existingScoped = await db.attendance.findFirst({
        where: withScope({ id: existing.id }, await buildAccessScope(user, "attendance")),
        select: { id: true },
      });
      if (!existingScoped) {
        return NextResponse.json(
          { success: false, error: "Attendance record not found or no access" },
          { status: 404 }
        );
      }
      const approvalStatus = resolveApprovalStatusOnEdit(user, existing.approvalStatus);
      record = await db.attendance.update({
        where: { id: existing.id },
        data: {
          status,
          notes: notes ?? null,
          overtimeHours: computedOt,
          workedHours,
          checkInTime: checkIn,
          checkOutTime: checkOut,
          approvalStatus,
          approvedById: approvalStatus === APPROVED ? user.id : null,
          approvedAt: approvalStatus === APPROVED ? new Date() : null,
        },
      });
    } else {
      const approvalStatus = resolveApprovalStatusOnCreate(user);
      record = await db.attendance.create({
        data: {
          employeeId,
          date: day,
          status,
          notes: notes ?? null,
          overtimeHours: computedOt,
          workedHours,
          checkInTime: checkIn,
          checkOutTime: checkOut,
          createdBy: user.id,
          approvalStatus,
          approvedById: approvalStatus === APPROVED ? user.id : null,
          approvedAt: approvalStatus === APPROVED ? new Date() : null,
        },
      });
    }

    // Approved attendance automatically recalculates the affected payrolls;
    // a recalculation failure must never fail the attendance write itself.
    if (record.approvalStatus === APPROVED || existing?.approvalStatus === APPROVED) {
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
    console.error("Attendance create error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create attendance record" },
      { status: 500 }
    );
  }
}
