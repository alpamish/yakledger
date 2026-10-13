import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { APPROVED, REJECTED, APPROVAL_ENTITIES } from "@/lib/access-control";
import { ENTITY_CONFIG, applyWalletEffect } from "@/lib/approvals";
import { approveAndPostClaim, rejectClaim, ClaimError } from "@/services/contractor-claim.service";
import { recalculatePayrollsForAttendance } from "@/services/hr.service";

const actionSchema = z.object({
  action: z.enum(["approve", "reject"]),
  note: z.string().optional().nullable(),
});

// POST /api/approvals/[entity]/[id] - Approve or reject a pending record
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ entity: string; id: string }> }
) {
  try {
    const { entity, id } = await params;

    if (!APPROVAL_ENTITIES.has(entity) || !ENTITY_CONFIG[entity]) {
      return NextResponse.json({ success: false, error: "Unknown entity" }, { status: 400 });
    }

    const cfg = ENTITY_CONFIG[entity];
    const result = await requirePermission(request, cfg.permission);
    if ("status" in result) return result;
    const user = result.user;

    const body = await request.json();
    const parsed = actionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      );
    }

    const { action, note } = parsed.data;

    // Claims need their full posting flow (ledger + advance recovery), not the
    // generic approvalStatus update. Route through the claim service instead.
    if (entity === "contractorClaim") {
      try {
        const updated =
          action === "approve"
            ? await approveAndPostClaim(id, user.id, note ?? undefined)
            : await rejectClaim(id, user.id, note ?? undefined);
        return NextResponse.json({
          success: true,
          data: updated,
          message: action === "approve" ? "Claim approved and posted" : "Claim rejected",
        });
      } catch (err) {
        if (err instanceof ClaimError) {
          return NextResponse.json({ success: false, error: err.message }, { status: err.status });
        }
        throw err;
      }
    }

    const model = db[cfg.model as keyof typeof db] as unknown as {
      findUnique: (args: { where: { id: string } }) => Promise<Record<string, unknown> | null>;
      update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
    };

    const record = await model.findUnique({ where: { id } });
    if (!record) {
      return NextResponse.json({ success: false, error: "Record not found" }, { status: 404 });
    }

    if (record.approvalStatus === APPROVED) {
      return NextResponse.json({ success: false, error: "Record is already approved" }, { status: 400 });
    }

    const newStatus = action === "approve" ? APPROVED : REJECTED;

    const updated = await db.$transaction(async (tx) => {
      const txModel = tx[cfg.model as keyof typeof tx] as unknown as {
        update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
      };

      const result = await txModel.update({
        where: { id },
        data: {
          approvalStatus: newStatus,
          approvedById: user.id,
          approvedAt: new Date(),
          approvalNote: note ?? null,
        },
      });

      await tx.auditLog.create({
        data: {
          action: action === "approve" ? "APPROVE" : "REJECT",
          entity: cfg.auditEntity,
          entityId: id,
          details: `${action === "approve" ? "Approved" : "Rejected"} ${entity} ${id}${note ? ` - ${note}` : ""}`,
          userId: user.id,
        },
      });

      if (action === "approve") {
        await applyWalletEffect(entity, record, user.id, tx);
      }

      return result;
    });

    // Approving attendance through the queue has the same effect as editing
    // an approved record: the affected payrolls are brought up to date
    // (Plan-payroll.pdf §1 "Attendance & Hiring/Termination"). A failure here
    // must never fail the approval itself.
    if (entity === "attendance" && action === "approve") {
      const attendance = record as unknown as {
        employeeId?: string;
        date?: Date | string | null;
      };
      if (attendance.employeeId && attendance.date) {
        try {
          await recalculatePayrollsForAttendance({
            employeeId: attendance.employeeId,
            dates: [attendance.date],
            userId: user.id,
          });
        } catch (error) {
          console.error("Attendance payroll recalculation error:", error);
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: updated,
      message: action === "approve" ? "Record approved successfully" : "Record rejected",
    });
  } catch (error) {
    console.error("Approval action error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to process approval" },
      { status: 500 }
    );
  }
}
