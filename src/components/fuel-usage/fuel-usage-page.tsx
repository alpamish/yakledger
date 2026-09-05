'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { subscribeRefresh } from '@/lib/live-refresh';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FuelUsageForm } from './fuel-usage-form';
import { BatchFuelUsageForm } from './batch-fuel-usage-form';
import { FuelUsageAnalysis } from './fuel-usage-analysis';
import { FuelIssueForm } from '@/components/fuel/fuel-issue-form';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { fuelUsageApi, machineryApi, contractorsApi } from '@/services/contractor-api';
import { fuelApi } from '@/services/asset-api';
import { useDebounce } from '@/hooks/use-debounce';
import type { FuelUsage, FuelType, FuelUsageSummary, Contractor, Machinery } from '@/types/contractor';
import type { FuelTransaction } from '@/types/asset';
import type { ApprovalStatus } from '@/types/expense';
import { RecordAccessDialog } from '@/components/common/record-access-dialog';
import {
  FUEL_TYPE_LABELS,
  FUEL_TYPE_COLORS,
  FUEL_TYPES,
} from '@/types/contractor';
import {
  APPROVAL_STATUSES,
  APPROVAL_STATUS_LABELS,
  APPROVAL_STATUS_COLORS,
} from '@/types/expense';
import { ASSET_CATEGORY_LABELS } from '@/types/asset';
import {
  Plus,
  Fuel,
  Search,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  X,
  BarChart3,
  Droplets,
  TrendingUp,
  CalendarDays,
  List,
  LineChart,
  Truck,
  ArrowUp,
  ArrowDown,
  Calendar,
  DollarSign,
} from 'lucide-react';
import { format } from 'date-fns';
import { formatShamsi, gregorianToShamsi, shamsiToGregorian } from '@/lib/shamsi';
import { toast } from 'sonner';
import { usePermissions } from '@/hooks/use-permissions';
import { useExpenseStore } from '@/hooks/use-expense-store';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'AFN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatCurrencyShort(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'AFN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

type DateMode = 'miladi' | 'shamsi';

