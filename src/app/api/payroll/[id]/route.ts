import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permissions";
import { deletePayroll, updatePayrollLine } from "@/services/hr.service";
import { payrollLineUpdateSchema } from "@/lib/validations/hr";
import { toMinor } from "@/lib/money";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await requirePermission(request, "employees:payroll:manage");
  if ("status" in result) return result;

  try {
    const body = await request.json();
    const parsed = payrollLineUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || "Invalid input" },
        { status: 400 }
      );
    }

    const d = parsed.data;
    const updated = await updatePayrollLine(d.lineId, {
      ...(d.overtimeHours !== undefined && { overtimeHours: d.overtimeHours }),
      ...(d.allowancesMinor !== undefined && { allowancesMinor: toMinor(d.allowancesMinor) }),
      ...(d.bonusesMinor !== undefined && { bonusesMinor: toMinor(d.bonusesMinor) }),
      ...(d.deductionsMinor !== undefined && { deductionsMinor: toMinor(d.deductionsMinor) }),
      ...(d.netPayableMinor !== undefined && { netPayableMinor: toMinor(d.netPayableMinor) }),
      ...(d.remainingEmployeeDebtMinor !== undefined && { remainingEmployeeDebtMinor: toMinor(d.remainingEmployeeDebtMinor) }),
      ...(d.deductExpenses !== undefined && { deductExpenses: d.deductExpenses }),
      ...(d.walletId !== undefined && { walletId: d.walletId }),
    }, result.user.id);

    return NextResponse.json({ success: true, data: updated });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Failed to update payroll line" },
      { status: 400 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await requirePermission(request, "employees:payroll:manage");
  if ("status" in result) return result;
  const user = result.user;

  try {
    await deletePayroll(id, user.id, user.role);
    return NextResponse.json({
      success: true,
      message: "Payroll record deleted",
    });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Failed to delete payroll" },
      { status: 400 }
    );
  }
}
