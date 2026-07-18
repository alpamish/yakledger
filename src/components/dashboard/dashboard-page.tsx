'use client';

import * as React from 'react';
import { useExpenseStore } from '@/hooks/use-expense-store';
import { usePermissions } from '@/hooks/use-permissions';
import { CATEGORY_LABELS, CATEGORY_COLORS } from '@/types/expense';
import type { Category } from '@/types/expense';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { LoadingSpinner } from '@/components/common/loading-spinner';
import { EmptyState } from '@/components/common/empty-state';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DollarSign,
  Calendar,
  BarChart3,
  PieChart,
  Receipt,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';

// ─── Helpers ──────────────────────────────────────────────────────

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'AFN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ─── Custom Tooltip for Bar Chart ─────────────────────────────────

function BarChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; payload: { count: number } }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border/50 bg-background px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-medium text-foreground">{label}</p>
      <p className="text-emerald-600 dark:text-emerald-400">
        Amount: {formatCurrency(payload[0].value)}
      </p>
      <p className="text-muted-foreground">
        Transactions: {payload[0].payload.count}
      </p>
    </div>
  );
}

// ─── Custom Tooltip for Pie Chart ─────────────────────────────────

function PieChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    payload: { count: number; percent: number; category: string };
  }>;
}) {
  if (!active || !payload?.length) return null;
  const data = payload[0];
  return (
    <div className="rounded-lg border border-border/50 bg-background px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-medium text-foreground">{data.name}</p>
      <p className="text-emerald-600 dark:text-emerald-400">
        Amount: {formatCurrency(data.value)}
      </p>
      <p className="text-muted-foreground">
        Count: {data.payload.count} ({data.payload.percent.toFixed(1)}%)
      </p>
    </div>
  );
}

// ─── Custom Legend for Pie Chart ──────────────────────────────────

