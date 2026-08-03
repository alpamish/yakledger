import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { walletService } from "@/services/wallet.service";
import { buildAccessScope, withScope, APPROVED } from "@/lib/access-control";

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
      where: withScope({ id }, await buildAccessScope(user, "cashTransaction")),
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
      try {
        if (existing.type === "ADVANCE" || existing.type === "ADJUSTMENT") {
          await walletService.deductFromWallet(existing.employeeId, existing.amount, user.id);
        } else if (existing.type === "RETURN") {
          await walletService.addBackToWallet(existing.employeeId, existing.amount, user.id);
        }
      } catch (walletErr) {
        console.warn("Wallet adjustment on cash transaction delete failed:", walletErr);
      }
    }

    return NextResponse.json({ success: true, message: "Transaction deleted successfully" });
  } catch (error) {
    console.error("Delete cash transaction error:", error);
    return NextResponse.json({ success: false, error: "Failed to delete transaction" }, { status: 500 });
  }
}
