import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

const updateMaintenanceSchema = z.object({
  serviceDate: z.string().optional(),
  serviceType: z.enum(["ROUTINE", "REPAIR", "INSPECTION", "TIRE_REPLACEMENT", "OIL_CHANGE", "BATTERY", "OTHER"]).optional(),
  cost: z.coerce.number().min(0).optional(),
  description: z.string().optional().nullable(),
  vendor: z.string().optional().nullable(),
  nextServiceDate: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const result = await requirePermission(request, "assets:view");
    if ("status" in result) return result;

    const { id } = await params;
    const record = await db.maintenanceRecord.findUnique({
      where: { id },
      include: { asset: { select: { id: true, name: true, category: true, plateNumber: true } } },
    });
    if (!record) return NextResponse.json({ success: false, error: "Maintenance record not found" }, { status: 404 });
    return NextResponse.json({ success: true, data: record });
  } catch (error) {
    console.error("Get maintenance record error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch maintenance record" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const result = await requirePermission(request, "assets:edit");
    if ("status" in result) return result;
    const user = result.user;

    const { id } = await params;
    const existing = await db.maintenanceRecord.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ success: false, error: "Maintenance record not found" }, { status: 404 });

    const body = await request.json();
    const parsed = updateMaintenanceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues.map((i) => i.message).join(", ") }, { status: 400 });
    }

    const data = parsed.data;
    const updateData: Record<string, unknown> = {};
    if (data.serviceDate !== undefined) updateData.serviceDate = new Date(data.serviceDate);
    if (data.serviceType !== undefined) updateData.serviceType = data.serviceType;
    if (data.cost !== undefined) updateData.cost = data.cost;
    if (data.description !== undefined) updateData.description = data.description ?? null;
    if (data.vendor !== undefined) updateData.vendor = data.vendor ?? null;
    if (data.nextServiceDate !== undefined) updateData.nextServiceDate = data.nextServiceDate ? new Date(data.nextServiceDate) : null;
    if (data.notes !== undefined) updateData.notes = data.notes ?? null;

    const record = await db.maintenanceRecord.update({
      where: { id },
      data: updateData,
      include: { asset: { select: { id: true, name: true, category: true } } },
    });

    await db.auditLog.create({
      data: { action: "UPDATE", entity: "MaintenanceRecord", entityId: id, details: `Updated maintenance record`, userId: user.id },
    });

    return NextResponse.json({ success: true, data: record, message: "Maintenance record updated successfully" });
  } catch (error) {
    console.error("Update maintenance record error:", error);
    return NextResponse.json({ success: false, error: "Failed to update maintenance record" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const result = await requirePermission(request, "assets:delete");
    if ("status" in result) return result;
    const user = result.user;

    const { id } = await params;
    const existing = await db.maintenanceRecord.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ success: false, error: "Maintenance record not found" }, { status: 404 });

    await db.maintenanceRecord.delete({ where: { id } });

    await db.auditLog.create({
      data: { action: "DELETE", entity: "MaintenanceRecord", entityId: id, details: `Deleted maintenance record`, userId: user.id },
    });

    return NextResponse.json({ success: true, message: "Maintenance record deleted successfully" });
  } catch (error) {
    console.error("Delete maintenance record error:", error);
    return NextResponse.json({ success: false, error: "Failed to delete maintenance record" }, { status: 500 });
  }
}
