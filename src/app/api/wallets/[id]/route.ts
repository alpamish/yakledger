import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permissions";
import { companyWalletService } from "@/services/company-wallet.service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requirePermission(request, "wallets:view");
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
    const wallet = await companyWalletService.get(id);
    if (!wallet) {
      return NextResponse.json(
        { success: false, error: "Wallet not found" },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, data: wallet });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Failed to load wallet" },
      { status: 500 }
    );
  }
}

export async function PATCH(
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
    const { name, type, currency, isActive, employeeIds, userIds } = body as {
      name?: string;
      type?: string;
      currency?: string;
      isActive?: boolean;
      employeeIds?: string[];
      userIds?: string[];
    };
    const data: any = {};
    if (typeof name === "string" && name.trim()) data.name = name.trim();
    if (typeof type === "string") data.type = type;
    if (typeof currency === "string" && currency.trim()) data.currency = currency;
    if (typeof isActive === "boolean") data.isActive = isActive;
    if (Array.isArray(employeeIds)) data.employeeIds = employeeIds;
    if (Array.isArray(userIds)) data.userIds = userIds;
    const wallet = await companyWalletService.update(id, data);
    return NextResponse.json({ success: true, data: wallet });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Failed to update wallet" },
      { status: 400 }
    );
  }
}

export async function DELETE(
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
    await companyWalletService.setActive(id, false);
    return NextResponse.json({ success: true, message: "Wallet deactivated" });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Failed to deactivate wallet" },
      { status: 400 }
    );
  }
}
