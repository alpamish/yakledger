import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAnyPermission, checkUserPermission } from "@/lib/permissions";
import {
  buildAccessScope,
  withScope,
  resolveApprovalStatusOnCreate,
  resolveApprovalStatusOnEdit,
  APPROVED,
} from "@/lib/access-control";
import {
  computeAttendanceHoursForSchedule,
  computePaidDailyHours,
  recalculatePayrollsForAttendance,
} from "@/services/hr.service";
import {
  formatDateOnly,
  isValidDateOnly,
  parseDateOnly,
  toAttendanceInstant,
} from "@/lib/attendance-date";

const ATTENDANCE_STATUSES = ["PRESENT", "ABSENT", "HALF_DAY", "LEAVE", "HOLIDAY"] as const;
const VALID_STATUSES = new Set<string>(ATTENDANCE_STATUSES);

const MAX_RECORDS = 500;

const WRITE_PERMISSIONS = ["employees:attendance:manage", "employees:create"];
const EDIT_PERMISSIONS = ["employees:attendance:manage", "employees:edit"];

const EMPLOYEE_SCHEDULE_SELECT = {
  id: true,
  workHoursPerDay: true,
  workStartTime: true,
  workEndTime: true,
  breakMinutes: true,
} as const;

interface ParsedRecord {
  employeeId: string;
  date: string;
  day: Date;
  status: string;
  notes: string | null;
  overtimeHours: number | null;
  checkIn: Date | null;
  checkOut: Date | null;
  /** false means "field omitted", so an existing value must be preserved. */
  hasNotes: boolean;
  hasCheckIn: boolean;
  hasCheckOut: boolean;
  hasOvertime: boolean;
}

async function canAny(user: { id: string; role: string }, permissions: string[]) {
  for (const permission of permissions) {
    if (await checkUserPermission(user.id, user.role, permission)) return true;
  }
  return false;
}

