import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { buildAccessScope, withScope } from "@/lib/access-control";
import {
  createDowntime,
  listDowntime,
  DowntimeError,
} from "@/services/machinery-downtime.service";

const createDowntimeSchema = z.object({
  start: z.string().min(1, "Start time is required"),
  end: z.string().min(1).optional().nullable(),
  reason: z.string().min(1, "Reason is required").max(500),
  chargeable: z.boolean().optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  loggedBy: z.string().min(1).max(200).optional().nullable(),
});

// GET /api/machinery/[id]/downtime - downtime records, filterable by range
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
    const chargeable = searchParams.get("chargeable");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const pageSize = Math.min(
      200,
      Math.max(1, parseInt(searchParams.get("pageSize") || "50", 10) || 50)
    );

    const where: Record<string, unknown> = { machineryId: id };
    if (from || to) {
      const start: Record<string, unknown> = {};
      if (from) start.gte = new Date(from);
      if (to) start.lte = new Date(to);
      where.start = start;
    }
    if (chargeable === "true") where.chargeable = true;
    else if (chargeable === "false") where.chargeable = false;

    const data = await listDowntime({ where, page, pageSize });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("GET /api/machinery/[id]/downtime error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/machinery/[id]/downtime - record a breakdown/stoppage
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
    const parsed = createDowntimeSchema.safeParse(body);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((issue) => issue.message);
      return NextResponse.json(
        { success: false, error: errors.join(", ") },
        { status: 400 }
      );
    }

    const record = await createDowntime({
      machineryId: id,
      start: new Date(parsed.data.start),
      end: parsed.data.end ? new Date(parsed.data.end) : null,
      reason: parsed.data.reason,
      chargeable: parsed.data.chargeable ?? null,
      notes: parsed.data.notes ?? null,
      loggedBy: parsed.data.loggedBy ?? user.name,
      userId: user.id,
    });

    return NextResponse.json({ success: true, data: record }, { status: 201 });
  } catch (error) {
    if (error instanceof DowntimeError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      );
    }
    console.error("POST /api/machinery/[id]/downtime error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
