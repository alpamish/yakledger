'use client';

import { useCallback, useMemo } from 'react';
import { formatCurrency } from '@/lib/utils';
import type { Category } from '@/types/expense';
import { CATEGORY_LABELS, CATEGORY_COLORS } from '@/types/expense';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  Cell,
} from 'recharts';
import {
  BarChart3,
  DollarSign,
  Calendar,
  Filter,
  FileText,
  FileSpreadsheet,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface ExpenseReportsTabProps {
  dashboardStats: {
    totalExpenses: number;
    totalAmount: number;
    averageAmount: number;
    expensesThisMonth: number;
    amountThisMonth: number;
    expensesByCategory: { category: string; amount: number; count: number }[];
    monthlyTrend: { month: string; amount: number; count: number }[];
  };
  selectedExpenses: { category: string; amount: number }[];
  selectedExpenseIds: Set<string>;
  exportCSV: () => void;
  exportExcel: () => void;
  hasPermission: (action: string) => boolean;
}

export default function ExpenseReportsTab({
  dashboardStats,
  selectedExpenses,
  selectedExpenseIds,
  exportCSV,
  exportExcel,
  hasPermission,
}: ExpenseReportsTabProps) {
  const { expensesByCategory, monthlyTrend, totalAmount } = dashboardStats;

  const categoryChartData = useMemo(
    () =>
      expensesByCategory
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 8)
        .map((cat) => ({
          category: CATEGORY_LABELS[cat.category as Category] ?? cat.category,
          amount: cat.amount,
          count: cat.count,
          color: CATEGORY_COLORS[cat.category as Category] ?? '#78716c',
        })),
    [expensesByCategory]
  );

  const handleExportCSV = useCallback(() => {
    exportCSV();
  }, [exportCSV]);

  const handleExportExcel = useCallback(() => {
    exportExcel();
  }, [exportExcel]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Expense Reports</h2>
          <p className="text-sm text-muted-foreground">
            Detailed expense analysis and export options
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {hasPermission('reports:generatePdf') && (
            <Button variant="outline" size="sm" onClick={handleExportCSV}>
              <FileText className="mr-1.5 h-3.5 w-3.5" />
              Export CSV
            </Button>
          )}
          {hasPermission('reports:generatePdf') && (
            <Button variant="outline" size="sm" onClick={handleExportExcel}>
              <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />
              Export Excel
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="transition-shadow hover:shadow-md">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Amount
            </CardTitle>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600/10">
              <DollarSign className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">
              {formatCurrency(dashboardStats.totalAmount)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {dashboardStats.totalExpenses} total expenses
            </p>
          </CardContent>
        </Card>

        <Card className="transition-shadow hover:shadow-md">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              This Month
            </CardTitle>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600/10">
              <Calendar className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">
              {formatCurrency(dashboardStats.amountThisMonth)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {dashboardStats.expensesThisMonth} expenses this month
            </p>
          </CardContent>
        </Card>

        <Card className="transition-shadow hover:shadow-md">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Average
            </CardTitle>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600/10">
              <BarChart3 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">
              {formatCurrency(dashboardStats.averageAmount)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Per expense average
            </p>
          </CardContent>
        </Card>

        <Card className="transition-shadow hover:shadow-md">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Selected for Export
            </CardTitle>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600/10">
              <Filter className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">
              {selectedExpenses.length}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {selectedExpenseIds.size === 0 ? 'All expenses' : `${selectedExpenseIds.size} selected`}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              Monthly Expense Trend
            </CardTitle>
            <CardDescription>Amount and count over time</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlyTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#059669" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border/50" />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12 }}
                    tickFormatter={(value: number) =>
                      value >= 1000 ? `$${(value / 1000).toFixed(0)}k` : `$${value}`
                    }
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid hsl(var(--border))',
                      backgroundColor: 'hsl(var(--popover))',
                      color: 'hsl(var(--popover-foreground))',
                    }}
                    formatter={(value: number) => [formatCurrency(value), 'Amount']}
                  />
                  <Area
                    type="monotone"
                    dataKey="amount"
                    stroke="#059669"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorAmount)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              Expenses by Category
            </CardTitle>
            <CardDescription>Top categories by amount</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={categoryChartData}
                  layout="vertical"
                  margin={{ top: 8, right: 8, left: 80, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-border/50" />
                  <XAxis
                    type="number"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12 }}
                    tickFormatter={(value: number) =>
                      value >= 1000 ? `$${(value / 1000).toFixed(0)}k` : `$${value}`
                    }
                  />
                  <YAxis
                    type="category"
                    dataKey="category"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11 }}
                    width={75}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid hsl(var(--border))',
                      backgroundColor: 'hsl(var(--popover))',
                      color: 'hsl(var(--popover-foreground))',
                    }}
                    formatter={(value: number) => [formatCurrency(value), 'Amount']}
                  />
                  <Bar dataKey="amount" radius={[0, 6, 6, 0]} maxBarSize={32}>
                    {categoryChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Category Breakdown</CardTitle>
          <CardDescription>Detailed breakdown by expense category</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-3 text-left font-medium text-muted-foreground">Category</th>
                  <th className="py-3 text-right font-medium text-muted-foreground">Count</th>
                  <th className="py-3 text-right font-medium text-muted-foreground">Amount</th>
                  <th className="py-3 text-right font-medium text-muted-foreground">Average</th>
                  <th className="py-3 text-right font-medium text-muted-foreground">% of Total</th>
                </tr>
              </thead>
              <tbody>
                {expensesByCategory
                  .sort((a, b) => b.amount - a.amount)
                  .map((cat) => {
                    const catColor = CATEGORY_COLORS[cat.category as Category] ?? '#78716c';
                    const percentage = totalAmount > 0 ? (cat.amount / totalAmount) * 100 : 0;
                    const avg = cat.count > 0 ? cat.amount / cat.count : 0;
                    return (
                      <tr key={cat.category} className="border-b last:border-0 hover:bg-muted/50">
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <div
                              className="h-3 w-3 rounded-sm shrink-0"
                              style={{ backgroundColor: catColor }}
                            />
                            <span className="font-medium">
                              {CATEGORY_LABELS[cat.category as Category] ?? cat.category}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 text-right text-muted-foreground">{cat.count}</td>
                        <td className="py-3 text-right font-medium">{formatCurrency(cat.amount)}</td>
                        <td className="py-3 text-right text-muted-foreground">{formatCurrency(avg)}</td>
                        <td className="py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="h-2 w-16 rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${percentage}%`, backgroundColor: catColor }}
                              />
                            </div>
                            <span className="text-muted-foreground tabular-nums w-12 text-right">
                              {percentage.toFixed(1)}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <td className="pt-3">Total</td>
                  <td className="pt-3 text-right">{dashboardStats.totalExpenses}</td>
                  <td className="pt-3 text-right">{formatCurrency(totalAmount)}</td>
                  <td className="pt-3 text-right">{formatCurrency(dashboardStats.averageAmount)}</td>
                  <td className="pt-3 text-right">100%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
