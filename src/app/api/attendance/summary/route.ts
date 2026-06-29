import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

// GET /api/attendance/summary?employeeId=X&dateFrom=Y&dateTo=Z
export async function GET(request: NextRequest) {
  try {
    const result = await requirePermission(request, "employees:view");
    if ("status" in result) return result;

    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get("employeeId");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");

    if (!employeeId) {
      return NextResponse.json(
        { success: false, error: "employeeId is required" },
        { status: 400 }
      );
    }

    const where: Record<string, unknown> = { employeeId };
    if (dateFrom || dateTo) {
      const dateFilter: Record<string, Date> = {};
      if (dateFrom) dateFilter.gte = new Date(dateFrom);
      if (dateTo) dateFilter.lte = new Date(dateTo + "T23:59:59.999Z");
      where.date = dateFilter;
    }

    const records = await db.attendance.findMany({
      where,
      select: { status: true },
    });

    const summary = {
      presentDays: 0,
      halfDays: 0,
      absentDays: 0,
      leaveDays: 0,
      holidayDays: 0,
      totalDays: records.length,
      effectiveDays: 0,
    };

    for (const r of records) {
      switch (r.status) {
        case "PRESENT":
          summary.presentDays++;
          break;
        case "HALF_DAY":
          summary.halfDays++;
          break;
        case "ABSENT":
          summary.absentDays++;
          break;
        case "LEAVE":
          summary.leaveDays++;
          break;
        case "HOLIDAY":
          summary.holidayDays++;
          break;
      }
    }

    summary.effectiveDays = summary.presentDays + summary.halfDays * 0.5;

    return NextResponse.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    console.error("Attendance summary error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch attendance summary" },
      { status: 500 }
    );
  }
}
