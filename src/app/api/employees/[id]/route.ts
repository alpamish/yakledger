import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission, checkUserPermission } from "@/lib/permissions";
import { buildAccessScope, buildListScope, buildAggregateScope, withScope } from "@/lib/access-control";
import { sanitizeSalaryFields } from "@/services/hr.service";

const DEPARTMENT_VALUES = [
  "ADMINISTRATION", "FINANCE", "OPERATIONS", "ENGINEERING",
  "LOGISTICS", "SECURITY", "MACHINERY_TEAM", "LABOR", "KITCHEN",
] as const;

const EMPLOYMENT_TYPE_VALUES = [
  "FULL_TIME", "PART_TIME", "CONTRACT",
] as const;

const EMPLOYEE_STATUS_VALUES = [
  "ACTIVE", "INACTIVE", "TERMINATED",
] as const;

const updateEmployeeSchema = z.object({
  fullName: z.string().min(1).optional(),
  fatherName: z.string().min(1).optional(),
  gender: z.string().optional(),
  dateOfBirth: z.string().optional().nullable(),
  phoneNumber: z.string().min(1).optional(),
  email: z.string().email().optional().nullable(),
  address: z.string().optional().nullable(),
  nationalId: z.string().optional().nullable(),
  jobTitle: z.string().min(1).optional(),
  department: z.enum(DEPARTMENT_VALUES).optional(),
  employmentType: z.enum(EMPLOYMENT_TYPE_VALUES).optional(),
  salary: z.number().min(0).optional(),
  workHoursPerDay: z.number().int().min(1).optional(),
  overtimeRate: z.number().min(1).optional(),
  workStartTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM").optional(),
  workEndTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM").optional(),
  breakMinutes: z.coerce.number().int().min(0).max(1440).optional(),
  hireDate: z.string().min(1).optional(),
  status: z.enum(EMPLOYEE_STATUS_VALUES).optional(),
  quitingDate: z.string().optional().nullable(),
  idImageFront: z.string().optional().nullable(),
  idImageBack: z.string().optional().nullable(),
  emergencyContactName: z.string().optional().nullable(),
  emergencyContactPhone: z.string().optional().nullable(),
  employeeNumber: z.string().optional().nullable(),
});

// GET /api/employees/[id] - Get single employee with related expenses
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await requirePermission(request, "employees:view");
    if ("status" in result) return result;
    const user = result.user;

    const { id } = await params;

    const expenseListScope = await buildListScope(user, "expense");
    const expenseScope = await buildAggregateScope(user, "expense");
    const attendanceScope = await buildAggregateScope(user, "attendance");

    const employee = await db.employee.findFirst({
      where: withScope({ id }, await buildAccessScope(user, "employee")),
      include: {
        creator: {
          select: { id: true, email: true, name: true, role: true, avatar: true },
        },
        expensesPaidBy: {
          where: expenseListScope,
          select: { id: true, title: true, amount: true, category: true, expenseDate: true, notes: true },
          orderBy: { expenseDate: "desc" },
          take: 20,
        },
        expensesPaidTo: {
          where: expenseListScope,
          select: { id: true, title: true, amount: true, category: true, expenseDate: true, notes: true },
          orderBy: { expenseDate: "desc" },
          take: 20,
        },
        _count: {
          select: { expensesPaidBy: true, expensesPaidTo: true },
        },
      },
    });

    if (!employee) {
      return NextResponse.json(
        { success: false, error: "Employee not found" },
        { status: 404 }
      );
    }

    // Calculate totals

    const totalExpensesPaidBy = await db.expense.aggregate({
      where: { ...expenseScope, paidById: id },
      _sum: { amount: true },
    });

    const totalExpensesPaidTo = await db.expense.aggregate({
      where: { ...expenseScope, paidToId: id },
      _sum: { amount: true },
    });

    const totalSalaryPaid = await db.expense.aggregate({
      where: { ...expenseScope, paidToId: id, category: "SALARY" },
      _sum: { amount: true },
    });

    const totalRewards = await db.expense.aggregate({
      where: { ...expenseScope, paidToId: id, category: { in: ["REWARD", "BONUS"] } },
      _sum: { amount: true },
    });

    const overtimeAgg = await db.attendance.aggregate({
      where: withScope(
        { employeeId: id },
        attendanceScope
      ),
      _sum: { overtimeHours: true },
    });
    const totalOvertimeHours = overtimeAgg._sum.overtimeHours ?? 0;
    const workHoursPerDay = employee.workHoursPerDay ?? 9;
    const overtimeRate = employee.overtimeRate ?? 1.25;
    const hourlySalary = workHoursPerDay > 0 ? (employee.salary / 30) / workHoursPerDay : (employee.salary / 30) / 9;
    const overtimePay = totalOvertimeHours * hourlySalary * overtimeRate;

    const canViewSalary = await checkUserPermission(
      user.id,
      user.role,
      "employees:salary:view"
    );

    let responseData: Record<string, any> = {
      ...employee,
      totalExpensesPaidBy: totalExpensesPaidBy._sum.amount ?? 0,
      totalExpensesPaidTo: totalExpensesPaidTo._sum.amount ?? 0,
      totalSalaryPaid: totalSalaryPaid._sum.amount ?? 0,
      totalRewards: totalRewards._sum.amount ?? 0,
      totalOvertimeHours,
      overtimePay,
    };

    if (!canViewSalary) {
      responseData = sanitizeSalaryFields(responseData, false);
      delete responseData.totalSalaryPaid;
      delete responseData.overtimePay;
    }

    return NextResponse.json({
      success: true,
      data: responseData,
    });
  } catch (error) {
    console.error("Get employee error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch employee" },
      { status: 500 }
    );
  }
}

