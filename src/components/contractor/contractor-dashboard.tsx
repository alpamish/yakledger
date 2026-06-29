'use client';

import * as React from 'react';
import { useContractorStore } from '@/hooks/use-contractor-store';
import {
  CONTRACTOR_TYPE_LABELS,
  CONTRACTOR_TYPE_COLORS,
  CONTRACTOR_STATUS_LABELS,
  CONTRACTOR_STATUS_COLORS,
} from '@/types/contractor';
import type { ContractorType, ContractorStatus } from '@/types/contractor';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/common/loading-spinner';
import { EmptyState } from '@/components/common/empty-state';
import {
  HardHat,
  UserCheck,
  DollarSign,
  Calendar,
  Clock,
  Fuel,
  PieChart,
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

function formatHours(hours: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(hours);
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
  payload?: Array<{ value: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border/50 bg-background px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-medium text-foreground">{label}</p>
      <p className="text-emerald-600 dark:text-emerald-400">
        Amount: {formatCurrency(payload[0].value)}
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
    payload: { count: number; contractorType: string };
  }>;
}) {
  if (!active || !payload?.length) return null;
  const data = payload[0];
  return (
    <div className="rounded-lg border border-border/50 bg-background px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-medium text-foreground">{data.name}</p>
      <p className="text-emerald-600 dark:text-emerald-400">
        Count: {data.value} contractor{data.value !== 1 ? 's' : ''}
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
  iconColor?: string;
}

function StatCard({ title, value, description, icon: Icon, iconColor = 'text-emerald-600 dark:text-emerald-400' }: StatCardProps) {
  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600/10">
          <Icon className={`h-4 w-4 ${iconColor}`} />
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

export function ContractorDashboard() {
  const { dashboardStats, fetchDashboard, isLoading } = useContractorStore();
  const [hasFetched, setHasFetched] = React.useState(false);

  React.useEffect(() => {
    if (!hasFetched) {
      fetchDashboard();
      setHasFetched(true);
    }
  }, [fetchDashboard, hasFetched]);

  // ─── Loading state ──────────────────────────────────────────
  if (isLoading && !dashboardStats) {
    return (
      <div className="flex h-[40vh] items-center justify-center">
        <LoadingSpinner size="lg" text="Loading contractor dashboard..." />
      </div>
    );
  }

  // ─── Empty state ────────────────────────────────────────────
  if (!dashboardStats) {
    return (
      <div className="flex h-[40vh] items-center justify-center">
        <EmptyState
          icon={HardHat}
          title="No contractor data"
          description="Start adding contractors to see dashboard statistics and charts."
        />
      </div>
    );
  }

  const {
    totalContractors,
    activeContractors,
    totalContractorExpenses,
    monthlyContractorPayments,
    totalTimesheetHours,
    totalFuelCost,
    contractorsByType,
    monthlyPaymentTrend,
    recentContractors,
    topContractorsByExpense,
  } = dashboardStats;

  // Prepare pie chart data
  const pieData = contractorsByType.map((item) => ({
    name: CONTRACTOR_TYPE_LABELS[item.type as ContractorType] ?? item.type,
    value: item.count,
    contractorType: item.type,
  }));

  return (
    <div className="space-y-6">
      {/* ─── 1. Statistics Cards Row ─────────────────────────────── */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Contractors"
          value={totalContractors.toString()}
          description={`${activeContractors} active`}
          icon={HardHat}
        />
        <StatCard
          title="Active Contractors"
          value={activeContractors.toString()}
          description={`${totalContractors > 0 ? ((activeContractors / totalContractors) * 100).toFixed(0) : 0}% of total`}
          icon={UserCheck}
          iconColor="text-emerald-600 dark:text-emerald-400"
        />
        <StatCard
          title="Total Expenses"
          value={formatCurrency(totalContractorExpenses)}
          description="All contractor expenses"
          icon={DollarSign}
        />
        <StatCard
          title="Monthly Payments"
          value={formatCurrency(monthlyContractorPayments)}
          description="This month's payments"
          icon={Calendar}
        />
        <StatCard
          title="Timesheet Hours"
          value={`${formatHours(totalTimesheetHours)} hrs`}
          description="Total hours logged"
          icon={Clock}
          iconColor="text-teal-600 dark:text-teal-400"
        />
        <StatCard
          title="Total Fuel Cost"
          value={formatCurrency(totalFuelCost)}
          description="All fuel expenses"
          icon={Fuel}
          iconColor="text-amber-600 dark:text-amber-400"
        />
      </div>

      {/* ─── 2. Charts Section ──────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Contractor Type Distribution Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChart className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              Contractor Type Distribution
            </CardTitle>
            <CardDescription>Breakdown by contractor type</CardDescription>
          </CardHeader>
          <CardContent>
            {pieData.length === 0 ? (
              <div className="flex h-[300px] items-center justify-center">
                <p className="text-sm text-muted-foreground">
                  No type data available
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
                            CONTRACTOR_TYPE_COLORS[entry.contractorType as ContractorType] ??
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

        {/* Monthly Payment Trend Bar Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              Monthly Payment Trend
            </CardTitle>
            <CardDescription>Payment trends over recent months</CardDescription>
          </CardHeader>
          <CardContent>
            {monthlyPaymentTrend.length === 0 ? (
              <div className="flex h-[300px] items-center justify-center">
                <p className="text-sm text-muted-foreground">
                  No payment trend data available
                </p>
              </div>
            ) : (
              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={monthlyPaymentTrend}
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
                          ? `AFN ${(value / 1000).toFixed(0)}k`
                          : `AFN ${value}`
                      }
                      className="fill-muted-foreground"
                    />
                    <Tooltip content={<BarChartTooltip />} cursor={{ fill: 'hsl(var(--muted) / 0.3)' }} />
                    <Bar
                      dataKey="amount"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={56}
                      className="fill-emerald-600 dark:fill-emerald-500"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── 3. Top Contractors by Expense ────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            Top Contractors by Expense
          </CardTitle>
          <CardDescription>Highest expense contractors</CardDescription>
        </CardHeader>
        <CardContent>
          {topContractorsByExpense.length === 0 ? (
            <div className="flex h-24 items-center justify-center">
              <p className="text-sm text-muted-foreground">
                No expense data available
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {topContractorsByExpense.map((contractor, index) => {
                const maxAmount = topContractorsByExpense[0]?.totalAmount ?? 1;
                const percentage =
                  maxAmount > 0 ? (contractor.totalAmount / maxAmount) * 100 : 0;
                return (
                  <div
                    key={contractor.id}
                    className="flex items-center gap-4 rounded-lg border p-3 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600/10 text-emerald-700 dark:text-emerald-400 text-sm font-bold">
                      {index + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {contractor.contractorName}
                      </p>
                      <div className="mt-1 h-1.5 w-full rounded-full bg-muted">
                        <div
                          className="h-1.5 rounded-full bg-emerald-600 dark:bg-emerald-500 transition-all"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold tabular-nums">
                        {formatCurrency(contractor.totalAmount)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── 4. Recent Contractors ───────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            Recent Contractors
          </CardTitle>
          <CardDescription>Latest 5 registered contractors</CardDescription>
        </CardHeader>
        <CardContent>
          {recentContractors.length === 0 ? (
            <div className="flex h-24 items-center justify-center">
              <p className="text-sm text-muted-foreground">
                No recent contractors
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentContractors.map((contractor) => {
                const typeColor =
                  CONTRACTOR_TYPE_COLORS[contractor.contractorType as ContractorType] ??
                  '#78716c';
                const statusColor =
                  CONTRACTOR_STATUS_COLORS[contractor.status as ContractorStatus] ??
                  '#78716c';
                return (
                  <div
                    key={contractor.id}
                    className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-600/10 text-emerald-700 dark:text-emerald-400 text-sm font-semibold">
                        {contractor.contractorName
                          .split(' ')
                          .map((n) => n[0])
                          .join('')
                          .toUpperCase()
                          .slice(0, 2)}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {contractor.contractorName}
                        </p>
                        <div className="mt-1 flex items-center gap-1.5">
                          <Badge
                            variant="outline"
                            className="border-0 text-[10px] px-1.5 py-0"
                            style={{
                              backgroundColor: `${typeColor}18`,
                              color: typeColor,
                            }}
                          >
                            {CONTRACTOR_TYPE_LABELS[contractor.contractorType as ContractorType] ??
                              contractor.contractorType}
                          </Badge>
                          <Badge
                            variant="outline"
                            className="border-0 text-[10px] px-1.5 py-0"
                            style={{
                              backgroundColor: `${statusColor}18`,
                              color: statusColor,
                            }}
                          >
                            {CONTRACTOR_STATUS_LABELS[contractor.status as ContractorStatus] ??
                              contractor.status}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div className="ml-4 shrink-0 text-right">
                      <p className="text-xs text-muted-foreground">
                        {formatDate(contractor.createdAt)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
