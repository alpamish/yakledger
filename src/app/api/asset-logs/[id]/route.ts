import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

const updateAssetLogSchema = z.object({
  date: z.string().optional(),
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

const approveSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
});

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const result = await requirePermission(request, "assets:view");
    if ("status" in result) return result;

    const { id } = await params;
    const log = await db.assetLog.findUnique({
      where: { id },
      include: {
        asset: { select: { id: true, name: true, category: true, plateNumber: true } },
        operator: { select: { id: true, fullName: true } },
        approvedBy: { select: { id: true, name: true } },
      },
    });
    if (!log) return NextResponse.json({ success: false, error: "Asset log not found" }, { status: 404 });
    return NextResponse.json({ success: true, data: log });
  } catch (error) {
    console.error("Get asset log error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch asset log" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const result = await requirePermission(request, "assets:edit");
    if ("status" in result) return result;
    const user = result.user;

    const { id } = await params;
    const existing = await db.assetLog.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ success: false, error: "Asset log not found" }, { status: 404 });

    const body = await request.json();
    const parsed = updateAssetLogSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues.map((i) => i.message).join(", ") }, { status: 400 });
    }

    const data = parsed.data;
    const updateData: Record<string, unknown> = {};

    if (data.date !== undefined) updateData.date = new Date(data.date);
    if (data.startTime !== undefined) updateData.startTime = data.startTime ?? null;
    if (data.endTime !== undefined) updateData.endTime = data.endTime ?? null;
    if (data.operatorId !== undefined) updateData.operatorId = data.operatorId ?? null;
    if (data.startOdometer !== undefined) updateData.startOdometer = data.startOdometer ?? null;
    if (data.endOdometer !== undefined) updateData.endOdometer = data.endOdometer ?? null;

    const start = data.startOdometer !== undefined ? data.startOdometer : existing.startOdometer;
    const end = data.endOdometer !== undefined ? data.endOdometer : existing.endOdometer;
    if (data.distanceTraveled !== undefined) {
      updateData.distanceTraveled = data.distanceTraveled ?? null;
    } else if (start !== null && start !== undefined && end !== null && end !== undefined) {
      updateData.distanceTraveled = (end as number) - (start as number);
    }

    if (data.engineHoursStart !== undefined) updateData.engineHoursStart = data.engineHoursStart ?? null;
    if (data.engineHoursEnd !== undefined) updateData.engineHoursEnd = data.engineHoursEnd ?? null;

    const engStart = data.engineHoursStart !== undefined ? data.engineHoursStart : existing.engineHoursStart;
    const engEnd = data.engineHoursEnd !== undefined ? data.engineHoursEnd : existing.engineHoursEnd;
    if (data.engineHoursUsed !== undefined) {
      updateData.engineHoursUsed = data.engineHoursUsed ?? null;
    } else if (engStart !== null && engStart !== undefined && engEnd !== null && engEnd !== undefined) {
      updateData.engineHoursUsed = (engEnd as number) - (engStart as number);
    }

    if (data.fuelConsumed !== undefined) updateData.fuelConsumed = data.fuelConsumed ?? null;
    if (data.workSite !== undefined) updateData.workSite = data.workSite ?? null;
    if (data.project !== undefined) updateData.project = data.project ?? null;
    if (data.conditions !== undefined) updateData.conditions = data.conditions ?? null;
    if (data.issues !== undefined) updateData.issues = data.issues ?? null;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.remarks !== undefined) updateData.remarks = data.remarks ?? null;

    const log = await db.assetLog.update({
      where: { id },
      data: updateData,
      include: {
        asset: { select: { id: true, name: true, category: true, plateNumber: true } },
        operator: { select: { id: true, fullName: true } },
        approvedBy: { select: { id: true, name: true } },
      },
    });

    await db.auditLog.create({
      data: { action: "UPDATE", entity: "AssetLog", entityId: id, details: `Updated asset log`, userId: user.id },
    });

    return NextResponse.json({ success: true, data: log, message: "Asset log updated successfully" });
  } catch (error) {
    console.error("Update asset log error:", error);
    return NextResponse.json({ success: false, error: "Failed to update asset log" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const result = await requirePermission(request, "assets:edit");
    if ("status" in result) return result;
    const user = result.user;

    const { id } = await params;
    const existing = await db.assetLog.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ success: false, error: "Asset log not found" }, { status: 404 });

    const body = await request.json();
    const parsed = approveSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues.map((i) => i.message).join(", ") }, { status: 400 });
    }

    const log = await db.assetLog.update({
      where: { id },
      data: {
        status: parsed.data.status,
        approvedById: user.id,
        approvedAt: new Date(),
      },
      include: {
        asset: { select: { id: true, name: true, category: true, plateNumber: true } },
        operator: { select: { id: true, fullName: true } },
        approvedBy: { select: { id: true, name: true } },
      },
    });

    await db.auditLog.create({
      data: {
        action: "UPDATE",
        entity: "AssetLog",
        entityId: id,
        details: `Log ${parsed.data.status === "APPROVED" ? "approved" : "rejected"}`,
        userId: user.id,
      },
    });

    return NextResponse.json({ success: true, data: log, message: `Log ${parsed.data.status === "APPROVED" ? "approved" : "rejected"} successfully` });
  } catch (error) {
    console.error("Approve asset log error:", error);
    return NextResponse.json({ success: false, error: "Failed to update log status" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const result = await requirePermission(request, "assets:delete");
    if ("status" in result) return result;
    const user = result.user;

    const { id } = await params;
    const existing = await db.assetLog.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ success: false, error: "Asset log not found" }, { status: 404 });

    await db.assetLog.delete({ where: { id } });

    await db.auditLog.create({
      data: { action: "DELETE", entity: "AssetLog", entityId: id, details: `Deleted asset log`, userId: user.id },
    });

    return NextResponse.json({ success: true, message: "Asset log deleted successfully" });
  } catch (error) {
    console.error("Delete asset log error:", error);
    return NextResponse.json({ success: false, error: "Failed to delete asset log" }, { status: 500 });
  }
}
