import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permissions";
import { db } from "@/lib/db";

/**
 * Audit trail of every change made to a payroll (Plan-payroll.pdf §2
 * action 13): who did what, when — including the Admin-only old-value
 * snapshots.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await requirePermission(request, "employees:payroll:view");
  if ("status" in result) return result;

  try {
    const rows = await db.payrollAuditLog.findMany({
      where: { payrollId: id },
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
      },
    });
    return NextResponse.json({ success: true, data: rows });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Failed to load audit trail" },
      { status: 400 }
    );
  }
}
