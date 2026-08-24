import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { buildAccessScope, withScope } from "@/lib/access-control";
import { ensureSufficientStock, InsufficientStockError } from "@/lib/fuel-stock";

const updateFuelTransactionSchema = z.object({
  type: z.enum(["PURCHASE", "TRANSFER", "ISSUE"]).optional(),
  fuelType: z.string().optional(),
  quantity: z.coerce.number().positive().optional(),
  unitPrice: z.coerce.number().min(0).optional().nullable(),
  totalCost: z.coerce.number().min(0).optional().nullable(),
  supplier: z.string().optional().nullable(),
  assetId: z.string().optional().nullable(),
  containerId: z.string().optional().nullable(),
  destinationContainerId: z.string().optional().nullable(),
  contractorId: z.string().optional().nullable(),
  machineryId: z.string().optional().nullable(),
  issuedToName: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  date: z.string().optional(),
});

const transactionIncludes = {
  asset: { select: { id: true, name: true, category: true } },
  container: { select: { id: true, name: true, fuelLocation: true, isMainContainer: true } },
  destinationContainer: { select: { id: true, name: true, fuelLocation: true } },
  contractor: { select: { id: true, contractorName: true } },
  machinery: { select: { id: true, machineryName: true, plateNumber: true } },
};

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const result = await requirePermission(request, "fuelUsage:view");
    if ("status" in result) return result;
    const user = result.user;

    const { id } = await params;
    const transaction = await db.fuelTransaction.findFirst({
      where: withScope({ id }, await buildAccessScope(user, "fuelTransaction")),
      include: transactionIncludes,
    });
    if (!transaction) return NextResponse.json({ success: false, error: "Fuel transaction not found" }, { status: 404 });
    return NextResponse.json({ success: true, data: transaction });
  } catch (error) {
    console.error("Get fuel transaction error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch fuel transaction" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const result = await requirePermission(request, "fuelUsage:edit");
    if ("status" in result) return result;
    const user = result.user;

    const { id } = await params;
    const existing = await db.fuelTransaction.findFirst({
      where: withScope({ id }, await buildAccessScope(user, "fuelTransaction")),
      select: {
        id: true,
        type: true,
        fuelType: true,
        quantity: true,
        unitPrice: true,
        totalCost: true,
        containerId: true,
        destinationContainerId: true,
        contractorId: true,
        machineryId: true,
        date: true,
      },
    });
    if (!existing) return NextResponse.json({ success: false, error: "Fuel transaction not found" }, { status: 404 });

    const body = await request.json();
    const parsed = updateFuelTransactionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues.map((i) => i.message).join(", ") }, { status: 400 });
    }

    const data = parsed.data;
    const updateData: Record<string, unknown> = {};
    if (data.type !== undefined) updateData.type = data.type;
    if (data.fuelType !== undefined) updateData.fuelType = data.fuelType;
    if (data.quantity !== undefined) updateData.quantity = data.quantity;
    if (data.unitPrice !== undefined) updateData.unitPrice = data.unitPrice ?? null;
    if (data.totalCost !== undefined) updateData.totalCost = data.totalCost ?? null;
    if (data.supplier !== undefined) updateData.supplier = data.supplier ?? null;
    if (data.assetId !== undefined) updateData.assetId = data.assetId ?? null;
    if (data.containerId !== undefined) updateData.containerId = data.containerId ?? null;
    if (data.destinationContainerId !== undefined) updateData.destinationContainerId = data.destinationContainerId ?? null;
    if (data.contractorId !== undefined) updateData.contractorId = data.contractorId ?? null;
    if (data.machineryId !== undefined) updateData.machineryId = data.machineryId ?? null;
    if (data.issuedToName !== undefined) updateData.issuedToName = data.issuedToName ?? null;
    if (data.notes !== undefined) updateData.notes = data.notes ?? null;
    if (data.date !== undefined) updateData.date = new Date(data.date);

    // Recompute totalCost when quantity/unitPrice change and totalCost wasn't explicit.
    if (data.totalCost === undefined && (data.quantity !== undefined || data.unitPrice !== undefined)) {
      const newQuantity = data.quantity ?? existing.quantity;
      const newUnitPrice = data.unitPrice !== undefined ? data.unitPrice : existing.unitPrice;
      if (newUnitPrice != null) updateData.totalCost = newQuantity * newUnitPrice;
    }

    if (data.type === "TRANSFER" || (data.type === undefined && existing.type === "TRANSFER")) {
      const sourceId = data.containerId !== undefined ? data.containerId : existing.containerId;
      const destId = data.destinationContainerId !== undefined ? data.destinationContainerId : existing.destinationContainerId;
      if (!sourceId || !destId) {
        return NextResponse.json({ success: false, error: "Both source and destination containers are required for a transfer" }, { status: 400 });
      }
      if (sourceId === destId) {
        return NextResponse.json({ success: false, error: "Source and destination containers must be different" }, { status: 400 });
      }
    }

    const transaction = await db.$transaction(async (tx) => {
      // Validate the post-update balance: the edited row's own previous draw is
      // excluded so we only check against other transactions.
      const effectiveType = data.type ?? existing.type;
      const effectiveFuelType = data.fuelType ?? existing.fuelType;
      const effectiveSourceId = data.containerId !== undefined ? data.containerId : existing.containerId;
      const effectiveQuantity = data.quantity ?? existing.quantity;

      if ((effectiveType === "ISSUE" || effectiveType === "TRANSFER") && effectiveSourceId) {
        await ensureSufficientStock(tx, effectiveSourceId, effectiveQuantity, effectiveFuelType, id);
      }

      const updated = await tx.fuelTransaction.update({
        where: { id },
        data: updateData,
        include: transactionIncludes,
      });

      // Keep a derived FuelUsage in sync when the underlying ISSUE changes.
      if (updated.type === "ISSUE") {
        const usage = await tx.fuelUsage.findFirst({
          where: { fuelTransactionId: id },
          select: { id: true },
        });
        if (usage) {
          await tx.fuelUsage.update({
            where: { id: usage.id },
            data: {
              fuelType: updated.fuelType,
              quantity: updated.quantity,
              unitPrice: updated.unitPrice ?? 0,
              totalCost: updated.totalCost ?? 0,
              date: updated.date,
              contractorId: updated.contractorId ?? existing.contractorId ?? "",
              machineryId: updated.machineryId ?? existing.machineryId ?? null,
            },
          });
        }
      }

      return updated;
    });

    await db.auditLog.create({
      data: { action: "UPDATE", entity: "FuelTransaction", entityId: id, details: `Updated fuel transaction`, userId: user.id },
    });

    return NextResponse.json({ success: true, data: transaction, message: "Fuel transaction updated successfully" });
  } catch (error) {
    if (error instanceof InsufficientStockError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    console.error("Update fuel transaction error:", error);
    return NextResponse.json({ success: false, error: "Failed to update fuel transaction" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const result = await requirePermission(request, "fuelUsage:delete");
    if ("status" in result) return result;
    const user = result.user;

    const { id } = await params;
    const existing = await db.fuelTransaction.findFirst({
      where: withScope({ id }, await buildAccessScope(user, "fuelTransaction")),
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ success: false, error: "Fuel transaction not found" }, { status: 404 });

    await db.$transaction(async (tx) => {
      // Also delete linked FuelUsage if exists.
      await tx.fuelUsage.deleteMany({ where: { fuelTransactionId: id } });
      await tx.fuelTransaction.delete({ where: { id } });

      await tx.auditLog.create({
        data: { action: "DELETE", entity: "FuelTransaction", entityId: id, details: `Deleted fuel transaction`, userId: user.id },
      });
    });

    return NextResponse.json({ success: true, message: "Fuel transaction deleted successfully" });
  } catch (error) {
    console.error("Delete fuel transaction error:", error);
    return NextResponse.json({ success: false, error: "Failed to delete fuel transaction" }, { status: 500 });
  }
}
