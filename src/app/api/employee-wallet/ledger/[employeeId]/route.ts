import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { walletService } from "@/services/wallet.service";
import { buildAccessScope, withScope } from "@/lib/access-control";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ employeeId: string }> }
) {
  try {
    const result = await requirePermission(request, "cashAdvance:view");
    if ("status" in result) return result;
    const user = result.user;

    const { employeeId } = await params;
    const scope = await buildAccessScope(user, "employee");
    const employee = await db.employee.findFirst({
      where: withScope({ id: employeeId }, scope),
      select: { id: true },
    });
    if (!employee) {
      return NextResponse.json({ success: false, error: "Employee not found" }, { status: 404 });
    }

    const ledger = await walletService.getLedger(employeeId);

    return NextResponse.json({ success: true, data: ledger });
  } catch (error) {
    console.error("Get employee ledger error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch ledger" }, { status: 500 });
  }
}