// PUT /api/employees/[id] - Update employee
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await requirePermission(request, "employees:edit");
    if ("status" in result) return result;
    const user = result.user;

    const { id } = await params;
    const body = await request.json();
    const parsed = updateEmployeeSchema.safeParse(body);

    if (!parsed.success) {
      const errors = parsed.error.issues.map((issue) => issue.message);
      return NextResponse.json(
        { success: false, error: errors.join(", ") },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Get current employee to check for status change
    const currentEmployee = await db.employee.findFirst({
      where: withScope({ id }, await buildAccessScope(user, "employee")),
      select: { id: true, status: true, quitingDate: true },
    });

    if (!currentEmployee) {
      return NextResponse.json(
        { success: false, error: "Employee not found" },
        { status: 404 }
      );
    }

    // Build update object, converting date strings to Date objects
    const updateData: Record<string, unknown> = {};
    console.log("Update data received:", JSON.stringify(data));
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        if ((key === "dateOfBirth" || key === "hireDate" || key === "quitingDate") && value) {
          updateData[key] = new Date(value as string);
        } else {
          updateData[key] = value;
        }
      }
    }
    console.log("Update data to Prisma:", JSON.stringify(updateData));

    // Auto-set quitingDate when status changes to INACTIVE or TERMINATED
    if (data.status && (data.status === "INACTIVE" || data.status === "TERMINATED")) {
      if (!currentEmployee?.quitingDate) {
        updateData.quitingDate = new Date();
      }
    }

    // Clear quitingDate if status is set back to ACTIVE
    if (data.status === "ACTIVE") {
      updateData.quitingDate = null;
    }

    let employee;
    try {
      employee = await db.employee.update({
        where: { id },
        data: updateData,
        include: {
          creator: {
            select: { id: true, email: true, name: true, role: true, avatar: true },
          },
        },
      });
    } catch (dbError) {
      console.error("Database update error:", dbError);
      return NextResponse.json(
        { success: false, error: `Database error: ${(dbError as Error).message}` },
        { status: 500 }
      );
    }

    // Create audit log entry
    await db.auditLog.create({
      data: {
        action: "UPDATE",
        entity: "Employee",
        entityId: employee.id,
        details: `Updated employee: ${employee.fullName}`,
        userId: user.id,
      },
    });

    return NextResponse.json({
      success: true,
      data: employee,
      message: "Employee updated successfully",
    });
  } catch (error) {
    console.error("Update employee error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update employee" },
      { status: 500 }
    );
  }
}

// DELETE /api/employees/[id] - Delete employee
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await requirePermission(request, "employees:delete");
    if ("status" in result) return result;
    const user = result.user;

    const { id } = await params;

    // Get employee name before deletion for audit log
    const employee = await db.employee.findFirst({
      where: withScope({ id }, await buildAccessScope(user, "employee")),
      select: { fullName: true },
    });

    if (!employee) {
      return NextResponse.json(
        { success: false, error: "Employee not found" },
        { status: 404 }
      );
    }

    // Data-integrity guard: never hard-delete an employee that has financial
    // or payroll history. Use status change (resign/terminate) instead.
    const financialLinks = await db.employee.findFirst({
      where: { id },
      select: {
        _count: {
          select: {
            expensesPaidBy: true,
            expensesPaidTo: true,
            cashTransactions: true,
            payrolls: true,
            attendanceRecords: true,
          },
        },
      },
    });
    const links = financialLinks?._count;
    const hasHistory =
      !!links &&
      (links.expensesPaidBy > 0 ||
        links.expensesPaidTo > 0 ||
        links.cashTransactions > 0 ||
        links.payrolls > 0 ||
        links.attendanceRecords > 0);
    if (hasHistory) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Cannot delete employee with financial, attendance, or payroll history. Change their status (terminate/resign) instead.",
        },
        { status: 409 }
      );
    }

    // Create audit log entry before deletion
    await db.auditLog.create({
      data: {
        action: "DELETE",
        entity: "Employee",
        entityId: id,
        details: `Deleted employee: ${employee.fullName}`,
        userId: user.id,
      },
    });

    await db.employee.delete({ where: { id } });

    return NextResponse.json({
      success: true,
      message: "Employee deleted successfully",
    });
  } catch (error) {
    console.error("Delete employee error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete employee" },
      { status: 500 }
    );
  }
}
