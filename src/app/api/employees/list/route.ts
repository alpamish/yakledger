import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

// GET /api/employees/list - Simple employee list for dropdowns/selects
export async function GET(request: NextRequest) {
  const result = await requirePermission(request, "employees:view");
  if ("status" in result) return result;
  try {
    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get("status");

    const where: Record<string, string> = {};
    if (statusParam && statusParam !== "ALL") {
      where.status = statusParam;
    }

    const employees = await db.employee.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      select: {
        id: true,
        fullName: true,
        jobTitle: true,
        department: true,
        salary: true,
        status: true,
        hireDate: true,
      },
      orderBy: { fullName: "asc" },
    });

    return NextResponse.json({
      success: true,
      data: employees,
    });
  } catch (error) {
    console.error("Employee list error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch employee list" },
      { status: 500 }
    );
  }
}
