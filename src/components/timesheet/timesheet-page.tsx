'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { TimesheetForm } from './timesheet-form';
import { BatchTimesheetForm } from './batch-timesheet-form';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { timesheetsApi, machineryApi } from '@/services/contractor-api';
import type { Timesheet, Machinery } from '@/types/contractor';
import { resolveTimesheetHourlyRate } from '@/lib/contractor-rate';
import { APPROVAL_STATUS_LABELS } from '@/types/expense';
import type { ApprovalStatus } from '@/types/expense';
import {
  Plus,
  Clock,
  Search,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  BarChart3,
  CalendarDays,
  Timer,
  Briefcase,
  DollarSign,
  TrendingUp,
} from 'lucide-react';
import { format, getDaysInMonth } from 'date-fns';
import { toast } from 'sonner';
import { usePermissions } from '@/hooks/use-permissions';
import { useExpenseStore } from '@/hooks/use-expense-store';
import { useLiveRefresh } from '@/hooks/use-live-refresh';
import { ApprovalStatusBadge } from '@/components/common/approval-status-badge';
import { RecordAccessDialog } from '@/components/common/record-access-dialog';

interface DailyRow {
  day: number;
  date: string;
  dateLabel: string;
  totalHours: number;
  overtimeHours: number;
  entries: number;
  contractors: string;
}

interface ChartRow extends DailyRow {
  label: string;
}

interface ContractorRevenue {
  name: string;
  hours: number;
  revenue: number;
}

interface MachineryRevenue {
  name: string;
  plateNumber: string;
  contractor: string;
  hours: number;
  hourlyRate: number;
  revenue: number;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'AFN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function getHourlyRate(ts: Timesheet, machineryList: Machinery[]): number {
  if (!ts.machineryId) return 0;
  const machine = machineryList.find((m) => m.id === ts.machineryId);
  if (!machine) return 0;
  // Shared contract-aware resolver: linked rate tier → default tier →
  // machinery rates (derived via configured workHoursPerDay, never a hard 9).
  return resolveTimesheetHourlyRate(ts, machine.machineryRates ?? [], machine);
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ChartRow }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border bg-background px-3 py-2 shadow-md text-xs">
      <p className="font-medium">{d.dateLabel}</p>
      <p className="text-emerald-600 dark:text-emerald-400">Hours: {d.totalHours.toFixed(1)}</p>
      {d.overtimeHours > 0 && (
        <p className="text-amber-600 dark:text-amber-400">OT: {d.overtimeHours.toFixed(1)}</p>
      )}
      <p className="text-muted-foreground">{d.entries} entry(ies)</p>
    </div>
  );
}

const MONTH_LABELS = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function buildMonthOptions() {
  const now = new Date();
  const options: { value: string; label: string }[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    options.push({ value: key, label: `${MONTH_LABELS[d.getMonth() + 1]} ${d.getFullYear()}` });
  }
  return options;
}

function getMonthRange(monthKey: string): { dateFrom: string; dateTo: string } {
  const [yearStr, monthStr] = monthKey.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const daysInMonth = getDaysInMonth(new Date(year, month - 1));
  return {
    dateFrom: `${year}-${String(month).padStart(2, '0')}-01`,
    dateTo: `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`,
  };
}

