import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { Prisma } from "@prisma/client";

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

const createEmployeeSchema = z.object({
  fullName: z.string().min(1, "Full name is required"),
  fatherName: z.string().min(1, "Father name is required"),
  gender: z.string().default("male"),
  dateOfBirth: z.string().optional().nullable(),
  phoneNumber: z.string().min(1, "Phone number is required"),
  email: z.string().email().optional().nullable(),
  address: z.string().optional().nullable(),
  nationalId: z.string().optional().nullable(),
  jobTitle: z.string().min(1, "Job title is required"),
  department: z.enum(DEPARTMENT_VALUES),
  employmentType: z.enum(EMPLOYMENT_TYPE_VALUES).default("FULL_TIME"),
  salary: z.number().min(0).default(0),
  workHoursPerDay: z.number().int().min(1).default(9),
  overtimeRate: z.number().min(1).default(1.25),
  hireDate: z.string().min(1, "Hire date is required"),
  status: z.enum(EMPLOYEE_STATUS_VALUES).default("ACTIVE"),
  idImageFront: z.string().optional().nullable(),
  idImageBack: z.string().optional().nullable(),
  emergencyContactName: z.string().optional().nullable(),
  emergencyContactPhone: z.string().optional().nullable(),
});

// GET /api/employees - List employees with filtering, pagination, sorting
export async function GET(request: NextRequest) {
  try {
    const result = await requirePermission(request, "employees:view");
    if ("status" in result) return result;

    const { searchParams } = new URL(request.url);

    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "10")));

    const search = searchParams.get("search") || undefined;
    const searchField = searchParams.get("searchField") || "all";
    const departmentsParam = searchParams.get("departments");
    const departments = departmentsParam ? departmentsParam.split(",").filter(Boolean) : undefined;
    const statusesParam = searchParams.get("statuses");
    const statuses = statusesParam ? statusesParam.split(",").filter(Boolean) : undefined;
    const employmentTypesParam = searchParams.get("employmentTypes");
    const employmentTypes = employmentTypesParam ? employmentTypesParam.split(",").filter(Boolean) : undefined;

    const sortBy = searchParams.get("sortBy") || "createdAt";
    const sortOrder = searchParams.get("sortOrder") || "desc";

    // Build dynamic where clause
    const where: Prisma.EmployeeWhereInput = {};

    if (search) {
      const fieldMap: Record<string, Prisma.EmployeeWhereInput> = {
        fullName: { fullName: { contains: search } },
        fatherName: { fatherName: { contains: search } },
        phoneNumber: { phoneNumber: { contains: search } },
        email: { email: { contains: search } },
        jobTitle: { jobTitle: { contains: search } },
        nationalId: { nationalId: { contains: search } },
      };
      where.OR = searchField === "all"
        ? [
            { fullName: { contains: search } },
            { fatherName: { contains: search } },
            { phoneNumber: { contains: search } },
            { email: { contains: search } },
            { jobTitle: { contains: search } },
            { nationalId: { contains: search } },
          ]
        : [fieldMap[searchField] || { fullName: { contains: search } }];
    }

    if (departments && departments.length > 0) {
      where.department = { in: departments as Prisma.EnumDepartmentFilter["in"] };
    }

    if (statuses && statuses.length > 0) {
      where.status = { in: statuses as Prisma.EnumEmployeeStatusFilter["in"] };
    }

    if (employmentTypes && employmentTypes.length > 0) {
      where.employmentType = { in: employmentTypes as Prisma.EnumEmploymentTypeFilter["in"] };
    }

    // Validate sort field
    const validSortFields = ["createdAt", "fullName", "salary", "hireDate", "department", "status", "updatedAt"];
    const sortField = validSortFields.includes(sortBy) ? sortBy : "createdAt";
    const order = sortOrder === "asc" ? "asc" : "desc";

    const [employees, total] = await Promise.all([
      db.employee.findMany({
        where,
        include: {
          creator: {
            select: { id: true, email: true, name: true, role: true, avatar: true },
          },
          _count: {
            select: { expensesPaidBy: true, expensesPaidTo: true },
          },
        },
        orderBy: { [sortField]: order },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.employee.count({ where }),
    ]);

    const totalPages = Math.ceil(total / pageSize);

    return NextResponse.json({
      success: true,
      data: {
        data: employees,
        total,
        page,
        pageSize,
        totalPages,
      },
    });
  } catch (error) {
    console.error("Get employees error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch employees" },
      { status: 500 }
    );
  }
}

// POST /api/employees - Create a new employee
export async function POST(request: NextRequest) {
  try {
    const result = await requirePermission(request, "employees:create");
    if ("status" in result) return result;
    const user = result.user;

    const body = await request.json();
    const parsed = createEmployeeSchema.safeParse(body);

    if (!parsed.success) {
      const errors = parsed.error.issues.map((issue) => issue.message);
      return NextResponse.json(
        { success: false, error: errors.join(", ") },
        { status: 400 }
      );
    }

    const data = parsed.data;

    const employee = await db.$transaction(async (tx) => {
      const created = await tx.employee.create({
        data: {
          fullName: data.fullName,
          fatherName: data.fatherName,
          gender: data.gender,
          dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
          phoneNumber: data.phoneNumber,
          email: data.email ?? null,
          address: data.address ?? null,
          nationalId: data.nationalId ?? null,
          jobTitle: data.jobTitle,
          department: data.department,
          employmentType: data.employmentType,
          salary: data.salary,
          hireDate: new Date(data.hireDate),
          status: data.status,
          idImageFront: data.idImageFront ?? null,
          idImageBack: data.idImageBack ?? null,
          emergencyContactName: data.emergencyContactName ?? null,
          emergencyContactPhone: data.emergencyContactPhone ?? null,
          createdBy: user.id,
        },
        include: {
          creator: {
            select: { id: true, email: true, name: true, role: true, avatar: true },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          action: "CREATE",
          entity: "Employee",
          entityId: created.id,
          details: `Created employee: ${created.fullName} (${created.jobTitle})`,
          userId: user.id,
        },
      });

      return created;
    });

    return NextResponse.json(
      {
        success: true,
        data: employee,
        message: "Employee created successfully",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Create employee error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create employee" },
      { status: 500 }
    );
  }
}
