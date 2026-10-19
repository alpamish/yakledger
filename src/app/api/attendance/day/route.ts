import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAnyPermission } from "@/lib/permissions";
import { buildAccessScope, withScope } from "@/lib/access-control";
import { isValidDateOnly, parseDateOnly } from "@/lib/attendance-date";

const VIEW_PERMISSIONS = ["employees:view", "employees:attendance:view"];

/**
 * GET /api/attendance/day?date=YYYY-MM-DD
 *
 * One-shot roster payload: every active employee plus their attendance record
 * for the day (or null when unmarked) and the day's summary. Using
 * `buildAccessScope` (rather than the list scope) means PENDING rows are
 * visible to the people who can act on them, so the roster never shows a day
 * as "not marked" when a pending record already exists.
 */
export async function GET(request: NextRequest) {
  try {
    const result = await requireAnyPermission(request, VIEW_PERMISSIONS);
    if ("status" in result) return result;
    const user = result.user;

    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date");
    const search = searchParams.get("search")?.trim();
    const department = searchParams.get("department")?.trim();
    const includeInactive = searchParams.get("includeInactive") === "1";

    if (!isValidDateOnly(date)) {
      return NextResponse.json(
        { success: false, error: "date must be a valid YYYY-MM-DD day" },
        { status: 400 }
      );
    }

    const day = parseDateOnly(date)!;

    const employeeWhere: Record<string, unknown> = {};
    if (!includeInactive) employeeWhere.status = "ACTIVE";
    if (department) employeeWhere.department = department;
    if (search) employeeWhere.fullName = { contains: search };

    const [employees, records] = await Promise.all([
      db.employee.findMany({
        where: employeeWhere,
        select: {
          id: true,
          fullName: true,
          jobTitle: true,
          department: true,
          workStartTime: true,
          workEndTime: true,
        },
        orderBy: [{ department: "asc" }, { fullName: "asc" }],
      }),
      db.attendance.findMany({
        where: withScope({ date: day }, await buildAccessScope(user, "attendance")),
        select: {
          id: true,
          employeeId: true,
          date: true,
          status: true,
          notes: true,
          overtimeHours: true,
          workedHours: true,
          checkInTime: true,
          checkOutTime: true,
          approvalStatus: true,
        },
      }),
    ]);

    const recordByEmployee = new Map<string, (typeof records)[number]>(
      records.map((r) => [r.employeeId, r] as const)
    );

    const summary = {
      totalEmployees: employees.length,
      marked: 0,
      unmarked: 0,
      present: 0,
      absent: 0,
      halfDay: 0,
      leave: 0,
      holiday: 0,
      totalOvertimeHours: 0,
    };

    const rows = employees.map((employee) => {
      const record = recordByEmployee.get(employee.id) ?? null;
      if (record) {
        summary.marked++;
        summary.totalOvertimeHours += record.overtimeHours ?? 0;
        switch (record.status) {
          case "PRESENT":
            summary.present++;
            break;
          case "ABSENT":
            summary.absent++;
            break;
          case "HALF_DAY":
            summary.halfDay++;
            break;
          case "LEAVE":
            summary.leave++;
            break;
          case "HOLIDAY":
            summary.holiday++;
            break;
        }
      } else {
        summary.unmarked++;
      }
      return { employee, record };
    });

    summary.totalOvertimeHours = +summary.totalOvertimeHours.toFixed(2);

    return NextResponse.json({
      success: true,
      data: { date, summary, rows },
    });
  } catch (error) {
    console.error("Attendance day roster error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load the attendance roster" },
      { status: 500 }
    );
  }
}