export function TimesheetPage() {
  const { canView, canCreate, canEdit, canDelete, canApprove } = usePermissions();
  const isAdmin = useExpenseStore((s) => s.user)?.role === "ADMIN";

  if (!canView('timesheets')) return null;

  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [approvalStatus, setApprovalStatus] = useState<ApprovalStatus | ''>('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [dailyTimesheets, setDailyTimesheets] = useState<Timesheet[]>([]);
  const [isDailyLoading, setIsDailyLoading] = useState(true);

  const [machineryList, setMachineryList] = useState<Machinery[]>([]);

  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [machineryFilter, setMachineryFilter] = useState('');

  const monthOptions = useMemo(() => buildMonthOptions(), []);

  const [formOpen, setFormOpen] = useState(false);
  const [batchFormOpen, setBatchFormOpen] = useState(false);
  const [editingTimesheet, setEditingTimesheet] = useState<Timesheet | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; timesheet: Timesheet | null }>({
    open: false,
    timesheet: null,
  });

  const pageSize = 20;

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await timesheetsApi.getAll({
        search: search || undefined,
        approvalStatus: approvalStatus || undefined,
        page,
        pageSize,
      });
      const d = res.data!;
      setTimesheets(d.data);
      setTotalPages(d.totalPages);
      setTotal(d.total);
    } catch {
      toast.error('Failed to load timesheets');
    } finally {
      setIsLoading(false);
    }
  }, [search, approvalStatus, page, pageSize]);

  const fetchDailyData = useCallback(async () => {
    setIsDailyLoading(true);
    try {
      const { dateFrom, dateTo } = getMonthRange(selectedMonth);
      const allResults: Timesheet[] = [];
      let p = 1;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const res = await timesheetsApi.getAll({
          dateFrom,
          dateTo,
          machineryId: machineryFilter || undefined,
          search: search || undefined,
          approvalStatus: approvalStatus || undefined,
          page: p,
          pageSize: 100,
        });
        const d = res.data!;
        allResults.push(...d.data);
        if (p >= d.totalPages) break;
        p++;
      }
      setDailyTimesheets(allResults);
    } catch {
      toast.error('Failed to load daily data');
    } finally {
      setIsDailyLoading(false);
    }
  }, [selectedMonth, machineryFilter, search, approvalStatus]);

  useEffect(() => {
    machineryApi.getAll({ pageSize: 500 }).then((res) => {
      if (res.data) setMachineryList(res.data.data);
    }).catch(() => {});
  }, []);

  useLiveRefresh(fetchData, 15_000);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    fetchDailyData();
  }, [fetchDailyData]);

  const handleAdd = useCallback(() => {
    setEditingTimesheet(null);
    setFormOpen(true);
  }, []);

  const handleEdit = useCallback((t: Timesheet) => {
    setEditingTimesheet(t);
    setFormOpen(true);
  }, []);

  const handleDelete = useCallback((t: Timesheet) => {
    setDeleteConfirm({ open: true, timesheet: t });
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (deleteConfirm.timesheet) {
      try {
        await timesheetsApi.delete(deleteConfirm.timesheet.id);
        toast.success('Timesheet deleted successfully');
        fetchData();
      } catch {
        toast.error('Failed to delete timesheet');
      }
    }
    setDeleteConfirm({ open: false, timesheet: null });
  }, [deleteConfirm.timesheet, fetchData]);

  const handleFormSuccess = useCallback(() => {
    fetchData();
    fetchDailyData();
  }, [fetchData, fetchDailyData]);

  const handleApprove = useCallback(async (id: string) => {
    try {
      await timesheetsApi.approve(id);
      toast.success('Timesheet approved successfully');
      fetchData();
    } catch {
      toast.error('Failed to approve timesheet');
    }
  }, [fetchData]);

  // ── Daily rows (from unpaginated dailyTimesheets) ──
  const { dailyRows, chartData, grandTotalHours, grandTotalOT, workingDays, avgHoursPerDay } = useMemo(() => {
    const [yearStr, monthStr] = selectedMonth.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const daysInMonth = getDaysInMonth(new Date(year, month - 1));

    const dayMap = new Map<number, { totalHours: number; overtimeHours: number; entries: number; contractors: Set<string> }>();

    for (const ts of dailyTimesheets) {
      const d = new Date(ts.date);
      if (d.getFullYear() === year && d.getMonth() + 1 === month) {
        const day = d.getDate();
        const existing = dayMap.get(day);
        if (existing) {
          existing.totalHours += ts.totalHours;
          existing.overtimeHours += ts.overtimeHours;
          existing.entries += 1;
          if (ts.contractor?.contractorName) existing.contractors.add(ts.contractor.contractorName);
        } else {
          dayMap.set(day, {
            totalHours: ts.totalHours,
            overtimeHours: ts.overtimeHours,
            entries: 1,
            contractors: ts.contractor?.contractorName ? new Set([ts.contractor.contractorName]) : new Set(),
          });
        }
      }
    }

    const rows: DailyRow[] = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const entry = dayMap.get(day);
      if (entry) {
        const dateObj = new Date(year, month - 1, day);
        rows.push({
          day,
          date: format(dateObj, 'yyyy-MM-dd'),
          dateLabel: format(dateObj, 'MMM dd, yyyy'),
          totalHours: entry.totalHours,
          overtimeHours: entry.overtimeHours,
          entries: entry.entries,
          contractors: Array.from(entry.contractors).join(', ') || '\u2014',
        });
      }
    }

    const chart: ChartRow[] = rows.map((r) => ({ ...r, label: format(new Date(year, month - 1, r.day), 'dd') }));

    const gTotalH = rows.reduce((s, r) => s + r.totalHours, 0);
    const gTotalO = rows.reduce((s, r) => s + r.overtimeHours, 0);
    const wDays = rows.length;
    const avg = wDays > 0 ? gTotalH / wDays : 0;

    return {
      dailyRows: rows,
      chartData: chart,
      grandTotalHours: gTotalH,
      grandTotalOT: gTotalO,
      workingDays: wDays,
      avgHoursPerDay: avg,
    };
  }, [dailyTimesheets, selectedMonth]);

  // ── Financial data (from unpaginated dailyTimesheets + machineryList rates) ──
  const { totalRevenue, finTotalHours, avgHourlyRate, byContractor, byMachinery } = useMemo(() => {
    const contractorMap = new Map<string, { hours: number; revenue: number }>();
    const machineryMap = new Map<string, { name: string; plateNumber: string; contractor: string; hours: number; hourlyRate: number; revenue: number }>();
    let totalH = 0;
    let totalR = 0;

    for (const ts of dailyTimesheets) {
      const rate = getHourlyRate(ts, machineryList);
      const revenue = ts.totalHours * rate;
      totalH += ts.totalHours;
      totalR += revenue;

      const contractorName = ts.contractor?.contractorName ?? 'Unknown';
      const existing = contractorMap.get(contractorName);
      if (existing) {
        existing.hours += ts.totalHours;
        existing.revenue += revenue;
      } else {
        contractorMap.set(contractorName, { hours: ts.totalHours, revenue });
      }

      if (ts.machineryId) {
        const machine = machineryList.find((m) => m.id === ts.machineryId);
        const machName = machine?.machineryName ?? ts.machinery?.machineryType ?? 'Unknown';
        const plate = machine?.plateNumber ?? ts.machinery?.plateNumber ?? '';
        const machEntry = machineryMap.get(ts.machineryId);
        if (machEntry) {
          machEntry.hours += ts.totalHours;
          machEntry.revenue += revenue;
        } else {
          machineryMap.set(ts.machineryId, {
            name: machName,
            plateNumber: plate,
            contractor: contractorName,
            hours: ts.totalHours,
            hourlyRate: rate,
            revenue,
          });
        }
      }
    }

    const byCtr: ContractorRevenue[] = Array.from(contractorMap.entries())
      .map(([name, d]) => ({ name, ...d }))
      .sort((a, b) => b.revenue - a.revenue);

    const byMach: MachineryRevenue[] = Array.from(machineryMap.values())
      .sort((a, b) => b.revenue - a.revenue);

    return {
      totalRevenue: totalR,
      finTotalHours: totalH,
      avgHourlyRate: totalH > 0 ? totalR / totalH : 0,
      byContractor: byCtr,
      byMachinery: byMach,
    };
  }, [dailyTimesheets, machineryList]);

  // ── Shared filter bar for Daily Hours & Financial tabs ──
  const tabFilterBar = (
    <div className="flex items-center gap-3">
      <CalendarDays className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
      <Select value={selectedMonth} onValueChange={setSelectedMonth}>
        <SelectTrigger className="w-[200px] h-10">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {monthOptions.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={machineryFilter || '_all'} onValueChange={(v) => setMachineryFilter(v === '_all' ? '' : v)}>
        <SelectTrigger className="w-[220px] h-10">
          <SelectValue placeholder="All Machinery" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="_all">All Machinery</SelectItem>
          {machineryList.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {m.machineryName}{m.plateNumber ? ` (${m.plateNumber})` : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Clock className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            Timesheets
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage contractor timesheets and hours
          </p>
        </div>
        {canCreate('timesheets') && (
          <div className="flex items-center gap-2">
            <Button onClick={() => setBatchFormOpen(true)} variant="outline">
              <Plus className="mr-2 h-4 w-4" />
              Batch Entry
            </Button>
            <Button onClick={handleAdd} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              <Plus className="mr-2 h-4 w-4" />
              Add Timesheet
            </Button>
          </div>
        )}
      </div>

      {/* Search */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-sm flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, site, or plate number..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9"
          />
        </div>
        <Select
          value={approvalStatus || '_all'}
          onValueChange={(v) => { setApprovalStatus(v === '_all' ? '' : (v as ApprovalStatus)); setPage(1); }}
        >
          <SelectTrigger className="w-[140px] h-10 text-xs">
            <SelectValue placeholder="All status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">All status</SelectItem>
            {(['PENDING', 'APPROVED', 'REJECTED'] as ApprovalStatus[]).map((s) => (
              <SelectItem key={s} value={s}>{APPROVAL_STATUS_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="timesheets" className="space-y-4">
        <TabsList>
          <TabsTrigger value="timesheets" className="gap-1.5">
            <Clock className="h-4 w-4" /> Timesheets
          </TabsTrigger>
          <TabsTrigger value="daily-hours" className="gap-1.5">
            <BarChart3 className="h-4 w-4" /> Daily Hours
          </TabsTrigger>
          <TabsTrigger value="financial" className="gap-1.5">
            <DollarSign className="h-4 w-4" /> Financial
          </TabsTrigger>
        </TabsList>

        {/* ─── Timesheets Tab ─────────────────────────────────── */}
        <TabsContent value="timesheets">
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : timesheets.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Contractor</TableHead>
                        <TableHead>Operator</TableHead>
                        <TableHead>Work Site</TableHead>
                        <TableHead>Driver</TableHead>
                        <TableHead className="text-right">Hours</TableHead>
                        <TableHead className="text-right">OT</TableHead>
                        <TableHead>Machinery</TableHead>
                        <TableHead>Notes</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {timesheets.map((t) => (
                        <TableRow key={t.id}>
                          <TableCell className="text-muted-foreground">{format(new Date(t.date), 'MMM dd, yyyy')}</TableCell>
                          <TableCell className="font-medium max-w-[150px] truncate">
                            {t.contractor?.contractorName ?? '\u2014'}
                          </TableCell>
                          <TableCell>{t.operatorName ?? '\u2014'}</TableCell>
                          <TableCell className="max-w-[120px] truncate">{t.workSite ?? '\u2014'}</TableCell>
                          <TableCell>{t.machinery?.driverName ?? '\u2014'}</TableCell>
                          <TableCell className="text-right font-mono tabular-nums">{t.totalHours.toFixed(2)}</TableCell>
                          <TableCell className="text-right font-mono tabular-nums">{t.overtimeHours.toFixed(2)}</TableCell>
                          <TableCell className="max-w-[150px] truncate">
                            {t.machinery ? (
                              <span>
                                {t.machinery.machineryType}
                                <span className="text-xs text-muted-foreground ml-1">({t.machinery.plateNumber ?? '\u2014'})</span>
                              </span>
                            ) : '\u2014'}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate text-muted-foreground text-sm">
                            {t.notes ?? '\u2014'}
                          </TableCell>
                          <TableCell>
                            <ApprovalStatusBadge status={t.approvalStatus} />
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {t.approvalStatus === 'PENDING' && canApprove('timesheets') && (
                                <Button variant="ghost" size="sm" className="text-emerald-600" onClick={() => handleApprove(t.id)}>
                                  Approve
                                </Button>
                              )}
                              {canEdit('timesheets') && (isAdmin || t.approvalStatus !== 'APPROVED') && (
                                <Button variant="ghost" size="icon" onClick={() => handleEdit(t)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              )}
                              {isAdmin && (
                                <RecordAccessDialog
                                  entity="timesheet"
                                  entityId={t.id}
                                  entityLabel="timesheet"
                                />
                              )}
                              {canDelete('timesheets') && (isAdmin || t.approvalStatus !== 'APPROVED') && (
                                <Button variant="ghost" size="icon" onClick={() => handleDelete(t)}>
                                  <Trash2 className="h-4 w-4 text-red-500" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="py-12 text-center">
                  <Clock className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">
                    {search ? 'No timesheets match your search' : 'No timesheets added yet'}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {timesheets.length} of {total} timesheets
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <Button variant="outline" size="icon" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ─── Daily Hours Tab ────────────────────────────────── */}
        <TabsContent value="daily-hours">
          <div className="space-y-6">
            {tabFilterBar}
            {isDailyLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-600/10">
                          <Timer className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Total Hours</p>
                          <p className="text-lg font-bold">{grandTotalHours.toFixed(1)} hrs</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-600/10">
                          <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Overtime Hours</p>
                          <p className="text-lg font-bold">{grandTotalOT.toFixed(1)} hrs</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600/10">
                          <Briefcase className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Working Days</p>
                          <p className="text-lg font-bold">{workingDays} days</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-600/10">
                          <BarChart3 className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Avg Hours / Day</p>
                          <p className="text-lg font-bold">{avgHoursPerDay.toFixed(1)} hrs</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
                {chartData.length > 0 ? (
                  <Card>
                    <CardContent className="p-4">
                      <div className="h-[280px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border/50" />
                            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                            <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'hsl(var(--muted) / 0.3)' }} />
                            <Bar dataKey="totalHours" radius={[4, 4, 0, 0]} maxBarSize={40} className="fill-emerald-600 dark:fill-emerald-500" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <BarChart3 className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                      <p className="text-sm text-muted-foreground">No timesheet data for this month</p>
                    </CardContent>
                  </Card>
                )}
                <Card>
                  <CardContent className="p-0">
                    {dailyRows.length > 0 ? (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[50px]">#</TableHead>
                              <TableHead>Date</TableHead>
                              <TableHead className="text-right">Total Hours</TableHead>
                              <TableHead className="text-right">Overtime</TableHead>
                              <TableHead className="text-right">Entries</TableHead>
                              <TableHead>Contractor(s)</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {dailyRows.map((r) => (
                              <TableRow key={r.day}>
                                <TableCell className="text-muted-foreground font-mono text-xs">{r.day}</TableCell>
                                <TableCell className="font-medium">{r.dateLabel}</TableCell>
                                <TableCell className="text-right font-mono tabular-nums font-medium">{r.totalHours.toFixed(1)}</TableCell>
                                <TableCell className="text-right font-mono tabular-nums">
                                  {r.overtimeHours > 0 ? (
                                    <span className="text-amber-600 dark:text-amber-400">{r.overtimeHours.toFixed(1)}</span>
                                  ) : (
                                    <span className="text-muted-foreground">0.0</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-right font-mono tabular-nums">{r.entries}</TableCell>
                                <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">{r.contractors}</TableCell>
                              </TableRow>
                            ))}
                            <TableRow className="bg-emerald-50 dark:bg-emerald-950/20">
                              <TableCell colSpan={2} className="font-bold text-sm">TOTAL</TableCell>
                              <TableCell className="text-right font-mono tabular-nums font-bold text-sm">{grandTotalHours.toFixed(1)}</TableCell>
                              <TableCell className="text-right font-mono tabular-nums font-bold text-sm">{grandTotalOT.toFixed(1)}</TableCell>
                              <TableCell className="text-right font-mono tabular-nums font-bold text-sm">{dailyRows.reduce((s, r) => s + r.entries, 0)}</TableCell>
                              <TableCell />
                            </TableRow>
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                      <div className="py-12 text-center">
                        <CalendarDays className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                        <p className="text-sm text-muted-foreground">No timesheet entries for this month</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </TabsContent>

        {/* ─── Financial Tab ──────────────────────────────────── */}
        <TabsContent value="financial">
          <div className="space-y-6">
            {tabFilterBar}
            {isDailyLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-600/10">
                          <DollarSign className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Total Revenue</p>
                          <p className="text-lg font-bold">{formatCurrency(totalRevenue)}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600/10">
                          <Timer className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Total Hours</p>
                          <p className="text-lg font-bold">{finTotalHours.toFixed(1)} hrs</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-600/10">
                          <TrendingUp className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Avg Hourly Rate</p>
                          <p className="text-lg font-bold">{formatCurrency(avgHourlyRate)}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
                <div className="grid gap-6 lg:grid-cols-2">
                  <Card>
                    <CardContent className="p-0">
                      {byContractor.length > 0 ? (
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Contractor</TableHead>
                                <TableHead className="text-right">Hours</TableHead>
                                <TableHead className="text-right">Revenue</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {byContractor.map((r) => (
                                <TableRow key={r.name}>
                                  <TableCell className="font-medium">{r.name}</TableCell>
                                  <TableCell className="text-right font-mono tabular-nums">{r.hours.toFixed(1)}</TableCell>
                                  <TableCell className="text-right font-mono tabular-nums">{formatCurrency(r.revenue)}</TableCell>
                                </TableRow>
                              ))}
                              <TableRow className="bg-emerald-50 dark:bg-emerald-950/20">
                                <TableCell className="font-bold text-sm">TOTAL</TableCell>
                                <TableCell className="text-right font-mono tabular-nums font-bold text-sm">{finTotalHours.toFixed(1)}</TableCell>
                                <TableCell className="text-right font-mono tabular-nums font-bold text-sm">{formatCurrency(totalRevenue)}</TableCell>
                              </TableRow>
                            </TableBody>
                          </Table>
                        </div>
                      ) : (
                        <div className="py-12 text-center">
                          <DollarSign className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                          <p className="text-sm text-muted-foreground">No financial data for this month</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-0">
                      {byMachinery.length > 0 ? (
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Machinery</TableHead>
                                <TableHead>Contractor</TableHead>
                                <TableHead className="text-right">Hours</TableHead>
                                <TableHead className="text-right">Rate</TableHead>
                                <TableHead className="text-right">Revenue</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {byMachinery.map((r, i) => (
                                <TableRow key={i}>
                                  <TableCell className="font-medium max-w-[150px] truncate">
                                    {r.name}
                                    {r.plateNumber && <span className="text-xs text-muted-foreground ml-1">({r.plateNumber})</span>}
                                  </TableCell>
                                  <TableCell className="max-w-[120px] truncate text-sm">{r.contractor}</TableCell>
                                  <TableCell className="text-right font-mono tabular-nums">{r.hours.toFixed(1)}</TableCell>
                                  <TableCell className="text-right font-mono tabular-nums text-xs">{r.hourlyRate > 0 ? formatCurrency(r.hourlyRate) : '\u2014'}</TableCell>
                                  <TableCell className="text-right font-mono tabular-nums">{formatCurrency(r.revenue)}</TableCell>
                                </TableRow>
                              ))}
                              <TableRow className="bg-emerald-50 dark:bg-emerald-950/20">
                                <TableCell colSpan={2} className="font-bold text-sm">TOTAL</TableCell>
                                <TableCell className="text-right font-mono tabular-nums font-bold text-sm">{finTotalHours.toFixed(1)}</TableCell>
                                <TableCell />
                                <TableCell className="text-right font-mono tabular-nums font-bold text-sm">{formatCurrency(totalRevenue)}</TableCell>
                              </TableRow>
                            </TableBody>
                          </Table>
                        </div>
                      ) : (
                        <div className="py-12 text-center">
                          <DollarSign className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                          <p className="text-sm text-muted-foreground">No financial data for this month</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <TimesheetForm open={formOpen} onOpenChange={setFormOpen} editingTimesheet={editingTimesheet} onSuccess={handleFormSuccess} />
      <BatchTimesheetForm open={batchFormOpen} onOpenChange={setBatchFormOpen} onSuccess={handleFormSuccess} />
      <ConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={(open) => setDeleteConfirm({ open, timesheet: open ? deleteConfirm.timesheet : null })}
        title="Delete Timesheet"
        description="Are you sure you want to delete this timesheet? This action cannot be undone."
        onConfirm={handleDeleteConfirm}
        confirmText="Delete"
        variant="destructive"
      />
    </div>
  );
}
