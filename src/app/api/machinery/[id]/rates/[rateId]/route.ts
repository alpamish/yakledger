import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { buildAccessScope, withScope } from "@/lib/access-control";

const updateRateSchema = z.object({
  rateName: z.string().min(1).optional(),
  monthlyRate: z.number().min(0).optional(),
  dailyRate: z.number().min(0).optional(),
  hourlyRate: z.number().min(0).optional(),
  contractDaysPerMonth: z.number().int().min(1).max(31).optional(),
  workHoursPerDay: z.number().int().min(1).max(24).optional(),
  isDefault: z.boolean().optional(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; rateId: string }> }
) {
  const result = await requirePermission(request, "machinery:edit");
  if ("status" in result) return result;
  const user = result.user;

  try {
    const { id, rateId } = await params;
    const rateExists = await db.machineryRate.findFirst({
      where: withScope({ id: rateId, machineryId: id }, await buildAccessScope(user, "machineryRate")),
      select: { id: true },
    });

    if (!rateExists) {
      return NextResponse.json(
        { success: false, error: "Rate not found" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const parsed = updateRateSchema.safeParse(body);

    if (!parsed.success) {
      const errors = parsed.error.issues.map((issue) => issue.message);
      return NextResponse.json(
        { success: false, error: errors.join(", ") },
        { status: 400 }
      );
    }

    const data = parsed.data;

    const rate = await db.$transaction(async (tx) => {
      if (data.isDefault) {
        await tx.machineryRate.updateMany({
          where: { machineryId: id, isDefault: true },
          data: { isDefault: false },
        });
      }

      const updated = await tx.machineryRate.update({
        where: { id: rateId },
        data,
      });

      await tx.auditLog.create({
        data: {
          action: "UPDATE",
          entity: "MachineryRate",
          entityId: rateId,
          details: `Updated rate "${updated.rateName}" for machinery ${id}`,
          userId: user.id,
        },
      });

      return updated;
    });

    return NextResponse.json({ success: true, data: rate });
  } catch (error) {
    console.error("Update machinery rate error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update rate" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; rateId: string }> }
) {
  const result = await requirePermission(request, "machinery:delete");
  if ("status" in result) return result;
  const user = result.user;

  try {
    const { id, rateId } = await params;

    const rateExists = await db.machineryRate.findFirst({
      where: withScope({ id: rateId, machineryId: id }, await buildAccessScope(user, "machineryRate")),
      select: { id: true },
    });

    if (!rateExists) {
      return NextResponse.json(
        { success: false, error: "Rate not found" },
        { status: 404 }
      );
    }

    const count = await db.machineryRate.count({ where: { machineryId: id } });
    if (count <= 1) {
      return NextResponse.json(
        { success: false, error: "Cannot delete the only rate tier. Add another rate first." },
        { status: 400 }
      );
    }

    await db.$transaction(async (tx) => {
      await tx.machineryRate.delete({ where: { id: rateId } });
      await tx.auditLog.create({
        data: {
          action: "DELETE",
          entity: "MachineryRate",
          entityId: rateId,
          details: `Deleted rate ${rateId} for machinery ${id}`,
          userId: user.id,
        },
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete machinery rate error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete rate" },
      { status: 500 }
    );
  }
}
