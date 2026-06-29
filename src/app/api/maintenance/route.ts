import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { Prisma } from "@prisma/client";

const createMaintenanceSchema = z.object({
  assetId: z.string().min(1, "Asset is required"),
  serviceDate: z.string().min(1, "Service date is required"),
  serviceType: z.enum(["ROUTINE", "REPAIR", "INSPECTION", "TIRE_REPLACEMENT", "OIL_CHANGE", "BATTERY", "OTHER"]),
  cost: z.coerce.number().min(0, "Cost must be non-negative"),
  description: z.string().optional().nullable(),
  vendor: z.string().optional().nullable(),
  nextServiceDate: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function GET(request: NextRequest) {
  try {
    const result = await requirePermission(request, "assets:view");
    if ("status" in result) return result;

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "10")));

    const assetId = searchParams.get("assetId") || undefined;
    const serviceType = searchParams.get("serviceType") || undefined;
    const upcoming = searchParams.get("upcoming") === "true";
    const sortBy = searchParams.get("sortBy") || "serviceDate";
    const sortOrder = searchParams.get("sortOrder") || "desc";

    const where: Prisma.MaintenanceRecordWhereInput = {};
    if (assetId) where.assetId = assetId;
    if (serviceType) where.serviceType = serviceType;
    if (upcoming) {
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
      where.nextServiceDate = { lte: thirtyDaysFromNow, gte: new Date() };
    }

    const validSortFields = ["serviceDate", "cost", "createdAt", "serviceType"];
    const sortField = validSortFields.includes(sortBy) ? sortBy : "serviceDate";
    const order = sortOrder === "asc" ? "asc" : "desc";

    const [records, total] = await Promise.all([
      db.maintenanceRecord.findMany({
        where,
        include: { asset: { select: { id: true, name: true, category: true, plateNumber: true } } },
        orderBy: { [sortField]: order },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.maintenanceRecord.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: { data: records, total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    });
  } catch (error) {
    console.error("Get maintenance records error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch maintenance records" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const result = await requirePermission(request, "assets:create");
    if ("status" in result) return result;
    const user = result.user;

    const body = await request.json();
    const parsed = createMaintenanceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues.map((i) => i.message).join(", ") }, { status: 400 });
    }

    const data = parsed.data;

    // Verify asset exists
    const asset = await db.asset.findUnique({ where: { id: data.assetId } });
    if (!asset) return NextResponse.json({ success: false, error: "Asset not found" }, { status: 404 });

    const record = await db.maintenanceRecord.create({
      data: {
        assetId: data.assetId,
        serviceDate: new Date(data.serviceDate),
        serviceType: data.serviceType,
        cost: data.cost,
        description: data.description ?? null,
        vendor: data.vendor ?? null,
        nextServiceDate: data.nextServiceDate ? new Date(data.nextServiceDate) : null,
        notes: data.notes ?? null,
        createdBy: user.id,
      },
      include: { asset: { select: { id: true, name: true, category: true } } },
    });

    // Auto-update asset status to UNDER_REPAIR if repair type
    if (data.serviceType === "REPAIR" && asset.status !== "UNDER_REPAIR") {
      await db.asset.update({ where: { id: data.assetId }, data: { status: "UNDER_REPAIR" } });
    }

    await db.auditLog.create({
      data: { action: "CREATE", entity: "MaintenanceRecord", entityId: record.id, details: `Created maintenance record for ${asset.name}`, userId: user.id },
    });

    return NextResponse.json({ success: true, data: record, message: "Maintenance record created successfully" }, { status: 201 });
  } catch (error) {
    console.error("Create maintenance record error:", error);
    return NextResponse.json({ success: false, error: "Failed to create maintenance record" }, { status: 500 });
  }
}
