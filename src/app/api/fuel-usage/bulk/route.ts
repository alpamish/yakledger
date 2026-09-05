import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { resolveApprovalStatusOnCreate, APPROVED } from "@/lib/access-control";
import { ensureSufficientStock, ensureContainerFuelTypeMatches, InsufficientStockError } from "@/lib/fuel-stock";

const FUEL_TYPE_VALUES = [
  "DIESEL", "GASOLINE", "LPG", "CNG", "OTHER",
] as const;

const bulkRecordSchema = z.object({
  contractorId: z.string().min(1, "Contractor is required"),
  machineryId: z.string().min(1, "Machinery is required"),
  fuelType: z.enum(FUEL_TYPE_VALUES),
  quantity: z.number().positive("Quantity must be positive"),
  unitPrice: z.number().min(0, "Unit price must be non-negative"),
  date: z.string().min(1, "Date is required"),
  fuelStation: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const bulkCreateSchema = z.object({
  records: z.array(bulkRecordSchema).min(1, "At least one record is required"),
  containerId: z.string().min(1, "Source container is required"),
});

export async function POST(request: NextRequest) {
  try {
    const result = await requirePermission(request, "fuelUsage:create");
    if ("status" in result) return result;
    const user = result.user;

    const body = await request.json();
    const parsed = bulkCreateSchema.safeParse(body);

    if (!parsed.success) {
      const errors = parsed.error.issues.map((issue) => issue.message);
      return NextResponse.json(
        { success: false, error: errors.join(", ") },
        { status: 400 }
      );
    }

    const { records, containerId } = parsed.data;

    const includes = {
      contractor: {
        select: { id: true, contractorName: true, contractorType: true },
      },
      machinery: {
        select: { id: true, machineryName: true, machineryType: true, plateNumber: true },
      },
    } as const;

    const created = await db.$transaction(async (tx) => {
      // Resolve the average purchase price per fuel type (records may mix fuel types).
      const fuelTypes = Array.from(new Set(records.map((r) => r.fuelType)));
      const avgPriceByType: Record<string, number> = {};
      if (fuelTypes.length > 0) {
        const aggregations = await tx.fuelTransaction.groupBy({
          by: ["fuelType"],
          where: { type: 'PURCHASE', containerId, fuelType: { in: fuelTypes } },
          _sum: { quantity: true, totalCost: true },
        });
        for (const a of aggregations) {
          const totalQty = a._sum?.quantity || 0;
          const purchaseCost = a._sum?.totalCost || 0;
          avgPriceByType[a.fuelType] = totalQty > 0 ? purchaseCost / totalQty : 0;
        }
      }

      const results: Awaited<ReturnType<typeof tx.fuelUsage.create>>[] = [];
      const approvalStatus = resolveApprovalStatusOnCreate(user);
      const approvedById = approvalStatus === APPROVED ? user.id : null;
      const approvedAt = approvalStatus === APPROVED ? new Date() : null;
      for (const record of records) {
        const totalCost = record.quantity * record.unitPrice;

        await ensureContainerFuelTypeMatches(tx, containerId, record.fuelType);
        await ensureSufficientStock(tx, containerId, record.quantity, record.fuelType);

        const avgPrice = avgPriceByType[record.fuelType] ?? 0;
        const fuelTxn = await tx.fuelTransaction.create({
          data: {
            type: 'ISSUE',
            fuelType: record.fuelType,
            quantity: record.quantity,
            unitPrice: avgPrice || record.unitPrice,
            totalCost: (avgPrice || record.unitPrice) * record.quantity,
            containerId,
            contractorId: record.contractorId,
            machineryId: record.machineryId ?? null,
            date: new Date(record.date),
            createdBy: user.id,
          },
        });

        const fuelUsage = await tx.fuelUsage.create({
          data: {
            contractorId: record.contractorId,
            machineryId: record.machineryId,
            fuelType: record.fuelType,
            quantity: record.quantity,
            unitPrice: record.unitPrice,
            totalCost,
            date: new Date(record.date),
            fuelStation: record.fuelStation ?? null,
            fuelTransactionId: fuelTxn.id,
            notes: record.notes ?? null,
            createdBy: user.id,
            approvalStatus,
            approvedById,
            approvedAt,
          },
          include: includes,
        });
        results.push(fuelUsage);
      }
      return results;
    });

    // Create a single audit log for the bulk operation
    await db.auditLog.create({
      data: {
        action: "CREATE",
        entity: "FuelUsage",
        entityId: `bulk-${created[0]?.id ?? 'unknown'}`,
        details: `Bulk created ${created.length} fuel usage records (deducted from container)`,
        userId: user.id,
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: { created: created.length, records: created },
        message: `${created.length} fuel usage records created successfully`,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof InsufficientStockError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    console.error("Bulk create fuel usage error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create fuel usage records" },
      { status: 500 }
    );
  }
}
