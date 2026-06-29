import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

const updateAssetSchema = z.object({
  name: z.string().min(1).optional(),
  category: z.enum(["VEHICLE", "FUEL", "FURNITURE", "LAPTOP", "ELECTRONICS", "MACHINERY", "OFFICE_EQUIPMENT", "OTHER"]).optional(),
  purchaseDate: z.string().optional(),
  purchasePrice: z.coerce.number().min(0).optional(),
  currentValue: z.coerce.number().min(0).optional(),
  quantity: z.coerce.number().int().min(1).optional(),
  serialNumber: z.string().optional().nullable(),
  plateNumber: z.string().optional().nullable(),
  assignedToId: z.string().optional().nullable(),
  status: z.enum(["ACTIVE", "IN_USE", "UNDER_REPAIR", "SOLD", "LOST"]).optional(),
  notes: z.string().optional().nullable(),
  images: z.string().optional().nullable(),
  fuelType: z.string().optional().nullable(),
  fuelCapacity: z.coerce.number().min(0).optional().nullable(),
  fuelLocation: z.string().optional().nullable(),
  isMainContainer: z.boolean().optional(),
});

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const result = await requirePermission(request, "assets:view");
    if ("status" in result) return result;

    const { id } = await params;
    const asset = await db.asset.findUnique({
      where: { id },
      include: {
        assignedTo: { select: { id: true, fullName: true, jobTitle: true } },
        maintenanceRecords: {
          orderBy: { serviceDate: "desc" },
          include: { creator: { select: { id: true, name: true } } },
        },
        assetLogs: {
          orderBy: { date: "desc" },
          take: 20,
          include: { operator: { select: { id: true, fullName: true } } },
        },
        fuelTransactions: {
          where: { type: "ISSUE" },
          orderBy: { date: "desc" },
          take: 20,
        },
        _count: { select: { maintenanceRecords: true, assetLogs: true, fuelTransactions: true } },
      },
    });

    if (!asset) {
      return NextResponse.json({ success: false, error: "Asset not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: asset });
  } catch (error) {
    console.error("Get asset error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch asset" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const result = await requirePermission(request, "assets:edit");
    if ("status" in result) return result;
    const user = result.user;

    const { id } = await params;
    const existing = await db.asset.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ success: false, error: "Asset not found" }, { status: 404 });

    const body = await request.json();
    const parsed = updateAssetSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues.map((i) => i.message).join(", ") }, { status: 400 });
    }

    const data = parsed.data;
    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.category !== undefined) updateData.category = data.category;
    if (data.purchaseDate !== undefined) updateData.purchaseDate = new Date(data.purchaseDate);
    if (data.purchasePrice !== undefined) updateData.purchasePrice = data.purchasePrice;
    if (data.currentValue !== undefined) updateData.currentValue = data.currentValue;
    if (data.quantity !== undefined) updateData.quantity = data.quantity;
    if (data.serialNumber !== undefined) updateData.serialNumber = data.serialNumber ?? null;
    if (data.plateNumber !== undefined) updateData.plateNumber = data.plateNumber ?? null;
    if (data.assignedToId !== undefined) updateData.assignedToId = data.assignedToId ?? null;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.notes !== undefined) updateData.notes = data.notes ?? null;
    if (data.images !== undefined) updateData.images = data.images ?? null;
    if (data.fuelType !== undefined) updateData.fuelType = data.fuelType ?? null;
    if (data.fuelCapacity !== undefined) updateData.fuelCapacity = data.fuelCapacity ?? null;
    if (data.fuelLocation !== undefined) updateData.fuelLocation = data.fuelLocation ?? null;
    if (data.isMainContainer !== undefined) updateData.isMainContainer = data.isMainContainer;

    const asset = await db.asset.update({
      where: { id },
      data: updateData,
      include: { assignedTo: { select: { id: true, fullName: true, jobTitle: true } } },
    });

    await db.auditLog.create({
      data: { action: "UPDATE", entity: "Asset", entityId: id, details: `Updated asset: ${asset.name}`, userId: user.id },
    });

    return NextResponse.json({ success: true, data: asset, message: "Asset updated successfully" });
  } catch (error) {
    console.error("Update asset error:", error);
    return NextResponse.json({ success: false, error: "Failed to update asset" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const result = await requirePermission(request, "assets:delete");
    if ("status" in result) return result;
    const user = result.user;

    const { id } = await params;
    const existing = await db.asset.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ success: false, error: "Asset not found" }, { status: 404 });

    await db.asset.delete({ where: { id } });

    await db.auditLog.create({
      data: { action: "DELETE", entity: "Asset", entityId: id, details: `Deleted asset: ${existing.name}`, userId: user.id },
    });

    return NextResponse.json({ success: true, message: "Asset deleted successfully" });
  } catch (error) {
    console.error("Delete asset error:", error);
    return NextResponse.json({ success: false, error: "Failed to delete asset" }, { status: 500 });
  }
}
