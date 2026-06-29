import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

const bulkRecordSchema = z.object({
  contractorId: z.string().min(1, "Contractor is required"),
  machineryId: z.string().optional().nullable(),
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

function parseMinutes(val: string | null | undefined): number {
  if (!val) return -1;
  const [h, m] = val.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return -1;
  return h * 60 + m;
}

function calculateHours(
  startTime: string | null | undefined,
  lunchStart: string | null | undefined,
  lunchEnd: string | null | undefined,
  endTime: string | null | undefined,
  workHoursPerDay: number
): { totalHours: number; overtimeHours: number } {
  const s = parseMinutes(startTime);
  const ls = parseMinutes(lunchStart);
  const le = parseMinutes(lunchEnd);
  const e = parseMinutes(endTime);

  let total = 0;
  if (s >= 0 && (ls ?? -1) > s) total += ((ls ?? 0) - s) / 60;
  if ((le ?? -1) >= 0 && e > (le ?? -1)) total += (e - (le ?? 0)) / 60;

  total = Math.round(total * 100) / 100;
  const ot = Math.max(0, Math.round((total - workHoursPerDay) * 100) / 100);

  return { totalHours: total, overtimeHours: ot };
}

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
      for (const record of records) {
        const WORK_HOURS_PER_DAY = 9;
        const hours = record.totalHours != null && record.totalHours > 0
          ? { totalHours: record.totalHours, overtimeHours: record.overtimeHours ?? 0 }
          : calculateHours(record.startTime, record.lunchStart, record.lunchEnd, record.endTime, WORK_HOURS_PER_DAY);

        const timesheet = await tx.timesheet.create({
          data: {
            contractorId: record.contractorId,
            machineryId: record.machineryId ?? null,
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
