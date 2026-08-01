import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

const ATTENDANCE_STATUSES = ["PRESENT", "ABSENT", "HALF_DAY", "LEAVE", "HOLIDAY"] as const;

const VALID_STATUSES = new Set(ATTENDANCE_STATUSES);

// GET /api/attendance - List attendance records with filters
export async function GET(request: NextRequest) {
  try {
    const result = await requirePermission(request, "employees:view");
    if ("status" in result) return result;

    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get("employeeId");
    const search = searchParams.get("search");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const status = searchParams.get("status");
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") ?? "50")));

    const where: Record<string, unknown> = {};

    if (employeeId) where.employeeId = employeeId;
    if (status) where.status = status;

    if (search) {
      where.employee = { fullName: { contains: search } };
    }

    if (dateFrom || dateTo) {
      const dateFilter: Record<string, Date> = {};
      if (dateFrom) dateFilter.gte = new Date(dateFrom);
      if (dateTo) dateFilter.lte = new Date(dateTo + "T23:59:59.999Z");
      where.date = dateFilter;
    }

    const [records, total] = await Promise.all([
      db.attendance.findMany({
        where,
        orderBy: { date: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          employee: {
            select: { id: true, fullName: true, jobTitle: true, department: true },
          },
        },
      }),
      db.attendance.count({ where }),
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
    const result = await requirePermission(request, "employees:create");
    if ("status" in result) return result;
    const user = result.user;

    const body = await request.json();
    const { employeeId, date, status, notes, overtimeHours } = body;

    if (!employeeId || !date || !status) {
      return NextResponse.json(
        { success: false, error: "employeeId, date, and status are required" },
        { status: 400 }
      );
    }

    if (!VALID_STATUSES.has(status)) {
      return NextResponse.json(
        { success: false, error: `Invalid status. Must be one of: ${ATTENDANCE_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }

    const ot = overtimeHours !== undefined && overtimeHours !== null ? Number(overtimeHours) : 0;
    if (isNaN(ot) || ot < 0) {
      return NextResponse.json(
        { success: false, error: "overtimeHours must be a non-negative number" },
        { status: 400 }
      );
    }

    // Upsert: create or update if record exists for same employee + date
    const existing = await db.attendance.findUnique({
      where: { employeeId_date: { employeeId, date: new Date(date) } },
    });

    let record;
    if (existing) {
      record = await db.attendance.update({
        where: { id: existing.id },
        data: { status, notes: notes ?? null, overtimeHours: ot },
      });
    } else {
      record = await db.attendance.create({
        data: {
          employeeId,
          date: new Date(date),
          status,
          notes: notes ?? null,
          overtimeHours: ot,
          createdBy: user.id,
        },
      });
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
