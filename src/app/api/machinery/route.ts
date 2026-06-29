import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { Prisma } from "@prisma/client";

const FUEL_TYPE_VALUES = [
  "DIESEL", "GASOLINE", "LPG", "CNG", "OTHER",
] as const;

const MACHINERY_STATUS_VALUES = [
  "OPERATIONAL", "UNDER_MAINTENANCE", "OUT_OF_SERVICE",
] as const;

const createMachinerySchema = z.object({
  machineryName: z.string().min(1, "Machinery name is required"),
  machineryType: z.string().min(1, "Machinery type is required"),
  plateNumber: z.string().optional().nullable(),
  model: z.string().optional().nullable(),
  driverName: z.string().optional().nullable(),
  status: z.enum(MACHINERY_STATUS_VALUES).default("OPERATIONAL"),
  assignedContractorId: z.string().min(1, "Contractor is required"),
  fuelType: z.enum(FUEL_TYPE_VALUES).default("DIESEL"),
  hourlyConsumptionRate: z.number().min(0).default(0),
  hourlyRate: z.number().min(0).default(0),
  dailyRate: z.number().min(0).default(0),
  monthlyRate: z.number().min(0).default(0),
  contractDaysPerMonth: z.number().int().min(1).max(31).default(28),
  workHoursPerDay: z.number().int().min(1).max(24).default(9),
  contractStartDate: z.string().optional().nullable(),
  contractEndDate: z.string().optional().nullable(),
});

// GET /api/machinery - List machinery with filtering, pagination, sorting
export async function GET(request: NextRequest) {
  try {
    const result = await requirePermission(request, "machinery:view");
    if ("status" in result) return result;

    const { searchParams } = new URL(request.url);

    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const pageSize = Math.min(1000, Math.max(1, parseInt(searchParams.get("pageSize") || "10")));

    const search = searchParams.get("search") || undefined;
    const statusesParam = searchParams.get("statuses");
    const statuses = statusesParam ? statusesParam.split(",").filter(Boolean) : undefined;
    const assignedContractorId = searchParams.get("assignedContractorId") || undefined;
    const machineryType = searchParams.get("machineryType") || undefined;
    const fuelTypesParam = searchParams.get("fuelTypes");
    const fuelTypes = fuelTypesParam ? fuelTypesParam.split(",").filter(Boolean) : undefined;

    const sortBy = searchParams.get("sortBy") || "createdAt";
    const sortOrder = searchParams.get("sortOrder") || "desc";

    // Build dynamic where clause
    const where: Prisma.MachineryWhereInput = {};

    if (search) {
      where.OR = [
        { machineryName: { contains: search } },
        { plateNumber: { contains: search } },
        { model: { contains: search } },
        { driverName: { contains: search } },
        { assignedContractor: { contractorName: { contains: search } } },
      ];
    }

    if (statuses && statuses.length > 0) {
      where.status = { in: statuses };
    }

    if (assignedContractorId) {
      where.assignedContractorId = assignedContractorId;
    }

    if (machineryType) {
      where.machineryType = machineryType;
    }

    if (fuelTypes && fuelTypes.length > 0) {
      where.fuelType = { in: fuelTypes };
    }

    // Validate sort field
    const validSortFields = ["createdAt", "machineryName", "machineryType", "status", "updatedAt"];
    const sortField = validSortFields.includes(sortBy) ? sortBy : "createdAt";
    const order = sortOrder === "asc" ? "asc" : "desc";

    const [machinery, total] = await Promise.all([
      db.machinery.findMany({
        where,
        include: {
          assignedContractor: {
            select: { id: true, contractorName: true, contractorType: true },
          },
          _count: {
            select: { timesheets: true, fuelUsages: true },
          },
        },
        orderBy: { [sortField]: order },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.machinery.count({ where }),
    ]);

    const totalPages = Math.ceil(total / pageSize);

    return NextResponse.json({
      success: true,
      data: {
        data: machinery,
        total,
        page,
        pageSize,
        totalPages,
      },
    });
  } catch (error) {
    console.error("Get machinery error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch machinery" },
      { status: 500 }
    );
  }
}

// POST /api/machinery - Create a new machinery
export async function POST(request: NextRequest) {
  try {
    const result = await requirePermission(request, "machinery:create");
    if ("status" in result) return result;
    const user = result.user;

    const body = await request.json();
    const parsed = createMachinerySchema.safeParse(body);

    if (!parsed.success) {
      const errors = parsed.error.issues.map((issue) => issue.message);
      return NextResponse.json(
        { success: false, error: errors.join(", ") },
        { status: 400 }
      );
    }

    const data = parsed.data;

    const machinery = await db.machinery.create({
      data: {
        machineryName: data.machineryName,
        machineryType: data.machineryType,
        plateNumber: data.plateNumber ?? null,
        model: data.model ?? null,
        driverName: data.driverName ?? null,
        status: data.status,
        assignedContractorId: data.assignedContractorId,
        fuelType: data.fuelType,
        hourlyConsumptionRate: data.hourlyConsumptionRate,
        hourlyRate: data.hourlyRate,
        dailyRate: data.dailyRate,
        monthlyRate: data.monthlyRate,
        contractDaysPerMonth: data.contractDaysPerMonth,
        workHoursPerDay: data.workHoursPerDay,
        contractStartDate: data.contractStartDate ? new Date(data.contractStartDate) : null,
        contractEndDate: data.contractEndDate ? new Date(data.contractEndDate) : null,
        createdBy: user.id,
      },
      include: {
        assignedContractor: {
          select: { id: true, contractorName: true, contractorType: true },
        },
        _count: {
          select: { timesheets: true, fuelUsages: true },
        },
      },
    });

    // Create audit log entry
    await db.auditLog.create({
      data: {
        action: "CREATE",
        entity: "Machinery",
        entityId: machinery.id,
        details: `Created machinery: ${machinery.machineryName} (${machinery.machineryType})`,
        userId: user.id,
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: machinery,
        message: "Machinery created successfully",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Create machinery error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create machinery" },
      { status: 500 }
    );
  }
}
