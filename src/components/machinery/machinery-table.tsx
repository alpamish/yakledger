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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useMachineryStore } from '@/hooks/use-machinery-store';
import { useDebounce } from '@/hooks/use-debounce';
import { usePermissions } from '@/hooks/use-permissions';
import { machineryApi, contractorsApi } from '@/services/contractor-api';
import {
  MACHINERY_STATUSES,
  MACHINERY_STATUS_LABELS,
  MACHINERY_STATUS_COLORS,
  FUEL_TYPES,
  FUEL_TYPE_LABELS,
  FUEL_TYPE_COLORS,
} from '@/types/contractor';
import type { Machinery, MachineryStatus, FuelType } from '@/types/contractor';
import type { Contractor } from '@/types/contractor';
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
  Truck,
  Eye,
  CheckSquare,
  Square,
  FileText,
} from 'lucide-react';

interface MachineryTableProps {
  onTimesheet: (machinery: Machinery) => void;
  onEdit: (machinery: Machinery) => void;
  onDelete: (machinery: Machinery) => void;
  onBulkFarsiTimesheet?: (ids: string[]) => void;
}

export function MachineryTable({ onTimesheet, onEdit, onDelete, onBulkFarsiTimesheet }: MachineryTableProps) {
  const { canEdit, canDelete } = usePermissions();
  const machinery = useMachineryStore((s) => s.machinery);
  const selectedIds = useMachineryStore((s) => s.selectedIds);
  const filters = useMachineryStore((s) => s.filters);
  const pagination = useMachineryStore((s) => s.pagination);
  const sorting = useMachineryStore((s) => s.sorting);
  const isLoading = useMachineryStore((s) => s.isLoading);
  const fetchMachinery = useMachineryStore((s) => s.fetchMachinery);
  const toggleSelect = useMachineryStore((s) => s.toggleSelect);
  const selectAll = useMachineryStore((s) => s.selectAll);
  const clearSelection = useMachineryStore((s) => s.clearSelection);
  const setFilters = useMachineryStore((s) => s.setFilters);
  const resetFilters = useMachineryStore((s) => s.resetFilters);
  const setPage = useMachineryStore((s) => s.setPage);
  const setPageSize = useMachineryStore((s) => s.setPageSize);
  const setSortingStore = useMachineryStore((s) => s.setSorting);

  const [searchInput, setSearchInput] = useState(filters.search ?? '');
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Local filter state
  const [localStatuses, setLocalStatuses] = useState<MachineryStatus[]>(filters.statuses ?? []);
  const [localFuelTypes, setLocalFuelTypes] = useState<FuelType[]>(filters.fuelTypes ?? []);
  const [localMachineryType, setLocalMachineryType] = useState(filters.machineryTypes?.[0] ?? '');
  const [localContractorId, setLocalContractorId] = useState(filters.assignedContractorId ?? '');

  // Filter options
  const [machineryTypes, setMachineryTypes] = useState<string[]>([]);
  const [contractors, setContractors] = useState<Pick<Contractor, 'id' | 'contractorName'>[]>([]);

  const debouncedSearch = useDebounce(searchInput, 300);
  const isFirstRender = useRef(true);

  // Load filter options on mount
  useEffect(() => {
    async function load() {
      const [typesRes, contractorsRes] = await Promise.all([
        machineryApi.getTypes(),
        contractorsApi.getList('ACTIVE'),
      ]);
      if (typesRes.data) setMachineryTypes(typesRes.data);
      if (contractorsRes.data) setContractors(contractorsRes.data);
    }
    load();
  }, []);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setFilters({ search: debouncedSearch || undefined });
  }, [debouncedSearch, setFilters]);

  useEffect(() => {
    fetchMachinery();
  }, [filters, pagination.page, pagination.pageSize, sorting, fetchMachinery]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (localStatuses.length > 0) count++;
    if (localFuelTypes.length > 0) count++;
    if (localMachineryType) count++;
    if (localContractorId) count++;
    return count;
  }, [localStatuses, localFuelTypes, localMachineryType, localContractorId]);

  const [sortingState, setSortingState] = useState<SortingState>([
    { id: sorting.sortBy, desc: sorting.sortOrder === 'desc' },
  ]);

  const columns = useMemo<ColumnDef<Machinery>[]>(
    () => [
      {
        id: 'select',
        header: () => (
          <Checkbox
            checked={
              machinery.length > 0 &&
              machinery.every((m) => selectedIds.has(m.id))
            }
            onCheckedChange={(checked) => {
              if (checked) selectAll();
              else clearSelection();
            }}
            aria-label="Select all"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={selectedIds.has(row.original.id)}
            onCheckedChange={() => toggleSelect(row.original.id)}
            aria-label={`Select ${row.original.machineryName}`}
          />
        ),
        enableSorting: false,
        size: 40,
      },
      {
        accessorKey: 'machineryName',
        header: ({ column }) => {
          const sorted = column.getIsSorted();
          return (
            <Button variant="ghost" size="sm" className="-ml-3 h-8" onClick={() => column.toggleSorting(sorted === 'asc')}>
              Name
              {sorted === 'asc' ? <ArrowUp className="ml-1 h-4 w-4" /> : sorted === 'desc' ? <ArrowDown className="ml-1 h-4 w-4" /> : <ArrowUpDown className="ml-1 h-4 w-4 opacity-50" />}
            </Button>
          );
        },
        cell: ({ row }) => (
          <span className="font-medium text-sm truncate max-w-[180px] block">
            {row.original.machineryName}
          </span>
        ),
      },
      {
        accessorKey: 'machineryType',
        header: ({ column }) => {
          const sorted = column.getIsSorted();
          return (
            <Button variant="ghost" size="sm" className="-ml-3 h-8" onClick={() => column.toggleSorting(sorted === 'asc')}>
              Type
              {sorted === 'asc' ? <ArrowUp className="ml-1 h-4 w-4" /> : sorted === 'desc' ? <ArrowDown className="ml-1 h-4 w-4" /> : <ArrowUpDown className="ml-1 h-4 w-4 opacity-50" />}
            </Button>
          );
        },
        cell: ({ getValue }) => (
          <span className="text-sm text-muted-foreground">{getValue() as string}</span>
        ),
      },
      {
        accessorKey: 'driverName',
        header: 'Driver',
        cell: ({ getValue }) => {
          const name = getValue() as string | null;
          return <span className="text-sm text-muted-foreground">{name || '\u2014'}</span>;
        },
        enableSorting: false,
      },
      {
        accessorKey: 'plateNumber',
        header: 'Plate #',
        cell: ({ getValue }) => {
          const plate = getValue() as string | null;
          return <span className="text-sm text-muted-foreground">{plate || '\u2014'}</span>;
        },
        enableSorting: false,
      },
      {
        accessorKey: 'status',
        header: ({ column }) => {
          const sorted = column.getIsSorted();
          return (
            <Button variant="ghost" size="sm" className="-ml-3 h-8" onClick={() => column.toggleSorting(sorted === 'asc')}>
              Status
              {sorted === 'asc' ? <ArrowUp className="ml-1 h-4 w-4" /> : sorted === 'desc' ? <ArrowDown className="ml-1 h-4 w-4" /> : <ArrowUpDown className="ml-1 h-4 w-4 opacity-50" />}
            </Button>
          );
        },
        cell: ({ getValue }) => {
          const status = getValue() as MachineryStatus;
          const color = MACHINERY_STATUS_COLORS[status] ?? '#78716c';
          return (
            <Badge variant="outline" className="border-0 text-xs" style={{ backgroundColor: `${color}18`, color }}>
              {MACHINERY_STATUS_LABELS[status] ?? status}
            </Badge>
          );
        },
      },
      {
        id: 'contractor',
        header: 'Contractor',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground truncate max-w-[150px] block">
            {row.original.assignedContractor?.contractorName ?? '\u2014'}
          </span>
        ),
        enableSorting: false,
      },
      {
        id: 'fuelType',
        header: 'Fuel',
        cell: ({ row }) => {
          const fType = row.original.fuelType as FuelType;
          const color = FUEL_TYPE_COLORS[fType] ?? '#78716c';
          return (
            <Badge variant="outline" className="border-0 text-xs" style={{ backgroundColor: `${color}18`, color }}>
              {FUEL_TYPE_LABELS[fType] ?? fType}
            </Badge>
          );
        },
        enableSorting: false,
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
              <DropdownMenuItem onClick={() => onTimesheet(row.original)}>
                <FileText className="mr-2 h-4 w-4 text-emerald-600" />
                Timesheet Form
              </DropdownMenuItem>
              {canEdit('machinery') && (
                <DropdownMenuItem onClick={() => onEdit(row.original)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
              )}
              {canDelete('machinery') && (
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
    [machinery, selectedIds, toggleSelect, selectAll, clearSelection, onTimesheet, onEdit, onDelete, canEdit, canDelete]
  );

  const table = useReactTable({
    data: machinery,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: (updater) => {
      const newSorting = typeof updater === 'function' ? updater(sortingState) : updater;
      setSortingState(newSorting);
      if (newSorting.length > 0) {
        setSortingStore(newSorting[0].id, newSorting[0].desc ? 'desc' : 'asc');
      }
    },
    state: { sorting: sortingState },
    manualSorting: true,
    manualPagination: true,
    pageCount: pagination.totalPages,
  });

  const applyFilters = useCallback(() => {
    setFilters({
      statuses: localStatuses.length > 0 ? localStatuses : undefined,
      fuelTypes: localFuelTypes.length > 0 ? localFuelTypes : undefined,
      machineryTypes: localMachineryType ? [localMachineryType] : undefined,
      assignedContractorId: localContractorId || undefined,
    });
    setFiltersOpen(false);
  }, [localStatuses, localFuelTypes, localMachineryType, localContractorId, setFilters]);

  const handleResetFilters = useCallback(() => {
    setSearchInput('');
    setLocalStatuses([]);
    setLocalFuelTypes([]);
    setLocalMachineryType('');
    setLocalContractorId('');
    resetFilters();
  }, [resetFilters]);

  const toggleStatus = useCallback((s: MachineryStatus) => {
    setLocalStatuses((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  }, []);

  const toggleFuelTypeFilter = useCallback((f: FuelType) => {
    setLocalFuelTypes((prev) =>
      prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]
    );
  }, []);

  const startIndex = pagination.total > 0 ? (pagination.page - 1) * pagination.pageSize + 1 : 0;
  const endIndex = Math.min(pagination.page * pagination.pageSize, pagination.total);

  const pageNumbers = useMemo(() => {
    const pages: number[] = [];
    const totalPages = pagination.totalPages;
    const current = pagination.page;
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (current > 3) pages.push(-1);
      for (let i = Math.max(2, current - 1); i <= Math.min(totalPages - 1, current + 1); i++) pages.push(i);
      if (current < totalPages - 2) pages.push(-1);
      pages.push(totalPages);
    }
    return pages;
  }, [pagination.totalPages, pagination.page]);

  if (isLoading && machinery.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-9 w-24" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-6 w-16" />
            <Skeleton className="h-8 w-8" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, contractor, plate, driver..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9"
          />
          {searchInput && (
            <button onClick={() => setSearchInput('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setFiltersOpen(!filtersOpen)} className="relative">
            <Filter className="mr-2 h-4 w-4" />
            Filters
            {activeFilterCount > 0 && (
              <Badge className="ml-2 h-5 w-5 rounded-full p-0 flex items-center justify-center text-[10px] bg-emerald-600 text-white border-0">
                {activeFilterCount}
              </Badge>
            )}
          </Button>
          {activeFilterCount > 0 && (
            <Button variant="ghost" size="sm" onClick={handleResetFilters} className="text-muted-foreground">
              <X className="mr-1 h-4 w-4" />
              Reset
            </Button>
          )}
        </div>
      </div>

      {/* Collapsible Filter Panel */}
      {filtersOpen && (
        <div className="border rounded-lg p-4 bg-card space-y-4 animate-in slide-in-from-top-2 duration-200">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Status Multi-Select */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Status</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full justify-start text-left font-normal">
                    {localStatuses.length > 0 ? `${localStatuses.length} selected` : 'Select statuses'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 max-h-48 overflow-y-auto p-2" align="start">
                  {MACHINERY_STATUSES.map((s) => {
                    const color = MACHINERY_STATUS_COLORS[s];
                    return (
                      <button key={s} className="flex items-center gap-2 w-full rounded-sm px-2 py-1.5 text-sm hover:bg-accent transition-colors" onClick={() => toggleStatus(s)}>
                        {localStatuses.includes(s) ? <CheckSquare className="h-4 w-4 text-emerald-600" /> : <Square className="h-4 w-4 text-muted-foreground" />}
                        <Badge variant="outline" className="border-0 text-xs" style={{ backgroundColor: `${color}18`, color }}>
                          {MACHINERY_STATUS_LABELS[s]}
                        </Badge>
                      </button>
                    );
                  })}
                </PopoverContent>
              </Popover>
            </div>

            {/* Fuel Type Multi-Select */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Fuel Type</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full justify-start text-left font-normal">
                    {localFuelTypes.length > 0 ? `${localFuelTypes.length} selected` : 'Select fuel types'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 max-h-48 overflow-y-auto p-2" align="start">
                  {FUEL_TYPES.map((f) => {
                    const color = FUEL_TYPE_COLORS[f];
                    return (
                      <button key={f} className="flex items-center gap-2 w-full rounded-sm px-2 py-1.5 text-sm hover:bg-accent transition-colors" onClick={() => toggleFuelTypeFilter(f)}>
                        {localFuelTypes.includes(f) ? <CheckSquare className="h-4 w-4 text-emerald-600" /> : <Square className="h-4 w-4 text-muted-foreground" />}
                        <Badge variant="outline" className="border-0 text-xs" style={{ backgroundColor: `${color}18`, color }}>
                          {FUEL_TYPE_LABELS[f]}
                        </Badge>
                      </button>
                    );
                  })}
                </PopoverContent>
              </Popover>
            </div>

            {/* Type Select */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Type</label>
              <Select value={localMachineryType} onValueChange={setLocalMachineryType}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  {machineryTypes.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Contractor Select */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Contractor</label>
              <Select value={localContractorId} onValueChange={setLocalContractorId}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="All Contractors" />
                </SelectTrigger>
                <SelectContent>
                  {contractors.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.contractorName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <Button size="sm" onClick={applyFilters}>
              Apply Filters
            </Button>
            <Button size="sm" variant="outline" onClick={handleResetFilters}>
              Reset All
            </Button>
          </div>
        </div>
      )}

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 p-3 rounded-lg border bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          {onBulkFarsiTimesheet && (
            <Button size="sm" variant="outline" className="border-emerald-300 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-950" onClick={() => {
              onBulkFarsiTimesheet(Array.from(selectedIds));
            }}>
              <FileText className="mr-2 h-4 w-4" />
              Print Timesheets (Farsi)
            </Button>
          )}
          {canEdit('machinery') && (
            <BulkStatusAction
              selectedIds={Array.from(selectedIds)}
              onComplete={clearSelection}
            />
          )}
          {canDelete('machinery') && (
            <Button size="sm" variant="destructive" onClick={() => {
              const ids = Array.from(selectedIds);
              useMachineryStore.getState().bulkDelete(ids);
            }}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Selected
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={clearSelection} className="text-muted-foreground">
            Clear Selection
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border overflow-x-auto">
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
            {table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-state={selectedIds.has(row.original.id) ? 'selected' : undefined}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-64">
                  <EmptyState
                    icon={Truck}
                    title="No machinery found"
                    description={searchInput || activeFilterCount > 0 ? 'Try adjusting your search or filters.' : 'Get started by adding your first machinery.'}
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
            Showing <span className="font-medium text-foreground">{startIndex}</span> to{' '}
            <span className="font-medium text-foreground">{endIndex}</span> of{' '}
            <span className="font-medium text-foreground">{pagination.total}</span> results
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Rows:</span>
              <select
                value={pagination.pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="h-8 rounded-md border bg-transparent px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {[10, 20, 50, 100].map((size) => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setPage(pagination.page - 1)}
                disabled={pagination.page <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {pageNumbers.map((page, idx) =>
                page === -1 ? (
                  <span key={`ellipsis-${idx}`} className="px-2 text-muted-foreground">...</span>
                ) : (
                  <Button
                    key={page}
                    variant={page === pagination.page ? 'default' : 'outline'}
                    size="icon"
                    className={`h-8 w-8 ${page === pagination.page ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}`}
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
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Refreshing indicator */}
      {isLoading && machinery.length > 0 && (
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

function BulkStatusAction({
  selectedIds,
  onComplete,
}: {
  selectedIds: string[];
  onComplete: () => void;
}) {
  const [status, setStatus] = useState<MachineryStatus>('OPERATIONAL');

  const handleApply = useCallback(async () => {
    const confirmed = window.confirm(
      `Are you sure you want to change the status of ${selectedIds.length} machinery record(s) to "${MACHINERY_STATUS_LABELS[status]}"?`
    );
    if (!confirmed) return;
    await useMachineryStore.getState().bulkUpdateStatus(selectedIds, status);
    onComplete();
  }, [selectedIds, status, onComplete]);

  return (
    <div className="flex items-center gap-2">
      <Select value={status} onValueChange={(v) => setStatus(v as MachineryStatus)}>
        <SelectTrigger className="h-8 w-44 border-emerald-300 dark:border-emerald-700">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MACHINERY_STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {MACHINERY_STATUS_LABELS[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        size="sm"
        variant="outline"
        className="border-emerald-300 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-950"
        onClick={handleApply}
      >
        Apply Status
      </Button>
    </div>
  );
}
