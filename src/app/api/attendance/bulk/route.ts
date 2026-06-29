import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

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

    let created = 0;
    let updated = 0;

    for (const record of records) {
      const { employeeId, date, status, notes } = record;

      if (!employeeId || !date || !status) continue;
      if (!VALID_STATUSES.has(status)) continue;

      const existing = await db.attendance.findUnique({
        where: { employeeId_date: { employeeId, date: new Date(date) } },
      });

      if (existing) {
        await db.attendance.update({
          where: { id: existing.id },
          data: { status, notes: notes ?? null },
        });
        updated++;
      } else {
        await db.attendance.create({
          data: {
            employeeId,
            date: new Date(date),
            status,
            notes: notes ?? null,
            createdBy: user.id,
          },
        });
        created++;
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
