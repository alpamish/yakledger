import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { buildAccessScope, withScope } from "@/lib/access-control";
import {
  createDailyLog,
  listDailyLogs,
  DailyLogError,
} from "@/services/machinery-log.service";

const HOURS = z.number().min(0).max(24);

const createDailyLogSchema = z.object({
  date: z.string().min(1, "Date is required"),
  contractId: z.string().optional().nullable(),
  openingMeter: z.number().min(0, "Opening meter must be non-negative"),
  closingMeter: z.number().min(0, "Closing meter must be non-negative"),
  normalHours: HOURS.default(0),
  overtimeHours: HOURS.default(0),
  idleHours: HOURS.default(0),
  breakdownHours: HOURS.default(0),
  weather: z.string().max(100).optional().nullable(),
  delayReason: z.string().max(1000).optional().nullable(),
  operator: z.string().max(200).optional().nullable(),
  loggedBy: z.string().min(1).max(200).optional().nullable(),
});

// GET /api/machinery/[id]/daily-logs - operating logs, filterable by date
// range and flagged status
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await requirePermission(request, "machinery:view");
    if ("status" in result) return result;
    const user = result.user;

    const { id } = await params;
    const scope = await buildAccessScope(user, "machinery");
    const machinery = await db.machinery.findFirst({
      where: withScope({ id }, scope),
      select: { id: true },
    });
    if (!machinery) {
      return NextResponse.json({ success: false, error: "Machinery not found" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const flagged = searchParams.get("flagged");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const pageSize = Math.min(
      200,
      Math.max(1, parseInt(searchParams.get("pageSize") || "50", 10) || 50)
    );

    const where: Record<string, unknown> = { machineryId: id };
    if (from || to) {
      const date: Record<string, unknown> = {};
      if (from) date.gte = new Date(from);
      if (to) date.lte = new Date(to);
      where.date = date;
    }
    if (flagged === "true") where.flagged = true;
    else if (flagged === "false") where.flagged = false;

    const data = await listDailyLogs({ where, page, pageSize });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("GET /api/machinery/[id]/daily-logs error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/machinery/[id]/daily-logs - record a day's operating log
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await requirePermission(request, "machinery:create");
    if ("status" in result) return result;
    const user = result.user;

    const { id } = await params;
    const scope = await buildAccessScope(user, "machinery");
    const machinery = await db.machinery.findFirst({
      where: withScope({ id }, scope),
      select: { id: true },
    });
    if (!machinery) {
      return NextResponse.json({ success: false, error: "Machinery not found" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = createDailyLogSchema.safeParse(body);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((issue) => issue.message);
      return NextResponse.json(
        { success: false, error: errors.join(", ") },
        { status: 400 }
      );
    }

    if (parsed.data.contractId) {
      const contract = await db.contractorContract.findUnique({
        where: { id: parsed.data.contractId },
        select: { id: true },
      });
      if (!contract) {
        return NextResponse.json(
          { success: false, error: "Contract not found" },
          { status: 404 }
        );
      }
    }

    const log = await createDailyLog({
      machineryId: id,
      contractId: parsed.data.contractId ?? null,
      date: new Date(parsed.data.date),
      openingMeter: parsed.data.openingMeter,
      closingMeter: parsed.data.closingMeter,
      normalHours: parsed.data.normalHours,
      overtimeHours: parsed.data.overtimeHours,
      idleHours: parsed.data.idleHours,
      breakdownHours: parsed.data.breakdownHours,
      weather: parsed.data.weather ?? null,
      delayReason: parsed.data.delayReason ?? null,
      operator: parsed.data.operator ?? null,
      loggedBy: parsed.data.loggedBy ?? user.name,
      userId: user.id,
    });

    return NextResponse.json({ success: true, data: log }, { status: 201 });
  } catch (error) {
    if (error instanceof DailyLogError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      );
    }
    console.error("POST /api/machinery/[id]/daily-logs error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
