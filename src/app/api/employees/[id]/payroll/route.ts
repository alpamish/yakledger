import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permissions";
import { db } from "@/lib/db";
import { approvePayroll, revertPayroll } from "@/services/hr.service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await requirePermission(request, "employees:payroll:view");
  if ("status" in result) return result;
  try {
    const payroll = await db.payroll.findMany({
      where: { employeeId: id },
      include: {
        lines: true,
        wallet: { select: { id: true, name: true, currency: true } },
      },
      orderBy: { periodStart: "desc" },
    });
    return NextResponse.json({ success: true, data: payroll });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to fetch payroll" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await requirePermission(request, "employees:payroll:manage");
  if ("status" in result) return result;
  const user = result.user;

  try {
    const body = await request.json().catch(() => ({}));
    const { payrollId, action, reason } = body as {
      payrollId?: string;
      action?: string;
      reason?: string;
    };
    if (action === "approve" && payrollId) {
      // Approval only (§2 action 6): payment is recorded separately through
      // POST /api/payroll/[id]/payments.
      const updated = await approvePayroll(payrollId, user.id);
      return NextResponse.json({ success: true, data: updated });
    }
    if (action === "revert" && payrollId) {
      const updated = await revertPayroll(payrollId, user.id, reason);
      return NextResponse.json({ success: true, data: updated });
    }
    return NextResponse.json(
      { success: false, error: "Invalid payroll action" },
      { status: 400 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Failed to process payroll" },
      { status: 400 }
    );
  }
}
