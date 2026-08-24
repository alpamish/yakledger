import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission, checkUserPermission } from "@/lib/permissions";
import { Prisma } from "@prisma/client";
import { buildAccessScope, withScope } from "@/lib/access-control";
import { createPurchaseExpense, assetCategoryToExpenseCategory } from "@/services/purchase-expense.service";
import { PAYMENT_METHODS } from "@/types/expense";

const createAssetSchema = z.object({
  name: z.string().min(1, "Name is required"),
  category: z.enum(["VEHICLE", "FUEL", "FURNITURE", "LAPTOP", "ELECTRONICS", "MACHINERY", "OFFICE_EQUIPMENT", "OTHER"]),
  purchaseDate: z.string().min(1, "Purchase date is required"),
  purchasePrice: z.coerce.number().min(0, "Price must be non-negative"),
  currentValue: z.coerce.number().min(0, "Value must be non-negative"),
  quantity: z.coerce.number().int().min(1).default(1),
  serialNumber: z.string().optional().nullable(),
  plateNumber: z.string().optional().nullable(),
  assignedToId: z.string().optional().nullable(),
  status: z.enum(["ACTIVE", "IN_USE", "UNDER_REPAIR", "SOLD", "LOST"]).default("ACTIVE"),
  notes: z.string().optional().nullable(),
  images: z.string().optional().nullable(),
  fuelType: z.string().optional().nullable(),
  fuelCapacity: z.coerce.number().min(0).optional().nullable(),
  fuelLocation: z.string().optional().nullable(),
  isMainContainer: z.boolean().optional().default(false),
  createExpense: z.boolean().optional().default(false),
  paymentMethod: z.enum(PAYMENT_METHODS).optional().nullable(),
  paidBy: z.string().optional().nullable(),
  paidTo: z.string().optional().nullable(),
  payNow: z.boolean().optional().default(false),
  walletId: z.string().optional().nullable(),
});

export async function GET(request: NextRequest) {
  try {
    const result = await requirePermission(request, "assets:view");
    if ("status" in result) return result;
    const user = result.user;

    const { searchParams } = new URL(request.url);

    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "10")));

    const search = searchParams.get("search") || undefined;
    const categoriesParam = searchParams.get("categories");
    const categories = categoriesParam ? categoriesParam.split(",").filter(Boolean) : undefined;
    const statusesParam = searchParams.get("statuses");
    const statuses = statusesParam ? statusesParam.split(",").filter(Boolean) : undefined;
    const assignedToId = searchParams.get("assignedToId") || undefined;
    const dateFrom = searchParams.get("dateFrom") || undefined;
    const dateTo = searchParams.get("dateTo") || undefined;
    const sortBy = searchParams.get("sortBy") || "createdAt";
    const sortOrder = searchParams.get("sortOrder") || "desc";

    const where: Prisma.AssetWhereInput = {};

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { serialNumber: { contains: search } },
        { plateNumber: { contains: search } },
        { notes: { contains: search } },
      ];
    }

    if (categories && categories.length > 0) {
      where.category = { in: categories as Prisma.StringFilter["in"] };
    }

    if (statuses && statuses.length > 0) {
      where.status = { in: statuses as Prisma.StringFilter["in"] };
    }

    if (assignedToId) {
      where.assignedToId = assignedToId;
    }

    if (dateFrom || dateTo) {
      where.purchaseDate = {};
      if (dateFrom) (where.purchaseDate as Prisma.DateTimeFilter).gte = new Date(dateFrom);
      if (dateTo) (where.purchaseDate as Prisma.DateTimeFilter).lte = new Date(dateTo);
    }

    const validSortFields = ["createdAt", "updatedAt", "name", "category", "status", "purchaseDate", "purchasePrice", "currentValue"];
    const sortField = validSortFields.includes(sortBy) ? sortBy : "createdAt";
    const order = sortOrder === "asc" ? "asc" : "desc";

    const scopedWhere = withScope(where, await buildAccessScope(user, "asset"));

    const [assets, total] = await Promise.all([
      db.asset.findMany({
        where: scopedWhere,
        include: {
          assignedTo: { select: { id: true, fullName: true, jobTitle: true } },
          _count: { select: { maintenanceRecords: true, assetLogs: true, fuelTransactions: true } },
          expenses: { select: { id: true, amount: true, approvalStatus: true, walletId: true } },
        },
        orderBy: { [sortField]: order },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.asset.count({ where: scopedWhere }),
    ]);

    return NextResponse.json({
      success: true,
      data: { data: assets, total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    });
  } catch (error) {
    console.error("Get assets error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch assets" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const result = await requirePermission(request, "assets:create");
    if ("status" in result) return result;
    const user = result.user;

    const body = await request.json();
    const parsed = createAssetSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues.map((i) => i.message).join(", ") }, { status: 400 });
    }

    const data = parsed.data;

    if (data.createExpense) {
      const hasExpensePermission = await checkUserPermission(user.id, user.role, "expenses:create");
      if (!hasExpensePermission) {
        return NextResponse.json({ success: false, error: "Forbidden: insufficient permissions to record an expense" }, { status: 403 });
      }
      if (data.purchasePrice <= 0) {
        return NextResponse.json({ success: false, error: "Purchase price is required to record this asset as an expense" }, { status: 400 });
      }
      if (!data.paymentMethod) {
        return NextResponse.json({ success: false, error: "Payment method is required when recording this asset as an expense" }, { status: 400 });
      }
    }

    const asset = await db.$transaction(async (tx) => {
      const created = await tx.asset.create({
        data: {
          name: data.name,
          category: data.category,
          purchaseDate: new Date(data.purchaseDate),
          purchasePrice: data.purchasePrice,
          currentValue: data.currentValue,
          quantity: data.quantity,
          serialNumber: data.serialNumber ?? null,
          plateNumber: data.plateNumber ?? null,
          assignedToId: data.assignedToId ?? null,
          status: data.status,
          notes: data.notes ?? null,
          images: data.images ?? null,
          fuelType: data.fuelType ?? null,
          fuelCapacity: data.fuelCapacity ?? null,
          fuelLocation: data.fuelLocation ?? null,
          isMainContainer: data.isMainContainer ?? false,
          createdBy: user.id,
        },
        include: {
          assignedTo: { select: { id: true, fullName: true, jobTitle: true } },
        },
      });

      await tx.auditLog.create({
        data: { action: "CREATE", entity: "Asset", entityId: created.id, details: `Created asset: ${created.name} (${created.category})`, userId: user.id },
      });

      if (data.createExpense) {
        await createPurchaseExpense(tx, user, {
          title: `Asset purchase — ${created.name}`,
          category: assetCategoryToExpenseCategory(created.category),
          amount: data.purchasePrice,
          paymentMethod: data.paymentMethod!,
          paidTo: data.paidTo || created.name,
          paidBy: data.paidBy || user.name || user.email || "Company",
          expenseDate: new Date(data.purchaseDate),
          notes: data.notes ?? null,
          walletId: data.payNow ? data.walletId ?? null : null,
          assetId: created.id,
        });
      }

      return created;
    });

    return NextResponse.json({ success: true, data: asset, message: "Asset created successfully" }, { status: 201 });
  } catch (error) {
    console.error("Create asset error:", error);
    return NextResponse.json({ success: false, error: "Failed to create asset" }, { status: 500 });
  }
}
