import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

const FUEL_TYPE_VALUES = [
  "DIESEL", "GASOLINE", "LPG", "CNG", "OTHER",
] as const;

const MACHINERY_STATUS_VALUES = [
  "OPERATIONAL", "UNDER_MAINTENANCE", "OUT_OF_SERVICE",
] as const;

const updateMachinerySchema = z.object({
  machineryName: z.string().min(1).optional(),
  machineryType: z.string().min(1).optional(),
  plateNumber: z.string().optional().nullable(),
  model: z.string().optional().nullable(),
  driverName: z.string().optional().nullable(),
  status: z.enum(MACHINERY_STATUS_VALUES).optional(),
  assignedContractorId: z.string().min(1, "Contractor is required").optional(),
  fuelType: z.enum(FUEL_TYPE_VALUES).optional(),
  hourlyConsumptionRate: z.number().min(0).optional(),
  hourlyRate: z.number().min(0).optional(),
  dailyRate: z.number().min(0).optional(),
  monthlyRate: z.number().min(0).optional(),
  contractDaysPerMonth: z.number().int().min(1).max(31).optional(),
  workHoursPerDay: z.number().int().min(1).max(24).optional(),
  contractStartDate: z.string().optional().nullable(),
  contractEndDate: z.string().optional().nullable(),
});

// GET /api/machinery/[id] - Get single machinery by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await requirePermission(request, "machinery:view");
    if ("status" in result) return result;

    const { id } = await params;

    const machinery = await db.machinery.findUnique({
      where: { id },
      include: {
        assignedContractor: {
          select: { id: true, contractorName: true, contractorType: true },
        },
        _count: {
          select: { timesheets: true, fuelUsages: true },
        },
      },
    });

    if (!machinery) {
      return NextResponse.json(
        { success: false, error: "Machinery not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: machinery,
    });
  } catch (error) {
    console.error("Get machinery error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch machinery" },
      { status: 500 }
    );
  }
}

// PUT /api/machinery/[id] - Update machinery
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await requirePermission(request, "machinery:edit");
    if ("status" in result) return result;
    const user = result.user;

    const { id } = await params;
    const body = await request.json();
    const parsed = updateMachinerySchema.safeParse(body);

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
        if ((key === "contractStartDate" || key === "contractEndDate") && value) {
          updateData[key] = new Date(value as string);
        } else {
          updateData[key] = value;
        }
      }
    }

    const machinery = await db.machinery.update({
      where: { id },
      data: updateData,
      include: {
        assignedContractor: {
          select: { id: true, contractorName: true, contractorType: true },
        },
        _count: {
          select: { timesheets: true, fuelUsages: true },
        },
      },
    });

    // Create audit log entry
    await db.auditLog.create({
      data: {
        action: "UPDATE",
        entity: "Machinery",
        entityId: machinery.id,
        details: `Updated machinery: ${machinery.machineryName}`,
        userId: user.id,
      },
    });

    return NextResponse.json({
      success: true,
      data: machinery,
      message: "Machinery updated successfully",
    });
  } catch (error) {
    console.error("Update machinery error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update machinery" },
      { status: 500 }
    );
  }
}

// DELETE /api/machinery/[id] - Delete machinery
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await requirePermission(request, "machinery:delete");
    if ("status" in result) return result;
    const user = result.user;

    const { id } = await params;

    // Get machinery info before deletion for audit log
    const machinery = await db.machinery.findUnique({
      where: { id },
      select: { machineryName: true, machineryType: true },
    });

    if (!machinery) {
      return NextResponse.json(
        { success: false, error: "Machinery not found" },
        { status: 404 }
      );
    }

    // Create audit log entry before deletion
    await db.auditLog.create({
      data: {
        action: "DELETE",
        entity: "Machinery",
        entityId: id,
        details: `Deleted machinery: ${machinery.machineryName} (${machinery.machineryType})`,
        userId: user.id,
      },
    });

    await db.machinery.delete({ where: { id } });

    return NextResponse.json({
      success: true,
      message: "Machinery deleted successfully",
    });
  } catch (error) {
    console.error("Delete machinery error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete machinery" },
      { status: 500 }
    );
  }
}
