import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permissions";
import { getEmployeeFinancialSummary } from "@/services/hr.service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requirePermission(request, "employees:payroll:view");
  if ("status" in result) return result;
  const { id } = await params;
  try {
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