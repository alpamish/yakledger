import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permissions";
import { companyWalletService } from "@/services/company-wallet.service";

export async function GET(request: NextRequest) {
  const result = await requirePermission(request, "wallets:view");
  if ("status" in result) return result;
  try {
    const wallets = await companyWalletService.list();
    return NextResponse.json({ success: true, data: wallets });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Failed to load wallets" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const result = await requirePermission(request, "wallets:manage");
  if ("status" in result) return result;
  const user = result.user;
  try {
    const body = await request.json();
    const { name, type, currency, initialBalance } = body as {
      name?: string;
      type?: string;
      currency?: string;
      initialBalance?: number;
    };
    if (!name || !name.trim()) {
      return NextResponse.json(
        { success: false, error: "Wallet name is required" },
        { status: 400 }
      );
    }
    const wallet = await companyWalletService.create({
      name: name.trim(),
      type,
      currency,
      initialBalance: typeof initialBalance === "number" ? initialBalance : 0,
      createdBy: user.id,
    });
    return NextResponse.json({ success: true, data: wallet });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Failed to create wallet" },
      { status: 400 }
    );
  }
}