import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAnyPermission, checkUserPermission } from "@/lib/permissions";

// GET /api/employees/list - Simple employee list for dropdowns/selects
export async function GET(request: NextRequest) {
  const result = await requireAnyPermission(request, ["employees:view", "content:employees"]);
  if ("status" in result) return result;
  const user = result.user;
  try {
    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get("status");

    const where: Record<string, string> = {};
    if (statusParam && statusParam !== "ALL") {
      where.status = statusParam;
    }

    const canViewSalary = await checkUserPermission(
      user.id,
      user.role,
      "employees:salary:view"
    );

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

    const safe = canViewSalary
      ? employees
      : employees.map(({ salary, ...rest }) => rest);

    return NextResponse.json({
      success: true,
      data: safe,
    });
  } catch (error) {
    console.error("Employee list error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch employee list" },
      { status: 500 }
    );
  }
}
