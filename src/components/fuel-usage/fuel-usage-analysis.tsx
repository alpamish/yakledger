'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { fuelUsageApi, machineryApi } from '@/services/contractor-api';
import { FuelAnalysisKpiCards } from './fuel-analysis-kpi-cards';
import { FuelAnalysisCharts } from './fuel-analysis-charts';
import { FuelDailyBreakdown } from './fuel-daily-breakdown';
import type {
  MonthlyAnalysisResponse,
  MonthlyFuelData,
  MachineryInfo,
  FuelType,
} from '@/types/contractor';
import { FUEL_TYPES, FUEL_TYPE_LABELS } from '@/types/contractor';
import {
  Loader2,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart3,
  CalendarDays,
  ChevronDown,
  Check,
  AlertOctagon,
  FileDown,
  ChevronRight,
  ChevronLeft,
  Search,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

function formatNumber(n: number, decimals = 1): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
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

interface MachineOption {
  id: string;
  machineryName: string;
  plateNumber: string | null;
  machineryType: string;
}

function getDirectionIcon(value: number) {
  if (value > 0) return TrendingUp;
  if (value < 0) return TrendingDown;
  return Minus;
}

const ANOMALIES_PER_PAGE = 10;

function LoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-[90px] rounded-lg bg-muted" />
        ))}
      </div>
      <div className="h-[280px] rounded-lg bg-muted" />
      <div className="grid grid-cols-2 gap-4">
        <div className="h-[250px] rounded-lg bg-muted" />
        <div className="h-[250px] rounded-lg bg-muted" />
      </div>
      <div className="h-[300px] rounded-lg bg-muted" />
    </div>
  );
}

