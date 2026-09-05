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
    const hasAccess = await companyWalletService.hasUserAccess(id, user.id, user.role);
    if (!hasAccess) {
      return NextResponse.json(
        { success: false, error: "You do not have access to this wallet" },
        { status: 403 }
      );
    }
    const body = await request.json();
    const { amount, note } = body as { amount?: number; note?: string };
    if (typeof amount !== "number" || amount <= 0) {
      return NextResponse.json(
        { success: false, error: "A positive amount is required" },
        { status: 400 }
      );
    }
    const wallet = await companyWalletService.fund(id, amount, user.id, note);
    return NextResponse.json({ success: true, data: wallet });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Failed to fund wallet" },
      { status: 400 }
    );
  }
}
