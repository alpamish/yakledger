import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { Prisma } from "@prisma/client";

const createAssetLogSchema = z.object({
  assetId: z.string().min(1, "Asset is required"),
  date: z.string().min(1, "Date is required"),
  startTime: z.string().optional().nullable(),
  endTime: z.string().optional().nullable(),
  operatorId: z.string().optional().nullable(),
  startOdometer: z.coerce.number().min(0).optional().nullable(),
  endOdometer: z.coerce.number().min(0).optional().nullable(),
  distanceTraveled: z.coerce.number().min(0).optional().nullable(),
  engineHoursStart: z.coerce.number().min(0).optional().nullable(),
  engineHoursEnd: z.coerce.number().min(0).optional().nullable(),
  engineHoursUsed: z.coerce.number().min(0).optional().nullable(),
  fuelConsumed: z.coerce.number().min(0).optional().nullable(),
  workSite: z.string().optional().nullable(),
  project: z.string().optional().nullable(),
  conditions: z.string().optional().nullable(),
  issues: z.string().optional().nullable(),
  status: z.string().optional().nullable(),
  remarks: z.string().optional().nullable(),
});

export async function GET(request: NextRequest) {
  try {
    const result = await requirePermission(request, "assets:view");
    if ("status" in result) return result;

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "10")));

    const assetId = searchParams.get("assetId") || undefined;
    const operatorId = searchParams.get("operatorId") || undefined;
    const status = searchParams.get("status") || undefined;
    const dateFrom = searchParams.get("dateFrom") || undefined;
    const dateTo = searchParams.get("dateTo") || undefined;
    const sortBy = searchParams.get("sortBy") || "date";
    const sortOrder = searchParams.get("sortOrder") || "desc";

    const where: Prisma.AssetLogWhereInput = {};
    if (assetId) where.assetId = assetId;
    if (operatorId) where.operatorId = operatorId;
    if (status) where.status = status;
    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) (where.date as Prisma.DateTimeFilter).gte = new Date(dateFrom);
      if (dateTo) (where.date as Prisma.DateTimeFilter).lte = new Date(dateTo);
    }

    const validSortFields = ["date", "createdAt", "distanceTraveled", "fuelConsumed", "status"];
    const sortField = validSortFields.includes(sortBy) ? sortBy : "date";
    const order = sortOrder === "asc" ? "asc" : "desc";

    const [logs, total] = await Promise.all([
      db.assetLog.findMany({
        where,
        include: {
          asset: { select: { id: true, name: true, category: true, plateNumber: true } },
          operator: { select: { id: true, fullName: true } },
          approvedBy: { select: { id: true, name: true } },
        },
        orderBy: { [sortField]: order },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.assetLog.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: { data: logs, total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    });
  } catch (error) {
    console.error("Get asset logs error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch asset logs" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const result = await requirePermission(request, "assets:create");
    if ("status" in result) return result;
    const user = result.user;

    const body = await request.json();
    const parsed = createAssetLogSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues.map((i) => i.message).join(", ") }, { status: 400 });
    }

    const data = parsed.data;

    let distanceTraveled = data.distanceTraveled;
    if (distanceTraveled === null || distanceTraveled === undefined) {
      if (data.startOdometer !== null && data.startOdometer !== undefined && data.endOdometer !== null && data.endOdometer !== undefined) {
        distanceTraveled = data.endOdometer - data.startOdometer;
      }
    }

    let engineHoursUsed = data.engineHoursUsed;
    if (engineHoursUsed === null || engineHoursUsed === undefined) {
      if (data.engineHoursStart !== null && data.engineHoursStart !== undefined && data.engineHoursEnd !== null && data.engineHoursEnd !== undefined) {
        engineHoursUsed = data.engineHoursEnd - data.engineHoursStart;
      }
    }

    const log = await db.assetLog.create({
      data: {
        assetId: data.assetId,
        date: new Date(data.date),
        startTime: data.startTime ?? null,
        endTime: data.endTime ?? null,
        operatorId: data.operatorId ?? null,
        startOdometer: data.startOdometer ?? null,
        endOdometer: data.endOdometer ?? null,
        distanceTraveled: distanceTraveled ?? null,
        engineHoursStart: data.engineHoursStart ?? null,
        engineHoursEnd: data.engineHoursEnd ?? null,
        engineHoursUsed: engineHoursUsed ?? null,
        fuelConsumed: data.fuelConsumed ?? null,
        workSite: data.workSite ?? null,
        project: data.project ?? null,
        conditions: data.conditions ?? null,
        issues: data.issues ?? null,
        status: data.status ?? "PENDING",
        remarks: data.remarks ?? null,
        createdBy: user.id,
      },
      include: {
        asset: { select: { id: true, name: true, category: true, plateNumber: true } },
        operator: { select: { id: true, fullName: true } },
        approvedBy: { select: { id: true, name: true } },
      },
    });

    await db.auditLog.create({
      data: { action: "CREATE", entity: "AssetLog", entityId: log.id, details: `Created asset log for ${log.asset?.name}`, userId: user.id },
    });

    return NextResponse.json({ success: true, data: log, message: "Asset log created successfully" }, { status: 201 });
  } catch (error) {
    console.error("Create asset log error:", error);
    return NextResponse.json({ success: false, error: "Failed to create asset log" }, { status: 500 });
  }
}
