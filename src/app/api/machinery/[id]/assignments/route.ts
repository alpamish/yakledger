import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { buildAccessScope, withScope } from "@/lib/access-control";
import {
  applyTransfer,
  listAssignments,
  AssignmentError,
} from "@/services/machinery-assignment.service";

const transferSchema = z.object({
  contractorId: z.string().min(1, "Contractor is required"),
  startDate: z.string().min(1, "Start date is required"),
  contractId: z.string().optional().nullable(),
  projectName: z.string().max(300).optional().nullable(),
  transferredBy: z.string().min(1).max(200).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
});

// GET /api/machinery/[id]/assignments - transfer history, newest first
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

    const assignments = await listAssignments(id);
    return NextResponse.json({ success: true, data: assignments });
  } catch (error) {
    console.error("GET /api/machinery/[id]/assignments error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/machinery/[id]/assignments - transfer the machine to a contractor
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
      select: {
        id: true,
        assignedContractorId: true,
        contractStartDate: true,
        createdAt: true,
      },
    });
    if (!machinery) {
      return NextResponse.json({ success: false, error: "Machinery not found" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = transferSchema.safeParse(body);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((issue) => issue.message);
      return NextResponse.json(
        { success: false, error: errors.join(", ") },
        { status: 400 }
      );
    }

    // Validate the target contractor exists (and is a contractor).
    const contractor = await db.contractor.findUnique({
      where: { id: parsed.data.contractorId },
      select: { id: true },
    });
    if (!contractor) {
      return NextResponse.json(
        { success: false, error: "Contractor not found" },
        { status: 404 }
      );
    }
    if (parsed.data.contractId) {
      const contract = await db.contractorContract.findUnique({
        where: { id: parsed.data.contractId },
        select: { id: true, contractorId: true },
      });
      if (!contract || contract.contractorId !== parsed.data.contractorId) {
        return NextResponse.json(
          { success: false, error: "Contract does not belong to that contractor" },
          { status: 400 }
        );
      }
    }

    const assignment = await db.$transaction(async (tx: any) =>
      applyTransfer(
        tx,
        machinery,
        {
          contractorId: parsed.data.contractorId,
          startDate: new Date(parsed.data.startDate),
          contractId: parsed.data.contractId ?? null,
          projectName: parsed.data.projectName ?? null,
          transferredBy: parsed.data.transferredBy ?? null,
          notes: parsed.data.notes ?? null,
        },
        { userId: user.id, userName: user.name }
      )
    );

    const full = await listAssignments(id);
    return NextResponse.json(
      { success: true, data: { assignment, assignments: full } },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof AssignmentError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      );
    }
    console.error("POST /api/machinery/[id]/assignments error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
