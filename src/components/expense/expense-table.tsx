'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { format } from 'date-fns';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useExpenseStore } from '@/hooks/use-expense-store';
import { useDebounce } from '@/hooks/use-debounce';
import { usePermissions } from '@/hooks/use-permissions';
import {
  CATEGORIES,
  PAYMENT_METHODS,
  CATEGORY_LABELS,
  PAYMENT_METHOD_LABELS,
  CATEGORY_COLORS,
} from '@/types/expense';
import type { Expense, Category, PaymentMethod } from '@/types/expense';
import { EmptyState } from '@/components/common/empty-state';
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  MoreHorizontal,
  Pencil,
  Trash2,
  Search,
  Filter,
  X,
  ChevronLeft,
  ChevronRight,
  FileDown,
  Receipt,
  CheckSquare,
  Square,
  Slash,
  ChevronDown,
} from 'lucide-react';

interface ExpenseTableProps {
  onEdit: (expense: Expense) => void;
  onDelete: (expense: Expense) => void;
  onBulkDelete: () => void;
  onExportPdf: () => void;
  onViewDetail: (expense: Expense) => void;
}

export function ExpenseTable({
  onEdit,
  onDelete,
  onBulkDelete,
  onExportPdf,
  onViewDetail,
}: ExpenseTableProps) {
  const { canEdit, canDelete } = usePermissions();
  const expenses = useExpenseStore((s) => s.expenses);
  const selectedExpenseIds = useExpenseStore((s) => s.selectedExpenseIds);
  const filters = useExpenseStore((s) => s.filters);
  const pagination = useExpenseStore((s) => s.pagination);
  const sorting = useExpenseStore((s) => s.sorting);
  const isLoading = useExpenseStore((s) => s.isLoading);
  const fetchExpenses = useExpenseStore((s) => s.fetchExpenses);
  const toggleSelectExpense = useExpenseStore((s) => s.toggleSelectExpense);
  const selectAllExpenses = useExpenseStore((s) => s.selectAllExpenses);
  const clearSelection = useExpenseStore((s) => s.clearSelection);
  const setFilters = useExpenseStore((s) => s.setFilters);
  const resetFilters = useExpenseStore((s) => s.resetFilters);
  const setPage = useExpenseStore((s) => s.setPage);
  const setPageSize = useExpenseStore((s) => s.setPageSize);
  const setSorting = useExpenseStore((s) => s.setSorting);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchInput, setSearchInput] = useState(filters.search ?? '');
  const [searchField, setSearchField] = useState(filters.searchField ?? 'all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchScopeOpen, setSearchScopeOpen] = useState(false);

  const SEARCH_FIELDS = [
    { value: 'all', label: 'All Fields' },
    { value: 'title', label: 'Title' },
    { value: 'description', label: 'Description' },
    { value: 'paidTo', label: 'Paid To' },
    { value: 'paidBy', label: 'Paid By' },
    { value: 'notes', label: 'Notes' },
  ] as const;

  // Keyboard shortcut to focus search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.key === '/' &&
        !e.ctrlKey &&
        !e.metaKey &&
        document.activeElement !== searchInputRef.current
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // Local filter state for collapsible panel
  const [localCategories, setLocalCategories] = useState<Category[]>(
    filters.categories ?? []
  );
  const [localPaymentMethods, setLocalPaymentMethods] = useState<PaymentMethod[]>(
    filters.paymentMethods ?? []
  );
  const [localDateFrom, setLocalDateFrom] = useState(filters.dateFrom ?? '');
  const [localDateTo, setLocalDateTo] = useState(filters.dateTo ?? '');
  const [localAmountMin, setLocalAmountMin] = useState(
    filters.amountMin !== undefined ? String(filters.amountMin) : ''
  );
  const [localAmountMax, setLocalAmountMax] = useState(
    filters.amountMax !== undefined ? String(filters.amountMax) : ''
  );

  const debouncedSearch = useDebounce(searchInput, 300);
  const isFirstRender = useRef(true);

  // Sync debounced search & searchField to store (skip on first render to avoid double-fetch)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setFilters({
      search: debouncedSearch || undefined,
      searchField: debouncedSearch ? searchField : undefined,
    });
  }, [debouncedSearch, searchField, setFilters]);

  // Fetch expenses when filters/pagination/sorting change
  useEffect(() => {
    fetchExpenses();
  }, [filters, pagination.page, pagination.pageSize, sorting, fetchExpenses]);

  // Count active filters (excluding search)
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.categories && filters.categories.length > 0) count++;
    if (filters.paymentMethods && filters.paymentMethods.length > 0) count++;
    if (filters.dateFrom) count++;
    if (filters.dateTo) count++;
    if (filters.amountMin !== undefined) count++;
    if (filters.amountMax !== undefined) count++;
    return count;
  }, [filters]);

  // TanStack Table sorting state
  const [sortingState, setSortingState] = useState<SortingState>([
    {
      id: sorting.sortBy,
      desc: sorting.sortOrder === 'desc',
    },
  ]);

  // Column definitions
  const columns = useMemo<ColumnDef<Expense>[]>(
    () => [
      {
        id: 'select',
        header: ({ table }) => (
          <Checkbox
            checked={
              expenses.length > 0 &&
              expenses.every((e) => selectedExpenseIds.has(e.id))
            }
            onCheckedChange={(checked) => {
              if (checked) {
                selectAllExpenses();
              } else {
                clearSelection();
              }
            }}
            aria-label="Select all"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={selectedExpenseIds.has(row.original.id)}
            onCheckedChange={() => toggleSelectExpense(row.original.id)}
            aria-label={`Select ${row.original.title}`}
          />
        ),
        enableSorting: false,
        size: 40,
      },
      {
        accessorKey: 'title',
        header: ({ column }) => {
          const sorted = column.getIsSorted();
          return (
            <Button
              variant="ghost"
              size="sm"
              className="-ml-3 h-8"
              onClick={() => column.toggleSorting(sorted === 'asc')}
            >
              Title
              {sorted === 'asc' ? (
                <ArrowUp className="ml-1 h-4 w-4" />
              ) : sorted === 'desc' ? (
                <ArrowDown className="ml-1 h-4 w-4" />
              ) : (
                <ArrowUpDown className="ml-1 h-4 w-4 opacity-50" />
              )}
            </Button>
          );
        },
        cell: ({ getValue }) => {
          const title = getValue() as string;
          return (
            <span className="font-medium max-w-[200px] truncate block">
              {title}
            </span>
          );
        },
      },
      {
        accessorKey: 'category',
        header: ({ column }) => {
          const sorted = column.getIsSorted();
          return (
            <Button
              variant="ghost"
              size="sm"
              className="-ml-3 h-8"
              onClick={() => column.toggleSorting(sorted === 'asc')}
            >
              Category
              {sorted === 'asc' ? (
                <ArrowUp className="ml-1 h-4 w-4" />
              ) : sorted === 'desc' ? (
                <ArrowDown className="ml-1 h-4 w-4" />
              ) : (
                <ArrowUpDown className="ml-1 h-4 w-4 opacity-50" />
              )}
            </Button>
          );
        },
        cell: ({ getValue }) => {
          const cat = getValue() as Category;
          return (
            <Badge
              className="text-white border-0 text-xs"
              style={{ backgroundColor: CATEGORY_COLORS[cat] }}
            >
              {CATEGORY_LABELS[cat]}
            </Badge>
          );
        },
      },
      {
        accessorKey: 'amount',
        header: ({ column }) => {
          const sorted = column.getIsSorted();
          return (
            <Button
              variant="ghost"
              size="sm"
              className="-ml-3 h-8"
              onClick={() => column.toggleSorting(sorted === 'asc')}
            >
              Amount
              {sorted === 'asc' ? (
                <ArrowUp className="ml-1 h-4 w-4" />
              ) : sorted === 'desc' ? (
                <ArrowDown className="ml-1 h-4 w-4" />
              ) : (
                <ArrowUpDown className="ml-1 h-4 w-4 opacity-50" />
              )}
            </Button>
          );
        },
        cell: ({ getValue }) => {
          const amount = getValue() as number;
          return (
            <span className="font-mono tabular-nums">
              Afs {amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          );
        },
      },
      {
        accessorKey: 'paymentMethod',
        header: ({ column }) => {
          const sorted = column.getIsSorted();
          return (
            <Button
              variant="ghost"
              size="sm"
              className="-ml-3 h-8"
              onClick={() => column.toggleSorting(sorted === 'asc')}
            >
              Payment Method
              {sorted === 'asc' ? (
                <ArrowUp className="ml-1 h-4 w-4" />
              ) : sorted === 'desc' ? (
                <ArrowDown className="ml-1 h-4 w-4" />
              ) : (
                <ArrowUpDown className="ml-1 h-4 w-4 opacity-50" />
              )}
            </Button>
          );
        },
        cell: ({ getValue }) => {
          const pm = getValue() as PaymentMethod;
          return (
            <span className="text-sm">{PAYMENT_METHOD_LABELS[pm]}</span>
          );
        },
      },
      {
        accessorKey: 'paidTo',
        header: ({ column }) => {
          const sorted = column.getIsSorted();
          return (
            <Button
              variant="ghost"
              size="sm"
              className="-ml-3 h-8"
              onClick={() => column.toggleSorting(sorted === 'asc')}
            >
              Paid To
              {sorted === 'asc' ? (
                <ArrowUp className="ml-1 h-4 w-4" />
              ) : sorted === 'desc' ? (
                <ArrowDown className="ml-1 h-4 w-4" />
              ) : (
                <ArrowUpDown className="ml-1 h-4 w-4 opacity-50" />
              )}
            </Button>
          );
        },
        cell: ({ row }) => {
          const expense = row.original;
          const fullName = expense.paidToContractor
            ? `${expense.paidToContractor.contractorName} ${expense.paidToContractor.fatherName}`
            : expense.paidToEmployee?.fullName ?? expense.paidTo;
          return (
            <span className="max-w-[120px] truncate block">{fullName}</span>
          );
        },
      },
      {
        accessorKey: 'paidBy',
        header: ({ column }) => {
          const sorted = column.getIsSorted();
          return (
            <Button
              variant="ghost"
              size="sm"
              className="-ml-3 h-8"
              onClick={() => column.toggleSorting(sorted === 'asc')}
            >
              Paid By
              {sorted === 'asc' ? (
                <ArrowUp className="ml-1 h-4 w-4" />
              ) : sorted === 'desc' ? (
                <ArrowDown className="ml-1 h-4 w-4" />
              ) : (
                <ArrowUpDown className="ml-1 h-4 w-4 opacity-50" />
              )}
            </Button>
          );
        },
        cell: ({ getValue }) => {
          const paidBy = getValue() as string;
          return (
            <span className="max-w-[120px] truncate block">{paidBy}</span>
          );
        },
      },
      {
        accessorKey: 'expenseDate',
        header: ({ column }) => {
          const sorted = column.getIsSorted();
          return (
            <Button
              variant="ghost"
              size="sm"
              className="-ml-3 h-8"
              onClick={() => column.toggleSorting(sorted === 'asc')}
            >
              Date
              {sorted === 'asc' ? (
                <ArrowUp className="ml-1 h-4 w-4" />
              ) : sorted === 'desc' ? (
                <ArrowDown className="ml-1 h-4 w-4" />
              ) : (
                <ArrowUpDown className="ml-1 h-4 w-4 opacity-50" />
              )}
            </Button>
          );
        },
        cell: ({ getValue }) => {
          const date = getValue() as string;
          try {
            return format(new Date(date), 'MMM dd, yyyy');
          } catch {
            return date;
          }
        },
      },
      {
        id: 'actions',
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
                <span className="sr-only">Open menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canEdit('expenses') && (
                <DropdownMenuItem onClick={() => onEdit(row.original)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
              )}
              {canDelete('expenses') && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => onDelete(row.original)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ),
        enableSorting: false,
        size: 50,
      },
    ],
    [
      expenses,
      selectedExpenseIds,
      toggleSelectExpense,
      selectAllExpenses,
      clearSelection,
      onEdit,
      onDelete,
      canEdit,
      canDelete,
    ]
  );

  const table = useReactTable({
    data: expenses,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: (updater) => {
      const newSorting =
        typeof updater === 'function' ? updater(sortingState) : updater;
      setSortingState(newSorting);
      if (newSorting.length > 0) {
        setSorting(newSorting[0].id, newSorting[0].desc ? 'desc' : 'asc');
      }
    },
    state: {
      sorting: sortingState,
    },
    manualSorting: true,
    manualPagination: true,
    pageCount: pagination.totalPages,
  });

  // Apply filters from the collapsible panel
  const applyFilters = useCallback(() => {
    setFilters({
      categories: localCategories.length > 0 ? localCategories : undefined,
      paymentMethods:
        localPaymentMethods.length > 0 ? localPaymentMethods : undefined,
      dateFrom: localDateFrom || undefined,
      dateTo: localDateTo || undefined,
      amountMin: localAmountMin ? Number(localAmountMin) : undefined,
      amountMax: localAmountMax ? Number(localAmountMax) : undefined,
    });
  }, [
    localCategories,
    localPaymentMethods,
    localDateFrom,
    localDateTo,
    localAmountMin,
    localAmountMax,
    setFilters,
  ]);

  const handleResetFilters = useCallback(() => {
    setSearchInput('');
    setSearchField('all');
    setLocalCategories([]);
    setLocalPaymentMethods([]);
    setLocalDateFrom('');
    setLocalDateTo('');
    setLocalAmountMin('');
    setLocalAmountMax('');
    resetFilters();
  }, [resetFilters]);

  // Toggle a category in the local selection
  const toggleCategory = useCallback((cat: Category) => {
    setLocalCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  }, []);

  // Toggle a payment method in the local selection
  const togglePaymentMethod = useCallback((pm: PaymentMethod) => {
    setLocalPaymentMethods((prev) =>
      prev.includes(pm) ? prev.filter((p) => p !== pm) : [...prev, pm]
    );
  }, []);

  // Pagination helpers
  const startIndex =
    pagination.total > 0
      ? (pagination.page - 1) * pagination.pageSize + 1
      : 0;
  const endIndex = Math.min(
    pagination.page * pagination.pageSize,
    pagination.total
  );

  // Generate page numbers
  const pageNumbers = useMemo(() => {
    const pages: number[] = [];
    const totalPages = pagination.totalPages;
    const current = pagination.page;

    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (current > 3) pages.push(-1); // ellipsis
      for (
        let i = Math.max(2, current - 1);
        i <= Math.min(totalPages - 1, current + 1);
        i++
      ) {
        pages.push(i);
      }
      if (current < totalPages - 2) pages.push(-1); // ellipsis
      pages.push(totalPages);
    }
    return pages;
  }, [pagination.totalPages, pagination.page]);

  // Loading skeleton
  if (isLoading && expenses.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-9 w-24" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-8" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
        <div className="relative flex-1 w-full sm:max-w-md group">
          <div className="absolute left-0 top-0 h-full flex items-center">
            <Popover open={searchScopeOpen} onOpenChange={setSearchScopeOpen}>
              <PopoverTrigger asChild>
                <button className="flex items-center gap-1 h-9 px-2.5 rounded-l-md border-r bg-muted/50 hover:bg-muted transition-colors text-xs font-medium text-muted-foreground hover:text-foreground">
                  <Search className="h-3.5 w-3.5 shrink-0" />
                  <span className="hidden sm:inline">{SEARCH_FIELDS.find(f => f.value === searchField)?.label}</span>
                  <ChevronDown className="h-3 w-3 opacity-50" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-44 p-1" align="start" side="bottom">
                {SEARCH_FIELDS.map((field) => (
                  <button
                    key={field.value}
                    className={`flex items-center gap-2 w-full rounded-sm px-2 py-1.5 text-sm transition-colors ${
                      searchField === field.value
                        ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 font-medium'
                        : 'hover:bg-accent text-foreground'
                    }`}
                    onClick={() => {
                      setSearchField(field.value);
                      setSearchScopeOpen(false);
                      searchInputRef.current?.focus();
                    }}
                  >
                    {field.label}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          </div>
          <Input
            ref={searchInputRef}
            placeholder="Search expenses..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-[88px] sm:pl-[100px] pr-8 h-9"
          />
          {searchInput && (
            <button
              onClick={() => setSearchInput('')}
              className="absolute right-8 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
            <kbd className="hidden sm:inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-40 group-focus-within:opacity-0 transition-opacity">
              <Slash className="h-2.5 w-2.5" />
            </kbd>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFiltersOpen(!filtersOpen)}
            className="relative"
          >
            <Filter className="mr-2 h-4 w-4" />
            Filters
            {activeFilterCount > 0 && (
              <Badge className="ml-2 h-5 w-5 rounded-full p-0 flex items-center justify-center text-[10px] bg-emerald-600 text-white border-0">
                {activeFilterCount}
              </Badge>
            )}
          </Button>

          {(searchInput || activeFilterCount > 0) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResetFilters}
              className="text-muted-foreground"
            >
              <X className="mr-1 h-4 w-4" />
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Collapsible Filter Panel */}
      {filtersOpen && (
        <div className="border rounded-lg p-4 bg-card space-y-4 animate-in slide-in-from-top-2 duration-200">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Category Multi-Select */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Category</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start text-left font-normal"
                  >
                    {localCategories.length > 0
                      ? `${localCategories.length} selected`
                      : 'Select categories'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 max-h-64 overflow-y-auto p-2" align="start">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      className="flex items-center gap-2 w-full rounded-sm px-2 py-1.5 text-sm hover:bg-accent transition-colors"
                      onClick={() => toggleCategory(cat)}
                    >
                      {localCategories.includes(cat) ? (
                        <CheckSquare className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <Square className="h-4 w-4 text-muted-foreground" />
                      )}
                      <Badge
                        className="text-white border-0 text-xs"
                        style={{ backgroundColor: CATEGORY_COLORS[cat] }}
                      >
                        {CATEGORY_LABELS[cat]}
                      </Badge>
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
            </div>

            {/* Payment Method Multi-Select */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Payment Method</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start text-left font-normal"
                  >
                    {localPaymentMethods.length > 0
                      ? `${localPaymentMethods.length} selected`
                      : 'Select payment methods'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 max-h-64 overflow-y-auto p-2" align="start">
                  {PAYMENT_METHODS.map((pm) => (
                    <button
                      key={pm}
                      className="flex items-center gap-2 w-full rounded-sm px-2 py-1.5 text-sm hover:bg-accent transition-colors"
                      onClick={() => togglePaymentMethod(pm)}
                    >
                      {localPaymentMethods.includes(pm) ? (
                        <CheckSquare className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <Square className="h-4 w-4 text-muted-foreground" />
                      )}
                      {PAYMENT_METHOD_LABELS[pm]}
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
            </div>

            {/* Date Range */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Date Range</label>
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={localDateFrom}
                  onChange={(e) => setLocalDateFrom(e.target.value)}
                  placeholder="From"
                  className="text-sm"
                />
                <span className="text-muted-foreground text-xs">to</span>
                <Input
                  type="date"
                  value={localDateTo}
                  onChange={(e) => setLocalDateTo(e.target.value)}
                  placeholder="To"
                  className="text-sm"
                />
              </div>
            </div>

            {/* Amount Range */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Amount Range</label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                    Afs
                  </span>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Min"
                    value={localAmountMin}
                    onChange={(e) => setLocalAmountMin(e.target.value)}
                    className="pl-7 text-sm"
                  />
                </div>
                <span className="text-muted-foreground text-xs">to</span>
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                    Afs
                  </span>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Max"
                    value={localAmountMax}
                    onChange={(e) => setLocalAmountMax(e.target.value)}
                    className="pl-7 text-sm"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <Button
              size="sm"
              onClick={applyFilters}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              Apply Filters
            </Button>
            <Button size="sm" variant="outline" onClick={handleResetFilters}>
              Reset All
            </Button>
          </div>
        </div>
      )}

      {/* Bulk Action Bar */}
      {selectedExpenseIds.size > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-lg border bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800">
          <span className="text-sm font-medium">
            {selectedExpenseIds.size} selected
          </span>
          {canDelete('expenses') && (
            <Button
              size="sm"
              variant="destructive"
              onClick={onBulkDelete}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Selected
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={onExportPdf}>
            <FileDown className="mr-2 h-4 w-4" />
            Export PDF
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={clearSelection}
            className="text-muted-foreground"
          >
            Clear Selection
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={
                    selectedExpenseIds.has(row.original.id) ? 'selected' : undefined
                  }
                  className="cursor-pointer"
                  onClick={(e) => {
                    const target = e.target as HTMLElement;
                    if (
                      target.closest('button') ||
                      target.closest('[role="checkbox"]') ||
                      target.closest('[role="menuitem"]') ||
                      target.closest('a')
                    ) {
                      return;
                    }
                    onViewDetail(row.original);
                  }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-64"
                >
                  <EmptyState
                    icon={Receipt}
                    title="No expenses found"
                    description={
                      searchInput || activeFilterCount > 0
                        ? 'Try adjusting your search or filters.'
                        : 'Get started by adding your first expense.'
                    }
                  />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {pagination.total > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-sm text-muted-foreground">
            Showing{' '}
            <span className="font-medium text-foreground">{startIndex}</span>
            {' '}to{' '}
            <span className="font-medium text-foreground">{endIndex}</span>
            {' '}of{' '}
            <span className="font-medium text-foreground">{pagination.total}</span>{' '}
            results
          </div>

          <div className="flex items-center gap-4">
            {/* Page Size Selector */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Rows:</span>
              <select
                value={pagination.pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="h-8 rounded-md border bg-transparent px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {[10, 25, 50, 100].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </div>

            {/* Page Navigation */}
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setPage(pagination.page - 1)}
                disabled={pagination.page <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
                <span className="sr-only">Previous page</span>
              </Button>

              {pageNumbers.map((page, idx) =>
                page === -1 ? (
                  <span
                    key={`ellipsis-${idx}`}
                    className="px-2 text-muted-foreground"
                  >
                    ...
                  </span>
                ) : (
                  <Button
                    key={page}
                    variant={page === pagination.page ? 'default' : 'outline'}
                    size="icon"
                    className={`h-8 w-8 ${
                      page === pagination.page
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        : ''
                    }`}
                    onClick={() => setPage(page)}
                  >
                    {page}
                  </Button>
                )
              )}

              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setPage(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages}
              >
                <ChevronRight className="h-4 w-4" />
                <span className="sr-only">Next page</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Loading overlay when data exists but is refreshing */}
      {isLoading && expenses.length > 0 && (
        <div className="rounded-lg border p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-600/20 border-t-emerald-600" />
            Updating...
          </div>
        </div>
      )}
    </div>
  );
}
