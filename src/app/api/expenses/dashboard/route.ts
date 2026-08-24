import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { buildAggregateScope, buildListScope } from "@/lib/access-control";

// GET /api/expenses/dashboard - Get dashboard statistics
export async function GET(request: NextRequest) {
  const result = await requirePermission(request, "dashboard:view");
  if ("status" in result) return result;
  const user = result.user;
  try {
    const aggregateScope = await buildAggregateScope(user, "expense");
    const listScope = await buildListScope(user, "expense");

    // Run all dashboard queries concurrently against the same scope. The
    // monthly trend uses a single indexed scan of the trailing 6 months and
    // aggregates the buckets in JS, instead of 6 sequential aggregates.
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const trendStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    const [
      aggregateResult,
      thisMonthResult,
      expensesByCategory,
      trendRows,
      recentExpenses,
    ] = await Promise.all([
      db.expense.aggregate({
        _count: { id: true },
        _sum: { amount: true },
        _avg: { amount: true },
        where: aggregateScope,
      }),
      db.expense.aggregate({
        _count: { id: true },
        _sum: { amount: true },
        where: {
          expenseDate: { gte: startOfMonth, lte: endOfMonth },
          ...aggregateScope,
        },
      }),
      db.expense.groupBy({
        by: ["category"],
        _sum: { amount: true },
        _count: { id: true },
        where: aggregateScope,
        orderBy: { _sum: { amount: "desc" } },
      }),
      db.expense.findMany({
        where: { expenseDate: { gte: trendStart }, ...aggregateScope },
        select: { amount: true, expenseDate: true },
      }),
      db.expense.findMany({
        take: 5,
        where: listScope,
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
      }),
    ]);

    const totalExpenses = aggregateResult._count.id;
    const totalAmount = aggregateResult._sum.amount ?? 0;
    const averageAmount = aggregateResult._avg.amount ?? 0;
    const expensesThisMonth = thisMonthResult._count.id;
    const amountThisMonth = thisMonthResult._sum.amount ?? 0;

    const expensesByCategoryFormatted = expensesByCategory.map((item) => ({
      category: item.category,
      amount: item._sum.amount ?? 0,
      count: item._count.id,
    }));

    // Aggregate the trailing-6-months scan into monthly buckets.
    const trendMap = new Map<string, { amount: number; count: number }>();
    for (const row of trendRows) {
      const d = new Date(row.expenseDate);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const bucket = trendMap.get(key) ?? { amount: 0, count: 0 };
      bucket.amount += row.amount;
      bucket.count += 1;
      trendMap.set(key, bucket);
    }

    const monthlyTrend: { month: string; amount: number; count: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      const bucket = trendMap.get(key) ?? { amount: 0, count: 0 };
      monthlyTrend.push({
        month: date.toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
        }),
        amount: bucket.amount,
        count: bucket.count,
      });
    }

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
      headers: {
        "Cache-Control": "private, max-age=15, must-revalidate",
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