export function FuelUsageAnalysis() {
  const [machines, setMachines] = useState<MachineOption[]>([]);
  const [selectedMachineId, setSelectedMachineId] = useState<string>('');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedFuelType, setSelectedFuelType] = useState<string>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [analysisData, setAnalysisData] = useState<MonthlyAnalysisResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [machinePopoverOpen, setMachinePopoverOpen] = useState(false);

  // Daily detail view state
  const [dailyView, setDailyView] = useState<{
    machineryId: string;
    machineryName: string;
    month: string;
    monthLabel: string;
  } | null>(null);

  // Summary pagination
  const [summaryPage, setSummaryPage] = useState(1);
  const [summaryPageSize, setSummaryPageSize] = useState(25);
  const [summarySearch, setSummarySearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce search input 300ms
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(summarySearch), 300);
    return () => clearTimeout(timer);
  }, [summarySearch]);

  // Anomaly pagination
  const [anomalyPage, setAnomalyPage] = useState(0);
  const [anomalyExpanded, setAnomalyExpanded] = useState(false);

  // Fetch machinery list
  useEffect(() => {
    machineryApi.getList().then((res) => {
      const list = (res.data ?? []) as unknown as MachineOption[];
      if (list.length > 0) {
        setMachines(list);
      }
    }).catch(() => {});
  }, []);

  // Fetch analysis data
  const fetchAnalysis = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fuelUsageApi.getMonthlyAnalysis({
        machineryId: selectedMachineId || undefined,
        year: selectedYear,
        fuelType: selectedFuelType || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      setAnalysisData(res.data ?? []);
    } catch {
      setAnalysisData([]);
    } finally {
      setIsLoading(false);
    }
  }, [selectedMachineId, selectedYear, selectedFuelType, dateFrom, dateTo]);

  useEffect(() => {
    fetchAnalysis();
  }, [fetchAnalysis]);

  // Reset pages when data or page size changes
  useEffect(() => {
    setSummaryPage(1);
  }, [analysisData, summaryPageSize]);

  useEffect(() => {
    setAnomalyPage(0);
    setAnomalyExpanded(false);
  }, [analysisData]);

  // Handle PDF export
  const handleExportPdf = useCallback(async () => {
    setIsExporting(true);
    try {
      const blob = await fuelUsageApi.getMonthlyAnalysisPdf({
        machineryId: selectedMachineId || undefined,
        year: selectedYear,
        fuelType: selectedFuelType || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fuel-analysis-${selectedYear}.html`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Report downloaded successfully');
    } catch {
      toast.error('Failed to generate report');
    } finally {
      setIsExporting(false);
    }
  }, [selectedMachineId, selectedYear, selectedFuelType, dateFrom, dateTo]);

  // Compute aggregate stats
  const allAnomalies = useMemo(() => {
    return analysisData.flatMap((d) => d.anomalies);
  }, [analysisData]);

  const criticalCount = useMemo(
    () => allAnomalies.filter((a) => a.severity === 'critical').length,
    [allAnomalies]
  );

  const warningCount = useMemo(
    () => allAnomalies.filter((a) => a.severity === 'warning').length,
    [allAnomalies]
  );

  const latestMonthlyData = useMemo(() => {
    const allMonthly: { data: MonthlyFuelData; info: MachineryInfo }[] = [];
    for (const d of analysisData) {
      for (const m of d.monthlyData) {
        if (m.totalLiters > 0) {
          allMonthly.push({ data: m, info: d.machinery as unknown as MachineryInfo });
        }
      }
    }
    return allMonthly;
  }, [analysisData]);

  // Reset to page 1 when debounced search changes
  useEffect(() => {
    setSummaryPage(1);
  }, [debouncedSearch]);

  // Filtered summary data (before early return — hook order invariant)
  const filteredSummaryData = useMemo(() => {
    if (!debouncedSearch.trim()) return latestMonthlyData;
    const q = debouncedSearch.toLowerCase();
    return latestMonthlyData.filter(
      (entry) =>
        entry.data.monthLabel.toLowerCase().includes(q) ||
        entry.info.machineryName.toLowerCase().includes(q) ||
        (entry.info.plateNumber ?? '').toLowerCase().includes(q) ||
        (entry.info.contractorName ?? '').toLowerCase().includes(q) ||
        entry.info.machineryType.toLowerCase().includes(q)
    );
  }, [latestMonthlyData, debouncedSearch]);

  // Compute KPI values
  const kpis = useMemo(() => {
    const totalLiters = latestMonthlyData.reduce((s, e) => s + e.data.totalLiters, 0);
    const totalCost = latestMonthlyData.reduce((s, e) => s + e.data.totalCost, 0);
    const totalHours = latestMonthlyData.reduce((s, e) => s + e.data.totalHours, 0);
    const avgLpH = totalHours > 0 ? totalLiters / totalHours : 0;
    const deviationPcts = latestMonthlyData
      .filter((e) => e.data.recordCount > 0)
      .map((e) => Math.abs(e.data.deviationPercent));
    const avgDev = deviationPcts.length > 0
      ? deviationPcts.reduce((s, v) => s + v, 0) / deviationPcts.length
      : 0;
    return {
      totalLiters,
      totalCost,
      avgLpH,
      anomalyCount: allAnomalies.length,
      criticalCount,
      warningCount,
      machineryCount: analysisData.length,
      avgDeviationPercent: avgDev,
    };
  }, [latestMonthlyData, allAnomalies, criticalCount, warningCount, analysisData.length]);

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  const hasAnyData = useMemo(() =>
    analysisData.some((d) =>
      d.monthlyData.some((m) => m.totalLiters > 0)
    ),
    [analysisData]
  );

  const selectedMachineryName = selectedMachineId
    ? machines.find((m) => m.id === selectedMachineId)?.machineryName ?? ''
    : '';

  // If daily detail view is active, show that instead
  if (dailyView) {
    return (
      <FuelDailyBreakdown
        machineryId={dailyView.machineryId}
        machineryName={dailyView.machineryName}
        month={dailyView.month}
        monthLabel={dailyView.monthLabel}
        onBack={() => setDailyView(null)}
      />
    );
  }

  // Paginated anomalies
  const totalAnomalyPages = Math.ceil(allAnomalies.length / ANOMALIES_PER_PAGE);
  const visibleAnomalies = anomalyExpanded
    ? allAnomalies
    : allAnomalies.slice(0, ANOMALIES_PER_PAGE);

  // Paginated summary data (filteredSummaryData defined above before early return)
  const hasPageSize = isFinite(summaryPageSize);
  const summaryTotalPages = hasPageSize
    ? Math.ceil(filteredSummaryData.length / summaryPageSize)
    : 1;
  const paginatedSummaryData = hasPageSize
    ? filteredSummaryData.slice(
        (summaryPage - 1) * summaryPageSize,
        summaryPage * summaryPageSize
      )
    : filteredSummaryData;

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
        <div className="flex-1 w-full sm:max-w-xs">
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
            Machinery
          </label>
          <Popover open={machinePopoverOpen} onOpenChange={setMachinePopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                className="w-full justify-between font-normal h-10"
              >
                {selectedMachineId
                  ? machines.find((m) => m.id === selectedMachineId)?.machineryName ?? 'All Machinery'
                  : 'All Machinery'}
                <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[90vw] sm:w-[400px] p-0">
              <Command>
                <CommandInput placeholder="Search machinery..." />
                <CommandList>
                  <CommandEmpty>No machinery found.</CommandEmpty>
                  <CommandItem
                    value="__all__"
                    onSelect={() => {
                      setSelectedMachineId('');
                      setMachinePopoverOpen(false);
                    }}
                  >
                    <Check
                      className="mr-2 h-4 w-4"
                      style={{ opacity: selectedMachineId === '' ? 1 : 0 }}
                    />
                    All Machinery
                  </CommandItem>
                  {machines.map((m) => (
                    <CommandItem
                      key={m.id}
                      value={`${m.machineryName} ${m.plateNumber ?? ''} ${m.machineryType}`}
                      onSelect={() => {
                        setSelectedMachineId(m.id);
                        setMachinePopoverOpen(false);
                      }}
                    >
                      <Check
                        className="mr-2 h-4 w-4"
                        style={{ opacity: selectedMachineId === m.id ? 1 : 0 }}
                      />
                      <span>{m.machineryName}</span>
                      {m.plateNumber && (
                        <span className="ml-1.5 text-muted-foreground text-xs">[{m.plateNumber}]</span>
                      )}
                    </CommandItem>
                  ))}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
        <div className="w-[130px]">
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
            Year
          </label>
          <Select
            value={String(selectedYear)}
            onValueChange={(v) => setSelectedYear(parseInt(v))}
          >
            <SelectTrigger className="h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {yearOptions.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-[130px]">
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
            Fuel Type
          </label>
          <Select
            value={selectedFuelType}
            onValueChange={(v) => setSelectedFuelType(v)}
          >
            <SelectTrigger className="h-10">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Types</SelectItem>
              {FUEL_TYPES.map((ft) => (
                <SelectItem key={ft} value={ft}>
                  {FUEL_TYPE_LABELS[ft]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              From
            </label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-10 w-[130px] text-xs"
            />
          </div>
          <span className="text-xs text-muted-foreground mt-6">to</span>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              To
            </label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-10 w-[130px] text-xs"
            />
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExportPdf}
          disabled={isExporting || !hasAnyData}
          className="h-10 gap-1.5"
        >
          {isExporting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FileDown className="h-4 w-4" />
          )}
          Export
        </Button>
      </div>

      {isLoading ? (
        <LoadingSkeleton />
      ) : !hasAnyData ? (
        <div className="py-16 text-center">
          <BarChart3 className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            No fuel usage data found for {selectedMachineId ? 'selected machinery' : 'any machinery'} in {selectedYear}
            {selectedFuelType ? ` (${FUEL_TYPE_LABELS[selectedFuelType as FuelType]})` : ''}
          </p>
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <FuelAnalysisKpiCards
            totalLiters={kpis.totalLiters}
            totalCost={kpis.totalCost}
            avgLitersPerHour={kpis.avgLpH}
            anomalyCount={kpis.anomalyCount}
            criticalCount={kpis.criticalCount}
            warningCount={kpis.warningCount}
            machineryCount={kpis.machineryCount}
            avgDeviationPercent={kpis.avgDeviationPercent}
          />

          {/* Charts */}
          <FuelAnalysisCharts
            analysisData={analysisData}
            selectedMachineryName={selectedMachineryName}
          />

          {/* Anomaly Alert Summary */}
          {(criticalCount > 0 || warningCount > 0) && (
            <Alert variant="default" className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              <AlertTitle className="text-amber-800 dark:text-amber-300">
                {criticalCount + warningCount} Abnormal Fuel Consumption Pattern{criticalCount + warningCount > 1 ? 's' : ''} Detected
              </AlertTitle>
              <AlertDescription className="text-amber-700 dark:text-amber-400">
                {criticalCount > 0 && `${criticalCount} critical`}
                {criticalCount > 0 && warningCount > 0 && ' and '}
                {warningCount > 0 && `${warningCount} warning`}
                {criticalCount + warningCount > 1 ? ' anomalies' : ' anomaly'} found.
                {' '}Review the details below.
              </AlertDescription>
            </Alert>
          )}

          {/* Monthly Summary Table */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-emerald-600" />
                Monthly Fuel Consumption Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="flex items-center gap-3 px-4 py-2.5 border-b">
                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by machinery, month, plate..."
                    value={summarySearch}
                    onChange={(e) => setSummarySearch(e.target.value)}
                    className="pl-8 h-9 text-xs"
                  />
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-muted-foreground">Show:</span>
                  <Select
                    value={String(summaryPageSize)}
                    onValueChange={(v) => setSummaryPageSize(Number(v))}
                  >
                    <SelectTrigger className="h-9 w-[130px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10 per page</SelectItem>
                      <SelectItem value="25">25 per page</SelectItem>
                      <SelectItem value="50">50 per page</SelectItem>
                      <SelectItem value="100">100 per page</SelectItem>
                      <SelectItem value="Infinity">All</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky left-0 bg-background z-10">Month</TableHead>
                      <TableHead className="text-right">Total Liters</TableHead>
                      <TableHead className="text-right">Total Cost</TableHead>
                      <TableHead className="text-right">Hours Worked</TableHead>
                      <TableHead className="text-right">Liters / Hour</TableHead>
                      <TableHead className="text-right">Vs Expected</TableHead>
                      <TableHead className="text-right">Vs Prev Month</TableHead>
                      <TableHead className="text-right">YTD Liters</TableHead>
                      <TableHead className="text-right">YTD Cost</TableHead>
                      <TableHead className="text-right">Data Source</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedSummaryData.length > 0 ? (
                      paginatedSummaryData.map((entry, idx) => {
                        const d = entry.data;
                        const devColor =
                          Math.abs(d.deviationPercent) >= 15
                            ? 'text-red-600 dark:text-red-400'
                            : Math.abs(d.deviationPercent) >= 5
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-green-600 dark:text-green-400';
                        const momColor =
                          d.monthOverMonthPercent !== null && Math.abs(d.monthOverMonthPercent) >= 15
                            ? 'text-red-600 dark:text-red-400'
                            : d.monthOverMonthPercent !== null && Math.abs(d.monthOverMonthPercent) >= 5
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-green-600 dark:text-green-400';
                        const TrendIcon = d.monthOverMonthPercent !== null
                          ? getDirectionIcon(d.monthOverMonthPercent)
                          : null;

                        return (
                          <TableRow
                            key={`${entry.info.id}_${d.month}`}
                            className="cursor-pointer"
                            onClick={() =>
                              setDailyView({
                                machineryId: entry.info.id,
                                machineryName: entry.info.machineryName,
                                month: d.month,
                                monthLabel: d.monthLabel,
                              })
                            }
                          >
                            <TableCell className="font-medium sticky left-0 bg-background z-10">
                              {d.monthLabel}
                              <span className="text-xs text-muted-foreground ml-1">
                                ({entry.info.machineryName}{entry.info.plateNumber ? ` [${entry.info.plateNumber}]` : ''})
                              </span>
                            </TableCell>
                            <TableCell className="text-right font-mono tabular-nums">
                              {formatNumber(d.totalLiters)}
                            </TableCell>
                            <TableCell className="text-right font-mono tabular-nums">
                              {formatCurrency(d.totalCost)}
                            </TableCell>
                            <TableCell className="text-right font-mono tabular-nums">
                              {formatNumber(d.totalHours)}
                            </TableCell>
                            <TableCell className="text-right font-mono tabular-nums font-medium">
                              {formatNumber(d.litersPerHour)}
                            </TableCell>
                            <TableCell className={`text-right font-mono tabular-nums font-medium ${devColor}`}>
                              {d.deviationPercent > 0 ? '+' : ''}{formatNumber(d.deviationPercent)}%
                            </TableCell>
                            <TableCell className={`text-right font-mono tabular-nums font-medium ${momColor}`}>
                              {d.monthOverMonthPercent !== null ? (
                                <span className="inline-flex items-center gap-1">
                                  {TrendIcon && <TrendIcon className="h-3 w-3" />}
                                  {d.monthOverMonthPercent > 0 ? '+' : ''}{formatNumber(d.monthOverMonthPercent)}%
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-mono tabular-nums text-blue-600 dark:text-blue-400">
                              {formatNumber(d.ytdLiters)}
                            </TableCell>
                            <TableCell className="text-right font-mono tabular-nums text-blue-600 dark:text-blue-400">
                              {formatCurrency(d.ytdCost)}
                            </TableCell>
                            <TableCell className="text-right">
                              <Badge
                                variant="outline"
                                className={`text-[10px] ${d.hasTimesheetData ? 'border-green-300 text-green-700 dark:border-green-700 dark:text-green-400' : 'border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400'}`}
                              >
                                {d.hasTimesheetData ? 'Timesheet' : 'Estimated'}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    ) : (
                      <TableRow>
                        <TableHead colSpan={10} className="h-24 text-center text-muted-foreground">
                          {latestMonthlyData.length === 0
                            ? 'No monthly data available'
                            : 'No results match your search'}
                        </TableHead>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              {hasPageSize && summaryTotalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-2 border-t">
                  <p className="text-xs text-muted-foreground">
                    Showing {(summaryPage - 1) * summaryPageSize + 1}&ndash;{Math.min(summaryPage * summaryPageSize, filteredSummaryData.length)} of {filteredSummaryData.length}
                  </p>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={summaryPage <= 1}
                      onClick={() => setSummaryPage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    {(() => {
                      const pages: (number | string)[] = [];
                      const total = summaryTotalPages;
                      const current = summaryPage;
                      if (total <= 7) {
                        for (let i = 1; i <= total; i++) pages.push(i);
                      } else {
                        pages.push(1);
                        if (current > 3) pages.push('...');
                        const start = Math.max(2, current - 1);
                        const end = Math.min(total - 1, current + 1);
                        for (let i = start; i <= end; i++) pages.push(i);
                        if (current < total - 2) pages.push('...');
                        pages.push(total);
                      }
                      return pages.map((p, i) =>
                        typeof p === 'string' ? (
                          <span key={`ellipsis_${i}`} className="px-1 text-xs text-muted-foreground">&hellip;</span>
                        ) : (
                          <Button
                            key={p}
                            variant={p === current ? 'default' : 'outline'}
                            size="sm"
                            className="min-w-[32px] h-8 text-xs"
                            onClick={() => setSummaryPage(p)}
                          >
                            {p}
                          </Button>
                        )
                      );
                    })()}
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={summaryPage >= summaryTotalPages}
                      onClick={() => setSummaryPage((p) => Math.min(summaryTotalPages, p + 1))}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
              <p className="text-xs text-muted-foreground px-4 py-2 border-t">
                Click a row to see daily breakdown for that month in a new view.
              </p>
            </CardContent>
          </Card>

          {/* Anomalies Section — Optimized with pagination */}
          {allAnomalies.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  Anomaly Alerts
                  <Badge variant="destructive" className="ml-2 text-[10px] px-1.5">
                    {criticalCount} Critical
                  </Badge>
                  <Badge variant="outline" className="text-[10px] px-1.5 border-amber-300 text-amber-700">
                    {warningCount} Warning
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {visibleAnomalies.map((anomaly, idx) => {
                  const SeverityIcon = anomaly.severity === 'critical' ? AlertOctagon : AlertTriangle;
                  return (
                    <div
                      key={`anomaly_${idx}`}
                      className={`rounded-lg border p-4 ${
                        anomaly.severity === 'critical'
                          ? 'border-red-500 bg-red-50 dark:bg-red-950/20'
                          : 'border-amber-500 bg-amber-50 dark:bg-amber-950/20'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <SeverityIcon
                          className={`h-5 w-5 mt-0.5 ${
                            anomaly.severity === 'critical'
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-amber-600 dark:text-amber-400'
                          }`}
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className={`text-[10px] uppercase ${
                                anomaly.severity === 'critical'
                                  ? 'border-red-300 text-red-700 dark:border-red-700 dark:text-red-400'
                                  : 'border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400'
                              }`}
                            >
                              {anomaly.severity}
                            </Badge>
                            <Badge
                              variant="secondary"
                              className="text-[10px] uppercase"
                            >
                              {anomaly.type.replace(/_/g, ' ')}
                            </Badge>
                          </div>
                          <p className="text-sm mt-1">{anomaly.message}</p>
                          <div className="flex gap-4 mt-1.5 text-xs text-muted-foreground">
                            <span>
                              Actual: <strong>{formatNumber(anomaly.actualValue)} L/hr</strong>
                            </span>
                            <span>
                              Expected: <strong>{formatNumber(anomaly.expectedValue)} L/hr</strong>
                            </span>
                            <span>
                              Deviation: <strong>{formatNumber(Math.abs(anomaly.deviationPercent))}%</strong>
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Anomaly pagination */}
                {allAnomalies.length > ANOMALIES_PER_PAGE && (
                  <div className="flex items-center justify-center gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setAnomalyExpanded(!anomalyExpanded)}
                    >
                      {anomalyExpanded
                        ? `Show first ${ANOMALIES_PER_PAGE}`
                        : `Show all ${allAnomalies.length} anomalies`}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
