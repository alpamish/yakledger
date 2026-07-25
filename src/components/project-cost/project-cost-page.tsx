'use client';

import * as React from 'react';
import { usePermissions } from '@/hooks/use-permissions';
import { useExpenseStore } from '@/hooks/use-expense-store';
import { PROJECT_COST_COLORS, fuelTypeLabel } from '@/types/project-cost';
import type { Module, Category } from '@/types/expense';
import { CATEGORY_LABELS, CATEGORY_COLORS } from '@/types/expense';
import type { ProjectCostData, ProjectCostDetail, ExpenseBreakdownItem } from '@/types/project-cost';
import { ProjectCostSkeleton } from './project-cost-skeleton';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
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
  Truck,
  Users,
  HardHat,
  Fuel,
  Package,
  HandCoins,
  ArrowRightLeft,
  BarChart3,
  PieChart as PieChartIcon,
  Calculator,
  TrendingUp,
  Clock,
  RotateCw,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  AreaChart,
  Area,
} from 'recharts';

const DATE_PRESETS = [
  { key: 'month', label: 'This Month' },
  { key: 'quarter', label: 'This Quarter' },
  { key: 'year', label: 'This Year' },
  { key: 'all', label: 'All Time' },
] as const;

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
    hour: '2-digit',
    minute: '2-digit',
  });
}

function useProjectCost(token: string | null, canView: (perm: Module) => boolean) {
  const [data, setData] = React.useState<ProjectCostData | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [dateRange, setDateRange] = React.useState<{ from?: string; to?: string }>({});
  const [activePreset, setActivePreset] = React.useState('all');

  const fetchData = React.useCallback(async () => {
    if (!canView('projectCost')) {
      setIsLoading(false);
      return;
    }
    try {
      setIsLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (dateRange.from) params.set('dateFrom', dateRange.from);
      if (dateRange.to) params.set('dateTo', dateRange.to);
      const qs = params.toString();
      const res = await fetch(`/api/project-cost${qs ? `?${qs}` : ''}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      } else {
        setError(json.error ?? 'Failed to load data');
      }
    } catch {
      setError('Failed to fetch project cost data');
    } finally {
      setIsLoading(false);
    }
  }, [token, dateRange, canView]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  const setPreset = React.useCallback((preset: string) => {
    const now = new Date();
    setActivePreset(preset);
    switch (preset) {
      case 'month': {
        const from = new Date(now.getFullYear(), now.getMonth(), 1);
        setDateRange({
          from: from.toISOString().split('T')[0],
          to: now.toISOString().split('T')[0],
        });
        break;
      }
      case 'quarter': {
        const qStart = Math.floor(now.getMonth() / 3) * 3;
        const from = new Date(now.getFullYear(), qStart, 1);
        setDateRange({
          from: from.toISOString().split('T')[0],
          to: now.toISOString().split('T')[0],
        });
        break;
      }
      case 'year': {
        const from = new Date(now.getFullYear(), 0, 1);
        setDateRange({
          from: from.toISOString().split('T')[0],
          to: now.toISOString().split('T')[0],
        });
        break;
      }
      case 'all':
        setDateRange({});
        break;
    }
  }, []);

  return { data, isLoading, error, fetchData, setPreset, activePreset };
}

interface StatCardProps {
  title: string;
  value: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color?: string;
}

function StatCard({ title, value, description, icon: Icon, color = 'emerald' }: StatCardProps) {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-600/10 text-blue-600 dark:text-blue-400',
    purple: 'bg-purple-600/10 text-purple-600 dark:text-purple-400',
    green: 'bg-emerald-600/10 text-emerald-600 dark:text-emerald-400',
    amber: 'bg-amber-600/10 text-amber-600 dark:text-amber-400',
    red: 'bg-red-600/10 text-red-600 dark:text-red-400',
    pink: 'bg-pink-600/10 text-pink-600 dark:text-pink-400',
    cyan: 'bg-cyan-600/10 text-cyan-600 dark:text-cyan-400',
    gray: 'bg-gray-600/10 text-gray-600 dark:text-gray-400',
  };
  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${colorMap[color] ?? colorMap.gray}`}>
          <Icon className="h-4 w-4" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tracking-tight">{value}</div>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

function PieChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    payload: { percent: number };
  }>;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="rounded-lg border border-border/50 bg-background px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-medium text-foreground">{d.name}</p>
      <p className="text-emerald-600 dark:text-emerald-400">
        Amount: {formatCurrency(d.value)}
      </p>
      <p className="text-muted-foreground">{d.payload.percent.toFixed(1)}%</p>
    </div>
  );
}

function CostLegend({ payload }: { payload?: Array<{ value: string; color: string }> }) {
  if (!payload?.length) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs">
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: entry.color }} />
          <span className="text-muted-foreground">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