function DateModeToggle({ value, onChange }: { value: DateMode; onChange: (v: DateMode) => void }) {
  return (
    <div className="flex items-center rounded-md border border-input bg-background p-0.5 h-10">
      {(['miladi', 'shamsi'] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={`px-2.5 h-full rounded text-xs font-medium transition-colors ${
            value === m ? 'bg-emerald-600 text-white' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {m === 'miladi' ? 'Miladi' : 'Shamsi'}
        </button>
      ))}
    </div>
  );
}

export function FuelUsagePage() {
  const { canView, canCreate, canEdit, canDelete } = usePermissions();
  const isAdmin = useExpenseStore((s) => s.user)?.role === "ADMIN";

  const [fuelUsages, setFuelUsages] = useState<FuelUsage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [dateMode, setDateMode] = useState<DateMode>('miladi');
  const [shamsiFrom, setShamsiFrom] = useState('');
  const [shamsiTo, setShamsiTo] = useState('');
  const [machineryType, setMachineryType] = useState('');
  const [machineryId, setMachineryId] = useState('');
  const [contractorId, setContractorId] = useState('');
  const [fuelType, setFuelType] = useState('');
  const [approvalStatus, setApprovalStatus] = useState('');
  const [sortBy, setSortBy] = useState('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [machineryTypes, setMachineryTypes] = useState<string[]>([]);
  const [contractors, setContractors] = useState<Pick<Contractor, 'id' | 'contractorName'>[]>([]);
  const [machines, setMachines] = useState<Pick<Machinery, 'id' | 'machineryName' | 'plateNumber'>[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [formOpen, setFormOpen] = useState(false);
  const [batchFormOpen, setBatchFormOpen] = useState(false);
  const [editingFuelUsage, setEditingFuelUsage] = useState<FuelUsage | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; fuelUsage: FuelUsage | null }>({
    open: false,
    fuelUsage: null,
  });

  const [summary, setSummary] = useState<FuelUsageSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const [viewMode, setViewMode] = useState<'contractor' | 'asset'>('contractor');

  // Asset issues state
  const [assetIssues, setAssetIssues] = useState<FuelTransaction[]>([]);
  const [assetIssuesLoading, setAssetIssuesLoading] = useState(false);
  const [assetIssuesPage, setAssetIssuesPage] = useState(1);
  const [assetIssuesTotalPages, setAssetIssuesTotalPages] = useState(1);
  const [assetIssuesTotal, setAssetIssuesTotal] = useState(0);
  const [issueFormOpen, setIssueFormOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<FuelTransaction | null>(null);
  const [deleteAssetIssueConfirm, setDeleteAssetIssueConfirm] = useState<{ open: boolean; transaction: FuelTransaction | null }>({
    open: false,
    transaction: null,
  });

  const pageSize = 20;
  const debouncedSearch = useDebounce(search, 300);
  const isFirstRender = useRef(true);

  useEffect(() => {
    machineryApi.getTypes().then((res) => {
      if (res.data) setMachineryTypes(res.data);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    contractorsApi.getList().then((res) => {
      if (res.data) setContractors(res.data);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    machineryApi.getList().then((res) => {
      if (res.data) {
        setMachines(
          res.data.map((m) => ({
            id: m.id,
            machineryName: m.machineryName,
            plateNumber: m.plateNumber,
          }))
        );
      }
    }).catch(() => {});
  }, []);

  const effectiveFilters = useMemo(
    () => ({
      search: debouncedSearch || undefined,
      dateFrom:
        dateMode === 'shamsi'
          ? (shamsiToGregorian(shamsiFrom) ?? undefined)
          : (dateFrom || undefined),
      dateTo:
        dateMode === 'shamsi'
          ? (shamsiToGregorian(shamsiTo) ?? undefined)
          : (dateTo || undefined),
      machineryType: machineryType || undefined,
      machineryId: machineryId || undefined,
      contractorId: contractorId || undefined,
      fuelTypes: fuelType ? [fuelType as FuelType] : undefined,
      approvalStatus: (approvalStatus || undefined) as ApprovalStatus | undefined,
    }),
    [
      debouncedSearch,
      dateMode,
      shamsiFrom,
      shamsiTo,
      dateFrom,
      dateTo,
      machineryType,
      machineryId,
      contractorId,
      fuelType,
      approvalStatus,
    ]
  );

  const summaryFilters = useMemo(() => {
    const { fuelTypes, ...rest } = effectiveFilters;
    return {
      ...rest,
      fuelType: fuelTypes?.[0],
    };
  }, [effectiveFilters]);

  useEffect(() => {
    setSummaryLoading(true);
    fuelUsageApi.getSummary(summaryFilters)
      .then((res) => {
        if (res.data) setSummary(res.data);
      })
      .catch(() => {})
      .finally(() => setSummaryLoading(false));
  }, [summaryFilters]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (search) count++;
    if (dateFrom || dateTo || shamsiFrom || shamsiTo) count++;
    if (machineryType) count++;
    if (machineryId) count++;
    if (contractorId) count++;
    if (fuelType) count++;
    if (approvalStatus) count++;
    return count;
  }, [search, dateFrom, dateTo, shamsiFrom, shamsiTo, machineryType, machineryId, contractorId, fuelType, approvalStatus]);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fuelUsageApi.getAll({
        ...effectiveFilters,
        page,
        pageSize,
        sortBy,
        sortOrder,
      });
      const d = res.data!;
      setFuelUsages(d.data);
      setTotalPages(d.totalPages);
      setTotal(d.total);
    } catch {
      toast.error('Failed to load fuel usage records');
    } finally {
      setIsLoading(false);
    }
  }, [effectiveFilters, page, pageSize, sortBy, sortOrder]);

  const fetchAssetIssues = useCallback(async () => {
    setAssetIssuesLoading(true);
    try {
      const res = await fuelApi.getAll({
        type: 'ISSUE',
        search: effectiveFilters.search,
        dateFrom: effectiveFilters.dateFrom,
        dateTo: effectiveFilters.dateTo,
        fuelType: effectiveFilters.fuelTypes?.[0],
        contractorId: effectiveFilters.contractorId,
        page: assetIssuesPage,
        pageSize,
      });
      const d = res.data!;
      const filtered = d.data.filter((t) => t.assetId && !t.contractorId);
      setAssetIssues(filtered);
      setAssetIssuesTotalPages(d.totalPages);
      setAssetIssuesTotal(d.total);
    } catch {
      toast.error('Failed to load asset issues');
    } finally {
      setAssetIssuesLoading(false);
    }
  }, [effectiveFilters, assetIssuesPage, pageSize]);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setPage(1);
    setAssetIssuesPage(1);
  }, [effectiveFilters]);

  useEffect(() => {
    const unsubscribe = subscribeRefresh(() => {
      fetchData();
      fetchAssetIssues();
    });
    return unsubscribe;
  }, [fetchData, fetchAssetIssues]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    fetchAssetIssues();
  }, [fetchAssetIssues]);

  const handleAdd = useCallback(() => {
    setEditingFuelUsage(null);
    setFormOpen(true);
  }, []);

  const handleEdit = useCallback((f: FuelUsage) => {
    setEditingFuelUsage(f);
    setFormOpen(true);
  }, []);

  const handleDelete = useCallback((f: FuelUsage) => {
    setDeleteConfirm({ open: true, fuelUsage: f });
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (deleteConfirm.fuelUsage) {
      try {
        await fuelUsageApi.delete(deleteConfirm.fuelUsage.id);
        toast.success('Fuel usage record deleted successfully');
        fetchData();
      } catch {
        toast.error('Failed to delete fuel usage record');
      }
    }
    setDeleteConfirm({ open: false, fuelUsage: null });
  }, [deleteConfirm.fuelUsage, fetchData]);

  const handleFormSuccess = useCallback(() => {
    fetchData();
  }, [fetchData]);

  const handleDeleteAssetIssue = useCallback((t: FuelTransaction) => {
    setDeleteAssetIssueConfirm({ open: true, transaction: t });
  }, []);

  const handleDeleteAssetIssueConfirm = useCallback(async () => {
    if (deleteAssetIssueConfirm.transaction) {
      try {
        await fuelApi.delete(deleteAssetIssueConfirm.transaction.id);
        toast.success('Asset issue deleted successfully');
        fetchAssetIssues();
      } catch {
        toast.error('Failed to delete asset issue');
      }
    }
    setDeleteAssetIssueConfirm({ open: false, transaction: null });
  }, [deleteAssetIssueConfirm.transaction, fetchAssetIssues]);

  const handleIssueFormSuccess = useCallback(() => {
    setIssueFormOpen(false);
    setEditingTransaction(null);
    if (viewMode === 'asset') fetchAssetIssues();
    else fetchData();
  }, [viewMode, fetchAssetIssues, fetchData]);

  const clearFilters = useCallback(() => {
    setSearch('');
    setDateFrom('');
    setDateTo('');
    setShamsiFrom('');
    setShamsiTo('');
    setMachineryType('');
    setMachineryId('');
    setContractorId('');
    setFuelType('');
    setApprovalStatus('');
    setSortBy('date');
    setSortOrder('desc');
    setPage(1);
  }, []);

  const toggleSortOrder = useCallback(() => {
    setSortOrder((o) => (o === 'desc' ? 'asc' : 'desc'));
  }, []);

  if (!canView('fuelUsage')) return null;

  const shamsiFromConverted = dateMode === 'shamsi' ? shamsiToGregorian(shamsiFrom) : null;
  const shamsiToConverted = dateMode === 'shamsi' ? shamsiToGregorian(shamsiTo) : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Fuel className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            Fuel Usage
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage contractor fuel consumption records
          </p>
        </div>
        {canCreate('fuelUsage') && (
          <div className="flex items-center gap-2">
            <Button onClick={handleAdd} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              <Plus className="mr-2 h-4 w-4" />
              Add Fuel Usage
            </Button>
            <Button onClick={() => setBatchFormOpen(true)} variant="outline">
              <Plus className="mr-2 h-4 w-4" />
              Batch Entry
            </Button>
            <Button onClick={() => setIssueFormOpen(true)} variant="outline" className="border-amber-600 text-amber-600">
              <Truck className="mr-2 h-4 w-4" />
              Issue to Asset
            </Button>
          </div>
        )}
      </div>

      <Tabs defaultValue="records" className="space-y-4">
        <TabsList>
          <TabsTrigger value="records" className="flex items-center gap-2">
            <List className="h-4 w-4" />
            Records
          </TabsTrigger>
          <TabsTrigger value="analysis" className="flex items-center gap-2">
            <LineChart className="h-4 w-4" />
            Summary & Analysis
          </TabsTrigger>
        </TabsList>

        <TabsContent value="records" className="space-y-6 mt-0">
          {/* Filters */}
          <div className="rounded-lg border p-3 space-y-3">
            <div className="flex flex-col lg:flex-row items-start lg:items-center gap-3">
              <div className="relative flex-1 w-full sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by contractor, plate, type..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
                {search && (
                  <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <DateModeToggle value={dateMode} onChange={setDateMode} />
                {dateMode === 'miladi' ? (
                  <>
                    <Input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="h-10 w-[130px] text-xs"
                      placeholder="From date"
                    />
                    <span className="text-xs text-muted-foreground">to</span>
                    <Input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="h-10 w-[130px] text-xs"
                      placeholder="To date"
                    />
                  </>
                ) : (
                  <>
                    <div className="relative">
                      <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        value={shamsiFrom}
                        onChange={(e) => setShamsiFrom(e.target.value)}
                        className="h-10 w-[130px] pl-8 text-xs font-mono"
                        placeholder="1404/05/01"
                        inputMode="numeric"
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">to</span>
                    <div className="relative">
                      <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        value={shamsiTo}
                        onChange={(e) => setShamsiTo(e.target.value)}
                        className="h-10 w-[130px] pl-8 text-xs font-mono"
                        placeholder="1404/05/31"
                        inputMode="numeric"
                      />
                    </div>
                  </>
                )}
              </div>

              <Select value={machineryType || '_all'} onValueChange={(v) => setMachineryType(v === '_all' ? '' : v)}>
                <SelectTrigger className="w-[150px] h-10 text-xs">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All types</SelectItem>
                  {machineryTypes.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={fuelType || '_all'} onValueChange={(v) => setFuelType(v === '_all' ? '' : v)}>
                <SelectTrigger className="w-[130px] h-10 text-xs">
                  <SelectValue placeholder="All fuels" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All fuels</SelectItem>
                  {FUEL_TYPES.map((ft) => (
                    <SelectItem key={ft} value={ft}>{FUEL_TYPE_LABELS[ft]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={contractorId || '_all'} onValueChange={(v) => setContractorId(v === '_all' ? '' : v)}>
                <SelectTrigger className="w-[170px] h-10 text-xs">
                  <SelectValue placeholder="All contractors" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All contractors</SelectItem>
                  {contractors.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.contractorName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={machineryId || '_all'} onValueChange={(v) => setMachineryId(v === '_all' ? '' : v)}>
                <SelectTrigger className="w-[170px] h-10 text-xs">
                  <SelectValue placeholder="All machinery" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All machinery</SelectItem>
                  {machines.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.machineryName}{m.plateNumber ? ` (${m.plateNumber})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={approvalStatus || '_all'} onValueChange={(v) => setApprovalStatus(v === '_all' ? '' : v)}>
                <SelectTrigger className="w-[130px] h-10 text-xs">
                  <SelectValue placeholder="All status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All status</SelectItem>
                  {APPROVAL_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{APPROVAL_STATUS_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {activeFilterCount > 0 && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground h-10">
                  <X className="mr-1 h-4 w-4" />
                  Clear
                </Button>
              )}
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-2 border-t pt-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                Sort by
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="h-8 w-[140px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="date">Date</SelectItem>
                    <SelectItem value="quantity">Quantity</SelectItem>
                    <SelectItem value="totalCost">Total Cost</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={toggleSortOrder} className="h-8">
                  {sortOrder === 'desc' ? <ArrowDown className="h-3.5 w-3.5" /> : <ArrowUp className="h-3.5 w-3.5" />}
                  {sortOrder === 'desc' ? 'Newest' : 'Oldest'}
                </Button>
              </div>
              {dateMode === 'shamsi' && (shamsiFrom || shamsiTo) && (
                <p className="text-[11px] text-muted-foreground sm:ml-auto">
                  Gregorian: {shamsiFromConverted ?? (shamsiFrom ? 'invalid' : '—')}
                  {' → '}
                  {shamsiToConverted ?? (shamsiTo ? 'invalid' : '—')}
                </p>
              )}
            </div>
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center gap-2 border-b pb-2">
            <Button
              variant={viewMode === 'contractor' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('contractor')}
              className={viewMode === 'contractor' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}
            >
              <Fuel className="mr-1.5 h-4 w-4" />
              Contractor Usage
            </Button>
            <Button
              variant={viewMode === 'asset' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('asset')}
              className={viewMode === 'asset' ? 'bg-amber-600 hover:bg-amber-700 text-white' : ''}
            >
              <Truck className="mr-1.5 h-4 w-4" />
              Asset Issues
            </Button>
          </div>

          {/* Contractor Usage View */}
          {viewMode === 'contractor' && (
          <>
          {/* Summary Section */}
          {summaryLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : summary ? (
            <div className="space-y-4">
              {/* Summary Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <Card className="border-emerald-200 dark:border-emerald-900">
                  <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-xs font-medium text-muted-foreground">Total Fuel Used</CardTitle>
                    <Droplets className="h-4 w-4 text-emerald-600" />
                  </CardHeader>
                  <CardContent>
                    <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400">
                      {summary.totalQuantity.toFixed(1)} <span className="text-xs font-normal">L</span>
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-sky-200 dark:border-sky-900">
                  <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-xs font-medium text-muted-foreground">Total from Stock</CardTitle>
                    <Fuel className="h-4 w-4 text-sky-600" />
                  </CardHeader>
                  <CardContent>
                    <p className="text-xl font-bold text-sky-700 dark:text-sky-400">
                      {summary.totalIssuedFromStock.toFixed(1)} <span className="text-xs font-normal">L</span>
                    </p>
                    {summary.totalIssuedFromStock !== summary.totalQuantity && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {(summary.totalIssuedFromStock - summary.totalQuantity).toFixed(1)}L issued without contractor
                      </p>
                    )}
                  </CardContent>
                </Card>
                <Card className="border-blue-200 dark:border-blue-900">
                  <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-xs font-medium text-muted-foreground">Total Cost</CardTitle>
                    <BarChart3 className="h-4 w-4 text-blue-600" />
                  </CardHeader>
                  <CardContent>
                    <p className="text-xl font-bold text-blue-700 dark:text-blue-400">
                      {formatCurrencyShort(summary.totalCost)}
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-violet-200 dark:border-violet-900">
                  <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-xs font-medium text-muted-foreground">Avg Unit Price</CardTitle>
                    <TrendingUp className="h-4 w-4 text-violet-600" />
                  </CardHeader>
                  <CardContent>
                    <p className="text-xl font-bold text-violet-700 dark:text-violet-400">
                      {formatCurrencyShort(summary.avgUnitPrice)}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">per liter</p>
                  </CardContent>
                </Card>
                <Card className="border-amber-200 dark:border-amber-900">
                  <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-xs font-medium text-muted-foreground">Records</CardTitle>
                    <CalendarDays className="h-4 w-4 text-amber-600" />
                  </CardHeader>
                  <CardContent>
                    <p className="text-xl font-bold text-amber-700 dark:text-amber-400">
                      {summary.recordCount}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Daily Fuel Usage */}
              {summary.dailyUsage.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <CalendarDays className="h-4 w-4 text-emerald-600" />
                      Daily Fuel Usage
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date (Miladi)</TableHead>
                            <TableHead>Date (Shamsi)</TableHead>
                            <TableHead className="text-right">Quantity (L)</TableHead>
                            <TableHead className="text-right">Cost</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {summary.dailyUsage.map((entry) => (
                            <TableRow key={entry.date}>
                              <TableCell className="text-muted-foreground text-xs font-mono">{entry.date}</TableCell>
                              <TableCell className="text-xs font-mono">
                                {formatShamsi(new Date(entry.date), "yyyy/MM/dd")}
                              </TableCell>
                              <TableCell className="text-right font-mono tabular-nums">{entry.quantity.toFixed(1)}</TableCell>
                              <TableCell className="text-right font-mono tabular-nums">
                                {formatCurrencyShort(entry.cost)}
                              </TableCell>
                            </TableRow>
                          ))}
                          {/* Total Row */}
                          <TableRow className="bg-emerald-50 dark:bg-emerald-950/20">
                            <TableCell className="font-semibold text-emerald-700 dark:text-emerald-400">Total</TableCell>
                            <TableCell />
                            <TableCell className="text-right font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                              {summary.dailyUsage.reduce((s, d) => s + d.quantity, 0).toFixed(1)}
                            </TableCell>
                            <TableCell className="text-right font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                              {formatCurrencyShort(summary.dailyUsage.reduce((s, d) => s + d.cost, 0))}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          ) : null}

          {/* Table */}
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : fuelUsages.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Contractor</TableHead>
                        <TableHead>Fuel Type</TableHead>
                        <TableHead className="text-right">Quantity</TableHead>
                        <TableHead className="text-right">Unit Price</TableHead>
                        <TableHead className="text-right">Total Cost</TableHead>
                        <TableHead>Fuel Station</TableHead>
                        <TableHead>Machinery</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {fuelUsages.map((f) => {
                        const fColor = FUEL_TYPE_COLORS[f.fuelType as FuelType] ?? '#78716c';
                        const status = f.approvalStatus as ApprovalStatus | undefined;
                        const sColor = status ? APPROVAL_STATUS_COLORS[status] : undefined;
                        return (
                          <TableRow key={f.id}>
                            <TableCell className="text-muted-foreground whitespace-nowrap">
                              <div>{format(new Date(f.date), 'MMM dd, yyyy')}</div>
                              <div className="text-[10px] text-muted-foreground/70 font-mono">
                                {gregorianToShamsi(f.date)}
                              </div>
                            </TableCell>
                            <TableCell className="font-medium max-w-[150px] truncate">
                              {f.contractor?.contractorName ?? '—'}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="border-0 text-[10px] px-1.5 py-0" style={{ backgroundColor: `${fColor}18`, color: fColor }}>
                                {FUEL_TYPE_LABELS[f.fuelType as FuelType] ?? f.fuelType}
                              </Badge>
                              {f.billable && (
                                <Badge variant="outline" className="ml-1 border-0 text-[10px] px-1.5 py-0 bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400">
                                  Billable
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-mono tabular-nums">{f.quantity.toFixed(2)}</TableCell>
                            <TableCell className="text-right font-mono tabular-nums">{formatCurrency(f.unitPrice)}</TableCell>
                            <TableCell className="text-right font-mono tabular-nums font-medium">{formatCurrency(f.totalCost)}</TableCell>
                            <TableCell className="max-w-[120px] truncate">{f.fuelStation ?? '—'}</TableCell>
                            <TableCell className="max-w-[150px] truncate">
                              {f.machinery ? (
                                <span>
                                  {f.machinery.machineryName}
                                  <span className="text-xs text-muted-foreground ml-1">({f.machinery.plateNumber ?? '—'})</span>
                                </span>
                              ) : '—'}
                            </TableCell>
                            <TableCell>
                              {status && sColor ? (
                                <Badge variant="outline" className="border-0 text-[10px] px-1.5 py-0" style={{ backgroundColor: `${sColor}18`, color: sColor }}>
                                  {APPROVAL_STATUS_LABELS[status]}
                                </Badge>
                              ) : '—'}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                {canEdit('fuelUsage') && (isAdmin || f.approvalStatus !== 'APPROVED') && (
                                  <Button variant="ghost" size="icon" onClick={() => handleEdit(f)}>
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                )}
                                {isAdmin && (
                                  <RecordAccessDialog
                                    entity="fuelUsage"
                                    entityId={f.id}
                                    entityLabel="fuel usage"
                                  />
                                )}
                                {canDelete('fuelUsage') && (isAdmin || f.approvalStatus !== 'APPROVED') && (
                                  <Button variant="ghost" size="icon" onClick={() => handleDelete(f)}>
                                    <Trash2 className="h-4 w-4 text-red-500" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="py-12 text-center">
                  <Fuel className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">
                    {activeFilterCount > 0 ? 'No fuel records match your filters' : 'No fuel usage records added yet'}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {fuelUsages.length} of {total} records
              </p>
            <div className="flex flex-wrap items-center gap-2">
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
          </>
          )}

          {/* Asset Issues View */}
          {viewMode === 'asset' && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <Card className="border-amber-200 dark:border-amber-900">
                <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-xs font-medium text-muted-foreground">Total Fuel Issued</CardTitle>
                  <Truck className="h-4 w-4 text-amber-600" />
                </CardHeader>
                <CardContent>
                  <p className="text-xl font-bold text-amber-700 dark:text-amber-400">
                    {assetIssues.reduce((sum, t) => sum + t.quantity, 0).toFixed(1)} <span className="text-xs font-normal">L</span>
                  </p>
                </CardContent>
              </Card>
              <Card className="border-blue-200 dark:border-blue-900">
                <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-xs font-medium text-muted-foreground">Total Cost</CardTitle>
                  <DollarSign className="h-4 w-4 text-blue-600" />
                </CardHeader>
                <CardContent>
                  <p className="text-xl font-bold text-blue-700 dark:text-blue-400">
                    {assetIssues.reduce((sum, t) => sum + (t.totalCost || 0), 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-xs font-normal">AFN</span>
                  </p>
                </CardContent>
              </Card>
              <Card className="border-violet-200 dark:border-violet-900">
                <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-xs font-medium text-muted-foreground">Records</CardTitle>
                  <List className="h-4 w-4 text-violet-600" />
                </CardHeader>
                <CardContent>
                  <p className="text-xl font-bold text-violet-700 dark:text-violet-400">
                    {assetIssues.length}
                  </p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardContent className="p-0">
                {assetIssuesLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : assetIssues.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Asset</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead>Fuel Type</TableHead>
                          <TableHead className="text-right">Quantity</TableHead>
                          <TableHead>Source Container</TableHead>
                          <TableHead>Issued To</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {assetIssues.map((t) => {
                          const fColor = FUEL_TYPE_COLORS[t.fuelType as FuelType] ?? '#78716c';
                          return (
                            <TableRow key={t.id}>
                              <TableCell className="text-muted-foreground whitespace-nowrap">
                                <div>{format(new Date(t.date), 'MMM dd, yyyy')}</div>
                                <div className="text-[10px] text-muted-foreground/70 font-mono">
                                  {gregorianToShamsi(t.date)}
                                </div>
                              </TableCell>
                              <TableCell className="font-medium max-w-[150px] truncate">
                                {t.asset?.name ?? t.issuedToName ?? '—'}
                              </TableCell>
                              <TableCell>
                                {t.asset?.category ? (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                    {ASSET_CATEGORY_LABELS[t.asset.category as keyof typeof ASSET_CATEGORY_LABELS] ?? t.asset.category}
                                  </Badge>
                                ) : '—'}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="border-0 text-[10px] px-1.5 py-0" style={{ backgroundColor: `${fColor}18`, color: fColor }}>
                                  {FUEL_TYPE_LABELS[t.fuelType as FuelType] ?? t.fuelType}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right font-mono tabular-nums">{t.quantity.toFixed(2)}</TableCell>
                              <TableCell className="max-w-[120px] truncate">{t.container?.name ?? '—'}</TableCell>
                              <TableCell className="max-w-[120px] truncate">{t.issuedToName ?? '—'}</TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  {canEdit('fuelUsage') && (
                                    <Button variant="ghost" size="icon" onClick={() => {
                                      setEditingTransaction(t);
                                      setIssueFormOpen(true);
                                    }}>
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                  )}
                                  {canDelete('fuelUsage') && (
                                    <Button variant="ghost" size="icon" onClick={() => handleDeleteAssetIssue(t)}>
                                      <Trash2 className="h-4 w-4 text-red-500" />
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="py-12 text-center">
                    <Truck className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">
                      {activeFilterCount > 0 ? 'No asset issues match your filters' : 'No fuel issued to assets yet'}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Asset Issues Pagination */}
            {assetIssuesTotalPages > 1 && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Showing {assetIssues.length} of {assetIssuesTotal} records
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="icon" disabled={assetIssuesPage <= 1} onClick={() => setAssetIssuesPage((p) => Math.max(1, p - 1))}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Page {assetIssuesPage} of {assetIssuesTotalPages}
                  </span>
                  <Button variant="outline" size="icon" disabled={assetIssuesPage >= assetIssuesTotalPages} onClick={() => setAssetIssuesPage((p) => p + 1)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
          )}
        </TabsContent>

        <TabsContent value="analysis" className="mt-0">
          <FuelUsageAnalysis />
        </TabsContent>
      </Tabs>

      {/* Form Dialog */}
      <FuelUsageForm
        open={formOpen}
        onOpenChange={setFormOpen}
        editingFuelUsage={editingFuelUsage}
        onSuccess={handleFormSuccess}
      />

      {/* Batch Entry Dialog */}
      <BatchFuelUsageForm
        open={batchFormOpen}
        onOpenChange={setBatchFormOpen}
        onSuccess={handleFormSuccess}
      />

      {/* Issue to Asset Dialog */}
      <Dialog open={issueFormOpen} onOpenChange={(open) => { if (!open) { setIssueFormOpen(false); setEditingTransaction(null); } }}>
        <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTransaction ? 'Edit Asset Issue' : 'Issue Fuel to Asset'}</DialogTitle>
          </DialogHeader>
          <FuelIssueForm
            initialData={editingTransaction ?? undefined}
            onSuccess={handleIssueFormSuccess}
          />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={(open) => setDeleteConfirm({ open, fuelUsage: open ? deleteConfirm.fuelUsage : null })}
        title="Delete Fuel Usage Record"
        description="Are you sure you want to delete this fuel usage record? This action cannot be undone."
        onConfirm={handleDeleteConfirm}
        confirmText="Delete"
        variant="destructive"
      />

      {/* Asset Issue Delete Confirmation */}
      <ConfirmDialog
        open={deleteAssetIssueConfirm.open}
        onOpenChange={(open) => setDeleteAssetIssueConfirm({ open, transaction: open ? deleteAssetIssueConfirm.transaction : null })}
        title="Delete Asset Issue"
        description="Are you sure you want to delete this asset fuel issue? This will also restore the fuel stock. This action cannot be undone."
        onConfirm={handleDeleteAssetIssueConfirm}
        confirmText="Delete"
        variant="destructive"
      />
    </div>
  );
}