// POST /api/attendance/bulk - Create/update attendance for many employees/days
export async function POST(request: NextRequest) {
  try {
    const result = await requireAnyPermission(request, WRITE_PERMISSIONS);
    if ("status" in result) return result;
    const user = result.user;

    const body = await request.json();
    const { records } = body as { records?: unknown };

    if (!Array.isArray(records) || records.length === 0) {
      return NextResponse.json(
        { success: false, error: "Records array is required and must not be empty" },
        { status: 400 }
      );
    }

    if (records.length > MAX_RECORDS) {
      return NextResponse.json(
        { success: false, error: `At most ${MAX_RECORDS} records can be saved at once` },
        { status: 400 }
      );
    }

    const errors: { index: number; error: string }[] = [];
    const parsed: ParsedRecord[] = [];

    records.forEach((raw, index) => {
      const entry = (raw ?? {}) as Record<string, unknown>;
      const employeeId = typeof entry.employeeId === "string" ? entry.employeeId : "";
      const date = typeof entry.date === "string" ? entry.date : "";
      const status = typeof entry.status === "string" ? entry.status : "";

      if (!employeeId) {
        errors.push({ index, error: "employeeId is required" });
        return;
      }
      if (!isValidDateOnly(date)) {
        errors.push({ index, error: "date must be a valid YYYY-MM-DD day" });
        return;
      }
      if (!VALID_STATUSES.has(status)) {
        errors.push({
          index,
          error: `status must be one of: ${ATTENDANCE_STATUSES.join(", ")}`,
        });
        return;
      }

      const hasOt = entry.overtimeHours !== undefined && entry.overtimeHours !== null;
      const overtimeHours = hasOt ? Number(entry.overtimeHours) : null;
      if (overtimeHours !== null && (isNaN(overtimeHours) || overtimeHours < 0)) {
        errors.push({ index, error: "overtimeHours must be a non-negative number" });
        return;
      }

      const hasCheckIn = entry.checkInTime !== undefined;
      const hasCheckOut = entry.checkOutTime !== undefined;
      const checkIn = entry.checkInTime ? toAttendanceInstant(date, entry.checkInTime) : null;
      const checkOut = entry.checkOutTime ? toAttendanceInstant(date, entry.checkOutTime) : null;
      if ((entry.checkInTime && !checkIn) || (entry.checkOutTime && !checkOut)) {
        errors.push({
          index,
          error: "checkInTime/checkOutTime must be HH:mm or a valid timestamp",
        });
        return;
      }

      parsed.push({
        employeeId,
        date,
        day: parseDateOnly(date)!,
        status,
        notes: typeof entry.notes === "string" && entry.notes.trim() !== "" ? entry.notes : null,
        overtimeHours,
        checkIn,
        checkOut,
        hasNotes: entry.notes !== undefined,
        hasCheckIn,
        hasCheckOut,
        hasOvertime: hasOt,
      });
    });

    if (errors.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `${errors.length} attendance row(s) are invalid`,
          details: errors,
        },
        { status: 400 }
      );
    }

    // Last entry wins for an employee/day pair so a duplicate can't hit the
    // unique constraint halfway through the write.
    const deduped = new Map<string, ParsedRecord>();
    let duplicates = 0;
    for (const record of parsed) {
      const key = `${record.employeeId}|${record.date}`;
      if (deduped.has(key)) duplicates++;
      deduped.set(key, record);
    }
    const rows = Array.from(deduped.values());

    // Load every referenced employee once (schedule is needed for hours).
    const employeeIds = Array.from(new Set(rows.map((r) => r.employeeId)));
    const employees = await db.employee.findMany({
      where: { id: { in: employeeIds } },
      select: EMPLOYEE_SCHEDULE_SELECT,
    });
    const employeeById = new Map(employees.map((e) => [e.id, e]));
    const missing = employeeIds.filter((id) => !employeeById.has(id));
    if (missing.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Some employees no longer exist",
          details: missing.map((id) => ({ employeeId: id, error: "Unknown employee" })),
        },
        { status: 400 }
      );
    }

    const scope = await buildAccessScope(user, "attendance");
    const existing = await db.attendance.findMany({
      where: withScope(
        {
          OR: rows.map((r) => ({ employeeId: r.employeeId, date: r.day })),
        },
        scope
      ),
      select: {
        id: true,
        employeeId: true,
        date: true,
        status: true,
        notes: true,
        approvalStatus: true,
        createdBy: true,
        overtimeHours: true,
        workedHours: true,
        checkInTime: true,
        checkOutTime: true,
      },
    });
    const existingByKey = new Map<
      string,
      (typeof existing)[number]
    >(existing.map((e) => [`${e.employeeId}|${formatDateOnly(e.date)}`, e] as const));

    // Any row that would overwrite someone else's record needs edit rights.
    const inaccessible = rows.filter(
      (r) => !existingByKey.has(`${r.employeeId}|${r.date}`)
    );
    if (inaccessible.length > 0) {
      // Only a problem when a record does exist but is outside the user's
      // scope; tell them which rows were refused instead of overwriting.
      const duplicatesOutsideScope = await db.attendance.findMany({
        where: {
          OR: inaccessible.map((r) => ({ employeeId: r.employeeId, date: r.day })),
        },
        select: { employeeId: true, date: true },
      });
      if (duplicatesOutsideScope.length > 0) {
        const keys = new Set(
          duplicatesOutsideScope.map((r) => `${r.employeeId}|${formatDateOnly(r.date)}`)
        );
        const details = inaccessible
          .filter((r) => keys.has(`${r.employeeId}|${r.date}`))
          .map((r) => ({
            employeeId: r.employeeId,
            date: r.date,
            error: "Attendance already marked by someone else and is not accessible",
          }));
        return NextResponse.json(
          { success: false, error: "Some attendance rows are not accessible", details },
          { status: 403 }
        );
      }
    }

    const editingExisting = rows.some((r) =>
      existingByKey.has(`${r.employeeId}|${r.date}`)
    );
    if (editingExisting && !(await canAny(user, EDIT_PERMISSIONS))) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Some days are already marked; editing attendance requires the manage permission",
        },
        { status: 403 }
      );
    }

    // Dates whose approval state is (or was) APPROVED, per employee — these
    // are the ones that can change a payroll's attendance figures.
    const affected = new Map<string, string[]>();
    const noteAffected = (employeeId: string, date: string, involved: boolean) => {
      if (!involved) return;
      const dates = affected.get(employeeId) ?? [];
      if (!dates.includes(date)) dates.push(date);
      affected.set(employeeId, dates);
    };

    let created = 0;
    let updated = 0;

    await db.$transaction(async (tx) => {
      for (const row of rows) {
        const employee = employeeById.get(row.employeeId)!;
        const paidDailyHours = computePaidDailyHours(employee);

        const existingRow = existingByKey.get(`${row.employeeId}|${row.date}`);
        if (existingRow) {
          const nextCheckIn = row.hasCheckIn ? row.checkIn : existingRow.checkInTime;
          const nextCheckOut = row.hasCheckOut ? row.checkOut : existingRow.checkOutTime;
          const recompute =
            row.hasOvertime || row.hasCheckIn || row.hasCheckOut;
          const computed = computeAttendanceHoursForSchedule(
            paidDailyHours,
            nextCheckIn,
            nextCheckOut,
            row.overtimeHours
          );
          const approvalStatus = resolveApprovalStatusOnEdit(
            user,
            existingRow.approvalStatus
          );
          await tx.attendance.update({
            where: { id: existingRow.id },
            data: {
              status: row.status,
              notes: row.hasNotes ? row.notes : existingRow.notes,
              ...(recompute
                ? { workedHours: computed.workedHours }
                : { workedHours: existingRow.workedHours }),
              overtimeHours: row.hasOvertime
                ? computed.overtimeHours
                : existingRow.overtimeHours,
              ...(row.hasCheckIn ? { checkInTime: row.checkIn } : {}),
              ...(row.hasCheckOut ? { checkOutTime: row.checkOut } : {}),
              approvalStatus,
              approvedById: approvalStatus === APPROVED ? user.id : null,
              approvedAt: approvalStatus === APPROVED ? new Date() : null,
            },
          });
          noteAffected(
            row.employeeId,
            row.date,
            approvalStatus === APPROVED || existingRow.approvalStatus === APPROVED
          );
          updated++;
        } else {
          const approvalStatus = resolveApprovalStatusOnCreate(user);
          const createdHours = computeAttendanceHoursForSchedule(
            paidDailyHours,
            row.checkIn,
            row.checkOut,
            row.overtimeHours
          );
          await tx.attendance.create({
            data: {
              employeeId: row.employeeId,
              date: row.day,
              status: row.status,
              notes: row.notes,
              overtimeHours: createdHours.overtimeHours,
              workedHours: createdHours.workedHours,
              checkInTime: row.checkIn,
              checkOutTime: row.checkOut,
              createdBy: user.id,
              approvalStatus,
              approvedById: approvalStatus === APPROVED ? user.id : null,
              approvedAt: approvalStatus === APPROVED ? new Date() : null,
            },
          });
          noteAffected(row.employeeId, row.date, approvalStatus === APPROVED);
          created++;
        }
      }
    });

    // Approved attendance automatically recalculates the affected payrolls;
    // a recalculation failure must never fail the bulk write itself. Run in
    // small batches so a big roster save doesn't block for minutes.
    const affectedEntries = Array.from(affected.entries());
    const CHUNK = 5;
    for (let i = 0; i < affectedEntries.length; i += CHUNK) {
      await Promise.all(
        affectedEntries.slice(i, i + CHUNK).map(async ([employeeId, dates]) => {
          try {
            await recalculatePayrollsForAttendance({ employeeId, dates, userId: user.id });
          } catch (error) {
            console.error("Attendance payroll recalculation error:", error);
          }
        })
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        created,
        updated,
        duplicates,
        total: rows.length,
        affectedPayrollEmployees: affected.size,
      },
    });
  } catch (error) {
    console.error("Bulk attendance error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create bulk attendance records" },
      { status: 500 }
    );
  }
}
