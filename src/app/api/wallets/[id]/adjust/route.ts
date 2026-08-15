import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permissions";
import { companyWalletService } from "@/services/company-wallet.service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requirePermission(request, "wallets:manage");
  if ("status" in result) return result;
  const user = result.user;
  const { id } = await params;
  try {
    const body = await request.json();
    const { amount, note } = body as { amount?: number; note?: string };
    if (typeof amount !== "number" || amount === 0) {
      return NextResponse.json(
        { success: false, error: "A non-zero amount is required" },
        { status: 400 }
      );
    }
    const wallet = await companyWalletService.adjust(id, amount, user.id, note);
    return NextResponse.json({ success: true, data: wallet });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Failed to adjust wallet" },
      { status: 400 }
    );
  }
}