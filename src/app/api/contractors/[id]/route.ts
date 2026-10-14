import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission, requireAnyPermission, checkUserPermission } from "@/lib/permissions";
import { Prisma } from "@prisma/client";
import { buildAccessScope, buildListScope, buildAggregateScope, withScope } from "@/lib/access-control";
import { updateContractorSchema } from "@/lib/validation/contractor";
import {
  archiveOrDeleteContractor,
  getContractorHistoryCounts,
  totalHistory,
} from "@/services/contractor.service";

// GET /api/contractors/[id] - Get single contractor with full profile
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await requirePermission(request, "contractors:view");
    if ("status" in result) return result;
    const user = result.user;

    const { id } = await params;

    const [
      contractorScope,
      expenseScope,
      timesheetScope,
      fuelUsageScope,
      expenseListScope,
      timesheetListScope,
      fuelUsageListScope,
      machineryScope,
      machineryRateScope,
    ] = await Promise.all([
      buildAccessScope(user, "contractor"),
      buildAggregateScope(user, "expense"),
      buildAggregateScope(user, "timesheet"),
      buildAggregateScope(user, "fuelUsage"),
      buildListScope(user, "expense"),
      buildListScope(user, "timesheet"),
      buildListScope(user, "fuelUsage"),
      buildAccessScope(user, "machinery"),
      buildAccessScope(user, "machineryRate"),
    ]);

    const contractor = await db.contractor.findFirst({
      where: withScope({ id }, contractorScope),
      include: {
        creator: {
          select: { id: true, email: true, name: true, role: true, avatar: true },
        },
        expensesPaidTo: {
          where: expenseListScope,
          select: {
            id: true,
            title: true,
            description: true,
            notes: true,
            amount: true,
            category: true,
            expenseDate: true,
            paymentMethod: true,
            paidBy: true,
          },
          orderBy: { expenseDate: "desc" },
        },
        machinery: {
          where: machineryScope,
          orderBy: { createdAt: "desc" },
        },
        _count: {
          select: {
            // Counts are financial figures: approved records only (aggregate
            // scope), matching timesheets/fuelUsages and totalExpensesPaid.
            // The expensesPaidTo list above keeps the wider list scope.
            expensesPaidTo: { where: expenseScope },
            timesheets: { where: timesheetScope },
            fuelUsages: { where: fuelUsageScope },
            machinery: { where: machineryScope },
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
      where: withScope({ paidToContractorId: id }, expenseScope),
      _sum: { amount: true },
    });
    const totalExpensesPaid = totalExpensesResult._sum.amount ?? 0;

    // Compute monthlyExpenses (last 6 months)
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const monthlyExpensesRaw = await db.expense.findMany({
      where: withScope(
        {
          paidToContractorId: id,
          expenseDate: { gte: sixMonthsAgo },
        },
        expenseScope
      ),
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

    // Fetch machineryRates for the scoped machinery belonging to this contractor
    const contractorMachineryIds = contractor.machinery.map((m) => m.id);
    const machineryRates = contractorMachineryIds.length > 0
      ? await db.machineryRate.findMany({
          where: withScope(
            { machineryId: { in: contractorMachineryIds } },
            machineryRateScope
          ),
        })
      : [];

    const responseData = {
      ...contractor,
      totalExpensesPaid,
      monthlyExpenses,
      machineryRates,
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

    const contractor = await db.contractor.findFirst({
      where: withScope({ id }, await buildAccessScope(user, "contractor")),
      select: { id: true },
    });

    if (!contractor) {
      return NextResponse.json(
        { success: false, error: "Contractor not found" },
        { status: 404 }
      );
    }

    const updateResult = await db.contractor.update({
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
        details: `Updated contractor: ${updateResult.contractorName}`,
        userId: user.id,
      },
    });

    return NextResponse.json({
      success: true,
      data: updateResult,
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

// DELETE /api/contractors/[id] - Archive-or-delete a contractor.
// Contractors with operational/financial history are archived (history is
// never cascade-deleted); only clean contractors are hard-deleted.
// Phase 5: archiving needs contractors:archive; hard-deleting additionally
// needs contractors:delete (archive-only callers get a 403 on clean targets).
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await requireAnyPermission(request, [
      "contractors:delete",
      "contractors:archive",
    ]);
    if ("status" in result) return result;
    const user = result.user;

    const { id } = await params;

    const contractorScope = await buildAccessScope(user, "contractor");
    const existing = await db.contractor.findFirst({
      where: withScope({ id }, contractorScope),
      select: { id: true, contractorName: true, status: true },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Contractor not found" },
        { status: 404 }
      );
    }

    // Archive-only callers may never hard-delete: require the contractor to
    // have history so the archive branch (not the delete branch) applies.
    const canDelete = await checkUserPermission(
      user.id,
      user.role,
      "contractors:delete"
    );
    if (!canDelete) {
      const history = await getContractorHistoryCounts(db, id);
      if (totalHistory(history) === 0) {
        return NextResponse.json(
          {
            success: false,
            error:
              "This contractor has no history and would be permanently deleted, which requires the contractors:delete permission",
          },
          { status: 403 }
        );
      }
    }

    const outcome = await db.$transaction(async (tx) => {
      const res = await archiveOrDeleteContractor(tx, id);
      await tx.auditLog.create({
        data: {
          action: res.outcome === "DELETED" ? "DELETE" : "ARCHIVE",
          entity: "Contractor",
          entityId: id,
          details:
            res.outcome === "DELETED"
              ? `Deleted contractor: ${existing.contractorName}`
              : `Archived contractor: ${existing.contractorName} (has operational/financial history; history preserved)`,
          userId: user.id,
        },
      });
      return res;
    });

    if (outcome.outcome === "ARCHIVED") {
      return NextResponse.json({
        success: true,
        data: { archived: true, history: outcome.history },
        message:
          "Contractor has operational/financial history and was archived instead of deleted. History is preserved.",
      });
    }

    return NextResponse.json({
      success: true,
      data: { archived: false },
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
