import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { Prisma } from "@prisma/client";

const createFuelTransactionSchema = z.object({
  type: z.enum(["PURCHASE", "TRANSFER", "ISSUE"]),
  fuelType: z.string().min(1, "Fuel type is required"),
  quantity: z.coerce.number().positive("Quantity must be positive"),
  unitPrice: z.coerce.number().min(0).optional().nullable(),
  totalCost: z.coerce.number().min(0).optional().nullable(),
  supplier: z.string().optional().nullable(),
  assetId: z.string().optional().nullable(),
  containerId: z.string().optional().nullable(),
  destinationContainerId: z.string().optional().nullable(),
  contractorId: z.string().optional().nullable(),
  machineryId: z.string().optional().nullable(),
  issuedToName: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  date: z.string().optional(),
});

const transactionIncludes = {
  asset: { select: { id: true, name: true, category: true } },
  container: { select: { id: true, name: true, fuelLocation: true, isMainContainer: true } },
  destinationContainer: { select: { id: true, name: true, fuelLocation: true } },
  contractor: { select: { id: true, contractorName: true } },
  machinery: { select: { id: true, machineryName: true, plateNumber: true } },
};

export async function GET(request: NextRequest) {
  try {
    const result = await requirePermission(request, "fuelUsage:view");
    if ("status" in result) return result;

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "10")));

    const type = searchParams.get("type") || undefined;
    const fuelType = searchParams.get("fuelType") || undefined;
    const assetId = searchParams.get("assetId") || undefined;
    const containerId = searchParams.get("containerId") || undefined;
    const contractorId = searchParams.get("contractorId") || undefined;
    const dateFrom = searchParams.get("dateFrom") || undefined;
    const dateTo = searchParams.get("dateTo") || undefined;
    const search = searchParams.get("search") || undefined;
    const sortBy = searchParams.get("sortBy") || "date";
    const sortOrder = searchParams.get("sortOrder") || "desc";

    const where: Prisma.FuelTransactionWhereInput = {};
    if (type) where.type = type as "PURCHASE" | "TRANSFER" | "ISSUE";
    if (fuelType) where.fuelType = fuelType;
    if (assetId) where.assetId = assetId;
    if (containerId) where.containerId = containerId;
    if (contractorId) where.contractorId = contractorId;
    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) (where.date as Prisma.DateTimeFilter).gte = new Date(dateFrom);
      if (dateTo) (where.date as Prisma.DateTimeFilter).lte = new Date(dateTo);
    }
    if (search) {
      where.OR = [
        { supplier: { contains: search } },
        { issuedToName: { contains: search } },
        { notes: { contains: search } },
        { container: { name: { contains: search } } },
        { destinationContainer: { name: { contains: search } } },
        { contractor: { contractorName: { contains: search } } },
        { machinery: { machineryName: { contains: search } } },
        { asset: { name: { contains: search } } },
      ] as Prisma.FuelTransactionWhereInput[];
    }

    const validSortFields = ["date", "createdAt", "fuelType", "quantity", "type"];
    const sortField = validSortFields.includes(sortBy) ? sortBy : "date";
    const order = sortOrder === "asc" ? "asc" : "desc";

    const [transactions, total] = await Promise.all([
      db.fuelTransaction.findMany({
        where,
        include: transactionIncludes,
        orderBy: { [sortField]: order },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.fuelTransaction.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: { data: transactions, total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    });
  } catch (error) {
    console.error("Get fuel transactions error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch fuel transactions" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const result = await requirePermission(request, "fuelUsage:create");
    if ("status" in result) return result;
    const user = result.user;

    const body = await request.json();
    const parsed = createFuelTransactionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues.map((i) => i.message).join(", ") }, { status: 400 });
    }

    const data = parsed.data;

    const transaction = await db.$transaction(async (tx) => {
      if (data.type === 'ISSUE' && !data.unitPrice && !data.totalCost) {
        const aggregation = await tx.fuelTransaction.aggregate({
          where: { type: 'PURCHASE', fuelType: data.fuelType },
          _sum: { quantity: true, totalCost: true },
        });
        const totalQty = aggregation._sum?.quantity || 0;
        const totalPurchaseCost = aggregation._sum?.totalCost || 0;
        if (totalQty > 0) {
          const avgPrice = totalPurchaseCost / totalQty;
          data.unitPrice = avgPrice;
          data.totalCost = avgPrice * data.quantity;
        }
      }

      const created = await tx.fuelTransaction.create({
        data: {
          type: data.type,
          fuelType: data.fuelType,
          quantity: data.quantity,
          unitPrice: data.unitPrice ?? null,
          totalCost: data.totalCost ?? null,
          supplier: data.supplier ?? null,
          assetId: data.assetId ?? null,
          containerId: data.containerId ?? null,
          destinationContainerId: data.destinationContainerId ?? null,
          contractorId: data.contractorId ?? null,
          machineryId: data.machineryId ?? null,
          issuedToName: data.issuedToName ?? null,
          notes: data.notes ?? null,
          date: data.date ? new Date(data.date) : new Date(),
          createdBy: user.id,
        },
        include: transactionIncludes,
      });

      if (data.type === "ISSUE" && data.contractorId) {
        await tx.fuelUsage.create({
          data: {
            contractorId: data.contractorId,
            machineryId: data.machineryId ?? null,
            fuelType: data.fuelType,
            quantity: data.quantity,
            unitPrice: data.unitPrice ?? 0,
            totalCost: data.totalCost ?? 0,
            date: created.date,
            fuelTransactionId: created.id,
            createdBy: user.id,
          },
        });
      }

      return created;
    });

    await db.auditLog.create({
      data: {
        action: "CREATE",
        entity: "FuelTransaction",
        entityId: transaction.id,
        details: `Created fuel ${data.type === "PURCHASE" ? "purchase" : data.type === "TRANSFER" ? "transfer" : "issue"}: ${data.quantity}L ${data.fuelType}`,
        userId: user.id,
      },
    });

    return NextResponse.json({ success: true, data: transaction, message: "Fuel transaction created successfully" }, { status: 201 });
  } catch (error) {
    console.error("Create fuel transaction error:", error);
    return NextResponse.json({ success: false, error: "Failed to create fuel transaction" }, { status: 500 });
  }
}
