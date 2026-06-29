import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { Prisma } from "@prisma/client";

const CONTRACTOR_TYPE_VALUES = [
  "MACHINERY_CONTRACTOR",
  "TRANSPORTATION_CONTRACTOR",
  "LABOR_CONTRACTOR",
  "MATERIAL_SUPPLIER",
  "OTHER",
] as const;

const CONTRACTOR_STATUS_VALUES = [
  "ACTIVE",
  "INACTIVE",
  "SUSPENDED",
] as const;

const updateContractorSchema = z.object({
  contractorName: z.string().min(1).optional(),
  fatherName: z.string().min(1).optional(),
  companyName: z.string().optional().nullable(),
  phoneNumber: z.string().min(1).optional(),
  alternativePhone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  address: z.string().optional().nullable(),
  nationalId: z.string().optional().nullable(),
  contractorType: z.enum(CONTRACTOR_TYPE_VALUES).optional(),
  status: z.enum(CONTRACTOR_STATUS_VALUES).optional(),
  notes: z.string().optional().nullable(),
});

// GET /api/contractors/[id] - Get single contractor with full profile
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await requirePermission(request, "contractors:view");
    if ("status" in result) return result;

    const { id } = await params;

    const contractor = await db.contractor.findUnique({
      where: { id },
      include: {
        creator: {
          select: { id: true, email: true, name: true, role: true, avatar: true },
        },
        expensesPaidTo: {
          select: {
            id: true,
            title: true,
            amount: true,
            category: true,
            expenseDate: true,
            paymentMethod: true,
          },
          orderBy: { expenseDate: "desc" },
          take: 20,
        },
        timesheets: {
          orderBy: { date: "desc" },
          take: 20,
          include: {
            machinery: {
              select: { id: true, machineryName: true, machineryType: true, plateNumber: true },
            },
          },
        },
        fuelUsages: {
          orderBy: { date: "desc" },
          take: 20,
          include: {
            machinery: {
              select: { id: true, machineryName: true, machineryType: true, plateNumber: true },
            },
            linkedExpense: {
              select: { id: true, title: true, amount: true, category: true },
            },
          },
        },
        machinery: {
          orderBy: { createdAt: "desc" },
        },
        _count: {
          select: {
            expensesPaidTo: true,
            timesheets: true,
            fuelUsages: true,
            machinery: true,
          },
        },
      },
    });

    if (!contractor) {
      return NextResponse.json(
        { success: false, error: "Contractor not found" },
        { status: 404 }
      );
    }

    // Compute totalExpensesPaid
    const totalExpensesResult = await db.expense.aggregate({
      where: { paidToContractorId: id },
      _sum: { amount: true },
    });
    const totalExpensesPaid = totalExpensesResult._sum.amount ?? 0;

    // Compute monthlyExpenses (last 6 months)
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const monthlyExpensesRaw = await db.expense.findMany({
      where: {
        paidToContractorId: id,
        expenseDate: { gte: sixMonthsAgo },
      },
      select: { amount: true, expenseDate: true },
    });

    // Group by month
    const monthMap = new Map<string, number>();
    for (const exp of monthlyExpensesRaw) {
      const d = new Date(exp.expenseDate);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthMap.set(key, (monthMap.get(key) || 0) + exp.amount);
    }
    const monthlyExpenses = Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, amount]) => ({ month, amount }));

    const responseData = {
      ...contractor,
      totalExpensesPaid,
      monthlyExpenses,
    };

    return NextResponse.json({
      success: true,
      data: responseData,
    });
  } catch (error) {
    console.error("Get contractor error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch contractor" },
      { status: 500 }
    );
  }
}

// PUT /api/contractors/[id] - Update contractor
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await requirePermission(request, "contractors:edit");
    if ("status" in result) return result;
    const user = result.user;

    const { id } = await params;
    const body = await request.json();
    const parsed = updateContractorSchema.safeParse(body);

    if (!parsed.success) {
      const errors = parsed.error.issues.map((issue) => issue.message);
      return NextResponse.json(
        { success: false, error: errors.join(", ") },
        { status: 400 }
      );
    }

    const data = parsed.data;

    const updateData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        updateData[key] = value;
      }
    }

    const contractor = await db.contractor.update({
      where: { id },
      data: updateData,
      include: {
        creator: {
          select: { id: true, email: true, name: true, role: true, avatar: true },
        },
      },
    });

    // Create audit log entry
    await db.auditLog.create({
      data: {
        action: "UPDATE",
        entity: "Contractor",
        entityId: contractor.id,
        details: `Updated contractor: ${contractor.contractorName}`,
        userId: user.id,
      },
    });

    return NextResponse.json({
      success: true,
      data: contractor,
      message: "Contractor updated successfully",
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json(
        { success: false, error: "Contractor not found" },
        { status: 404 }
      );
    }
    console.error("Update contractor error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update contractor" },
      { status: 500 }
    );
  }
}

// DELETE /api/contractors/[id] - Delete contractor
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await requirePermission(request, "contractors:delete");
    if ("status" in result) return result;
    const user = result.user;

    const { id } = await params;

    // Get contractor name before deletion for audit log
    const contractor = await db.contractor.findUnique({
      where: { id },
      select: { contractorName: true },
    });

    if (!contractor) {
      return NextResponse.json(
        { success: false, error: "Contractor not found" },
        { status: 404 }
      );
    }

    // Create audit log entry before deletion
    await db.auditLog.create({
      data: {
        action: "DELETE",
        entity: "Contractor",
        entityId: id,
        details: `Deleted contractor: ${contractor.contractorName}`,
        userId: user.id,
      },
    });

    await db.contractor.delete({ where: { id } });

    return NextResponse.json({
      success: true,
      message: "Contractor deleted successfully",
    });
  } catch (error) {
    console.error("Delete contractor error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete contractor" },
      { status: 500 }
    );
  }
}
