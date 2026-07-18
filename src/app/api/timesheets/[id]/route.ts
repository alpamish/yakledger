import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

const updateTimesheetSchema = z.object({
  contractorId: z.string().min(1).optional(),
  machineryId: z.string().min(1).optional(),
  machineryRateId: z.string().optional().nullable(),
  operatorName: z.string().optional().nullable(),
  workSite: z.string().optional().nullable(),
  date: z.string().min(1).optional(),
  startTime: z.string().optional().nullable(),
  lunchStart: z.string().optional().nullable(),
  lunchEnd: z.string().optional().nullable(),
  endTime: z.string().optional().nullable(),
  totalHours: z.number().min(0).optional(),
  overtimeHours: z.number().min(0).optional(),
  approvedBy: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

// Helper: calculate total hours from time strings (HH:mm format)
function calculateHours(start: string | null | undefined, end: string | null | undefined): number {
  if (!start || !end) return 0;
  const [h1, m1] = start.split(":").map(Number);
  const [h2, m2] = end.split(":").map(Number);
  if (isNaN(h1) || isNaN(m1) || isNaN(h2) || isNaN(m2)) return 0;
  const s = h1 * 60 + m1;
  const e = h2 * 60 + m2;
  if (e <= s) return 0;
  return Math.round(((e - s) / 60) * 100) / 100;
}

function calculateTotalHours(
  startTime: string | null | undefined,
  lunchStart: string | null | undefined,
  lunchEnd: string | null | undefined,
  endTime: string | null | undefined
): number {
  const morning = calculateHours(startTime, lunchStart);
  const afternoon = calculateHours(lunchEnd, endTime);
  return Math.round((morning + afternoon) * 100) / 100;
}

// PUT /api/timesheets/[id] - Update timesheet
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await requirePermission(request, "timesheets:edit");
    if ("status" in result) return result;
    const user = result.user;

    const { id } = await params;
    const body = await request.json();
    const parsedResult = updateTimesheetSchema.safeParse(body);

    if (!parsedResult.success) {
      const errors = parsedResult.error.issues.map((issue) => issue.message);
      return NextResponse.json(
        { success: false, error: errors.join(", ") },
        { status: 400 }
      );
    }

    const data = parsedResult.data;

    // Build update object
    const updateData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        if (key === "date" && value) {
          updateData[key] = new Date(value as string);
        } else {
          updateData[key] = value;
        }
      }
    }

    // Auto-recalculate totalHours if any time field changed and totalHours not explicitly set
    if ((data.startTime !== undefined || data.lunchStart !== undefined || data.lunchEnd !== undefined || data.endTime !== undefined) && data.totalHours === undefined) {
      const existing = await db.timesheet.findUnique({
        where: { id },
        select: { startTime: true, lunchStart: true, lunchEnd: true, endTime: true },
      });
      if (existing) {
        const startTime = (data.startTime ?? existing.startTime) as string | null;
        const lunchStart = (data.lunchStart ?? existing.lunchStart) as string | null;
        const lunchEnd = (data.lunchEnd ?? existing.lunchEnd) as string | null;
        const endTime = (data.endTime ?? existing.endTime) as string | null;
        const calculated = calculateTotalHours(startTime, lunchStart, lunchEnd, endTime);
        if (calculated > 0) {
          updateData.totalHours = calculated;
        }
      }
    }

    const timesheet = await db.timesheet.update({
      where: { id },
      data: updateData,
      include: {
        contractor: {
          select: { id: true, contractorName: true, contractorType: true },
        },
        machinery: {
          select: { id: true, machineryName: true, machineryType: true, plateNumber: true },
        },
      },
    });

    // Create audit log entry
    await db.auditLog.create({
      data: {
        action: "UPDATE",
        entity: "Timesheet",
        entityId: timesheet.id,
        details: `Updated timesheet for ${timesheet.operatorName || "contractor"}`,
        userId: user.id,
      },
    });

    return NextResponse.json({
      success: true,
      data: timesheet,
      message: "Timesheet updated successfully",
    });
  } catch (error) {
    console.error("Update timesheet error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update timesheet" },
      { status: 500 }
    );
  }
}

// DELETE /api/timesheets/[id] - Delete timesheet
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await requirePermission(request, "timesheets:delete");
    if ("status" in result) return result;
    const user = result.user;

    const { id } = await params;

    // Get timesheet info before deletion for audit log
    const timesheet = await db.timesheet.findUnique({
      where: { id },
      select: { operatorName: true, date: true },
    });

    if (!timesheet) {
      return NextResponse.json(
        { success: false, error: "Timesheet not found" },
        { status: 404 }
      );
    }

    // Create audit log entry before deletion
    await db.auditLog.create({
      data: {
        action: "DELETE",
        entity: "Timesheet",
        entityId: id,
        details: `Deleted timesheet for ${timesheet.operatorName || "contractor"}`,
        userId: user.id,
      },
    });

    await db.timesheet.delete({ where: { id } });

    return NextResponse.json({
      success: true,
      message: "Timesheet deleted successfully",
    });
  } catch (error) {
    console.error("Delete timesheet error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete timesheet" },
      { status: 500 }
    );
  }
}
