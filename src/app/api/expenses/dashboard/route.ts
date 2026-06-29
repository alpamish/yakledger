import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/permissions";

// GET /api/expenses/dashboard - Get dashboard statistics
export async function GET(request: NextRequest) {
  const result = await requirePermission(request, "dashboard:view");
  if ("status" in result) return result;
  try {
    // Get total expenses and total amount
    const aggregateResult = await db.expense.aggregate({
      _count: { id: true },
      _sum: { amount: true },
      _avg: { amount: true },
    });

    const totalExpenses = aggregateResult._count.id;
    const totalAmount = aggregateResult._sum.amount ?? 0;
    const averageAmount = aggregateResult._avg.amount ?? 0;

    // Get this month's expenses
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const thisMonthResult = await db.expense.aggregate({
      _count: { id: true },
      _sum: { amount: true },
      where: {
        expenseDate: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
      },
    });

    const expensesThisMonth = thisMonthResult._count.id;
    const amountThisMonth = thisMonthResult._sum.amount ?? 0;

    // Get expenses by category
    const expensesByCategory = await db.expense.groupBy({
      by: ["category"],
      _sum: { amount: true },
      _count: { id: true },
      orderBy: { _sum: { amount: "desc" } },
    });

    const expensesByCategoryFormatted = expensesByCategory.map((item) => ({
      category: item.category,
      amount: item._sum.amount ?? 0,
      count: item._count.id,
    }));

    // Get monthly trend for last 6 months
    const monthlyTrend: { month: string; amount: number; count: number }[] = [];

    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
      const monthEnd = new Date(
        date.getFullYear(),
        date.getMonth() + 1,
        0,
        23,
        59,
        59,
        999
      );

      const monthResult = await db.expense.aggregate({
        _sum: { amount: true },
        _count: { id: true },
        where: {
          expenseDate: {
            gte: monthStart,
            lte: monthEnd,
          },
        },
      });

      const monthName = date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
      });

      monthlyTrend.push({
        month: monthName,
        amount: monthResult._sum.amount ?? 0,
        count: monthResult._count.id,
      });
    }

    // Get recent expenses (last 5)
    const recentExpenses = await db.expense.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      include: {
        creator: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            avatar: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        totalExpenses,
        totalAmount,
        averageAmount,
        expensesThisMonth,
        amountThisMonth,
        expensesByCategory: expensesByCategoryFormatted,
        monthlyTrend,
        recentExpenses,
      },
    });
  } catch (error) {
    console.error("Dashboard stats error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch dashboard statistics" },
      { status: 500 }
    );
  }
}
