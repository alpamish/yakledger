import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

const FUEL_TYPE_VALUES = [
  "DIESEL", "GASOLINE", "LPG", "CNG", "OTHER",
] as const;

const updateFuelUsageSchema = z.object({
  contractorId: z.string().min(1).optional(),
  machineryId: z.string().min(1).optional(),
  fuelType: z.enum(FUEL_TYPE_VALUES).optional(),
  quantity: z.number().positive().optional(),
  unitPrice: z.number().min(0).optional(),
  totalCost: z.number().min(0).optional(),
  date: z.string().min(1).optional(),
  fuelStation: z.string().optional().nullable(),
  receiptAttachment: z.string().optional().nullable(),
  linkedExpenseId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

// PUT /api/fuel-usage/[id] - Update fuel usage
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await requirePermission(request, "fuelUsage:edit");
    if ("status" in result) return result;
    const user = result.user;

    const { id } = await params;
    const body = await request.json();
    const parsed = updateFuelUsageSchema.safeParse(body);

    if (!parsed.success) {
      const errors = parsed.error.issues.map((issue) => issue.message);
      return NextResponse.json(
        { success: false, error: errors.join(", ") },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Build update object
    const updateData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        if (key === "date" && value) {
          updateData[key] = new Date(value as string);
        } else {
          updateData[key] = value;
        }
      }
    }

    // Recalculate totalCost if quantity or unitPrice changed and totalCost not explicitly set
    if ((data.quantity !== undefined || data.unitPrice !== undefined) && data.totalCost === undefined) {
      const existing = await db.fuelUsage.findUnique({
        where: { id },
        select: { quantity: true, unitPrice: true },
      });
      if (existing) {
        const quantity = data.quantity ?? existing.quantity;
        const unitPrice = data.unitPrice ?? existing.unitPrice;
        updateData.totalCost = quantity * unitPrice;
      }
    }

    const fuelUsage = await db.fuelUsage.update({
      where: { id },
      data: updateData,
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
    });

    // Create audit log entry
    await db.auditLog.create({
      data: {
        action: "UPDATE",
        entity: "FuelUsage",
        entityId: fuelUsage.id,
        details: `Updated fuel usage record`,
        userId: user.id,
      },
    });

    return NextResponse.json({
      success: true,
      data: fuelUsage,
      message: "Fuel usage record updated successfully",
    });
  } catch (error) {
    console.error("Update fuel usage error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update fuel usage record" },
      { status: 500 }
    );
  }
}

// DELETE /api/fuel-usage/[id] - Delete fuel usage
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await requirePermission(request, "fuelUsage:delete");
    if ("status" in result) return result;
    const user = result.user;

    const { id } = await params;

    // Get fuel usage info before deletion for audit log
    const fuelUsage = await db.fuelUsage.findUnique({
      where: { id },
      select: { fuelType: true, quantity: true, totalCost: true },
    });

    if (!fuelUsage) {
      return NextResponse.json(
        { success: false, error: "Fuel usage record not found" },
        { status: 404 }
      );
    }

    // Create audit log entry before deletion
    await db.auditLog.create({
      data: {
        action: "DELETE",
        entity: "FuelUsage",
        entityId: id,
        details: `Deleted fuel usage record: ${fuelUsage.quantity} ${fuelUsage.fuelType} ($${fuelUsage.totalCost})`,
        userId: user.id,
      },
    });

    await db.fuelUsage.delete({ where: { id } });

    return NextResponse.json({
      success: true,
      message: "Fuel usage record deleted successfully",
    });
  } catch (error) {
    console.error("Delete fuel usage error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete fuel usage record" },
      { status: 500 }
    );
  }
}
