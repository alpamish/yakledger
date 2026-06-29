'use client';

import * as React from 'react';
import { machineryApi } from '@/services/contractor-api';
import type { MachinerySummaryStats, MachineryByContractor, MachineryFuelPerMachinery } from '@/types/contractor';
import {
  MACHINERY_STATUS_LABELS,
  MACHINERY_STATUS_COLORS,
} from '@/types/contractor';
import type { MachineryStatus } from '@/types/contractor';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/common/loading-spinner';
import { EmptyState } from '@/components/common/empty-state';
import {
  Truck,
  Clock,
  Calendar,
  Fuel,
  DollarSign,
  Gauge,
  Sun,
  PieChart,
  Users,
  Search,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from 'lucide-react';

function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(n);
}

function formatFuel(n: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(n);
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'AFN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

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

// ─── Contractor Summary Section ─────────────────────────────────

function ContractorSummarySection() {
  const [data, setData] = React.useState<MachineryByContractor[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [search, setSearch] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const pageSize = 10;

  const fetchData = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await machineryApi.getContractorSummary({
        search: search || undefined,
        page,
        pageSize,
      });
      if (res.data) {
        setData(res.data.data);
        setTotalPages(res.data.totalPages);
        setTotal(res.data.total);
      }
    } catch {
      // silently fail
    } finally {
      setIsLoading(false);
    }
  }, [search, page]);

  React.useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          Machinery by Contractor
        </CardTitle>
        <CardDescription>
          Machinery count, work hours, and fuel usage per contractor
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search contractor name..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9 h-8 text-sm"
          />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : data.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {search ? 'No contractors match your search' : 'No contractor data available'}
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Contractor</th>
                    <th className="px-4 py-3 font-medium text-right">Machinery</th>
                    <th className="px-4 py-3 font-medium text-right">Work Hours</th>
                    <th className="px-4 py-3 font-medium text-right">Fuel (L)</th>
                    <th className="px-4 py-3 font-medium text-right">Fuel Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((item) => (
                    <tr key={item.contractorId} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="px-4 py-3 font-medium">{item.contractorName}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {item.machineryCount}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {formatNumber(item.totalHours)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {formatFuel(item.totalFuelQuantity)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {formatCurrency(item.totalFuelCost)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-2">
                <p className="text-xs text-muted-foreground">
                  Showing {data.length} of {total}
                </p>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon" className="h-7 w-7" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                    <ChevronLeft className="h-3 w-3" />
                  </Button>
                  <span className="text-xs text-muted-foreground px-2">
                    {page} / {totalPages}
                  </span>
                  <Button variant="outline" size="icon" className="h-7 w-7" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                    <ChevronRight className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Fuel Summary Section ───────────────────────────────────────

function FuelSummarySection() {
  const [data, setData] = React.useState<MachineryFuelPerMachinery[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [search, setSearch] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const pageSize = 10;

  const fetchData = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await machineryApi.getFuelSummary({
        search: search || undefined,
        page,
        pageSize,
      });
      if (res.data) {
        setData(res.data.data);
        setTotalPages(res.data.totalPages);
        setTotal(res.data.total);
      }
    } catch {
      // silently fail
    } finally {
      setIsLoading(false);
    }
  }, [search, page]);

  React.useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Fuel className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          Fuel Usage per Machinery
        </CardTitle>
        <CardDescription>
          Fuel consumption, cost, and efficiency per machinery
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search machinery, driver, or contractor..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9 h-8 text-sm"
          />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : data.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {search ? 'No machinery matches your search' : 'No fuel usage data available'}
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Machinery</th>
                    <th className="px-4 py-3 font-medium">Driver</th>
                    <th className="px-4 py-3 font-medium">Contractor</th>
                    <th className="px-4 py-3 font-medium text-right">Work Hours</th>
                    <th className="px-4 py-3 font-medium text-right">Fuel (L)</th>
                    <th className="px-4 py-3 font-medium text-right">Fuel Cost</th>
                    <th className="px-4 py-3 font-medium text-right">L / Hour</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((item) => (
                    <tr key={item.machineryId} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="px-4 py-3 font-medium">{item.machineryName}</td>
                      <td className="px-4 py-3 text-muted-foreground">{item.driverName ?? '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{item.contractorName ?? '—'}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {formatNumber(item.totalHours)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {formatFuel(item.totalFuelQuantity)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {formatCurrency(item.totalFuelCost)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {formatFuel(item.litersPerHour)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-2">
                <p className="text-xs text-muted-foreground">
                  Showing {data.length} of {total}
                </p>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon" className="h-7 w-7" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                    <ChevronLeft className="h-3 w-3" />
                  </Button>
                  <span className="text-xs text-muted-foreground px-2">
                    {page} / {totalPages}
                  </span>
                  <Button variant="outline" size="icon" className="h-7 w-7" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                    <ChevronRight className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main MachinerySummary Component ────────────────────────────

export function MachinerySummary() {
  const [stats, setStats] = React.useState<MachinerySummaryStats | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const res = await machineryApi.getSummary();
        if (mounted && res.data) {
          setStats(res.data);
        }
      } catch {
        // silently fail
      } finally {
        if (mounted) setIsLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-[40vh] items-center justify-center">
        <LoadingSpinner size="lg" text="Loading machinery summary..." />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex h-[40vh] items-center justify-center">
        <EmptyState
          icon={Truck}
          title="No machinery data"
          description="Start adding machinery to see summary statistics."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ─── Stat Cards Row ─────────────────────────────── */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Machinery"
          value={stats.totalMachinery.toString()}
          description="All registered machinery"
          icon={Truck}
        />
        <StatCard
          title="Total Work Hours"
          value={`${formatNumber(stats.totalTimesheetHours)} hrs`}
          description="Timesheet hours logged"
          icon={Clock}
          iconColor="text-teal-600 dark:text-teal-400"
        />
        <StatCard
          title="Total Work Days"
          value={formatNumber(stats.totalTimesheetDays)}
          description="Distinct days with work"
          icon={Calendar}
          iconColor="text-blue-600 dark:text-blue-400"
        />
        <StatCard
          title="Total Fuel Used"
          value={`${formatFuel(stats.totalFuelQuantity)} L`}
          description="All machinery fuel consumption"
          icon={Fuel}
          iconColor="text-amber-600 dark:text-amber-400"
        />
        <StatCard
          title="Total Fuel Cost"
          value={formatCurrency(stats.totalFuelCost)}
          description="All machinery fuel expenses"
          icon={DollarSign}
          iconColor="text-red-600 dark:text-red-400"
        />
        <StatCard
          title="Avg Fuel / Hour"
          value={`${formatFuel(stats.averageFuelPerHour)} L`}
          description="Average fuel per work hour"
          icon={Gauge}
          iconColor="text-purple-600 dark:text-purple-400"
        />
        <StatCard
          title="Avg Fuel / Day"
          value={`${formatFuel(stats.averageFuelPerDay)} L`}
          description="Average fuel per work day"
          icon={Sun}
          iconColor="text-orange-600 dark:text-orange-400"
        />
      </div>

      {/* ─── Breakdown Section ──────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Machinery by Type */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChart className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              Machinery by Type
            </CardTitle>
            <CardDescription>Breakdown by machinery type</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.machineryByType.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No type data available
              </p>
            ) : (
              <div className="space-y-2">
                {stats.machineryByType.map((item) => {
                  const pct = stats.totalMachinery > 0
                    ? ((item.count / stats.totalMachinery) * 100).toFixed(0)
                    : '0';
                  return (
                    <div key={item.machineryType} className="flex items-center gap-3">
                      <span className="w-1/3 truncate text-sm font-medium">
                        {item.machineryType}
                      </span>
                      <div className="flex-1">
                        <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-emerald-600 dark:bg-emerald-500 transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                      <span className="w-16 text-right text-sm tabular-nums text-muted-foreground">
                        {item.count}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Machinery by Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              Machinery by Status
            </CardTitle>
            <CardDescription>Breakdown by operational status</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.machineryByStatus.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No status data available
              </p>
            ) : (
              <div className="space-y-3">
                {stats.machineryByStatus.map((item) => {
                  const color = MACHINERY_STATUS_COLORS[item.status as MachineryStatus] ?? '#78716c';
                  const pct = stats.totalMachinery > 0
                    ? ((item.count / stats.totalMachinery) * 100).toFixed(0)
                    : '0';
                  return (
                    <div key={item.status} className="flex items-center gap-3">
                      <Badge
                        variant="outline"
                        className="border-0 text-[10px] px-1.5 py-0 w-28 shrink-0"
                        style={{ backgroundColor: `${color}18`, color }}
                      >
                        {MACHINERY_STATUS_LABELS[item.status as MachineryStatus] ?? item.status}
                      </Badge>
                      <div className="flex-1">
                        <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${pct}%`, backgroundColor: color }}
                          />
                        </div>
                      </div>
                      <span className="w-16 text-right text-sm tabular-nums text-muted-foreground">
                        {item.count}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── Machinery by Contractor (paginated) ─────────── */}
      <ContractorSummarySection />

      {/* ─── Fuel Usage per Machinery (paginated) ────────── */}
      <FuelSummarySection />
    </div>
  );
}
