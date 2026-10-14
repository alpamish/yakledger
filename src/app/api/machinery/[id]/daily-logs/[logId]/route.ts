import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { buildAccessScope, withScope } from "@/lib/access-control";
import {
  updateDailyLog,
  deleteDailyLog,
  DailyLogError,
} from "@/services/machinery-log.service";

const HOURS = z.number().min(0).max(24);

const updateDailyLogSchema = z.object({
  date: z.string().min(1).optional(),
  contractId: z.string().optional().nullable(),
  openingMeter: z.number().min(0).optional(),
  closingMeter: z.number().min(0).optional(),
  normalHours: HOURS.optional(),
  overtimeHours: HOURS.optional(),
  idleHours: HOURS.optional(),
  breakdownHours: HOURS.optional(),
  weather: z.string().max(100).optional().nullable(),
  delayReason: z.string().max(1000).optional().nullable(),
  operator: z.string().max(200).optional().nullable(),
});

async function findLog(id: string, logId: string, user: { id: string; role: string }) {
  const scope = await buildAccessScope(user, "machinery");
  const machinery = await db.machinery.findFirst({
    where: withScope({ id }, scope),
    select: { id: true },
  });
  if (!machinery) return null;
  const log = await db.machineryDailyLog.findUnique({
    where: { id: logId },
    select: { id: true, machineryId: true },
  });
  if (!log || log.machineryId !== id) return null;
  return log;
}

// PUT /api/machinery/[id]/daily-logs/[logId] - edit readings (revalidates
// and recomputes the review flag)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; logId: string }> }
) {
  try {
    const result = await requirePermission(request, "machinery:edit");
    if ("status" in result) return result;
    const user = result.user;

    const { id, logId } = await params;
    const log = await findLog(id, logId, user);
    if (!log) {
      return NextResponse.json(
        { success: false, error: "Daily log not found" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const parsed = updateDailyLogSchema.safeParse(body);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((issue) => issue.message);
      return NextResponse.json(
        { success: false, error: errors.join(", ") },
        { status: 400 }
      );
    }
    const d = parsed.data;

    const updated = await updateDailyLog(logId, {
      ...(d.date ? { date: new Date(d.date) } : {}),
      ...(d.contractId !== undefined ? { contractId: d.contractId } : {}),
      ...(d.openingMeter !== undefined ? { openingMeter: d.openingMeter } : {}),
      ...(d.closingMeter !== undefined ? { closingMeter: d.closingMeter } : {}),
      ...(d.normalHours !== undefined ? { normalHours: d.normalHours } : {}),
      ...(d.overtimeHours !== undefined ? { overtimeHours: d.overtimeHours } : {}),
      ...(d.idleHours !== undefined ? { idleHours: d.idleHours } : {}),
      ...(d.breakdownHours !== undefined ? { breakdownHours: d.breakdownHours } : {}),
      ...(d.weather !== undefined ? { weather: d.weather } : {}),
      ...(d.delayReason !== undefined ? { delayReason: d.delayReason } : {}),
      ...(d.operator !== undefined ? { operator: d.operator } : {}),
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    if (error instanceof DailyLogError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      );
    }
    console.error("PUT /api/machinery/[id]/daily-logs/[logId] error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/machinery/[id]/daily-logs/[logId]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; logId: string }> }
) {
  try {
    const result = await requirePermission(request, "machinery:edit");
    if ("status" in result) return result;
    const user = result.user;

    const { id, logId } = await params;
    const log = await findLog(id, logId, user);
    if (!log) {
      return NextResponse.json(
        { success: false, error: "Daily log not found" },
        { status: 404 }
      );
    }

    await deleteDailyLog(logId);
    return NextResponse.json({ success: true, data: { id: logId } });
  } catch (error) {
    if (error instanceof DailyLogError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      );
    }
    console.error("DELETE /api/machinery/[id]/daily-logs/[logId] error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
