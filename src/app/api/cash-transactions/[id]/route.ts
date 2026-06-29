import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await requirePermission(request, "cashAdvance:view");
    if ("status" in result) return result;

    const { id } = await params;
    const transaction = await db.cashTransaction.findUnique({
      where: { id },
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
    const existing = await db.cashTransaction.findUnique({ where: { id } });

    if (!existing) {
      return NextResponse.json({ success: false, error: "Transaction not found" }, { status: 404 });
    }

    await db.auditLog.create({
      data: {
        action: "DELETE",
        entity: "CashTransaction",
        entityId: id,
        details: `Deleted cash transaction: ${existing.type} ${existing.amount}`,
        userId: user.id,
      },
    });

    await db.cashTransaction.delete({ where: { id } });

    return NextResponse.json({ success: true, message: "Transaction deleted successfully" });
  } catch (error) {
    console.error("Delete cash transaction error:", error);
    return NextResponse.json({ success: false, error: "Failed to delete transaction" }, { status: 500 });
  }
}
