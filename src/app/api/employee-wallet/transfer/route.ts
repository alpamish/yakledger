import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { walletService } from "@/services/wallet.service";

const createTransferSchema = z.object({
  fromEmployeeId: z.string().min(1, "Source employee is required"),
  toEmployeeId: z.string().min(1, "Destination employee is required"),
  amount: z.number().positive("Amount must be positive"),
  note: z.string().optional().nullable(),
});

export async function GET(request: NextRequest) {
  try {
    const result = await requirePermission(request, "cashAdvance:view");
    if ("status" in result) return result;

    const transfers = await db.transfer.findMany({
      include: {
        fromEmployee: { select: { id: true, fullName: true } },
        toEmployee: { select: { id: true, fullName: true } },
        creator: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: transfers });
  } catch (error) {
    console.error("Get transfers error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch transfers" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const result = await requirePermission(request, "cashAdvance:create");
    if ("status" in result) return result;
    const user = result.user;

    const body = await request.json();
    const parsed = createTransferSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      );
    }

    const data = parsed.data;

    if (data.fromEmployeeId === data.toEmployeeId) {
      return NextResponse.json(
        { success: false, error: "Cannot transfer to the same employee" },
        { status: 400 }
      );
    }

    const transfer = await walletService.createTransfer(
      data.fromEmployeeId,
      data.toEmployeeId,
      data.amount,
      user.id,
      data.note ?? undefined,
    );

    return NextResponse.json({ success: true, data: transfer, message: "Transfer completed successfully" }, { status: 201 });
  } catch (error) {
    console.error("Create transfer error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to create transfer" },
      { status: 500 }
    );
  }
}
