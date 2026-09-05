import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permissions";
import { companyWalletService } from "@/services/company-wallet.service";

// GET /api/wallets/transactions - List wallet transactions with filtering and pagination
export async function GET(request: NextRequest) {
  const result = await requirePermission(request, "wallets:view");
  if ("status" in result) return result;
  const user = result.user;
  try {
    const { searchParams } = new URL(request.url);
    const walletId = searchParams.get("walletId") || undefined;

    if (walletId) {
      const hasAccess = await companyWalletService.hasUserAccess(walletId, user.id, user.role);
      if (!hasAccess) {
        return NextResponse.json(
          { success: false, error: "You do not have access to this wallet" },
          { status: 403 }
        );
      }
    }

    let allowedWalletIds: string[] | undefined;
    if (!walletId) {
      const wallets = await companyWalletService.listForUser(user.id, user.role);
      const ids = wallets.map((w) => w.id);
      if (ids.length === 0) {
        return NextResponse.json({ success: true, data: { data: [], total: 0, page: 1, pageSize: 20, totalPages: 0 } });
      }
      allowedWalletIds = ids;
    }

    const data = await companyWalletService.listTransactions({
      walletId: walletId || undefined,
      allowedWalletIds,
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
