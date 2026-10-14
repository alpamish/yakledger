import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { buildAccessScope, withScope } from "@/lib/access-control";
import {
  updateAssignment,
  endAssignment,
  AssignmentError,
} from "@/services/machinery-assignment.service";

const updateAssignmentSchema = z.object({
  startDate: z.string().min(1).optional().nullable(),
  endDate: z.string().min(1).nullable().optional(),
  contractId: z.string().optional().nullable(),
  projectName: z.string().max(300).optional().nullable(),
  transferredBy: z.string().min(1).max(200).optional(),
  notes: z.string().max(5000).optional().nullable(),
});

// PUT /api/machinery/[id]/assignments/[assignmentId] - edit dates/context or
// close an assignment (set endDate). History rows are never deleted.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; assignmentId: string }> }
) {
  try {
    const result = await requirePermission(request, "machinery:edit");
    if ("status" in result) return result;
    const user = result.user;

    const { id, assignmentId } = await params;
    const scope = await buildAccessScope(user, "machinery");
    const machinery = await db.machinery.findFirst({
      where: withScope({ id }, scope),
      select: { id: true },
    });
    if (!machinery) {
      return NextResponse.json({ success: false, error: "Machinery not found" }, { status: 404 });
    }

    const assignment = await db.machineryAssignment.findUnique({
      where: { id: assignmentId },
      select: { id: true, machineryId: true },
    });
    if (!assignment || assignment.machineryId !== id) {
      return NextResponse.json(
        { success: false, error: "Assignment not found" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const parsed = updateAssignmentSchema.safeParse(body);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((issue) => issue.message);
      return NextResponse.json(
        { success: false, error: errors.join(", ") },
        { status: 400 }
      );
    }
    const data = parsed.data;

    // Pure close: endDate only → dedicated path recomputes the pointer.
    const onlyClosing =
      data.endDate !== undefined &&
      data.startDate === undefined &&
      data.contractId === undefined &&
      data.projectName === undefined &&
      data.transferredBy === undefined &&
      data.notes === undefined;

    let updated;
    if (onlyClosing && data.endDate) {
      updated = await endAssignment(assignmentId, new Date(data.endDate), {
        userId: user.id,
        userName: user.name,
      });
    } else {
      updated = await updateAssignment(assignmentId, {
        ...(data.startDate ? { startDate: new Date(data.startDate) } : {}),
        ...(data.endDate !== undefined
          ? { endDate: data.endDate ? new Date(data.endDate) : null }
          : {}),
        ...(data.contractId !== undefined ? { contractId: data.contractId } : {}),
        ...(data.projectName !== undefined ? { projectName: data.projectName } : {}),
        ...(data.transferredBy ? { transferredBy: data.transferredBy } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
      });
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    if (error instanceof AssignmentError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      );
    }
    console.error("PUT /api/machinery/[id]/assignments/[assignmentId] error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
