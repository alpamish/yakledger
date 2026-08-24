import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAnyPermission, checkUserPermission } from "@/lib/permissions";
import { sanitizeSalaryFields } from "@/services/hr.service";

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
        employeeNumber: true,
        fullName: true,
        fatherName: true,
        grandfatherName: true,
        gender: true,
        dateOfBirth: true,
        nationality: true,
        phoneNumber: true,
        email: true,
        address: true,
        nationalId: true,
        jobTitle: true,
        department: true,
        employmentType: true,
        salary: true,
        baseSalaryMinor: true,
        currency: true,
        workHoursPerDay: true,
        overtimeRate: true,
        workStartTime: true,
        workEndTime: true,
        breakMinutes: true,
        hireDate: true,
        status: true,
        employeeCategory: true,
        contractStartDate: true,
        contractEndDate: true,
        probationEndDate: true,
        terminationDate: true,
        terminationReason: true,
        workLocation: true,
        supervisorId: true,
        quitingDate: true,
        emergencyContactName: true,
        emergencyContactPhone: true,
        createdBy: true,
        createdAt: true,
        updatedAt: true,
        supervisor: { select: { fullName: true } },
      },
      orderBy: { fullName: "asc" },
    });

    const safe = employees.map((e) => sanitizeSalaryFields(e, canViewSalary));

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