function DetailSubRows({
  details,
  total,
  color,
}: {
  details?: ProjectCostDetail[];
  total: number;
  color: string;
}) {
  if (!details || details.length === 0) return null;
  return (
    <TableRow>
      <TableCell colSpan={5} className="p-0">
        <div className="bg-muted/30 px-4 sm:px-6 py-3">
          <div className="rounded-md border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Entity</TableHead>
                  <TableHead className="text-xs text-right">Paid</TableHead>
                  <TableHead className="text-xs text-right">Unpaid</TableHead>
                  <TableHead className="text-xs text-right">Total</TableHead>
                  <TableHead className="text-xs text-right w-[80px]">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {details.map((d, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-sm" style={{ backgroundColor: color }} />
                        <span className="text-xs font-medium">{d.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-xs">{formatCurrency(d.paid)}</TableCell>
                    <TableCell className="text-right text-xs">
                      {d.unpaid > 0 ? (
                        <span className="text-amber-600 dark:text-amber-400">{formatCurrency(d.unpaid)}</span>
                      ) : (
                        formatCurrency(d.unpaid)
                      )}
                    </TableCell>
                    <TableCell className="text-right text-xs font-semibold">{formatCurrency(d.total)}</TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {total > 0 ? ((d.total / total) * 100).toFixed(0) : 0}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function ProjectCostPage() {
  const { canView } = usePermissions();
  const token = useExpenseStore((s) => s.token);
  const { data, isLoading, error, fetchData, setPreset, activePreset } = useProjectCost(token, canView);
  const [expandedRow, setExpandedRow] = React.useState<string | null>(null);

  if (!canView('projectCost')) return null;

  if (isLoading && !data) {
    return <ProjectCostSkeleton />;
  }

  if (error) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <EmptyState
          icon={BarChart3}
          title="Failed to load"
          description={error}
        />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <EmptyState
          icon={Calculator}
          title="No cost data"
          description="Add expenses, employees, contractors and other records to see your project cost breakdown."
        />
      </div>
    );
  }

  const {
    expenses, machinery, employeeSalaries, contractorPayments,
    fuelCost, assetPurchases, cashAdvances, walletTransfers,
    details, monthlyTrend, byCategory, expenseBreakdown, lastUpdated,
  } = data;

  const toggleRow = (key: string) => {
    setExpandedRow(expandedRow === key ? null : key);
  };

  const breakdownRows = [
    {
      key: 'expenses', label: 'Expenses',
      paid: null, unpaid: null, total: expenses.total,
      color: PROJECT_COST_COLORS.expenses, desc: 'All recorded expenses',
      detailKey: undefined,
    },
    {
      key: 'machinery', label: 'Machinery Cost',
      paid: machinery.paid, unpaid: machinery.unpaid, total: machinery.total,
      color: PROJECT_COST_COLORS.machinery, desc: 'Paid + computed from timesheets',
      detailKey: 'machinery' as const,
    },
    {
      key: 'employeeSalaries', label: 'Employee Salaries',
      paid: employeeSalaries.paid, unpaid: employeeSalaries.unpaid, total: employeeSalaries.total,
      color: PROJECT_COST_COLORS.employeeSalaries, desc: 'Paid + earned from attendance',
      detailKey: 'employeeSalaries' as const,
    },
    {
      key: 'contractorPayments', label: 'Contractor Payments',
      paid: contractorPayments.paid, unpaid: contractorPayments.remaining, total: contractorPayments.total,
      color: PROJECT_COST_COLORS.contractorPayments, desc: 'Paid + computed from timesheets',
      detailKey: 'contractorPayments' as const,
    },
    {
      key: 'fuelCost', label: 'Fuel Cost',
      paid: null, unpaid: null, total: fuelCost.total,
      color: PROJECT_COST_COLORS.fuelCost,
      desc: fuelCost.byFuelType.map((f) => `${fuelTypeLabel(f.fuelType)}: ${formatCurrency(f.total)}`).join(' | '),
      detailKey: 'fuelCost' as const,
    },
    {
      key: 'assetPurchases', label: 'Asset Purchases',
      paid: null, unpaid: null, total: assetPurchases.total,
      color: PROJECT_COST_COLORS.assetPurchases, desc: 'Total purchase price',
      detailKey: undefined,
    },
    {
      key: 'cashAdvances', label: 'Cash Advances',
      paid: cashAdvances.total, unpaid: cashAdvances.remaining, total: cashAdvances.total,
      color: PROJECT_COST_COLORS.cashAdvances, desc: 'Advances minus returns',
      detailKey: 'cashAdvances' as const,
    },
  ];

  const totalOfAll = breakdownRows.reduce((s, r) => s + r.total, 0);

  const barData = breakdownRows.map((r) => ({
    name: r.label,
    value: r.total,
    fill: r.color,
  }));

  const pieData = byCategory.map((item) => ({
    ...item,
    percent: totalOfAll > 0 ? (item.value / totalOfAll) * 100 : 0,
  }));

  const trendColors = ['#3b82f6', '#ef4444', '#8b5cf6', '#f59e0b'];

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Calculator className="h-6 w-6 text-emerald-600" />
            Project Cost
          </h1>
          <p className="text-muted-foreground mt-1">
            Overall estimated project cost from all modules
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
          <Clock className="h-3.5 w-3.5" />
          Updated {formatDate(lastUpdated)}
          <Button variant="ghost" size="icon" className="h-7 w-7 ml-1" onClick={fetchData} title="Refresh">
            <RotateCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* ── Date Filter Bar ────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        {DATE_PRESETS.map((preset) => (
          <Button
            key={preset.key}
            variant={activePreset === preset.key ? 'default' : 'outline'}
            size="sm"
            className={activePreset === preset.key ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
            onClick={() => setPreset(preset.key)}
          >
            {preset.label}
          </Button>
        ))}
        {isLoading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground ml-2">
            <RotateCw className="h-3 w-3 animate-spin" />
            Loading...
          </div>
        )}
      </div>

      {/* ── Stat Cards ──────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Expenses" value={formatCurrency(expenses.total)}
          description="Across all categories" icon={DollarSign} color="blue" />
        <StatCard title="Machinery Cost" value={formatCurrency(machinery.total)}
          description={machinery.paid > 0 ? `${formatCurrency(machinery.paid)} paid` : 'No machinery costs'} icon={Truck} color="purple" />
        <StatCard title="Employee Salaries" value={formatCurrency(employeeSalaries.total)}
          description={employeeSalaries.paid > 0 ? `${formatCurrency(employeeSalaries.paid)} paid` : 'No salary data'} icon={Users} color="green" />
        <StatCard title="Contractor Payments" value={formatCurrency(contractorPayments.total)}
          description={contractorPayments.paid > 0 ? `${formatCurrency(contractorPayments.paid)} paid` : 'No contractor data'} icon={HardHat} color="amber" />
        <StatCard title="Fuel Cost" value={formatCurrency(fuelCost.total)}
          description="Total purchased fuel stock" icon={Fuel} color="red" />
        <StatCard title="Asset Purchases" value={formatCurrency(assetPurchases.total)}
          description={assetPurchases.total > 0 ? 'Total purchase price' : 'No assets'} icon={Package} color="pink" />
        <StatCard title="Cash Advances" value={formatCurrency(cashAdvances.total)}
          description={cashAdvances.remaining > 0 ? `${formatCurrency(cashAdvances.remaining)} outstanding` : 'No advances'} icon={HandCoins} color="cyan" />
        <StatCard title="Wallet Transfers" value={formatCurrency(walletTransfers.total)}
          description="Internal transfers only" icon={ArrowRightLeft} color="gray" />
      </div>

      {/* ── Charts Section ──────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-7">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <PieChartIcon className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              Cost Distribution
            </CardTitle>
            <CardDescription>How costs are distributed across modules</CardDescription>
          </CardHeader>
          <CardContent>
            {pieData.length === 0 ? (
              <div className="flex h-[300px] items-center justify-center">
                <p className="text-sm text-muted-foreground">No data</p>
              </div>
            ) : (
              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData} cx="50%" cy="45%" innerRadius={55} outerRadius={90}
                      paddingAngle={2} dataKey="value" nameKey="name"
                      strokeWidth={1} stroke="hsl(var(--background))"
                    >
                      {pieData.map((entry, i) => (
                        <Cell key={`cell-${i}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<PieChartTooltip />} />
                    <Legend content={<CostLegend />} layout="horizontal" verticalAlign="bottom" />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              Cost by Category
            </CardTitle>
            <CardDescription>Total cost per module</CardDescription>
          </CardHeader>
          <CardContent>
            {barData.length === 0 ? (
              <div className="flex h-[300px] items-center justify-center">
                <p className="text-sm text-muted-foreground">No data</p>
              </div>
            ) : (
              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-border/50" />
                    <XAxis type="number" tickLine={false} axisLine={false} tick={{ fontSize: 11 }}
                      tickFormatter={(v: number) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`}
                      className="fill-muted-foreground" />
                    <YAxis type="category" dataKey="name" tickLine={false} axisLine={false}
                      tick={{ fontSize: 11 }} width={130} className="fill-muted-foreground" />
                    <Tooltip cursor={{ fill: 'hsl(var(--muted) / 0.3)' }}
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        return (
                          <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-xl">
                            <p className="mb-1 font-medium">{label}</p>
                            <p className="text-emerald-600 dark:text-emerald-400">{formatCurrency(payload[0].value as number)}</p>
                          </div>
                        );
                      }} />
                    <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={24}>
                      {barData.map((entry, i) => (
                        <Cell key={`cell-${i}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Monthly Trend Chart ────────────────────────────────── */}
      {monthlyTrend.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              Monthly Cost Trend
            </CardTitle>
            <CardDescription>Cost breakdown over the last 6 months</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlyTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border/50" />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }}
                    tickFormatter={(v: number) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`}
                    className="fill-muted-foreground" />
                  <Tooltip content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-xl space-y-1">
                        <p className="font-medium mb-1">{label}</p>
                        {(payload as Array<{ name: string; value: number; color: string }>).map((p, i) => (
                          <p key={i} style={{ color: p.color }}>{p.name}: {formatCurrency(p.value)}</p>
                        ))}
                      </div>
                    );
                  }} />
                  <Area type="monotone" dataKey="expenses" name="Expenses" stackId="1"
                    stroke={trendColors[0]} fill={trendColors[0]} fillOpacity={0.15} strokeWidth={2} />
                  <Area type="monotone" dataKey="fuelCost" name="Fuel Cost" stackId="1"
                    stroke={trendColors[1]} fill={trendColors[1]} fillOpacity={0.15} strokeWidth={2} />
                  <Area type="monotone" dataKey="machineryCost" name="Machinery Cost" stackId="1"
                    stroke={trendColors[2]} fill={trendColors[2]} fillOpacity={0.15} strokeWidth={2} />
                  <Area type="monotone" dataKey="contractorCost" name="Contractor Cost" stackId="1"
                    stroke={trendColors[3]} fill={trendColors[3]} fillOpacity={0.15} strokeWidth={2} />
                  <Legend
                    content={({ payload }) => {
                      if (!payload?.length) return null;
                      return (
                        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs">
                          {payload.map((entry, i) => (
                            <div key={i} className="flex items-center gap-1.5">
                              <div className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: entry.color }} />
                              <span className="text-muted-foreground">{entry.value}</span>
                            </div>
                          ))}
                        </div>
                      );
                    }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Detailed Breakdown Table ──────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <BarChart3 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            Detailed Cost Breakdown
          </CardTitle>
          <CardDescription>Click a row to see per-entity details</CardDescription>
        </CardHeader>
        <CardContent className="p-0 sm:p-6">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs w-[200px]">Category</TableHead>
                  <TableHead className="text-xs text-right">Paid</TableHead>
                  <TableHead className="text-xs text-right">Unpaid / Remaining</TableHead>
                  <TableHead className="text-xs text-right">Total</TableHead>
                  <TableHead className="text-xs text-right w-[100px]">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {breakdownRows.map((row) => {
                  const percentage = totalOfAll > 0 ? (row.total / totalOfAll) * 100 : 0;
                  const isExpanded = expandedRow === row.key;
                  const hasDetail = row.detailKey && (details[row.detailKey]?.length ?? 0) > 0;
                  return (
                    <React.Fragment key={row.key}>
                      <TableRow
                        className={hasDetail ? 'cursor-pointer hover:bg-muted/50' : ''}
                        onClick={() => hasDetail && toggleRow(row.key)}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {hasDetail ? (
                              isExpanded
                                ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            ) : (
                              <div className="w-3.5" />
                            )}
                            <div className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: row.color }} />
                            <div>
                              <span className="text-xs font-medium">{row.label}</span>
                              <p className="text-[10px] text-muted-foreground mt-0.5">{row.desc}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-xs font-medium">
                          {row.paid !== null ? formatCurrency(row.paid) : '—'}
                        </TableCell>
                        <TableCell className="text-right text-xs font-medium">
                          {row.unpaid !== null ? (
                            <span className={row.unpaid > 0 ? 'text-amber-600 dark:text-amber-400' : ''}>
                              {formatCurrency(row.unpaid)}
                            </span>
                          ) : '—'}
                        </TableCell>
                        <TableCell className="text-right text-xs font-semibold">
                          {formatCurrency(row.total)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Progress value={percentage} className="h-1.5 w-12"
                              style={{ '--progress-color': row.color } as React.CSSProperties} />
                            <span className="text-xs text-muted-foreground tabular-nums w-10 text-right">
                              {percentage.toFixed(0)}%
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                      {isExpanded && row.detailKey && (
                        <DetailSubRows
                          details={details[row.detailKey]}
                          total={row.total}
                          color={row.color}
                        />
                      )}
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="border-t px-4 sm:px-6 py-3">
            <span className="text-xs text-muted-foreground">
              Wallet Transfers ({formatCurrency(walletTransfers.total)}) are internal money movements and are excluded from project cost calculations.
            </span>
          </div>
        </CardContent>
      </Card>

      {/* ── Detailed Expense Breakdown ─────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <DollarSign className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            Detailed Expense Breakdown
          </CardTitle>
          <CardDescription>All expenses grouped by category</CardDescription>
        </CardHeader>
        <CardContent className="p-0 sm:p-6">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Category</TableHead>
                  <TableHead className="text-xs text-right">Count</TableHead>
                  <TableHead className="text-xs text-right">Amount</TableHead>
                  <TableHead className="text-xs text-right w-[120px]">% of Expenses</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenseBreakdown.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-xs text-muted-foreground py-8">
                      No expense data found
                    </TableCell>
                  </TableRow>
                ) : (
                  expenseBreakdown.map((item) => {
                    const pct = expenses.total > 0 ? (item.amount / expenses.total) * 100 : 0;
                    return (
                      <TableRow key={item.category}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: item.color }} />
                            <span className="text-xs font-medium">
                              {CATEGORY_LABELS[item.category as Category] ?? item.category}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {item.count}
                        </TableCell>
                        <TableCell className="text-right text-xs font-semibold">
                          {formatCurrency(item.amount)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Progress value={pct} className="h-1.5 w-14"
                              style={{ ['--progress-color' as string]: item.color }} />
                            <span className="text-xs text-muted-foreground tabular-nums w-10 text-right">
                              {pct.toFixed(0)}%
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
