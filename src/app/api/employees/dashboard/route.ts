import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

// GET /api/employees/dashboard - Employee dashboard stats
export async function GET(request: NextRequest) {
  const result = await requirePermission(request, "employees:view");
  if ("status" in result) return result;
  try {
    // Get counts by status
    const [totalEmployees, activeEmployees, inactiveEmployees, terminatedEmployees] =
      await Promise.all([
        db.employee.count(),
        db.employee.count({ where: { status: "ACTIVE" } }),
        db.employee.count({ where: { status: "INACTIVE" } }),
        db.employee.count({ where: { status: "TERMINATED" } }),
      ]);

    // Get employees grouped by department
    const employeesByDepartment = await db.employee.groupBy({
      by: ["department"],
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    });

    const departmentData = employeesByDepartment.map((item) => ({
      department: item.department,
      count: item._count.id,
    }));

    // Get recent hires (last 5 by hireDate desc)
    const recentHires = await db.employee.findMany({
      where: { status: "ACTIVE" },
      include: {
        creator: {
          select: { id: true, email: true, name: true, role: true, avatar: true },
        },
      },
      orderBy: { hireDate: "desc" },
      take: 5,
    });

    // Calculate payroll stats (active employees only)
    const payrollStats = await db.employee.aggregate({
      where: { status: "ACTIVE" },
      _sum: { salary: true },
      _avg: { salary: true },
    });

    const totalPayroll = payrollStats._sum.salary ?? 0;
    const averageSalary = payrollStats._avg.salary ?? 0;

    return NextResponse.json({
      success: true,
      data: {
        totalEmployees,
        activeEmployees,
        inactiveEmployees,
        terminatedEmployees,
        employeesByDepartment: departmentData,
        recentHires,
        totalPayroll,
        averageSalary,
      },
    });
  } catch (error) {
    console.error("Employee dashboard error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch employee dashboard" },
      { status: 500 }
    );
  }
}
