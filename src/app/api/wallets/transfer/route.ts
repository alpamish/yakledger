import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permissions";
import { companyWalletService } from "@/services/company-wallet.service";

export async function POST(request: NextRequest) {
  const result = await requirePermission(request, "wallets:manage");
  if ("status" in result) return result;
  const user = result.user;
  try {
    const body = await request.json();
    const { fromWalletId, toWalletId, amount, note } = body as {
      fromWalletId?: string;
      toWalletId?: string;
      amount?: number;
      note?: string;
    };
    if (!fromWalletId || !toWalletId) {
      return NextResponse.json(
        { success: false, error: "Source and target wallets are required" },
        { status: 400 }
      );
    }
    if (typeof amount !== "number" || amount <= 0) {
      return NextResponse.json(
        { success: false, error: "A positive amount is required" },
        { status: 400 }
      );
    }
    const [fromAccess, toAccess] = await Promise.all([
      companyWalletService.hasUserAccess(fromWalletId, user.id, user.role),
      companyWalletService.hasUserAccess(toWalletId, user.id, user.role),
    ]);
    if (!fromAccess || !toAccess) {
      return NextResponse.json(
        { success: false, error: "You do not have access to one or both wallets" },
        { status: 403 }
      );
    }
    await companyWalletService.transfer(
      fromWalletId,
      toWalletId,
      amount,
      user.id,
      note
    );
    return NextResponse.json({ success: true, message: "Transfer completed" });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Transfer failed" },
      { status: 400 }
    );
  }
}
