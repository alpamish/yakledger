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
import { useContractorStore } from '@/hooks/use-contractor-store';
import { useDebounce } from '@/hooks/use-debounce';
import { usePermissions } from '@/hooks/use-permissions';
import {
  CONTRACTOR_TYPES,
  CONTRACTOR_STATUSES,
  CONTRACTOR_TYPE_LABELS,
  CONTRACTOR_STATUS_LABELS,
  CONTRACTOR_TYPE_COLORS,
  CONTRACTOR_STATUS_COLORS,
} from '@/types/contractor';
import type { Contractor, ContractorType, ContractorStatus } from '@/types/contractor';
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
  HardHat,
  Eye,
  CheckSquare,
  Square,
  UserCheck,
  Ban,
} from 'lucide-react';

interface ContractorTableProps {
  onEdit: (contractor: Contractor) => void;
  onDelete: (contractor: Contractor) => void;
  onViewProfile: (contractor: Contractor) => void;
  onBulkAction: (action: 'delete' | 'activate' | 'suspend') => void;
}

function formatDateShort(dateStr: string): string {
  try {
    return format(new Date(dateStr), 'MMM dd, yyyy');
  } catch {
    return dateStr;
  }
}

export function ContractorTable({
  onEdit,
  onDelete,
  onViewProfile,
  onBulkAction,
}: ContractorTableProps) {
  const { canEdit, canDelete } = usePermissions();
  const contractors = useContractorStore((s) => s.contractors);
  const selectedContractorIds = useContractorStore((s) => s.selectedContractorIds);
  const filters = useContractorStore((s) => s.filters);
  const pagination = useContractorStore((s) => s.pagination);
  const sorting = useContractorStore((s) => s.sorting);
  const isLoading = useContractorStore((s) => s.isLoading);
  const fetchContractors = useContractorStore((s) => s.fetchContractors);
  const toggleSelectContractor = useContractorStore((s) => s.toggleSelectContractor);
  const selectAllContractors = useContractorStore((s) => s.selectAllContractors);
  const clearSelection = useContractorStore((s) => s.clearSelection);
  const setFilters = useContractorStore((s) => s.setFilters);
  const resetFilters = useContractorStore((s) => s.resetFilters);
  const setPage = useContractorStore((s) => s.setPage);
  const setPageSize = useContractorStore((s) => s.setPageSize);
  const setSortingStore = useContractorStore((s) => s.setSorting);

  const [searchInput, setSearchInput] = useState(filters.search ?? '');
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Local filter state
  const [localContractorTypes, setLocalContractorTypes] = useState<ContractorType[]>(
    filters.contractorTypes ?? []
  );
  const [localStatuses, setLocalStatuses] = useState<ContractorStatus[]>(
    filters.statuses ?? []
  );

  const debouncedSearch = useDebounce(searchInput, 300);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setFilters({ search: debouncedSearch || undefined });
  }, [debouncedSearch, setFilters]);

  useEffect(() => {
    fetchContractors();
  }, [filters, pagination.page, pagination.pageSize, sorting, fetchContractors]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.contractorTypes && filters.contractorTypes.length > 0) count++;
    if (filters.statuses && filters.statuses.length > 0) count++;
    return count;
  }, [filters]);

  const [sortingState, setSortingState] = useState<SortingState>([
    { id: sorting.sortBy, desc: sorting.sortOrder === 'desc' },
  ]);

  const columns = useMemo<ColumnDef<Contractor>[]>(
    () => [
      {
        id: 'select',
        header: ({ table }) => (
          <Checkbox
            checked={
              contractors.length > 0 &&
              contractors.every((c) => selectedContractorIds.has(c.id))
            }
            onCheckedChange={(checked) => {
              if (checked) selectAllContractors();
              else clearSelection();
            }}
            aria-label="Select all"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={selectedContractorIds.has(row.original.id)}
            onCheckedChange={() => toggleSelectContractor(row.original.id)}
            aria-label={`Select ${row.original.contractorName}`}
          />
        ),
        enableSorting: false,
        size: 40,
      },
      {
        accessorKey: 'contractorName',
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
          <p className="font-medium text-sm truncate max-w-[180px]">
            {row.original.contractorName}
          </p>
        ),
      },
      {
        accessorKey: 'contractorType',
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
          const type = getValue() as ContractorType;
          return (
            <Badge
              variant="outline"
              className="border-0 text-xs"
              style={{
                backgroundColor: `${CONTRACTOR_TYPE_COLORS[type] ?? '#78716c'}18`,
                color: CONTRACTOR_TYPE_COLORS[type] ?? '#78716c',
              }}
            >
              {CONTRACTOR_TYPE_LABELS[type] ?? type}
            </Badge>
          );
        },
      },
      {
        accessorKey: 'phoneNumber',
        header: 'Phone',
        cell: ({ getValue }) => {
          const phone = getValue() as string;
          return <span className="text-sm text-muted-foreground">{phone}</span>;
        },
        enableSorting: false,
      },
      {
        accessorKey: 'companyName',
        header: 'Company',
        cell: ({ getValue }) => {
          const company = getValue() as string | null | undefined;
          return (
            <span className="text-sm text-muted-foreground truncate max-w-[120px] block">
              {company || '\u2014'}
            </span>
          );
        },
        enableSorting: false,
      },
      {
        id: 'machinery',
        header: 'Machinery',
        cell: ({ row }) => {
          const count = row.original._count?.machinery ?? 0;
          return (
            <span className="text-sm tabular-nums">
              {count > 0 ? `${count} machine${count !== 1 ? 's' : ''}` : '\u2014'}
            </span>
          );
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
          const status = getValue() as ContractorStatus;
          return (
            <Badge
              variant="outline"
              className="border-0 text-xs"
              style={{
                backgroundColor: `${CONTRACTOR_STATUS_COLORS[status] ?? '#78716c'}18`,
                color: CONTRACTOR_STATUS_COLORS[status] ?? '#78716c',
              }}
            >
              {CONTRACTOR_STATUS_LABELS[status] ?? status}
            </Badge>
          );
        },
      },
      {
        accessorKey: 'createdAt',
        header: ({ column }) => {
          const sorted = column.getIsSorted();
          return (
            <Button variant="ghost" size="sm" className="-ml-3 h-8" onClick={() => column.toggleSorting(sorted === 'asc')}>
              Created
              {sorted === 'asc' ? <ArrowUp className="ml-1 h-4 w-4" /> : sorted === 'desc' ? <ArrowDown className="ml-1 h-4 w-4" /> : <ArrowUpDown className="ml-1 h-4 w-4 opacity-50" />}
            </Button>
          );
        },
        cell: ({ getValue }) => {
          const date = getValue() as string;
          return <span className="text-sm text-muted-foreground">{formatDateShort(date)}</span>;
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
              <DropdownMenuItem onClick={() => onViewProfile(row.original)}>
                <Eye className="mr-2 h-4 w-4" />
                View Profile
              </DropdownMenuItem>
              {canEdit('contractors') && (
                <DropdownMenuItem onClick={() => onEdit(row.original)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
              )}
              {canDelete('contractors') && (
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
    [contractors, selectedContractorIds, toggleSelectContractor, selectAllContractors, clearSelection, onEdit, onDelete, onViewProfile, canEdit, canDelete]
  );

  const table = useReactTable({
    data: contractors,
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
      contractorTypes: localContractorTypes.length > 0 ? localContractorTypes : undefined,
      statuses: localStatuses.length > 0 ? localStatuses : undefined,
    });
  }, [localContractorTypes, localStatuses, setFilters]);

  const handleResetFilters = useCallback(() => {
    setSearchInput('');
    setLocalContractorTypes([]);
    setLocalStatuses([]);
    resetFilters();
  }, [resetFilters]);

  const toggleContractorType = useCallback((type: ContractorType) => {
    setLocalContractorTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  }, []);

  const toggleStatus = useCallback((status: ContractorStatus) => {
    setLocalStatuses((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
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

  // ─── Loading skeleton ──────────────────────────────────────
  if (isLoading && contractors.length === 0) {
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
            <Skeleton className="h-6 w-28" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-6 w-20" />
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
            placeholder="Search contractors..."
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Contractor Type Multi-Select */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Contractor Type</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full justify-start text-left font-normal">
                    {localContractorTypes.length > 0 ? `${localContractorTypes.length} selected` : 'Select types'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 max-h-64 overflow-y-auto p-2" align="start">
                  {CONTRACTOR_TYPES.map((type) => (
                    <button key={type} className="flex items-center gap-2 w-full rounded-sm px-2 py-1.5 text-sm hover:bg-accent transition-colors" onClick={() => toggleContractorType(type)}>
                      {localContractorTypes.includes(type) ? <CheckSquare className="h-4 w-4 text-emerald-600" /> : <Square className="h-4 w-4 text-muted-foreground" />}
                      <Badge variant="outline" className="border-0 text-xs" style={{ backgroundColor: `${CONTRACTOR_TYPE_COLORS[type]}18`, color: CONTRACTOR_TYPE_COLORS[type] }}>
                        {CONTRACTOR_TYPE_LABELS[type]}
                      </Badge>
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
            </div>

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
                  {CONTRACTOR_STATUSES.map((status) => (
                    <button key={status} className="flex items-center gap-2 w-full rounded-sm px-2 py-1.5 text-sm hover:bg-accent transition-colors" onClick={() => toggleStatus(status)}>
                      {localStatuses.includes(status) ? <CheckSquare className="h-4 w-4 text-emerald-600" /> : <Square className="h-4 w-4 text-muted-foreground" />}
                      <Badge variant="outline" className="border-0 text-xs" style={{ backgroundColor: `${CONTRACTOR_STATUS_COLORS[status]}18`, color: CONTRACTOR_STATUS_COLORS[status] }}>
                        {CONTRACTOR_STATUS_LABELS[status]}
                      </Badge>
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <Button size="sm" onClick={applyFilters} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              Apply Filters
            </Button>
            <Button size="sm" variant="outline" onClick={handleResetFilters}>
              Reset All
            </Button>
          </div>
        </div>
      )}

      {/* Bulk Action Bar */}
      {selectedContractorIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 p-3 rounded-lg border bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800">
          <span className="text-sm font-medium">{selectedContractorIds.size} selected</span>
          {canDelete('contractors') && (
            <Button size="sm" variant="destructive" onClick={() => onBulkAction('delete')}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Selected
            </Button>
          )}
          {canEdit('contractors') && (
            <Button size="sm" variant="outline" onClick={() => onBulkAction('activate')}>
              <UserCheck className="mr-2 h-4 w-4" />
              Activate Selected
            </Button>
          )}
          {canEdit('contractors') && (
            <Button size="sm" variant="outline" onClick={() => onBulkAction('suspend')}>
              <Ban className="mr-2 h-4 w-4" />
              Suspend Selected
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
                <TableRow key={row.id} data-state={selectedContractorIds.has(row.original.id) ? 'selected' : undefined}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-64">
                  <EmptyState
                    icon={HardHat}
                    title="No contractors found"
                    description={searchInput || activeFilterCount > 0 ? 'Try adjusting your search or filters.' : 'Get started by adding your first contractor.'}
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
                {[10, 25, 50, 100].map((size) => (
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
      {isLoading && contractors.length > 0 && (
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
