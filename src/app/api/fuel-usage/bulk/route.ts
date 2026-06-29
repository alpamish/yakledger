import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

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
  containerId: z.string().optional().nullable(),
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
      let globalFuelTransactionId: string | null = null;

      // If a global container is specified, resolve the average price once
      let avgPrice = 0;
      let firstFuelType = records[0]?.fuelType;
      if (containerId && firstFuelType) {
        const aggregation = await tx.fuelTransaction.aggregate({
          where: { type: 'PURCHASE', fuelType: firstFuelType, containerId },
          _sum: { quantity: true, totalCost: true },
        });
        const totalQty = aggregation._sum?.quantity || 0;
        const purchaseCost = aggregation._sum?.totalCost || 0;
        avgPrice = totalQty > 0 ? purchaseCost / totalQty : 0;
      }

      const results = [];
      for (const record of records) {
        const totalCost = record.quantity * record.unitPrice;
        let fuelTransactionId: string | null = null;

        if (containerId) {
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
          fuelTransactionId = fuelTxn.id;
        }

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
            fuelTransactionId,
            notes: record.notes ?? null,
            createdBy: user.id,
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
        details: `Bulk created ${created.length} fuel usage records${containerId ? ' (deducted from container)' : ''}`,
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
    console.error("Bulk create fuel usage error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create fuel usage records" },
      { status: 500 }
    );
  }
}