function PieChartLegend({
  payload,
}: {
  payload?: Array<{ value: string; color: string }>;
}) {
  if (!payload?.length) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs">
      {payload.map((entry, index) => (
        <div key={index} className="flex items-center gap-1.5">
          <div
            className="h-2.5 w-2.5 shrink-0 rounded-sm"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-muted-foreground">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────

interface StatCardProps {
  title: string;
  value: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

function StatCard({ title, value, description, icon: Icon }: StatCardProps) {
  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600/10">
          <Icon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tracking-tight">{value}</div>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

// ─── Main Dashboard Component ─────────────────────────────────────

export function DashboardPage() {
  const { canView } = usePermissions();
  const { dashboardStats, fetchDashboard, isLoading } = useExpenseStore();
  const [hasFetched, setHasFetched] = React.useState(false);

  React.useEffect(() => {
    if (!canView('dashboard')) return;
    if (!hasFetched) {
      fetchDashboard();
      setHasFetched(true);
    }
  }, [canView, fetchDashboard, hasFetched]);

  if (!canView('dashboard')) return null;

  // ─── Loading state ──────────────────────────────────────────
  if (isLoading && !dashboardStats) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <LoadingSpinner size="lg" text="Loading dashboard..." />
      </div>
    );
  }

  // ─── Empty state ────────────────────────────────────────────
  if (!dashboardStats) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <EmptyState
          icon={BarChart3}
          title="No dashboard data"
          description="Start adding expenses to see your dashboard statistics and charts."
        />
      </div>
    );
  }

  const {
    totalExpenses,
    totalAmount,
    averageAmount,
    expensesThisMonth,
    amountThisMonth,
    expensesByCategory,
    monthlyTrend,
    recentExpenses,
  } = dashboardStats;

  const uniqueCategories = expensesByCategory.length;

  // Prepare pie chart data with percentages
  const pieData = expensesByCategory.map((cat) => ({
    name: CATEGORY_LABELS[cat.category as Category] ?? cat.category,
    value: cat.amount,
    count: cat.count,
    category: cat.category,
    percent: totalAmount > 0 ? (cat.amount / totalAmount) * 100 : 0,
  }));

  // Sort category data by amount descending for table
  const sortedCategories = [...expensesByCategory].sort(
    (a, b) => b.amount - a.amount
  );

  return (
    <div className="space-y-6">
      {/* ─── 1. Statistics Cards Row ─────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Expenses"
          value={formatCurrency(totalAmount)}
          description={`${totalExpenses} expense${totalExpenses !== 1 ? 's' : ''} recorded`}
          icon={DollarSign}
        />
        <StatCard
          title="This Month"
          value={formatCurrency(amountThisMonth)}
          description={`${expensesThisMonth} expense${expensesThisMonth !== 1 ? 's' : ''} this month`}
          icon={Calendar}
        />
        <StatCard
          title="Average Expense"
          value={formatCurrency(averageAmount)}
          description="Per expense average"
          icon={BarChart3}
        />
        <StatCard
          title="Categories"
          value={uniqueCategories.toString()}
          description={`Active categor${uniqueCategories !== 1 ? 'ies' : 'y'} used`}
          icon={PieChart}
        />
      </div>

      {/* ─── 2. Charts Section ──────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-7">
        {/* Monthly Trend Bar Chart */}
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              Monthly Overview
            </CardTitle>
            <CardDescription>Expense trends over the past months</CardDescription>
          </CardHeader>
          <CardContent>
            {monthlyTrend.length === 0 ? (
              <div className="flex h-[300px] items-center justify-center">
                <p className="text-sm text-muted-foreground">
                  No monthly data available
                </p>
              </div>
            ) : (
              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={monthlyTrend}
                    margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      className="stroke-border/50"
                    />
                    <XAxis
                      dataKey="month"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 12 }}
                      className="fill-muted-foreground"
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 12 }}
                      tickFormatter={(value: number) =>
                        value >= 1000
                          ? `$${(value / 1000).toFixed(0)}k`
                          : `$${value}`
                      }
                      className="fill-muted-foreground"
                    />
                    <Tooltip content={<BarChartTooltip />} cursor={{ fill: 'hsl(var(--muted) / 0.3)' }} />
                    <Bar
                      dataKey="amount"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={56}
                    >
                      {monthlyTrend.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={
                            entry.amount > 0
                              ? 'hsl(160, 84%, 39%)'
                              : 'hsl(160, 20%, 80%)'
                          }
                          className="fill-emerald-600 dark:fill-emerald-500"
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Category Breakdown Pie Chart */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChart className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              Category Breakdown
            </CardTitle>
            <CardDescription>
              Expense distribution by category
            </CardDescription>
          </CardHeader>
          <CardContent>
            {pieData.length === 0 ? (
              <div className="flex h-[300px] items-center justify-center">
                <p className="text-sm text-muted-foreground">
                  No category data available
                </p>
              </div>
            ) : (
              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsPieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="45%"
                      innerRadius={55}
                      outerRadius={90}
                      paddingAngle={2}
                      dataKey="value"
                      nameKey="name"
                      strokeWidth={1}
                      stroke="hsl(var(--background))"
                    >
                      {pieData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={
                            CATEGORY_COLORS[entry.category as Category] ??
                            '#78716c'
                          }
                        />
                      ))}
                    </Pie>
                    <Tooltip content={<PieChartTooltip />} />
                    <Legend
                      content={<PieChartLegend />}
                      layout="horizontal"
                      verticalAlign="bottom"
                    />
                  </RechartsPieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── 3. Recent Expenses + Category Table ────────────────── */}
      <div className="grid gap-4 lg:grid-cols-7">
        {/* Recent Expenses */}
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              Recent Expenses
            </CardTitle>
            <CardDescription>Latest 5 transactions</CardDescription>
          </CardHeader>
          <CardContent>
            {recentExpenses.length === 0 ? (
              <div className="flex h-32 items-center justify-center">
                <p className="text-sm text-muted-foreground">
                  No recent expenses
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentExpenses.map((expense) => {
                  const catColor =
                    CATEGORY_COLORS[expense.category as Category] ?? '#78716c';
                  return (
                    <div
                      key={expense.id}
                      className="group flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted/50 cursor-pointer"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-medium text-foreground">
                            {expense.title}
                          </p>
                          <Badge
                            variant="outline"
                            className="shrink-0 border-0 text-[10px] font-medium"
                            style={{
                              backgroundColor: `${catColor}18`,
                              color: catColor,
                            }}
                          >
                            {CATEGORY_LABELS[expense.category as Category] ??
                              expense.category}
                          </Badge>
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{formatDate(expense.expenseDate)}</span>
                          <span className="text-border">·</span>
                          <span>Paid by {expense.paidBy}</span>
                        </div>
                      </div>
                      <div className="ml-4 shrink-0 text-right">
                        <p className="text-sm font-semibold text-foreground">
                          {formatCurrency(expense.amount)}
                        </p>
                      </div>
                    </div>
                  );
                })}

                {/* View all link */}
                <button
                  type="button"
                  className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-emerald-600/30 py-2 text-xs font-medium text-emerald-600 transition-colors hover:bg-emerald-600/5 hover:border-emerald-600/50 dark:text-emerald-400 dark:hover:bg-emerald-400/5"
                >
                  View all expenses
                  <ArrowRight className="h-3 w-3" />
                </button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Category Summary Table */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              Category Summary
            </CardTitle>
            <CardDescription>Breakdown by category</CardDescription>
          </CardHeader>
          <CardContent>
            {sortedCategories.length === 0 ? (
              <div className="flex h-32 items-center justify-center">
                <p className="text-sm text-muted-foreground">
                  No category data
                </p>
              </div>
            ) : (
              <div className="max-h-96 overflow-y-auto scrollbar-thin">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Category</TableHead>
                      <TableHead className="text-xs text-right">Count</TableHead>
                      <TableHead className="text-xs text-right">Amount</TableHead>
                      <TableHead className="text-xs text-right w-[80px]">% of Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedCategories.map((cat) => {
                      const catColor =
                        CATEGORY_COLORS[cat.category as Category] ?? '#78716c';
                      const percentage =
                        totalAmount > 0
                          ? (cat.amount / totalAmount) * 100
                          : 0;
                      return (
                        <TableRow key={cat.category}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div
                                className="h-2.5 w-2.5 shrink-0 rounded-sm"
                                style={{ backgroundColor: catColor }}
                              />
                              <span className="truncate text-xs font-medium">
                                {CATEGORY_LABELS[cat.category as Category] ??
                                  cat.category}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground">
                            {cat.count}
                          </TableCell>
                          <TableCell className="text-right text-xs font-medium">
                            {formatCurrency(cat.amount)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Progress
                                value={percentage}
                                className="h-1.5 w-12"
                                style={
                                  {
                                    '--progress-color': catColor,
                                  } as React.CSSProperties
                                }
                              />
                              <span className="text-xs text-muted-foreground tabular-nums w-10 text-right">
                                {percentage.toFixed(0)}%
                              </span>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
