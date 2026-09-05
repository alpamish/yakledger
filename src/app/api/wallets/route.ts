import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permissions";
import { companyWalletService } from "@/services/company-wallet.service";

export async function GET(request: NextRequest) {
  const result = await requirePermission(request, "wallets:view");
  if ("status" in result) return result;
  const user = result.user;
  try {
    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get("employeeId") || undefined;
    let wallets;
    if (employeeId) {
      wallets = await companyWalletService.listActiveForEmployee(employeeId);
    } else {
      wallets = await companyWalletService.listForUser(user.id, user.role);
    }
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
    const { name, type, currency, initialBalance, employeeIds, userIds } = body as {
      name?: string;
      type?: string;
      currency?: string;
      initialBalance?: number;
      employeeIds?: string[];
      userIds?: string[];
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
      employeeIds: Array.isArray(employeeIds) ? employeeIds : undefined,
      userIds: Array.isArray(userIds) ? userIds : undefined,
    });
    return NextResponse.json({ success: true, data: wallet });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Failed to create wallet" },
      { status: 400 }
    );
  }
}
