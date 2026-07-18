'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { FuelUsageForm } from './fuel-usage-form';
import { BatchFuelUsageForm } from './batch-fuel-usage-form';
import { FuelUsageAnalysis } from './fuel-usage-analysis';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { fuelUsageApi, machineryApi } from '@/services/contractor-api';
import { useDebounce } from '@/hooks/use-debounce';
import type { FuelUsage, FuelType, FuelUsageSummary } from '@/types/contractor';
import {
  FUEL_TYPE_LABELS,
  FUEL_TYPE_COLORS,
} from '@/types/contractor';
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
} from 'lucide-react';
import { format } from 'date-fns';
import { formatShamsi } from '@/lib/shamsi';
import { toast } from 'sonner';
import { usePermissions } from '@/hooks/use-permissions';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'AFN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function FuelUsagePage() {
  const { canView, canCreate, canEdit, canDelete } = usePermissions();

  if (!canView('fuelUsage')) return null;
  const [fuelUsages, setFuelUsages] = useState<FuelUsage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [machineryType, setMachineryType] = useState('');
  const [machineryTypes, setMachineryTypes] = useState<string[]>([]);
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

  const pageSize = 20;
  const debouncedSearch = useDebounce(search, 300);
  const isFirstRender = useRef(true);

  useEffect(() => {
    machineryApi.getTypes().then((res) => {
      if (res.data) setMachineryTypes(res.data);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    setSummaryLoading(true);
    fuelUsageApi.getSummary({ dateFrom: dateFrom || undefined, dateTo: dateTo || undefined })
      .then((res) => {
        if (res.data) setSummary(res.data);
      })
      .catch(() => {})
      .finally(() => setSummaryLoading(false));
  }, [dateFrom, dateTo]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (search) count++;
    if (dateFrom || dateTo) count++;
    if (machineryType) count++;
    return count;
  }, [search, dateFrom, dateTo, machineryType]);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fuelUsageApi.getAll({
        search: debouncedSearch || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        machineryType: machineryType || undefined,
        page,
        pageSize,
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
  }, [debouncedSearch, dateFrom, dateTo, machineryType, page, pageSize]);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setPage(1);
  }, [debouncedSearch, dateFrom, dateTo, machineryType]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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

  const clearFilters = useCallback(() => {
    setSearch('');
    setDateFrom('');
    setDateTo('');
    setMachineryType('');
    setPage(1);
  }, []);

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
          <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3 flex-wrap">
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

            <div className="flex items-center gap-2">
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

            {activeFilterCount > 0 && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground h-10">
                <X className="mr-1 h-4 w-4" />
                Clear
              </Button>
            )}
          </div>

          {/* Summary Section */}
          {summaryLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : summary ? (
            <div className="space-y-4">
              {/* Summary Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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
                <Card className="border-blue-200 dark:border-blue-900">
                  <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-xs font-medium text-muted-foreground">Total Cost</CardTitle>
                    <BarChart3 className="h-4 w-4 text-blue-600" />
                  </CardHeader>
                  <CardContent>
                    <p className="text-xl font-bold text-blue-700 dark:text-blue-400">
                      {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'AFN', minimumFractionDigits: 0 }).format(summary.totalCost)}
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
                      {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'AFN', minimumFractionDigits: 0 }).format(summary.avgUnitPrice)}
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
                                {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'AFN', minimumFractionDigits: 0 }).format(entry.cost)}
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
                              {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'AFN', minimumFractionDigits: 0 }).format(summary.dailyUsage.reduce((s, d) => s + d.cost, 0))}
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
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {fuelUsages.map((f) => {
                        const fColor = FUEL_TYPE_COLORS[f.fuelType as FuelType] ?? '#78716c';
                        return (
                          <TableRow key={f.id}>
                            <TableCell className="text-muted-foreground">{format(new Date(f.date), 'MMM dd, yyyy')}</TableCell>
                            <TableCell className="font-medium max-w-[150px] truncate">
                              {f.contractor?.contractorName ?? '—'}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="border-0 text-[10px] px-1.5 py-0" style={{ backgroundColor: `${fColor}18`, color: fColor }}>
                                {FUEL_TYPE_LABELS[f.fuelType as FuelType] ?? f.fuelType}
                              </Badge>
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
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                {canEdit('fuelUsage') && (
                                  <Button variant="ghost" size="icon" onClick={() => handleEdit(f)}>
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                )}
                                {canDelete('fuelUsage') && (
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
    </div>
  );
}
