import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { buildAccessScope, withScope } from "@/lib/access-control";
import {
  updateDowntime,
  deleteDowntime,
  DowntimeError,
} from "@/services/machinery-downtime.service";

const updateDowntimeSchema = z.object({
  start: z.string().min(1).optional(),
  end: z.string().min(1).nullable().optional(),
  reason: z.string().min(1).max(500).optional(),
  chargeable: z.boolean().optional(),
  notes: z.string().max(5000).optional().nullable(),
});

async function findRecord(id: string, recordId: string, user: { id: string; role: string }) {
  const scope = await buildAccessScope(user, "machinery");
  const machinery = await db.machinery.findFirst({
    where: withScope({ id }, scope),
    select: { id: true },
  });
  if (!machinery) return null;
  const record = await db.downtimeRecord.findUnique({
    where: { id: recordId },
    select: { id: true, machineryId: true },
  });
  if (!record || record.machineryId !== id) return null;
  return record;
}

// PUT /api/machinery/[id]/downtime/[recordId]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; recordId: string }> }
) {
  try {
    const result = await requirePermission(request, "machinery:edit");
    if ("status" in result) return result;
    const user = result.user;

    const { id, recordId } = await params;
    const record = await findRecord(id, recordId, user);
    if (!record) {
      return NextResponse.json(
        { success: false, error: "Downtime record not found" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const parsed = updateDowntimeSchema.safeParse(body);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((issue) => issue.message);
      return NextResponse.json(
        { success: false, error: errors.join(", ") },
        { status: 400 }
      );
    }
    const d = parsed.data;

    const updated = await updateDowntime(recordId, {
      ...(d.start ? { start: new Date(d.start) } : {}),
      ...(d.end !== undefined ? { end: d.end ? new Date(d.end) : null } : {}),
      ...(d.reason !== undefined ? { reason: d.reason } : {}),
      ...(d.chargeable !== undefined ? { chargeable: d.chargeable } : {}),
      ...(d.notes !== undefined ? { notes: d.notes } : {}),
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    if (error instanceof DowntimeError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      );
    }
    console.error("PUT /api/machinery/[id]/downtime/[recordId] error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/machinery/[id]/downtime/[recordId]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; recordId: string }> }
) {
  try {
    const result = await requirePermission(request, "machinery:edit");
    if ("status" in result) return result;
    const user = result.user;

    const { id, recordId } = await params;
    const record = await findRecord(id, recordId, user);
    if (!record) {
      return NextResponse.json(
        { success: false, error: "Downtime record not found" },
        { status: 404 }
      );
    }

    await deleteDowntime(recordId);
    return NextResponse.json({ success: true, data: { id: recordId } });
  } catch (error) {
    if (error instanceof DowntimeError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      );
    }
    console.error("DELETE /api/machinery/[id]/downtime/[recordId] error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
