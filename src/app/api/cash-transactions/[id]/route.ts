import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { walletService } from "@/services/wallet.service";
import { applyAdvanceEditToPayrolls } from "@/services/hr.service";
import { buildAccessScope, buildListScope, withScope, APPROVED } from "@/lib/access-control";
import { PAYROLL_PAYMENT_METHODS } from "@/lib/payroll-status";

const updateAdvanceSchema = z.object({
  amount: z.number().positive("Amount must be positive").optional(),
  note: z.string().optional().nullable(),
  referenceNumber: z.string().optional().nullable(),
  dueDate: z.coerce.date().optional().nullable(),
  paymentMethod: z.enum(PAYROLL_PAYMENT_METHODS).optional().nullable(),
  walletId: z.string().optional().nullable(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await requirePermission(request, "cashAdvance:view");
    if ("status" in result) return result;
    const user = result.user;

    const { id } = await params;
    const transaction = await db.cashTransaction.findFirst({
      where: withScope({ id }, await buildListScope(user, "cashTransaction")),
      include: {
        employee: { select: { id: true, fullName: true, jobTitle: true, department: true } },
        creator: { select: { id: true, name: true } },
      },
    });

    if (!transaction) {
      return NextResponse.json({ success: false, error: "Transaction not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: transaction });
  } catch (error) {
    console.error("Get cash transaction error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch transaction" }, { status: 500 });
  }
}

/**
 * Edit a cash advance (Plan-payroll.pdf §2 action 3). Editing a paid advance
 * is explicitly allowed for authorized users; amount changes recalculate the
 * affected unpaid payrolls and post an adjustment for paid ones (action 4).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await requirePermission(request, "cashAdvance:edit");
    if ("status" in result) return result;
    const user = result.user;

    const { id } = await params;
    const scope = await buildAccessScope(user, "cashTransaction");
    const existing = await db.cashTransaction.findFirst({
      where: withScope({ id }, scope),
    });

    if (!existing) {
      return NextResponse.json({ success: false, error: "Transaction not found" }, { status: 404 });
    }
    if (existing.type !== "ADVANCE") {
      return NextResponse.json(
        { success: false, error: "Only cash advances can be edited" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const parsed = updateAdvanceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      );
    }

    const { transaction, amountChanged, oldAmountMinor, newAmountMinor } =
      await walletService.updateAdvance(id, user, parsed.data);

    let payrollEffect = { recalculated: [] as string[], adjustments: [] as string[] };
    if (amountChanged) {
      payrollEffect = await applyAdvanceEditToPayrolls({
        advanceId: id,
        employeeId: existing.employeeId,
        oldAmountMinor,
        newAmountMinor,
        userId: user.id,
      });
    }

    return NextResponse.json({
      success: true,
      data: transaction,
      payroll: payrollEffect,
      message: "Advance updated successfully",
    });
  } catch (error) {
    console.error("Update cash transaction error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to update transaction" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await requirePermission(request, "cashAdvance:delete");
    if ("status" in result) return result;
    const user = result.user;

    const { id } = await params;
    const scope = await buildAccessScope(user, "cashTransaction");
    const existing = await db.cashTransaction.findFirst({
      where: withScope({ id }, scope),
    });

    if (!existing) {
      return NextResponse.json({ success: false, error: "Transaction not found" }, { status: 404 });
    }

    // Paid advances cannot be deleted (Plan-payroll.pdf §2 action 3) — they
    // can only be edited. Deleting one would silently cascade away the payroll
    // allocations that recorded real deductions.
    if (existing.type === "ADVANCE" && existing.approvalStatus === APPROVED) {
      return NextResponse.json(
        { success: false, error: "Paid advances cannot be deleted. Edit the advance instead." },
        { status: 409 }
      );
    }

    await db.$transaction(async (tx) => {
      await tx.auditLog.create({
        data: {
          action: "DELETE",
          entity: "CashTransaction",
          entityId: id,
          details: `Deleted cash transaction: ${existing.type} ${existing.amount}`,
          userId: user.id,
        },
      });

      await tx.cashTransaction.delete({ where: { id } });
    });

    if (existing.approvalStatus === APPROVED) {
      // The row itself is gone, so the derived balance simply needs a refresh
      // (no compensating entry — that would double count).
      try {
        await walletService.recomputeBalance(existing.employeeId);
      } catch (walletErr) {
        console.warn("Wallet recompute on cash transaction delete failed:", walletErr);
      }
    }

    return NextResponse.json({ success: true, message: "Transaction deleted successfully" });
  } catch (error) {
    console.error("Delete cash transaction error:", error);
    return NextResponse.json({ success: false, error: "Failed to delete transaction" }, { status: 500 });
  }
}
