'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useDebounce } from '@/hooks/use-debounce';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { format } from 'date-fns';
import { useAssetStore } from '@/hooks/use-asset-store';
import { fuelApi } from '@/services/asset-api';
import { settingsApi } from '@/services/settings';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { Badge } from '@/components/ui/badge';
import { Fuel, Plus, Trash2, FileText, FileBarChart, Loader2, ArrowRightLeft, ArrowUpDown, ArrowUp, ArrowDown, Search, Pencil, Eye, Filter, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { FuelPurchaseForm } from './fuel-purchase-form';
import { FuelIssueForm } from './fuel-issue-form';
import { FuelTransferForm } from './fuel-transfer-form';
import { FUEL_TYPE_LABELS, FUEL_TYPE_COLORS } from '@/types/contractor';
import { FUEL_TRANSACTION_TYPE_LABELS } from '@/types/asset';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { pdf } from '@react-pdf/renderer';
import type { FuelContainerStock, FuelStock, FuelTransaction, FuelFinancialSummary } from '@/types/asset';

const LOW_STOCK_THRESHOLD = 50;

export function FuelPage() {
  const fuelTransactions = useAssetStore((s) => s.fuelTransactions);
  const fuelPagination = useAssetStore((s) => s.fuelPagination);
  const fetchFuelTransactions = useAssetStore((s) => s.fetchFuelTransactions);
  const deleteFuelTransaction = useAssetStore((s) => s.deleteFuelTransaction);
  const setFuelPage = useAssetStore((s) => s.setFuelPage);

  const [containerStock, setContainerStock] = useState<FuelContainerStock[]>([]);
  const [stockByType, setStockByType] = useState<FuelStock[]>([]);
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [issueOpen, setIssueOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string | null }>({
    open: false,
    id: null,
  });
  const [financialSummary, setFinancialSummary] = useState<FuelFinancialSummary | null>(null);
  const [financialPdfGenerating, setFinancialPdfGenerating] = useState(false);
  const [summaryPdfGenerating, setSummaryPdfGenerating] = useState(false);
  const [sortingState, setSortingState] = useState<SortingState>([]);
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebounce(searchInput, 300);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [fuelTypeFilter, setFuelTypeFilter] = useState<string>('');
  const [containerFilter, setContainerFilter] = useState<string>('');
  const [pageSize, setPageSize] = useState(10);
  const [tableLoading, setTableLoading] = useState(false);
  const [companyName, setCompanyName] = useState("YakhshiLedger");
  const [detailTransaction, setDetailTransaction] = useState<FuelTransaction | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<FuelTransaction | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  const loadData = useCallback(() => {
    fetchFuelTransactions();
    fuelApi.getStock().then((res) => {
      if (res.data) {
        setContainerStock(res.data.containerStock);
        setStockByType(res.data.stock);
      }
    });
    fuelApi.getFinancialSummary().then((res) => {
      if (res.data) {
        setFinancialSummary(res.data);
      }
    });
  }, [fetchFuelTransactions]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    settingsApi.get().then((res) => {
      if (res.data?.companyName) setCompanyName(res.data.companyName);
    }).catch(() => {});
  }, []);

  // Sync all filters to store and re-fetch on change
  useEffect(() => {
    const filters: Record<string, string | undefined> = {};
    if (typeFilter && typeFilter !== 'all') filters.type = typeFilter;
    if (fuelTypeFilter) filters.fuelType = fuelTypeFilter;
    if (containerFilter) filters.containerId = containerFilter;
    if (dateFrom) filters.dateFrom = dateFrom;
    if (dateTo) filters.dateTo = dateTo;
    if (debouncedSearch) filters.search = debouncedSearch;
    useAssetStore.getState().setFuelFilters(filters);
    useAssetStore.getState().setFuelPageSize(pageSize);
    setTableLoading(true);
    useAssetStore.getState().fetchFuelTransactions().finally(() => setTableLoading(false));
  }, [typeFilter, fuelTypeFilter, containerFilter, dateFrom, dateTo, debouncedSearch, pageSize]);

  // Sync sorting to store and re-fetch
  useEffect(() => {
    if (sortingState.length > 0) {
      const s = sortingState[0];
      useAssetStore.getState().setFuelSorting(s.id, s.desc ? 'desc' : 'asc');
    } else {
      useAssetStore.getState().setFuelSorting('date', 'desc');
    }
    setTableLoading(true);
    useAssetStore.getState().fetchFuelTransactions().finally(() => setTableLoading(false));
  }, [sortingState]);

  const handleDelete = async () => {
    if (!deleteConfirm.id) return;
    try {
      await deleteFuelTransaction(deleteConfirm.id);
      toast.success('Fuel transaction deleted');
      loadData();
    } catch {
      toast.error('Failed to delete');
    }
    setDeleteConfirm({ open: false, id: null });
  };

  const handleDownloadFinancialPDF = async () => {
    setFinancialPdfGenerating(true);
    try {
      const { default: FuelFinancialPDFDocument } = await import('@/components/pdf/fuel-financial-pdf-document');
      if (!financialSummary) {
        const res = await fuelApi.getFinancialSummary();
        if (!res.data) throw new Error('No data');
        setFinancialSummary(res.data);
        const blob = await pdf(
          <FuelFinancialPDFDocument data={res.data} generatedAt={new Date()} />
        ).toBlob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `fuel-financial-report-${new Date().toISOString().split('T')[0]}.pdf`;
        link.click();
        URL.revokeObjectURL(url);
      } else {
        const blob = await pdf(
          <FuelFinancialPDFDocument data={financialSummary} generatedAt={new Date()} />
        ).toBlob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `fuel-financial-report-${new Date().toISOString().split('T')[0]}.pdf`;
        link.click();
        URL.revokeObjectURL(url);
      }
      toast.success('Financial report PDF downloaded successfully');
    } catch (err) {
      console.error('PDF generation failed:', err);
      toast.error('Failed to generate financial report PDF');
    }
    setFinancialPdfGenerating(false);
  };

  const handleDownloadSummaryPDF = async () => {
    setSummaryPdfGenerating(true);
    try {
      const { default: FuelSummaryPDFDocument } = await import('@/components/pdf/fuel-summary-pdf-document');
      const params: { dateFrom?: string; dateTo?: string } = {};
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;
      const res = await fuelApi.getFinancialSummary(params);
      if (!res.data) throw new Error('No data');
      const blob = await pdf(
        <FuelSummaryPDFDocument data={res.data} generatedAt={new Date()} companyName={companyName} />
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `fuel-summary-report-${new Date().toISOString().split('T')[0]}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success('گزارش خلاصه با موفقیت دانلود شد');
    } catch (err) {
      console.error('PDF generation failed:', err);
      toast.error('گزارش خلاصه ایجاد نشد');
    }
    setSummaryPdfGenerating(false);
  };

  const fmtCurrency = (value: number | null | undefined) => {
    if (value == null) return '-';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'AFN', minimumFractionDigits: 0 }).format(value);
  };

  const columns = useMemo<ColumnDef<FuelTransaction>[]>(
    () => [
      {
        accessorKey: 'date',
        header: ({ column }) => {
          const sorted = column.getIsSorted();
          return (
            <Button variant="ghost" size="sm" className="-ml-3 h-8" onClick={() => column.toggleSorting(sorted === 'asc')}>
              Date
              {sorted === 'asc' ? <ArrowUp className="ml-1 h-4 w-4" /> : sorted === 'desc' ? <ArrowDown className="ml-1 h-4 w-4" /> : <ArrowUpDown className="ml-1 h-4 w-4 opacity-50" />}
            </Button>
          );
        },
        cell: ({ getValue }) => {
          const date = getValue() as string;
          try { return format(new Date(date), 'MMM dd, yyyy'); } catch { return date; }
        },
      },
      {
        accessorKey: 'type',
        header: ({ column }) => {
          const sorted = column.getIsSorted();
          return (
            <Button variant="ghost" size="sm" className="-ml-3 h-8" onClick={() => column.toggleSorting(sorted === 'asc')}>
              Type
              {sorted === 'asc' ? <ArrowUp className="ml-1 h-4 w-4" /> : sorted === 'desc' ? <ArrowDown className="ml-1 h-4 w-4" /> : <ArrowUpDown className="ml-1 h-4 w-4 opacity-50" />}
            </Button>
          );
        },
        cell: ({ getValue }) => {
          const type = getValue() as string;
          return <Badge variant={getTypeBadgeColor(type)}>{FUEL_TRANSACTION_TYPE_LABELS[type as keyof typeof FUEL_TRANSACTION_TYPE_LABELS] || type}</Badge>;
        },
      },
      {
        accessorKey: 'fuelType',
        header: ({ column }) => {
          const sorted = column.getIsSorted();
          return (
            <Button variant="ghost" size="sm" className="-ml-3 h-8" onClick={() => column.toggleSorting(sorted === 'asc')}>
              Fuel Type
              {sorted === 'asc' ? <ArrowUp className="ml-1 h-4 w-4" /> : sorted === 'desc' ? <ArrowDown className="ml-1 h-4 w-4" /> : <ArrowUpDown className="ml-1 h-4 w-4 opacity-50" />}
            </Button>
          );
        },
        cell: ({ getValue }) => {
          const ft = getValue() as string;
          const color = FUEL_TYPE_COLORS[ft as keyof typeof FUEL_TYPE_COLORS] || '#78716c';
          return (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
              {FUEL_TYPE_LABELS[ft as keyof typeof FUEL_TYPE_LABELS] || ft}
            </span>
          );
        },
      },
      {
        accessorKey: 'quantity',
        header: ({ column }) => {
          const sorted = column.getIsSorted();
          return (
            <Button variant="ghost" size="sm" className="-ml-3 h-8" onClick={() => column.toggleSorting(sorted === 'asc')}>
              Quantity
              {sorted === 'asc' ? <ArrowUp className="ml-1 h-4 w-4" /> : sorted === 'desc' ? <ArrowDown className="ml-1 h-4 w-4" /> : <ArrowUpDown className="ml-1 h-4 w-4 opacity-50" />}
            </Button>
          );
        },
        cell: ({ getValue }) => {
          const qty = getValue() as number;
          return <span className="font-mono tabular-nums">{qty} L</span>;
        },
      },
      {
        id: 'unitPrice',
        header: 'Unit Price',
        cell: ({ row }) => {
          const t = row.original;
          if (t.type === 'TRANSFER') return <span className="text-xs text-muted-foreground">-</span>;
          return <span className="font-mono tabular-nums text-xs">{fmtCurrency(t.unitPrice)}</span>;
        },
        enableSorting: false,
      },
      {
        id: 'totalCost',
        header: 'Total Cost',
        cell: ({ row }) => {
          const t = row.original;
          if (t.type === 'TRANSFER') return <span className="text-xs text-muted-foreground">-</span>;
          return <span className="font-mono tabular-nums text-xs">{fmtCurrency(t.totalCost)}</span>;
        },
        enableSorting: false,
      },
      {
        id: 'container',
        header: 'Container',
        cell: ({ row }) => {
          const t = row.original;
          if (t.type === 'PURCHASE' && t.container?.name) return <span className="text-xs">{t.container.name}</span>;
          if (t.type === 'TRANSFER') return (
            <span className="text-xs">
              {t.container?.name || '-'} → {t.destinationContainer?.name || '-'}
            </span>
          );
          if (t.type === 'ISSUE' && t.container?.name) return <span className="text-xs">{t.container.name}</span>;
          return <span className="text-xs">-</span>;
        },
        enableSorting: false,
      },
      {
        id: 'details',
        header: 'Details',
        cell: ({ row }) => {
          const t = row.original;
          return (
            <div className="text-xs">
              {t.asset?.name && <span className="block">{t.asset.name}</span>}
              {t.contractor?.contractorName && (
                <span className="block text-muted-foreground">
                  {t.contractor.contractorName}{t.machinery ? ` / ${t.machinery.machineryName}` : ''}
                </span>
              )}
              {t.supplier && <span className="block text-muted-foreground">Supplier: {t.supplier}</span>}
              {t.issuedToName && <span className="block text-muted-foreground">To: {t.issuedToName}</span>}
              {!t.asset && !t.contractor && !t.supplier && !t.issuedToName && <span>-</span>}
            </div>
          );
        },
        enableSorting: false,
      },
      {
        accessorKey: 'notes',
        header: 'Notes',
        cell: ({ getValue }) => {
          const notes = getValue() as string | null | undefined;
          if (!notes) return <span className="text-xs text-muted-foreground">-</span>;
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-xs truncate max-w-[120px] inline-block cursor-default">{notes}</span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[300px]">
                <p className="text-xs">{notes}</p>
              </TooltipContent>
            </Tooltip>
          );
        },
        enableSorting: false,
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => {
          const t = row.original;
          return (
            <div className="flex items-center justify-end gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => { setDetailTransaction(t); }}
              >
                <Eye className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => { setEditingTransaction(t); setEditDialogOpen(true); }}
              >
                <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setDeleteConfirm({ open: true, id: t.id })}
              >
                <Trash2 className="h-3.5 w-3.5 text-red-500" />
              </Button>
            </div>
          );
        },
        enableSorting: false,
        size: 110,
      },
    ],
    []
  );

  const table = useReactTable({
    data: fuelTransactions,
    columns,
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: setSortingState,
    state: { sorting: sortingState },
    manualPagination: true,
    pageCount: fuelPagination.totalPages,
  });

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (typeFilter && typeFilter !== 'all') count++;
    if (fuelTypeFilter) count++;
    if (containerFilter) count++;
    if (dateFrom) count++;
    if (dateTo) count++;
    return count;
  }, [typeFilter, fuelTypeFilter, containerFilter, dateFrom, dateTo]);

  const getPageNumbers = useCallback((current: number, total: number) => {
    const pages: number[] = [];
    if (total <= 7) {
      for (let i = 1; i <= total; i++) pages.push(i);
    } else {
      pages.push(1);
      if (current > 3) pages.push(-1);
      for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) {
        pages.push(i);
      }
      if (current < total - 2) pages.push(-1);
      pages.push(total);
    }
    return pages;
  }, []);

  const handleEditSubmit = useCallback(() => {
    setEditDialogOpen(false);
    setEditingTransaction(null);
    loadData();
  }, [loadData]);

  const lowStockContainers = containerStock.filter((c) => c.balance < LOW_STOCK_THRESHOLD && !c.isMainContainer);

  const getTypeBadgeColor = (type: string) => {
    switch (type) {
      case 'PURCHASE': return 'default';
      case 'TRANSFER': return 'outline';
      case 'ISSUE': return 'secondary';
      default: return 'default';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Fuel className="h-5 w-5 text-emerald-600" />
            Fuel Stock Management
          </h2>
          {lowStockContainers.length > 0 && (
            <p className="text-sm text-amber-600 mt-1">
              ⚠ {lowStockContainers.length} container{lowStockContainers.length > 1 ? 's' : ''} low on stock
            </p>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            className="border-amber-600 text-amber-600"
            onClick={handleDownloadSummaryPDF}
            disabled={summaryPdfGenerating}
          >
            {summaryPdfGenerating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileBarChart className="mr-2 h-4 w-4" />
            )}
            {summaryPdfGenerating ? 'Generating...' : 'Summary PDF'}
          </Button>
          <Button
            variant="outline"
            className="border-violet-600 text-violet-600"
            onClick={handleDownloadFinancialPDF}
            disabled={financialPdfGenerating}
          >
            {financialPdfGenerating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileText className="mr-2 h-4 w-4" />
            )}
            {financialPdfGenerating ? 'Generating...' : 'Financial Report PDF'}
          </Button>
          <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="border-blue-600 text-blue-600">
                <ArrowRightLeft className="mr-2 h-4 w-4" />
                Transfer
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Transfer Fuel Between Containers</DialogTitle>
              </DialogHeader>
              <FuelTransferForm
                onSuccess={() => {
                  setTransferOpen(false);
                  loadData();
                }}
              />
            </DialogContent>
          </Dialog>
          <Dialog open={purchaseOpen} onOpenChange={setPurchaseOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="border-emerald-600 text-emerald-600">
                <Plus className="mr-2 h-4 w-4" />
                Add Purchase
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Record Fuel Purchase</DialogTitle>
              </DialogHeader>
              <FuelPurchaseForm
                onSuccess={() => {
                  setPurchaseOpen(false);
                  loadData();
                }}
              />
            </DialogContent>
          </Dialog>
          <Dialog open={issueOpen} onOpenChange={setIssueOpen}>
            <DialogTrigger asChild>
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white">
                <Plus className="mr-2 h-4 w-4" />
                Issue Fuel
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[550px]">
              <DialogHeader>
                <DialogTitle>Issue Fuel from Container</DialogTitle>
              </DialogHeader>
              <FuelIssueForm
                onSuccess={() => {
                  setIssueOpen(false);
                  loadData();
                }}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Financial Summary Card */}
      {financialSummary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-emerald-700 dark:text-emerald-400">
                Total Purchased
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{financialSummary.totalPurchasedQty.toFixed(1)} <span className="text-sm font-normal text-muted-foreground">L</span></p>
              <p className="text-xs text-muted-foreground mt-1">
                {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'AFN', minimumFractionDigits: 0 }).format(financialSummary.totalPurchasedCost)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-blue-700 dark:text-blue-400">
                Total Issued / Delivered
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{financialSummary.totalIssuedQty.toFixed(1)} <span className="text-sm font-normal text-muted-foreground">L</span></p>
              <p className="text-xs text-muted-foreground mt-1">
                {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'AFN', minimumFractionDigits: 0 }).format(financialSummary.totalIssuedCost)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-amber-700 dark:text-amber-400">
                Remaining Balance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{financialSummary.remainingQty.toFixed(1)} <span className="text-sm font-normal text-muted-foreground">L</span></p>
              <p className="text-xs text-muted-foreground mt-1">
                Est. {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'AFN', minimumFractionDigits: 0 }).format(financialSummary.remainingValue)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-violet-700 dark:text-violet-400">
                Avg Unit Price
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'AFN', minimumFractionDigits: 0 }).format(financialSummary.avgUnitPrice)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">per liter</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Container Stock Cards */}
      {containerStock.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {containerStock.map((c) => {
            const color = FUEL_TYPE_COLORS[c.fuelType as keyof typeof FUEL_TYPE_COLORS] || '#78716c';
            const isLow = !c.isMainContainer && c.balance < LOW_STOCK_THRESHOLD;
            return (
              <Card
                key={c.containerId}
                className={isLow ? 'border-amber-400 bg-amber-50/30 dark:bg-amber-950/10' : ''}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                    {c.containerName}
                    {c.isMainContainer && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Main</Badge>
                    )}
                    {isLow && (
                      <Badge variant="outline" className="ml-auto text-xs text-amber-600 border-amber-400">
                        Low
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-baseline justify-between">
                    <p className="text-3xl font-bold">
                      {c.balance.toFixed(1)}{' '}
                      <span className="text-sm font-normal text-muted-foreground">L</span>
                    </p>
                    <span className="text-xs text-muted-foreground">
                      {FUEL_TYPE_LABELS[c.fuelType as keyof typeof FUEL_TYPE_LABELS] || c.fuelType}
                    </span>
                  </div>
                  {c.fuelCapacity && c.fuelCapacity > 0 && (
                    <>
                      <div className="mt-2">
                        <div className="flex justify-between text-xs text-muted-foreground mb-1">
                          <span>Capacity: {c.fuelCapacity}L</span>
                          <span>{c.usagePercent}%</span>
                        </div>
                        <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              c.usagePercent > 90
                                ? 'bg-red-500'
                                : c.usagePercent > 75
                                ? 'bg-amber-500'
                                : c.usagePercent > 20
                                ? 'bg-emerald-500'
                                : 'bg-red-400'
                            }`}
                            style={{ width: `${Math.min(c.usagePercent, 100)}%` }}
                          />
                        </div>
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground mt-1">
                        <span>In: {c.totalPurchased + c.totalTransferredIn > 0 ? (c.totalPurchased + c.totalTransferredIn).toFixed(1) : '0'}L</span>
                        <span>Out: {c.totalTransferredOut + c.totalIssued > 0 ? (c.totalTransferredOut + c.totalIssued).toFixed(1) : '0'}L</span>
                      </div>
                    </>
                  )}
                  {c.fuelLocation && (
                    <p className="text-xs text-muted-foreground mt-1">{c.fuelLocation}</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Fuel Type Summary */}
      {stockByType.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {stockByType.map((s) => {
            const color = FUEL_TYPE_COLORS[s.fuelType as keyof typeof FUEL_TYPE_COLORS] || '#78716c';
            return (
              <Badge key={s.fuelType} variant="outline" className="text-sm py-1 px-3 gap-2">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                {FUEL_TYPE_LABELS[s.fuelType as keyof typeof FUEL_TYPE_LABELS] || s.fuelType}: {s.balance.toFixed(1)}L
              </Badge>
            );
          })}
        </div>
      )}

      {/* Transactions Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <CardTitle className="text-lg shrink-0">Transaction History</CardTitle>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search transactions..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 pl-9 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                />
                {searchInput && (
                  <button
                    onClick={() => setSearchInput('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v)}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="PURCHASE">Purchases</SelectItem>
                  <SelectItem value="TRANSFER">Transfers</SelectItem>
                  <SelectItem value="ISSUE">Issues</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFiltersOpen(!filtersOpen)}
                className="relative shrink-0"
              >
                <Filter className="mr-1.5 h-4 w-4" />
                Filters
                {activeFilterCount > 0 && (
                  <Badge className="ml-1.5 h-5 w-5 rounded-full p-0 flex items-center justify-center text-[10px] bg-emerald-600 text-white border-0">
                    {activeFilterCount}
                  </Badge>
                )}
              </Button>
              {(searchInput || activeFilterCount > 0) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setSearchInput(''); setTypeFilter(''); setFuelTypeFilter(''); setContainerFilter(''); setDateFrom(''); setDateTo(''); }}
                  className="text-muted-foreground shrink-0"
                >
                  <X className="mr-1 h-4 w-4" />
                  Clear
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        {/* Collapsible Filter Panel */}
        {filtersOpen && (
          <div className="px-6 pb-4">
            <div className="border rounded-lg p-4 bg-muted/30 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Date Range</label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="text-sm h-9"
                    />
                    <span className="text-muted-foreground text-xs">to</span>
                    <Input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="text-sm h-9"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Fuel Type</label>
                  <select
                    value={fuelTypeFilter}
                    onChange={(e) => setFuelTypeFilter(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                  >
                    <option value="">All Fuel Types</option>
                    {Object.entries(FUEL_TYPE_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Container</label>
                  <select
                    value={containerFilter}
                    onChange={(e) => setContainerFilter(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                  >
                    <option value="">All Containers</option>
                    {containerStock.map((c) => (
                      <option key={c.containerId} value={c.containerId}>{c.containerName}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => { setFuelTypeFilter(''); setContainerFilter(''); setDateFrom(''); setDateTo(''); }} className="text-muted-foreground">
                  Reset Filters
                </Button>
              </div>
            </div>
          </div>
        )}

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead key={header.id} style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}>
                        {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {tableLoading ? (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="p-4">
                      <div className="space-y-3">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Skeleton key={i} className="h-8 w-full" />
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : table.getRowModel().rows.length > 0 ? (
                  table.getRowModel().rows.map((row) => (
                    <TableRow
                      key={row.id}
                      className="cursor-pointer"
                      onClick={() => setDetailTransaction(row.original)}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="text-center py-8 text-muted-foreground">
                      {activeFilterCount > 0 || searchInput ? (
                        <div className="flex flex-col items-center gap-1">
                          <Search className="h-5 w-5 opacity-40" />
                          <span>No transactions match your filters</span>
                        </div>
                      ) : (
                        <span>No fuel transactions yet</span>
                      )}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      {fuelPagination.totalPages > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-sm text-muted-foreground">
            {fuelPagination.total > 0 ? (
              <>
                Showing{' '}
                <span className="font-medium text-foreground">{(fuelPagination.page - 1) * fuelPagination.pageSize + 1}</span>
                {' '}to{' '}
                <span className="font-medium text-foreground">{Math.min(fuelPagination.page * fuelPagination.pageSize, fuelPagination.total)}</span>
                {' '}of{' '}
                <span className="font-medium text-foreground">{fuelPagination.total}</span>
                {' '}entries
              </>
            ) : (
              <span>0 entries</span>
            )}
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Rows:</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="h-8 rounded-md border bg-transparent px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {[10, 25, 50, 100].map((size) => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
            </div>

            {fuelPagination.totalPages > 1 && (
              <Pagination className="w-auto">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() => {
                        if (fuelPagination.page > 1) {
                          setFuelPage(fuelPagination.page - 1);
                          fetchFuelTransactions();
                        }
                      }}
                      className={fuelPagination.page <= 1 ? 'pointer-events-none opacity-50' : ''}
                    />
                  </PaginationItem>
                  {getPageNumbers(fuelPagination.page, fuelPagination.totalPages).map((p, idx) =>
                    p === -1 ? (
                      <PaginationItem key={`ellipsis-${idx}`}>
                        <span className="px-2 text-muted-foreground">...</span>
                      </PaginationItem>
                    ) : (
                      <PaginationItem key={p}>
                        <PaginationLink
                          isActive={p === fuelPagination.page}
                          onClick={() => { setFuelPage(p); fetchFuelTransactions(); }}
                        >
                          {p}
                        </PaginationLink>
                      </PaginationItem>
                    )
                  )}
                  <PaginationItem>
                    <PaginationNext
                      onClick={() => {
                        if (fuelPagination.page < fuelPagination.totalPages) {
                          setFuelPage(fuelPagination.page + 1);
                          fetchFuelTransactions();
                        }
                      }}
                      className={fuelPagination.page >= fuelPagination.totalPages ? 'pointer-events-none opacity-50' : ''}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={(open) => setDeleteConfirm({ open, id: open ? deleteConfirm.id : null })}
        title="Delete Fuel Transaction"
        description="Are you sure you want to delete this fuel transaction?"
        onConfirm={handleDelete}
        confirmText="Delete"
        variant="destructive"
      />

      {/* Detail Drawer */}
      <Sheet open={!!detailTransaction} onOpenChange={(open) => { if (!open) setDetailTransaction(null); }}>
        <SheetContent side="right" className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Transaction Details</SheetTitle>
            <SheetDescription>Fuel transaction information</SheetDescription>
          </SheetHeader>
          {detailTransaction && (
            <div className="space-y-4 mt-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Date</p>
                  <p className="text-sm font-medium">{format(new Date(detailTransaction.date), 'MMM dd, yyyy')}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Type</p>
                  <Badge variant={getTypeBadgeColor(detailTransaction.type)} className="mt-0.5">
                    {FUEL_TRANSACTION_TYPE_LABELS[detailTransaction.type as keyof typeof FUEL_TRANSACTION_TYPE_LABELS] || detailTransaction.type}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Fuel Type</p>
                  <p className="text-sm font-medium">{FUEL_TYPE_LABELS[detailTransaction.fuelType as keyof typeof FUEL_TYPE_LABELS] || detailTransaction.fuelType}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Quantity</p>
                  <p className="text-sm font-medium">{detailTransaction.quantity} L</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Unit Price</p>
                  <p className="text-sm font-medium">{fmtCurrency(detailTransaction.unitPrice)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total Cost</p>
                  <p className="text-sm font-medium">{fmtCurrency(detailTransaction.totalCost)}</p>
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                {detailTransaction.container?.name && (
                  <div>
                    <p className="text-xs text-muted-foreground">Container</p>
                    <p className="text-sm">{detailTransaction.container.name}</p>
                  </div>
                )}
                {detailTransaction.destinationContainer?.name && (
                  <div>
                    <p className="text-xs text-muted-foreground">Destination Container</p>
                    <p className="text-sm">{detailTransaction.destinationContainer.name}</p>
                  </div>
                )}
                {detailTransaction.supplier && (
                  <div>
                    <p className="text-xs text-muted-foreground">Supplier</p>
                    <p className="text-sm">{detailTransaction.supplier}</p>
                  </div>
                )}
                {detailTransaction.asset?.name && (
                  <div>
                    <p className="text-xs text-muted-foreground">Asset</p>
                    <p className="text-sm">{detailTransaction.asset.name}</p>
                  </div>
                )}
                {detailTransaction.contractor?.contractorName && (
                  <div>
                    <p className="text-xs text-muted-foreground">Contractor</p>
                    <p className="text-sm">{detailTransaction.contractor.contractorName}</p>
                  </div>
                )}
                {detailTransaction.machinery?.machineryName && (
                  <div>
                    <p className="text-xs text-muted-foreground">Machinery</p>
                    <p className="text-sm">{detailTransaction.machinery.machineryName}{detailTransaction.machinery.plateNumber ? ` (${detailTransaction.machinery.plateNumber})` : ''}</p>
                  </div>
                )}
                {detailTransaction.issuedToName && (
                  <div>
                    <p className="text-xs text-muted-foreground">Issued To</p>
                    <p className="text-sm">{detailTransaction.issuedToName}</p>
                  </div>
                )}
                {detailTransaction.notes && (
                  <div>
                    <p className="text-xs text-muted-foreground">Notes</p>
                    <p className="text-sm">{detailTransaction.notes}</p>
                  </div>
                )}
              </div>

              <Separator />

              <div className="text-xs text-muted-foreground space-y-1">
                <p>ID: {detailTransaction.id}</p>
                <p>Created: {format(new Date(detailTransaction.createdAt), 'MMM dd, yyyy HH:mm')}</p>
                {detailTransaction.updatedAt && (
                  <p>Updated: {format(new Date(detailTransaction.updatedAt), 'MMM dd, yyyy HH:mm')}</p>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={(open) => { if (!open) { setEditDialogOpen(false); setEditingTransaction(null); } }}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle>
              Edit {editingTransaction ? FUEL_TRANSACTION_TYPE_LABELS[editingTransaction.type as keyof typeof FUEL_TRANSACTION_TYPE_LABELS] : ''} Transaction
            </DialogTitle>
          </DialogHeader>
          {editingTransaction?.type === 'PURCHASE' && (
            <FuelPurchaseForm
              initialData={editingTransaction}
              onSuccess={handleEditSubmit}
            />
          )}
          {editingTransaction?.type === 'ISSUE' && (
            <FuelIssueForm
              initialData={editingTransaction}
              onSuccess={handleEditSubmit}
            />
          )}
          {editingTransaction?.type === 'TRANSFER' && (
            <FuelTransferForm
              initialData={editingTransaction}
              onSuccess={handleEditSubmit}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
