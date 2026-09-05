import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/permissions";
import { walletService } from "@/services/wallet.service";

const createTransferToWalletSchema = z.object({
  employeeId: z.string().min(1, "Employee is required"),
  walletId: z.string().min(1, "Wallet is required"),
  amount: z.number().positive("Amount must be positive"),
  note: z.string().optional().nullable(),
  force: z.boolean().optional().default(false),
});

export async function POST(request: NextRequest) {
  try {
    const cashResult = await requirePermission(request, "cashAdvance:create");
    if ("status" in cashResult) return cashResult;
    const walletResult = await requirePermission(request, "wallets:manage");
    if ("status" in walletResult) return walletResult;
    const user = walletResult.user;

    const body = await request.json();
    const parsed = createTransferToWalletSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      );
    }

    const data = parsed.data;

    const txn = await walletService.transferToCompanyWallet(
      data.employeeId,
      data.walletId,
      data.amount,
      user,
      data.note ?? undefined,
      data.force,
    );

    return NextResponse.json(
      { success: true, data: txn, message: "Cash transferred to wallet" },
      { status: 201 }
    );
  } catch (error) {
    console.error("Transfer to wallet error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to transfer cash to wallet" },
      { status: 500 }
    );
  }
}
