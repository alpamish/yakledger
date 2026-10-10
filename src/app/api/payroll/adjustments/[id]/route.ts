import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permissions";
import { deletePayrollAdjustment } from "@/services/hr.service";

/** Delete an unposted adjustment; open payrolls of the employee follow. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await requirePermission(request, "employees:payroll:manage");
  if ("status" in result) return result;

  try {
    const deleted = await deletePayrollAdjustment(id, result.user.id);
    return NextResponse.json({ success: true, data: deleted });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Failed to delete adjustment" },
      { status: 400 }
    );
  }
}
