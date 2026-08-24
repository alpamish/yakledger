import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permissions";
import { getEmployeeFinancialSummary } from "@/services/hr.service";
import { buildAccessScope, withScope } from "@/lib/access-control";
import { db } from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requirePermission(request, "employees:payroll:view");
  if ("status" in result) return result;
  const user = result.user;
  const { id } = await params;
  try {
    const scope = await buildAccessScope(user, "employee");
    const employee = await db.employee.findFirst({
      where: withScope({ id }, scope),
      select: { id: true },
    });
    if (!employee) {
      return NextResponse.json(
        { success: false, error: "Employee not found" },
        { status: 404 }
      );
    }

    const summary = await getEmployeeFinancialSummary(id);
    return NextResponse.json({ success: true, data: summary });
  } catch (e: any) {
    return NextResponse.json(
      {
        success: false,
        error: e?.message || "Failed to load financial summary",
      },
      { status: 500 }
    );
  }
}