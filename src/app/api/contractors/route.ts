import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { Prisma } from "@prisma/client";
import { buildAccessScope, buildAggregateScope, withScope } from "@/lib/access-control";
import { generateContractorNumber } from "@/lib/contractor-number";
import { createContractorSchema } from "@/lib/validation/contractor";

// GET /api/contractors - List contractors with filtering, pagination, sorting
export async function GET(request: NextRequest) {
  try {
    const result = await requirePermission(request, "contractors:view");
    if ("status" in result) return result;
    const user = result.user;

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
        { contractorNumber: { contains: search } },
      ];
    }

    if (contractorTypes && contractorTypes.length > 0) {
      where.contractorType = { in: contractorTypes as Prisma.StringFilter["in"] };
    }

    if (statuses && statuses.length > 0) {
      where.status = { in: statuses as Prisma.StringFilter["in"] };
    } else {
      // Archived contractors are hidden from the default list; they remain
      // reachable via the explicit status filter (and in reports/history).
      where.status = { not: "ARCHIVED" };
    }

    // Validate sort field against real Contractor columns only. Rate columns
    // live on Machinery/MachineryRate, not Contractor — sorting by them would
    // 500 in Prisma. Unknown fields are rejected explicitly (400) so client
    // bugs surface instead of silently falling back.
    const validSortFields = ["createdAt", "contractorName", "status", "contractorNumber"];
    if (!validSortFields.includes(sortBy)) {
      return NextResponse.json(
        { success: false, error: `Invalid sort field: ${sortBy}. Valid fields: ${validSortFields.join(", ")}` },
        { status: 400 }
      );
    }
    const sortField = sortBy;
    const order = sortOrder === "asc" ? "asc" : "desc";

    const [
      contractorScope,
      expenseScope,
      timesheetScope,
      fuelUsageScope,
      machineryScope,
    ] = await Promise.all([
      buildAccessScope(user, "contractor"),
      buildAggregateScope(user, "expense"),
      buildAggregateScope(user, "timesheet"),
      buildAggregateScope(user, "fuelUsage"),
      buildAggregateScope(user, "machinery"),
    ]);
    const scopedWhere = withScope(where, contractorScope);

    const [contractors, total] = await Promise.all([
      db.contractor.findMany({
        where: scopedWhere,
        include: {
          creator: {
            select: { id: true, email: true, name: true, role: true, avatar: true },
          },
          // Counts respect visibility: only records this user may see as
          // settled (approved) are tallied, same as the profile endpoint.
          _count: {
            select: {
              expensesPaidTo: { where: expenseScope },
              timesheets: { where: timesheetScope },
              fuelUsages: { where: fuelUsageScope },
              machinery: { where: machineryScope },
            },
          },
        },
        orderBy: { [sortField]: order },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.contractor.count({ where: scopedWhere }),
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
      const contractorNumber = await generateContractorNumber(tx);
      const created = await tx.contractor.create({
        data: {
          contractorNumber,
          contractorName: data.contractorName,
          fatherName: data.fatherName,
          companyName: data.companyName ?? null,
          phoneNumber: data.phoneNumber,
          alternativePhone: data.alternativePhone ?? null,
          email: data.email ?? null,
          address: data.address ?? null,
          nationalId: data.nationalId ?? null,
          idImageFront: data.idImageFront ?? null,
          idImageBack: data.idImageBack ?? null,
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
        for (const m of data.machinery) {
          await tx.machinery.create({
            data: {
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
              machineryRates: {
                create: {
                  rateName: "Default",
                  monthlyRate: m.monthlyRate,
                  dailyRate: m.dailyRate,
                  hourlyRate: m.hourlyRate,
                  contractDaysPerMonth: m.contractDaysPerMonth,
                  workHoursPerDay: m.workHoursPerDay,
                  isDefault: true,
                  createdBy: user.id,
                },
              },
            },
          });
        }
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
