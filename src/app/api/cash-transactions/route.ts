import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { walletService } from "@/services/wallet.service";
import { buildListScope, withScope } from "@/lib/access-control";
import { ALLOCATING_PAYROLL_STATUSES, PAYROLL_PAYMENT_METHODS } from "@/lib/payroll-status";
import { fromMinor } from "@/lib/money";

const createTransactionSchema = z.object({
  employeeId: z.string().min(1, "Employee is required"),
  type: z.enum(["ADVANCE", "RETURN", "ADJUSTMENT"]),
  amount: z.number().positive("Amount must be positive"),
  note: z.string().optional().nullable(),
  referenceNumber: z.string().optional().nullable(),
  dueDate: z.coerce.date().optional().nullable(),
  // Recorded when the advance is paid (Plan-payroll.pdf §2 action 5).
  paymentMethod: z.enum(PAYROLL_PAYMENT_METHODS).optional().nullable(),
  walletId: z.string().optional().nullable(),
});

export async function GET(request: NextRequest) {
  try {
    const result = await requirePermission(request, "cashAdvance:view");
    if ("status" in result) return result;
    const user = result.user;

    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get("employeeId");
    const type = searchParams.get("type");

    const where: Record<string, unknown> = {};
    if (employeeId) where.employeeId = employeeId;
    if (type) where.type = type;

    const scope = await buildListScope(user, "cashTransaction");
    const scopedWhere = withScope(where, scope);

    const transactions = await db.cashTransaction.findMany({
      where: scopedWhere,
      include: {
        employee: { select: { id: true, fullName: true, jobTitle: true, department: true } },
        creator: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    // Outstanding balance per advance: total minus what live (approved /
    // partially paid / paid) payrolls have already allocated from it.
    const allocated = await db.payrollAdvanceAllocation.groupBy({
      by: ["cashTransactionId"],
      _sum: { amountMinor: true },
      where: {
        payroll: { status: { in: [...ALLOCATING_PAYROLL_STATUSES] } },
        cashTransaction: { type: "ADVANCE" },
      },
    });
    const allocatedByTxn = new Map(
      allocated.map((a) => [a.cashTransactionId, fromMinor(a._sum.amountMinor ?? 0)])
    );

    const data = transactions.map((t) => ({
      ...t,
      allocatedAmount: t.type === "ADVANCE" ? allocatedByTxn.get(t.id) ?? 0 : 0,
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Get cash transactions error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch transactions" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const result = await requirePermission(request, "cashAdvance:create");
    if ("status" in result) return result;
    const user = result.user;

    const body = await request.json();
    const parsed = createTransactionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      );
    }

    const data = parsed.data;
    let transaction;

    switch (data.type) {
      case "ADVANCE":
        transaction = await walletService.createAdvance(data.employeeId, data.amount, user, {
          note: data.note ?? undefined,
          referenceNumber: data.referenceNumber ?? undefined,
          dueDate: data.dueDate ?? undefined,
          paymentMethod: data.paymentMethod ?? undefined,
          walletId: data.walletId ?? undefined,
        });
        break;
      case "RETURN":
        transaction = await walletService.createReturn(data.employeeId, data.amount, user, data.note ?? undefined, data.referenceNumber ?? undefined);
        break;
      case "ADJUSTMENT":
        transaction = await walletService.createAdjustment(data.employeeId, data.amount, user, data.note ?? undefined);
        break;
    }

    return NextResponse.json({ success: true, data: transaction, message: "Transaction created successfully" }, { status: 201 });
  } catch (error) {
    console.error("Create cash transaction error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to create transaction" },
      { status: 500 }
    );
  }
}
