import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permissions";
import { walletService } from "@/services/wallet.service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ employeeId: string }> }
) {
  try {
    const result = await requirePermission(request, "cashAdvance:view");
    if ("status" in result) return result;

    const { employeeId } = await params;
    const ledger = await walletService.getLedger(employeeId);

    return NextResponse.json({ success: true, data: ledger });
  } catch (error) {
    console.error("Get employee ledger error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch ledger" }, { status: 500 });
  }
}
