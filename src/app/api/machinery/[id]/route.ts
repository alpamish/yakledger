import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { buildAccessScope, withScope } from "@/lib/access-control";
import { applyTransfer, AssignmentError } from "@/services/machinery-assignment.service";

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
  driverFatherName: z.string().optional().nullable(),
  driverPhoneNumber: z.string().optional().nullable(),
  driverNationalId: z.string().optional().nullable(),
  driverIdImageFront: z.string().optional().nullable(),
  driverIdImageBack: z.string().optional().nullable(),
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
  ownershipType: z.enum(["COMPANY", "CONTRACTOR_OWNED", "RENTED", "LEASED"]).optional(),
  rentalRate: z.number().min(0).optional().nullable(),
  rentalRateType: z.enum(["DAILY", "MONTHLY"]).optional().nullable(),
  rentalStartDate: z.string().optional().nullable(),
  rentalEndDate: z.string().optional().nullable(),
  meterJumpThreshold: z.number().min(0).optional().nullable(),
});

// GET /api/machinery/[id] - Get single machinery by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await requirePermission(request, "machinery:view");
    if ("status" in result) return result;
    const user = result.user;

    const { id } = await params;

    const machinery = await db.machinery.findFirst({
      where: withScope({ id }, await buildAccessScope(user, "machinery")),
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
        if (
          (key === "contractStartDate" ||
            key === "contractEndDate" ||
            key === "rentalStartDate" ||
            key === "rentalEndDate") &&
          value
        ) {
          updateData[key] = new Date(value as string);
        } else {
          updateData[key] = value;
        }
      }
    }

    const machinery = await db.machinery.findFirst({
      where: withScope({ id }, await buildAccessScope(user, "machinery")),
      select: {
        id: true,
        machineryName: true,
        machineryType: true,
        assignedContractorId: true,
        contractStartDate: true,
        createdAt: true,
      },
    });

    if (!machinery) {
      return NextResponse.json(
        { success: false, error: "Machinery not found" },
        { status: 404 }
      );
    }

    const RATE_KEYS = [
      "hourlyRate",
      "dailyRate",
      "monthlyRate",
      "contractDaysPerMonth",
      "workHoursPerDay",
    ];
    const ratesChanged = RATE_KEYS.some((key) => key in updateData);

    const updatedMachinery = await db.$transaction(async (tx) => {
      const updated = await tx.machinery.update({
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

      // Keep the default rate tier in sync with the machinery's base rates.
      if (ratesChanged) {
        const current = await tx.machinery.findUnique({
          where: { id },
          select: {
            monthlyRate: true,
            dailyRate: true,
            hourlyRate: true,
            contractDaysPerMonth: true,
            workHoursPerDay: true,
          },
        });
        const rateData = {
          monthlyRate: current?.monthlyRate ?? 0,
          dailyRate: current?.dailyRate ?? 0,
          hourlyRate: current?.hourlyRate ?? 0,
          contractDaysPerMonth: current?.contractDaysPerMonth ?? 28,
          workHoursPerDay: current?.workHoursPerDay ?? 9,
        };
        const defaultRate = await tx.machineryRate.findFirst({
          where: { machineryId: id, isDefault: true },
        });
        if (defaultRate) {
          await tx.machineryRate.update({
            where: { id: defaultRate.id },
            data: rateData,
          });
        } else {
          await tx.machineryRate.create({
            data: { machineryId: id, rateName: "Default", ...rateData, isDefault: true, createdBy: user.id },
          });
        }
      }

      // Create audit log entry
      await tx.auditLog.create({
        data: {
          action: "UPDATE",
          entity: "Machinery",
          entityId: machinery.id,
          details: `Updated machinery: ${updated.machineryName}`,
          userId: user.id,
        },
      });

      // Phase 3: changing the assigned contractor is a transfer — record it
      // in the assignment history (backfilling the initial row for machines
      // that predate assignment tracking) so pointer and history stay in sync.
      if (
        typeof updateData.assignedContractorId === "string" &&
        updateData.assignedContractorId !== machinery.assignedContractorId
      ) {
        await applyTransfer(
          tx,
          machinery,
          { contractorId: updateData.assignedContractorId, startDate: new Date() },
          { userId: user.id, userName: user.name }
        );
      }

      return updated;
    });

    return NextResponse.json({
      success: true,
      data: updatedMachinery,
      message: "Machinery updated successfully",
    });
  } catch (error) {
    if (error instanceof AssignmentError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      );
    }
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
    const machinery = await db.machinery.findFirst({
      where: withScope({ id }, await buildAccessScope(user, "machinery")),
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
