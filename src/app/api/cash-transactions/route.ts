import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { walletService } from "@/services/wallet.service";

const createTransactionSchema = z.object({
  employeeId: z.string().min(1, "Employee is required"),
  type: z.enum(["ADVANCE", "RETURN", "ADJUSTMENT"]),
  amount: z.number().positive("Amount must be positive"),
  note: z.string().optional().nullable(),
  referenceNumber: z.string().optional().nullable(),
});

export async function GET(request: NextRequest) {
  try {
    const result = await requirePermission(request, "cashAdvance:view");
    if ("status" in result) return result;

    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get("employeeId");
    const type = searchParams.get("type");

    const where: Record<string, unknown> = {};
    if (employeeId) where.employeeId = employeeId;
    if (type) where.type = type;

    const transactions = await db.cashTransaction.findMany({
      where,
      include: {
        employee: { select: { id: true, fullName: true, jobTitle: true, department: true } },
        creator: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: transactions });
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
        transaction = await walletService.createAdvance(data.employeeId, data.amount, user.id, data.note ?? undefined, data.referenceNumber ?? undefined);
        break;
      case "RETURN":
        transaction = await walletService.createReturn(data.employeeId, data.amount, user.id, data.note ?? undefined, data.referenceNumber ?? undefined);
        break;
      case "ADJUSTMENT":
        transaction = await walletService.createAdjustment(data.employeeId, data.amount, user.id, data.note ?? undefined);
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
