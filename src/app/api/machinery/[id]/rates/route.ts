import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

const createRateSchema = z.object({
  rateName: z.string().min(1, "Rate name is required"),
  monthlyRate: z.number().min(0).default(0),
  dailyRate: z.number().min(0).default(0),
  hourlyRate: z.number().min(0).default(0),
  contractDaysPerMonth: z.number().int().min(1).max(31).default(28),
  workHoursPerDay: z.number().int().min(1).max(24).default(9),
  isDefault: z.boolean().default(false),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requirePermission(request, "machinery:view");
  if ("status" in result) return result;

  try {
    const { id } = await params;
    const rates = await db.machineryRate.findMany({
      where: { machineryId: id },
      orderBy: [{ isDefault: "desc" }, { rateName: "asc" }],
    });
    return NextResponse.json({ success: true, data: rates });
  } catch (error) {
    console.error("Get machinery rates error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch rates" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requirePermission(request, "machinery:edit");
  if ("status" in result) return result;
  const user = result.user;

  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = createRateSchema.safeParse(body);

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

      const created = await tx.machineryRate.create({
        data: {
          machineryId: id,
          rateName: data.rateName,
          monthlyRate: data.monthlyRate,
          dailyRate: data.dailyRate,
          hourlyRate: data.hourlyRate,
          contractDaysPerMonth: data.contractDaysPerMonth,
          workHoursPerDay: data.workHoursPerDay,
          isDefault: data.isDefault,
          createdBy: user.id,
        },
      });

      await tx.auditLog.create({
        data: {
          action: "CREATE",
          entity: "MachineryRate",
          entityId: created.id,
          details: `Created rate "${created.rateName}" for machinery ${id}`,
          userId: user.id,
        },
      });

      return created;
    });

    return NextResponse.json({ success: true, data: rate }, { status: 201 });
  } catch (error) {
    console.error("Create machinery rate error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create rate" },
      { status: 500 }
    );
  }
}
