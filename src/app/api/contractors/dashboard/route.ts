import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

// GET /api/contractors/dashboard - Contractor dashboard stats
export async function GET(request: NextRequest) {
  const result = await requirePermission(request, "contractors:view");
  if ("status" in result) return result;
  try {
    // Get counts by status
    const [totalContractors, activeContractors, inactiveContractors, suspendedContractors] =
      await Promise.all([
        db.contractor.count(),
        db.contractor.count({ where: { status: "ACTIVE" } }),
        db.contractor.count({ where: { status: "INACTIVE" } }),
        db.contractor.count({ where: { status: "SUSPENDED" } }),
      ]);

    // Total contractor expenses (sum of all linked expenses)
    const totalExpensesResult = await db.expense.aggregate({
      where: { paidToContractorId: { not: null } },
      _sum: { amount: true },
    });
    const totalContractorExpenses = totalExpensesResult._sum.amount ?? 0;

    // Monthly contractor payments (this month)
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const monthlyPaymentsResult = await db.expense.aggregate({
      where: {
        paidToContractorId: { not: null },
        expenseDate: { gte: startOfMonth, lte: endOfMonth },
      },
      _sum: { amount: true },
    });
    const monthlyContractorPayments = monthlyPaymentsResult._sum.amount ?? 0;

    // Total timesheet hours
    const totalTimesheetHoursResult = await db.timesheet.aggregate({
      _sum: { totalHours: true },
    });
    const totalTimesheetHours = totalTimesheetHoursResult._sum.totalHours ?? 0;

    // Total fuel cost
    const totalFuelCostResult = await db.fuelUsage.aggregate({
      _sum: { totalCost: true },
    });
    const totalFuelCost = totalFuelCostResult._sum.totalCost ?? 0;

    // Contractors by type
    const contractorsByTypeRaw = await db.contractor.groupBy({
      by: ["contractorType"],
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    });
    const contractorsByType = contractorsByTypeRaw.map((item) => ({
      type: item.contractorType,
      count: item._count.id,
    }));

    // Monthly payment trend (last 6 months)
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const monthlyExpensesRaw = await db.expense.findMany({
      where: {
        paidToContractorId: { not: null },
        expenseDate: { gte: sixMonthsAgo },
      },
      select: { amount: true, expenseDate: true },
    });

    const monthMap = new Map<string, number>();
    // Initialize all 6 months with 0
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthMap.set(key, 0);
    }
    for (const exp of monthlyExpensesRaw) {
      const d = new Date(exp.expenseDate);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthMap.set(key, (monthMap.get(key) || 0) + exp.amount);
    }
    const monthlyPaymentTrend = Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, amount]) => ({ month, amount }));

    // Recent contractors (5 most recent)
    const recentContractors = await db.contractor.findMany({
      include: {
        creator: {
          select: { id: true, email: true, name: true, role: true, avatar: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    // Top contractors by expense amount
    const topContractorsRaw = await db.expense.groupBy({
      by: ["paidToContractorId"],
      where: { paidToContractorId: { not: null } },
      _sum: { amount: true },
      orderBy: { _sum: { amount: "desc" } },
      take: 5,
    });

    const topContractorIds = topContractorsRaw
      .map((item) => item.paidToContractorId)
      .filter((id): id is string => id !== null);

    const topContractorDetails = await db.contractor.findMany({
      where: { id: { in: topContractorIds } },
      select: { id: true, contractorName: true },
    });

    const topContractorsByExpense = topContractorsRaw
      .filter((item) => item.paidToContractorId !== null)
      .map((item) => {
        const detail = topContractorDetails.find((c) => c.id === item.paidToContractorId);
        return {
          id: item.paidToContractorId!,
          contractorName: detail?.contractorName || "Unknown",
          totalAmount: item._sum.amount ?? 0,
        };
      });

    return NextResponse.json({
      success: true,
      data: {
        totalContractors,
        activeContractors,
        inactiveContractors,
        suspendedContractors,
        totalContractorExpenses,
        monthlyContractorPayments,
        totalTimesheetHours,
        totalFuelCost,
        contractorsByType,
        monthlyPaymentTrend,
        recentContractors,
        topContractorsByExpense,
      },
    });
  } catch (error) {
    console.error("Contractor dashboard error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch contractor dashboard" },
      { status: 500 }
    );
  }
}
