import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { resolveApprovalStatusOnCreate, APPROVED } from "@/lib/access-control";
import { calculateHoursWithOvertime } from "@/lib/timesheet-hours";
import { DEFAULT_WORK_HOURS_PER_DAY } from "@/lib/contractor-rate";

const bulkRecordSchema = z.object({
  contractorId: z.string().min(1, "Contractor is required"),
  machineryId: z.string().optional().nullable(),
  machineryRateId: z.string().optional().nullable(),
  operatorName: z.string().optional().nullable(),
  workSite: z.string().optional().nullable(),
  date: z.string().min(1, "Date is required"),
  startTime: z.string().optional().nullable(),
  lunchStart: z.string().optional().nullable(),
  lunchEnd: z.string().optional().nullable(),
  endTime: z.string().optional().nullable(),
  totalHours: z.number().min(0).default(0),
  overtimeHours: z.number().min(0).default(0),
  notes: z.string().optional().nullable(),
});

const bulkCreateSchema = z.object({
  records: z.array(bulkRecordSchema).min(1, "At least one record is required"),
});

export async function POST(request: NextRequest) {
  try {
    const result = await requirePermission(request, "timesheets:create");
    if ("status" in result) return result;
    const user = result.user;

    const body = await request.json();
    const parsed = bulkCreateSchema.safeParse(body);

    if (!parsed.success) {
      const errors = parsed.error.issues.map((issue) => issue.message);
      return NextResponse.json(
        { success: false, error: errors.join(", ") },
        { status: 400 }
      );
    }

    const { records } = parsed.data;

    // Prefetch work-hours-per-day for the referenced machinery so overtime is
    // derived from each machine's configuration instead of a hard-coded 9.
    const machineryIds = [...new Set(records.map((r) => r.machineryId).filter(Boolean))] as string[];
    const machineryRows = machineryIds.length > 0
      ? await db.machinery.findMany({
          where: { id: { in: machineryIds } },
          select: { id: true, workHoursPerDay: true },
        })
      : [];
    const workHoursByMachinery = new Map<string, number>(
      machineryRows.map((m) => [m.id, m.workHoursPerDay])
    );

    const includes = {
      contractor: {
        select: { id: true, contractorName: true, contractorType: true },
      },
      machinery: {
        select: { id: true, machineryName: true, machineryType: true, plateNumber: true, driverName: true },
      },
    } as const;

    const created = await db.$transaction(async (tx) => {
      const results: Array<{ id: string }> = [];
      const approvalStatus = resolveApprovalStatusOnCreate(user);
      const approvedById = approvalStatus === APPROVED ? user.id : null;
      const approvedAt = approvalStatus === APPROVED ? new Date() : null;
      for (const record of records) {
        const workHoursPerDay = record.machineryId
          ? workHoursByMachinery.get(record.machineryId) ?? DEFAULT_WORK_HOURS_PER_DAY
          : DEFAULT_WORK_HOURS_PER_DAY;
        const hours = record.totalHours != null && record.totalHours > 0
          ? { totalHours: record.totalHours, overtimeHours: record.overtimeHours ?? 0 }
          : calculateHoursWithOvertime(record.startTime, record.lunchStart, record.lunchEnd, record.endTime, workHoursPerDay);

        const timesheet = await tx.timesheet.create({
          data: {
            contractorId: record.contractorId,
            machineryId: record.machineryId ?? null,
            machineryRateId: record.machineryRateId ?? null,
            operatorName: record.operatorName ?? null,
            workSite: record.workSite ?? null,
            date: new Date(record.date),
            startTime: record.startTime ?? null,
            lunchStart: record.lunchStart ?? null,
            lunchEnd: record.lunchEnd ?? null,
            endTime: record.endTime ?? null,
            totalHours: hours.totalHours,
            overtimeHours: hours.overtimeHours,
            notes: record.notes ?? null,
            createdBy: user.id,
            approvalStatus,
            approvedById,
            approvedAt,
          },
          include: includes,
        });
        results.push(timesheet);
      }
      return results;
    });

    await db.auditLog.create({
      data: {
        action: "CREATE",
        entity: "Timesheet",
        entityId: `bulk-${created[0]?.id ?? "unknown"}`,
        details: `Bulk created ${created.length} timesheet records`,
        userId: user.id,
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: { created: created.length, records: created },
        message: `${created.length} timesheet records created successfully`,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Bulk create timesheet error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create timesheet records" },
      { status: 500 }
    );
  }
}
