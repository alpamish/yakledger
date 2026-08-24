import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permissions";
import { companyWalletService } from "@/services/company-wallet.service";

// GET /api/wallets/transactions - List wallet transactions with filtering and pagination
export async function GET(request: NextRequest) {
  const result = await requirePermission(request, "wallets:view");
  if ("status" in result) return result;
  try {
    const { searchParams } = new URL(request.url);
    const data = await companyWalletService.listTransactions({
      walletId: searchParams.get("walletId") || undefined,
      type: searchParams.get("type") || undefined,
      from: searchParams.get("from") || undefined,
      to: searchParams.get("to") || undefined,
      search: searchParams.get("search") || undefined,
      page: searchParams.get("page") ? parseInt(searchParams.get("page")!) : undefined,
      pageSize: searchParams.get("pageSize") ? parseInt(searchParams.get("pageSize")!) : undefined,
    });
    return NextResponse.json({ success: true, data });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Failed to load transactions" },
      { status: 500 }
    );
  }
}
