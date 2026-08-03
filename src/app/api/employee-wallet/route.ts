import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { walletService } from "@/services/wallet.service";
import { buildAccessScope, withScope } from "@/lib/access-control";

export async function GET(request: NextRequest) {
  try {
    const result = await requirePermission(request, "cashAdvance:view");
    if ("status" in result) return result;
    const user = result.user;

    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get("employeeId");

    const scope = await buildAccessScope(user, "employee");

    if (employeeId) {
      const employee = await db.employee.findFirst({
        where: withScope({ id: employeeId }, scope),
        select: { id: true },
      });
      if (!employee) {
        return NextResponse.json({ success: false, error: "Employee not found" }, { status: 404 });
      }

      const dateFrom = searchParams.get("dateFrom") || undefined;
      const dateTo = searchParams.get("dateTo") || undefined;
      const page = searchParams.get("page") ? parseInt(searchParams.get("page")!) : undefined;
      const pageSize = searchParams.get("pageSize") ? parseInt(searchParams.get("pageSize")!) : undefined;

      if (dateFrom || dateTo || page || pageSize) {
        const { account } = await walletService.getAccountWithLedger(employeeId);
        const { ledger, total, page: pg, pageSize: ps } = await walletService.getFilteredLedger(employeeId, { dateFrom, dateTo, page, pageSize });
        return NextResponse.json({ success: true, data: { account, ledger, total, page: pg, pageSize: ps } });
      }

      const { account, ledger } = await walletService.getAccountWithLedger(employeeId);
      return NextResponse.json({ success: true, data: { account, ledger } });
    }

    const accounts = await walletService.getAllAccounts();
    const scopedAccounts = await Promise.all(
      accounts.map(async (acct) => {
        const emp = await db.employee.findFirst({
          where: withScope({ id: acct.employeeId }, scope),
          select: { id: true },
        });
        return emp ? acct : null;
      })
    );
    return NextResponse.json({ success: true, data: scopedAccounts.filter(Boolean) });
  } catch (error) {
    console.error("Get employee wallets error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch wallets" }, { status: 500 });
  }
}
