import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { Prisma } from "@prisma/client";

const CONTRACTOR_TYPE_VALUES = [
  "MACHINERY_CONTRACTOR",
  "TRANSPORTATION_CONTRACTOR",
  "LABOR_CONTRACTOR",
  "MATERIAL_SUPPLIER",
  "OTHER",
] as const;

const CONTRACTOR_STATUS_VALUES = [
  "ACTIVE",
  "INACTIVE",
  "SUSPENDED",
] as const;

const FUEL_TYPE_VALUES = [
  "DIESEL", "GASOLINE", "LPG", "CNG", "OTHER",
] as const;

const MACHINERY_STATUS_VALUES = [
  "OPERATIONAL", "UNDER_MAINTENANCE", "OUT_OF_SERVICE",
] as const;

const inlineMachinerySchema = z.object({
  machineryName: z.string().min(1, "Machinery name is required"),
  machineryType: z.string().min(1, "Machinery type is required"),
  plateNumber: z.string().optional().nullable(),
  model: z.string().optional().nullable(),
  driverName: z.string().optional().nullable(),
  status: z.enum(MACHINERY_STATUS_VALUES).default("OPERATIONAL"),
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

const createContractorSchema = z.object({
  contractorName: z.string().min(1, "Contractor name is required"),
  fatherName: z.string().min(1, "Father name is required"),
  companyName: z.string().optional().nullable(),
  phoneNumber: z.string().min(1, "Phone number is required"),
  alternativePhone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  address: z.string().optional().nullable(),
  nationalId: z.string().optional().nullable(),
  contractorType: z.enum(CONTRACTOR_TYPE_VALUES),
  status: z.enum(CONTRACTOR_STATUS_VALUES).default("ACTIVE"),
  notes: z.string().optional().nullable(),
  machinery: z.array(inlineMachinerySchema).optional(),
});

// GET /api/contractors - List contractors with filtering, pagination, sorting
export async function GET(request: NextRequest) {
  try {
    const result = await requirePermission(request, "contractors:view");
    if ("status" in result) return result;

    const { searchParams } = new URL(request.url);

    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "10")));

    const search = searchParams.get("search") || undefined;
    const contractorTypesParam = searchParams.get("contractorTypes");
    const contractorTypes = contractorTypesParam ? contractorTypesParam.split(",").filter(Boolean) : undefined;
    const statusesParam = searchParams.get("statuses");
    const statuses = statusesParam ? statusesParam.split(",").filter(Boolean) : undefined;

    const sortBy = searchParams.get("sortBy") || "createdAt";
    const sortOrder = searchParams.get("sortOrder") || "desc";

    // Build dynamic where clause
    const where: Prisma.ContractorWhereInput = {};

    if (search) {
      where.OR = [
        { contractorName: { contains: search } },
        { fatherName: { contains: search } },
        { phoneNumber: { contains: search } },
        { email: { contains: search } },
        { companyName: { contains: search } },
        { nationalId: { contains: search } },
      ];
    }

    if (contractorTypes && contractorTypes.length > 0) {
      where.contractorType = { in: contractorTypes as Prisma.EnumContractorTypeFilter["in"] };
    }

    if (statuses && statuses.length > 0) {
      where.status = { in: statuses as Prisma.EnumContractorStatusFilter["in"] };
    }

    // Validate sort field
    const validSortFields = ["createdAt", "contractorName", "hourlyRate", "dailyRate", "monthlyRate", "status"];
    const sortField = validSortFields.includes(sortBy) ? sortBy : "createdAt";
    const order = sortOrder === "asc" ? "asc" : "desc";

    const [contractors, total] = await Promise.all([
      db.contractor.findMany({
        where,
        include: {
          creator: {
            select: { id: true, email: true, name: true, role: true, avatar: true },
          },
          _count: {
            select: {
              expensesPaidTo: true,
              timesheets: true,
              fuelUsages: true,
              machinery: true,
            },
          },
        },
        orderBy: { [sortField]: order },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.contractor.count({ where }),
    ]);

    const totalPages = Math.ceil(total / pageSize);

    return NextResponse.json({
      success: true,
      data: {
        data: contractors,
        total,
        page,
        pageSize,
        totalPages,
      },
    });
  } catch (error) {
    console.error("Get contractors error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch contractors" },
      { status: 500 }
    );
  }
}

// POST /api/contractors - Create a new contractor
export async function POST(request: NextRequest) {
  try {
    const result = await requirePermission(request, "contractors:create");
    if ("status" in result) return result;
    const user = result.user;

    const body = await request.json();
    const parsed = createContractorSchema.safeParse(body);

    if (!parsed.success) {
      const errors = parsed.error.issues.map((issue) => issue.message);
      return NextResponse.json(
        { success: false, error: errors.join(", ") },
        { status: 400 }
      );
    }

    const data = parsed.data;

    const contractor = await db.$transaction(async (tx) => {
      const created = await tx.contractor.create({
        data: {
          contractorName: data.contractorName,
          fatherName: data.fatherName,
          companyName: data.companyName ?? null,
          phoneNumber: data.phoneNumber,
          alternativePhone: data.alternativePhone ?? null,
          email: data.email ?? null,
          address: data.address ?? null,
          nationalId: data.nationalId ?? null,
          contractorType: data.contractorType,
          status: data.status,
          notes: data.notes ?? null,
          createdBy: user.id,
        },
        include: {
          creator: {
            select: { id: true, email: true, name: true, role: true, avatar: true },
          },
        },
      });

      if (data.machinery && data.machinery.length > 0) {
        await tx.machinery.createMany({
          data: data.machinery.map((m) => ({
            machineryName: m.machineryName,
            machineryType: m.machineryType,
            plateNumber: m.plateNumber ?? null,
            model: m.model ?? null,
            driverName: m.driverName ?? null,
            status: m.status,
            assignedContractorId: created.id,
            fuelType: m.fuelType,
            hourlyConsumptionRate: m.hourlyConsumptionRate,
            hourlyRate: m.hourlyRate,
            dailyRate: m.dailyRate,
            monthlyRate: m.monthlyRate,
            contractDaysPerMonth: m.contractDaysPerMonth,
            workHoursPerDay: m.workHoursPerDay,
            contractStartDate: m.contractStartDate ? new Date(m.contractStartDate) : null,
            contractEndDate: m.contractEndDate ? new Date(m.contractEndDate) : null,
            createdBy: user.id,
          })),
        });
      }

      // Create audit log entry
      await tx.auditLog.create({
        data: {
          action: "CREATE",
          entity: "Contractor",
          entityId: created.id,
          details: `Created contractor: ${created.contractorName} (${created.contractorType})`,
          userId: user.id,
        },
      });

      return created;
    });

    return NextResponse.json(
      {
        success: true,
        data: contractor,
        message: "Contractor created successfully",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Create contractor error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create contractor" },
      { status: 500 }
    );
  }
}
