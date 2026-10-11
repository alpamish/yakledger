import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { Prisma } from "@prisma/client";
import { buildListScope, withScope, resolveApprovalStatusOnCreate, APPROVED } from "@/lib/access-control";
import { calculateTotalHours } from "@/lib/timesheet-hours";
import { resolveRateForWork } from "@/services/contract-rate.service";

const createTimesheetSchema = z.object({
  contractorId: z.string().min(1, "Contractor is required"),
  machineryId: z.string().min(1, "Machinery is required"),
  machineryRateId: z.string().optional().nullable(),
  // Contract billing (Phase 2). When omitted, the contractor's active contract
  // for the work date is auto-discovered; pass contractId: null to explicitly
  // bill without a contract (legacy machinery-rate billing).
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
  approvedBy: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

// GET /api/timesheets - List timesheets with filtering, pagination, sorting
export async function GET(request: NextRequest) {
  try {
    const result = await requirePermission(request, "timesheets:view");
    if ("status" in result) return result;
    const user = result.user;

    const { searchParams } = new URL(request.url);

    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "10")));

    const search = searchParams.get("search") || undefined;
    const contractorId = searchParams.get("contractorId") || undefined;
    const machineryId = searchParams.get("machineryId") || undefined;
    const dateFrom = searchParams.get("dateFrom") || undefined;
    const dateTo = searchParams.get("dateTo") || undefined;
    const approvalStatusParam = searchParams.get("approvalStatus");
    const approvalStatus = approvalStatusParam || undefined;

    const sortBy = searchParams.get("sortBy") || "date";
    const sortOrder = searchParams.get("sortOrder") || "desc";

    // Build dynamic where clause
    const where: Prisma.TimesheetWhereInput = {};

    if (approvalStatus) {
      where.approvalStatus = approvalStatus as Prisma.StringFilter["equals"];
    }

    if (search) {
      where.OR = [
        { operatorName: { contains: search } },
        { workSite: { contains: search } },
        { contractor: { contractorName: { contains: search } } },
        { machinery: { plateNumber: { contains: search } } },
        { machinery: { machineryName: { contains: search } } },
      ];
    }

    if (contractorId) {
      where.contractorId = contractorId;
    }

    if (machineryId) {
      where.machineryId = machineryId;
    }

    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) (where.date as Prisma.DateTimeFilter).gte = new Date(dateFrom);
      if (dateTo) (where.date as Prisma.DateTimeFilter).lte = new Date(dateTo);
    }

    // Validate sort field
    const validSortFields = ["date", "totalHours", "overtimeHours", "createdAt"];
    const sortField = validSortFields.includes(sortBy) ? sortBy : "date";
    const order = sortOrder === "asc" ? "asc" : "desc";

    const scopedWhere = withScope(where, await buildListScope(user, "timesheet"));

    const [timesheets, total] = await Promise.all([
      db.timesheet.findMany({
        where: scopedWhere,
        include: {
          contractor: {
            select: { id: true, contractorName: true, contractorType: true },
          },
          machinery: {
            select: { id: true, machineryName: true, machineryType: true, plateNumber: true, driverName: true },
          },
          approver: {
            select: { id: true, name: true },
          },
        },
        orderBy: { [sortField]: order },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.timesheet.count({ where: scopedWhere }),
    ]);

    const totalPages = Math.ceil(total / pageSize);

    return NextResponse.json({
      success: true,
      data: {
        data: timesheets,
        total,
        page,
        pageSize,
        totalPages,
      },
    });
  } catch (error) {
    console.error("Get timesheets error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch timesheets" },
      { status: 500 }
    );
  }
}

// POST /api/timesheets - Create a new timesheet
export async function POST(request: NextRequest) {
  try {
    const result = await requirePermission(request, "timesheets:create");
    if ("status" in result) return result;
    const user = result.user;

    const body = await request.json();
    const parsed = createTimesheetSchema.safeParse(body);

    if (!parsed.success) {
      const errors = parsed.error.issues.map((issue) => issue.message);
      return NextResponse.json(
        { success: false, error: errors.join(", ") },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Auto-calculate totalHours if any time fields are provided and totalHours is 0
    let totalHours = data.totalHours;
    if ((data.startTime || data.lunchStart || data.lunchEnd || data.endTime) && totalHours === 0) {
      totalHours = calculateTotalHours(data.startTime, data.lunchStart, data.lunchEnd, data.endTime);
    }

    const workDate = new Date(data.date);

    // Resolve which contract (if any) bills this work.
    let contractId: string | null = data.contractId ?? null;
    if (data.contractId === undefined) {
      // Auto-discover the contractor's active contract covering the work date.
      const active = await db.contractorContract.findFirst({
        where: {
          contractorId: data.contractorId,
          status: "ACTIVE",
          startDate: { lte: workDate },
          OR: [{ endDate: null }, { endDate: { gte: workDate } }],
        },
        orderBy: { startDate: "desc" },
        select: { id: true },
      });
      contractId = active?.id ?? null;
    }

    // Snapshot the resolved rate at creation so later rate changes never
    // rewrite what this work was billed at.
    const machinery = await db.machinery.findUnique({
      where: { id: data.machineryId },
      select: { id: true, hourlyRate: true, dailyRate: true, monthlyRate: true, workHoursPerDay: true, contractDaysPerMonth: true },
    });
    const resolved = await resolveRateForWork({
      client: db,
      contractId,
      machineryId: data.machineryId,
      label: data.rateLabel ?? null,
      at: workDate,
      machinery,
    });

    const timesheet = await db.$transaction(async (tx) => {
      const approvalStatus = resolveApprovalStatusOnCreate(user);
      const created = await tx.timesheet.create({
        data: {
          contractorId: data.contractorId,
          machineryId: data.machineryId,
          machineryRateId: data.machineryRateId ?? null,
          // Stamp the contract whenever one governs the work, even when the
          // rate itself fell back to machinery (traceability + delete guard).
          contractId,
          contractRateId: resolved.contractRateId,
          rateLabel: resolved.label,
          rateAmount: resolved.hourlyRate > 0 ? resolved.hourlyRate : null,
          operatorName: data.operatorName ?? null,
          workSite: data.workSite ?? null,
          date: new Date(data.date),
          startTime: data.startTime ?? null,
          lunchStart: data.lunchStart ?? null,
          lunchEnd: data.lunchEnd ?? null,
          endTime: data.endTime ?? null,
          totalHours,
          overtimeHours: data.overtimeHours,
          approvedBy: data.approvedBy ?? null,
          notes: data.notes ?? null,
          createdBy: user.id,
          approvalStatus,
          approvedById: approvalStatus === APPROVED ? user.id : null,
          approvedAt: approvalStatus === APPROVED ? new Date() : null,
        },
        include: {
          contractor: {
            select: { id: true, contractorName: true, contractorType: true },
          },
          machinery: {
            select: { id: true, machineryName: true, machineryType: true, plateNumber: true },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          action: "CREATE",
          entity: "Timesheet",
          entityId: created.id,
          details: `Created timesheet for ${created.operatorName || "contractor"} on ${data.date}`,
          userId: user.id,
        },
      });

      return created;
    });

    return NextResponse.json(
      {
        success: true,
        data: timesheet,
        message: "Timesheet created successfully",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Create timesheet error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create timesheet" },
      { status: 500 }
    );
  }
}
