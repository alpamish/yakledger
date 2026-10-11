import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { resolveApprovalStatusOnCreate, APPROVED } from "@/lib/access-control";
import { calculateHoursWithOvertime } from "@/lib/timesheet-hours";
import { DEFAULT_WORK_HOURS_PER_DAY } from "@/lib/contractor-rate";
import { resolveRateForWork } from "@/services/contract-rate.service";

const bulkRecordSchema = z.object({
  contractorId: z.string().min(1, "Contractor is required"),
  machineryId: z.string().optional().nullable(),
  machineryRateId: z.string().optional().nullable(),
  // Contract billing (Phase 2): omitted = auto-discover the contractor's
  // active contract for the date; null = explicitly bill without a contract.
  contractId: z.string().optional().nullable(),
  rateLabel: z.string().optional().nullable(),
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

    // Prefetch machinery rate fields (for overtime derivation and rate
    // resolution) instead of hard-coding 9 hours anywhere.
    const machineryIds = [...new Set(records.map((r) => r.machineryId).filter(Boolean))] as string[];
    const machineryRows = machineryIds.length > 0
      ? await db.machinery.findMany({
          where: { id: { in: machineryIds } },
          select: {
            id: true,
            workHoursPerDay: true,
            hourlyRate: true,
            dailyRate: true,
            monthlyRate: true,
            contractDaysPerMonth: true,
          },
        })
      : [];
    const workHoursByMachinery = new Map<string, number>(
      machineryRows.map((m) => [m.id, m.workHoursPerDay])
    );
    const machineryById = new Map<string, (typeof machineryRows)[number]>(
      machineryRows.map((m) => [m.id, m])
    );

    // Prefetch each contractor's active contracts (for auto-discovery).
    const contractorIds = [...new Set(records.map((r) => r.contractorId))];
    const activeContracts = contractorIds.length > 0
      ? await db.contractorContract.findMany({
          where: {
            contractorId: { in: contractorIds },
            status: "ACTIVE",
          },
          select: { id: true, contractorId: true, startDate: true, endDate: true },
        })
      : [];
    const discoverContract = (contractorId: string, at: Date): string | null => {
      const candidates = activeContracts
        .filter(
          (c) =>
            c.contractorId === contractorId &&
            c.startDate <= at &&
            (!c.endDate || c.endDate >= at)
        )
        .sort((a, b) => b.startDate.getTime() - a.startDate.getTime());
      return candidates[0]?.id ?? null;
    };

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

        const workDate = new Date(record.date);
        const contractId =
          record.contractId === undefined
            ? discoverContract(record.contractorId, workDate)
            : record.contractId;
        const resolved = await resolveRateForWork({
          client: tx,
          contractId,
          machineryId: record.machineryId,
          label: record.rateLabel ?? null,
          at: workDate,
          machinery: record.machineryId ? machineryById.get(record.machineryId) ?? null : null,
        });

        const timesheet = await tx.timesheet.create({
          data: {
            contractorId: record.contractorId,
            machineryId: record.machineryId ?? null,
            machineryRateId: record.machineryRateId ?? null,
            contractId,
            contractRateId: resolved.contractRateId,
            rateLabel: resolved.label,
            rateAmount: resolved.hourlyRate > 0 ? resolved.hourlyRate : null,
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
