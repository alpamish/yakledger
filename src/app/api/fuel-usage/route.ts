import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { Prisma } from "@prisma/client";

const FUEL_TYPE_VALUES = [
  "DIESEL", "GASOLINE", "LPG", "CNG", "OTHER",
] as const;

const createFuelUsageSchema = z.object({
  contractorId: z.string().min(1, "Contractor is required"),
  machineryId: z.string().min(1, "Machinery is required"),
  fuelType: z.enum(FUEL_TYPE_VALUES),
  quantity: z.number().positive("Quantity must be positive"),
  unitPrice: z.number().min(0, "Unit price must be non-negative"),
  totalCost: z.number().min(0).optional(),
  date: z.string().min(1, "Date is required"),
  fuelStation: z.string().optional().nullable(),
  receiptAttachment: z.string().optional().nullable(),
  linkedExpenseId: z.string().optional().nullable(),
  containerId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

// GET /api/fuel-usage - List fuel usage with filtering, pagination, sorting
export async function GET(request: NextRequest) {
  try {
    const result = await requirePermission(request, "fuelUsage:view");
    if ("status" in result) return result;

    const { searchParams } = new URL(request.url);

    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "10")));

    const search = searchParams.get("search") || undefined;
    const contractorId = searchParams.get("contractorId") || undefined;
    const machineryId = searchParams.get("machineryId") || undefined;
    const machineryType = searchParams.get("machineryType") || undefined;
    const fuelTypesParam = searchParams.get("fuelTypes");
    const fuelTypes = fuelTypesParam ? fuelTypesParam.split(",").filter(Boolean) : undefined;
    const dateFrom = searchParams.get("dateFrom") || undefined;
    const dateTo = searchParams.get("dateTo") || undefined;

    const sortBy = searchParams.get("sortBy") || "date";
    const sortOrder = searchParams.get("sortOrder") || "desc";

    // Build dynamic where clause
    const where: Prisma.FuelUsageWhereInput = {};

    if (search) {
      where.OR = [
        { fuelStation: { contains: search } },
        { notes: { contains: search } },
        { contractor: { contractorName: { contains: search } } },
        { machinery: { machineryType: { contains: search } } },
        { machinery: { plateNumber: { contains: search } } },
      ];
    }

    if (contractorId) {
      where.contractorId = contractorId;
    }

    if (machineryId) {
      where.machineryId = machineryId;
    }

    if (machineryType) {
      where.machinery = { machineryType };
    }

    if (fuelTypes && fuelTypes.length > 0) {
      where.fuelType = { in: fuelTypes as Prisma.EnumFuelTypeFilter["in"] };
    }

    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) (where.date as Prisma.DateTimeFilter).gte = new Date(dateFrom);
      if (dateTo) (where.date as Prisma.DateTimeFilter).lte = new Date(dateTo);
    }

    // Validate sort field
    const validSortFields = ["date", "totalCost", "quantity", "createdAt"];
    const sortField = validSortFields.includes(sortBy) ? sortBy : "date";
    const order = sortOrder === "asc" ? "asc" : "desc";

    const [fuelUsages, total] = await Promise.all([
      db.fuelUsage.findMany({
        where,
        include: {
          contractor: {
            select: { id: true, contractorName: true, contractorType: true },
          },
          machinery: {
            select: { id: true, machineryName: true, machineryType: true, plateNumber: true },
          },
          linkedExpense: {
            select: { id: true, title: true, amount: true, category: true },
          },
        },
        orderBy: { [sortField]: order },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.fuelUsage.count({ where }),
    ]);

    const totalPages = Math.ceil(total / pageSize);

    return NextResponse.json({
      success: true,
      data: {
        data: fuelUsages,
        total,
        page,
        pageSize,
        totalPages,
      },
    });
  } catch (error) {
    console.error("Get fuel usage error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch fuel usage records" },
      { status: 500 }
    );
  }
}

// POST /api/fuel-usage - Create a new fuel usage record
export async function POST(request: NextRequest) {
  try {
    const result = await requirePermission(request, "fuelUsage:create");
    if ("status" in result) return result;
    const user = result.user;

    const body = await request.json();
    const parsed = createFuelUsageSchema.safeParse(body);

    if (!parsed.success) {
      const errors = parsed.error.issues.map((issue) => issue.message);
      return NextResponse.json(
        { success: false, error: errors.join(", ") },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Auto-calculate totalCost if not provided
    const totalCost = data.totalCost ?? (data.quantity * data.unitPrice);

    const includes = {
      contractor: {
        select: { id: true, contractorName: true, contractorType: true },
      },
      machinery: {
        select: { id: true, machineryName: true, machineryType: true, plateNumber: true },
      },
      linkedExpense: {
        select: { id: true, title: true, amount: true, category: true },
      },
      fuelTransaction: {
        select: { id: true, type: true, quantity: true, unitPrice: true, totalCost: true },
      },
    } as const;

    const fuelUsage = await db.$transaction(async (tx) => {
      let fuelTransactionId: string | null = null;

      if (data.containerId) {
        const aggregation = await tx.fuelTransaction.aggregate({
          where: { type: 'PURCHASE', fuelType: data.fuelType },
          _sum: { quantity: true, totalCost: true },
        });
        const totalQty = aggregation._sum?.quantity || 0;
        const purchaseCost = aggregation._sum?.totalCost || 0;
        const avgPrice = totalQty > 0 ? purchaseCost / totalQty : data.unitPrice;

        const fuelTxn = await tx.fuelTransaction.create({
          data: {
            type: 'ISSUE',
            fuelType: data.fuelType,
            quantity: data.quantity,
            unitPrice: avgPrice,
            totalCost: avgPrice * data.quantity,
            containerId: data.containerId,
            contractorId: data.contractorId,
            machineryId: data.machineryId ?? null,
            date: new Date(data.date),
            createdBy: user.id,
          },
        });
        fuelTransactionId = fuelTxn.id;
      }

      return tx.fuelUsage.create({
        data: {
          contractorId: data.contractorId,
          machineryId: data.machineryId,
          fuelType: data.fuelType,
          quantity: data.quantity,
          unitPrice: data.unitPrice,
          totalCost,
          date: new Date(data.date),
          fuelStation: data.fuelStation ?? null,
          receiptAttachment: data.receiptAttachment ?? null,
          linkedExpenseId: data.linkedExpenseId ?? null,
          fuelTransactionId,
          notes: data.notes ?? null,
          createdBy: user.id,
        },
        include: includes,
      });
    });

    // Create audit log entry
    await db.auditLog.create({
      data: {
        action: "CREATE",
        entity: "FuelUsage",
        entityId: fuelUsage.id,
        details: `Created fuel usage record: ${data.quantity} ${data.fuelType} for $${totalCost}${data.containerId ? ' (deducted from container)' : ''}`,
        userId: user.id,
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: fuelUsage,
        message: "Fuel usage record created successfully",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Create fuel usage error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create fuel usage record" },
      { status: 500 }
    );
  }
}
