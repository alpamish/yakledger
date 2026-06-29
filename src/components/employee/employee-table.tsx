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
import { useEmployeeStore } from '@/hooks/use-employee-store';
import { useDebounce } from '@/hooks/use-debounce';
import { usePermissions } from '@/hooks/use-permissions';
import {
  DEPARTMENTS,
  EMPLOYMENT_TYPES,
  EMPLOYEE_STATUSES,
  DEPARTMENT_LABELS,
  EMPLOYMENT_TYPE_LABELS,
  EMPLOYEE_STATUS_LABELS,
  DEPARTMENT_COLORS,
  EMPLOYEE_STATUS_COLORS,
  SEARCH_FIELDS,
  SEARCH_FIELD_LABELS,
} from '@/types/employee';
import type { Employee, Department, EmploymentType, EmployeeStatus, SearchField } from '@/types/employee';
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
  Users,
  Eye,
  CheckSquare,
  Square,
  UserCheck,
  UserX,
  Calculator,
} from 'lucide-react';

function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase()
          ? <mark key={i} className="rounded-sm bg-yellow-200 dark:bg-yellow-800/60 px-0.5">{part}</mark>
          : part
      )}
    </>
  );
}

interface EmployeeTableProps {
  onEdit: (employee: Employee) => void;
  onDelete: (employee: Employee) => void;
  onViewProfile: (employee: Employee) => void;
  onBulkAction: (action: "delete" | "activate" | "deactivate") => void;
  onFinancialSummary?: () => void;
}

export function EmployeeTable({
  onEdit,
  onDelete,
  onViewProfile,
  onBulkAction,
  onFinancialSummary,
}: EmployeeTableProps) {
  const { canEdit, canDelete } = usePermissions();
  const employees = useEmployeeStore((s) => s.employees);
  const selectedEmployeeIds = useEmployeeStore((s) => s.selectedEmployeeIds);
  const filters = useEmployeeStore((s) => s.filters);
  const pagination = useEmployeeStore((s) => s.pagination);
  const sorting = useEmployeeStore((s) => s.sorting);
  const isLoading = useEmployeeStore((s) => s.isLoading);
  const fetchEmployees = useEmployeeStore((s) => s.fetchEmployees);
  const toggleSelectEmployee = useEmployeeStore((s) => s.toggleSelectEmployee);
  const selectAllEmployees = useEmployeeStore((s) => s.selectAllEmployees);
  const clearSelection = useEmployeeStore((s) => s.clearSelection);
  const setFilters = useEmployeeStore((s) => s.setFilters);
  const resetFilters = useEmployeeStore((s) => s.resetFilters);
  const setPage = useEmployeeStore((s) => s.setPage);
  const setPageSize = useEmployeeStore((s) => s.setPageSize);
  const setSorting = useEmployeeStore((s) => s.setSorting);

  const [searchInput, setSearchInput] = useState(filters.search ?? '');
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Local filter state
  const [localDepartments, setLocalDepartments] = useState<Department[]>(
    filters.departments ?? []
  );
  const [localStatuses, setLocalStatuses] = useState<EmployeeStatus[]>(
    filters.statuses ?? []
  );
  const [localEmploymentTypes, setLocalEmploymentTypes] = useState<EmploymentType[]>(
    filters.employmentTypes ?? []
  );

  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchField, setSearchField] = useState<SearchField>(filters.searchField ?? 'all');

  const debouncedSearch = useDebounce(searchInput, 300);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setFilters({ search: debouncedSearch || undefined, searchField });
  }, [debouncedSearch, searchField, setFilters]);

  useEffect(() => {
    fetchEmployees();
  }, [filters, pagination.page, pagination.pageSize, sorting, fetchEmployees]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.departments && filters.departments.length > 0) count++;
    if (filters.statuses && filters.statuses.length > 0) count++;
    if (filters.employmentTypes && filters.employmentTypes.length > 0) count++;
    return count;
  }, [filters]);

  const [sortingState, setSortingState] = useState<SortingState>([
    { id: sorting.sortBy, desc: sorting.sortOrder === 'desc' },
  ]);

  const columns = useMemo<ColumnDef<Employee>[]>(
    () => [
      {
        id: 'select',
        header: ({ table }) => (
          <Checkbox
            checked={
              employees.length > 0 &&
              employees.every((e) => selectedEmployeeIds.has(e.id))
            }
            onCheckedChange={(checked) => {
              if (checked) selectAllEmployees();
              else clearSelection();
            }}
            aria-label="Select all"
          />
        ),
        cell: ({ row }) => (
          <div onClick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={selectedEmployeeIds.has(row.original.id)}
              onCheckedChange={() => toggleSelectEmployee(row.original.id)}
              aria-label={`Select ${row.original.fullName}`}
            />
          </div>
        ),
        enableSorting: false,
        size: 40,
      },
      {
        accessorKey: 'fullName',
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
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600/10 text-emerald-700 dark:text-emerald-400 text-xs font-semibold">
              {row.original.fullName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)}
            </div>
            <div className="min-w-0">
              <p className="font-medium text-sm truncate max-w-[160px]">
                <HighlightMatch text={row.original.fullName} query={searchInput} />
              </p>
              <p className="text-xs text-muted-foreground truncate">
                <HighlightMatch text={row.original.jobTitle} query={searchInput} />
              </p>
            </div>
          </div>
        ),
      },
      {
        accessorKey: 'department',
        header: ({ column }) => {
          const sorted = column.getIsSorted();
          return (
            <Button variant="ghost" size="sm" className="-ml-3 h-8" onClick={() => column.toggleSorting(sorted === 'asc')}>
              Department
              {sorted === 'asc' ? <ArrowUp className="ml-1 h-4 w-4" /> : sorted === 'desc' ? <ArrowDown className="ml-1 h-4 w-4" /> : <ArrowUpDown className="ml-1 h-4 w-4 opacity-50" />}
            </Button>
          );
        },
        cell: ({ getValue }) => {
          const dept = getValue() as Department;
          return (
            <Badge
              variant="outline"
              className="border-0 text-xs"
              style={{
                backgroundColor: `${DEPARTMENT_COLORS[dept] ?? '#78716c'}18`,
                color: DEPARTMENT_COLORS[dept] ?? '#78716c',
              }}
            >
              {DEPARTMENT_LABELS[dept] ?? dept}
            </Badge>
          );
        },
      },
      {
        accessorKey: 'employmentType',
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
          const type = getValue() as EmploymentType;
          return <span className="text-sm">{EMPLOYMENT_TYPE_LABELS[type] ?? type}</span>;
        },
      },
      {
        accessorKey: 'salary',
        header: ({ column }) => {
          const sorted = column.getIsSorted();
          return (
            <Button variant="ghost" size="sm" className="-ml-3 h-8" onClick={() => column.toggleSorting(sorted === 'asc')}>
              Salary
              {sorted === 'asc' ? <ArrowUp className="ml-1 h-4 w-4" /> : sorted === 'desc' ? <ArrowDown className="ml-1 h-4 w-4" /> : <ArrowUpDown className="ml-1 h-4 w-4 opacity-50" />}
            </Button>
          );
        },
        cell: ({ getValue }) => {
          const salary = getValue() as number;
          return (
            <span className="font-mono tabular-nums text-sm">
              Afs {salary.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </span>
          );
        },
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
          const status = getValue() as EmployeeStatus;
          return (
            <Badge
              variant="outline"
              className="border-0 text-xs"
              style={{
                backgroundColor: `${EMPLOYEE_STATUS_COLORS[status] ?? '#78716c'}18`,
                color: EMPLOYEE_STATUS_COLORS[status] ?? '#78716c',
              }}
            >
              {EMPLOYEE_STATUS_LABELS[status] ?? status}
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
        accessorKey: 'hireDate',
        header: ({ column }) => {
          const sorted = column.getIsSorted();
          return (
            <Button variant="ghost" size="sm" className="-ml-3 h-8" onClick={() => column.toggleSorting(sorted === 'asc')}>
              Hire Date
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
        id: 'actions',
        cell: ({ row }) => (
          <div onClick={(e) => e.stopPropagation()}>
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
              {canEdit('employees') && (
                <DropdownMenuItem onClick={() => onEdit(row.original)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
              )}
              {canDelete('employees') && (
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
          </div>
        ),
        enableSorting: false,
        size: 50,
      },
    ],
    [employees, selectedEmployeeIds, toggleSelectEmployee, selectAllEmployees, clearSelection, onEdit, onDelete, onViewProfile, canEdit, canDelete]
  );

  const table = useReactTable({
    data: employees,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: (updater) => {
      const newSorting = typeof updater === 'function' ? updater(sortingState) : updater;
      setSortingState(newSorting);
      if (newSorting.length > 0) {
        setSorting(newSorting[0].id, newSorting[0].desc ? 'desc' : 'asc');
      }
    },
    state: { sorting: sortingState },
    manualSorting: true,
    manualPagination: true,
    pageCount: pagination.totalPages,
  });

  const applyFilters = useCallback(() => {
    setFilters({
      departments: localDepartments.length > 0 ? localDepartments : undefined,
      statuses: localStatuses.length > 0 ? localStatuses : undefined,
      employmentTypes: localEmploymentTypes.length > 0 ? localEmploymentTypes : undefined,
    });
  }, [localDepartments, localStatuses, localEmploymentTypes, setFilters]);

  const handleResetFilters = useCallback(() => {
    setSearchInput('');
    setSearchField('all');
    setLocalDepartments([]);
    setLocalStatuses([]);
    setLocalEmploymentTypes([]);
    resetFilters();
  }, [resetFilters]);

  const toggleDepartment = useCallback((dept: Department) => {
    setLocalDepartments((prev) =>
      prev.includes(dept) ? prev.filter((d) => d !== dept) : [...prev, dept]
    );
  }, []);

  const toggleStatus = useCallback((status: EmployeeStatus) => {
    setLocalStatuses((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
    );
  }, []);

  const toggleEmploymentType = useCallback((type: EmploymentType) => {
    setLocalEmploymentTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
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

  if (isLoading && employees.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-9 w-24" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-4 w-20" />
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
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="flex flex-1 w-full sm:max-w-md gap-0">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search employees... (press / to focus)"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setSearchInput('')}
              className="pl-9 rounded-r-none"
              ref={searchInputRef}
            />
            {searchInput && (
              <button onClick={() => setSearchInput('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <select
            value={searchField}
            onChange={(e) => setSearchField(e.target.value as SearchField)}
            className="h-9 rounded-md rounded-l-none border border-l-0 bg-muted/30 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
          >
            {SEARCH_FIELDS.map((field) => (
              <option key={field} value={field}>{SEARCH_FIELD_LABELS[field]}</option>
            ))}
          </select>
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Department Multi-Select */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Department</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full justify-start text-left font-normal">
                    {localDepartments.length > 0 ? `${localDepartments.length} selected` : 'Select departments'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 max-h-64 overflow-y-auto p-2" align="start">
                  {DEPARTMENTS.map((dept) => (
                    <button key={dept} className="flex items-center gap-2 w-full rounded-sm px-2 py-1.5 text-sm hover:bg-accent transition-colors" onClick={() => toggleDepartment(dept)}>
                      {localDepartments.includes(dept) ? <CheckSquare className="h-4 w-4 text-emerald-600" /> : <Square className="h-4 w-4 text-muted-foreground" />}
                      <Badge variant="outline" className="border-0 text-xs" style={{ backgroundColor: `${DEPARTMENT_COLORS[dept]}18`, color: DEPARTMENT_COLORS[dept] }}>
                        {DEPARTMENT_LABELS[dept]}
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
                  {EMPLOYEE_STATUSES.map((status) => (
                    <button key={status} className="flex items-center gap-2 w-full rounded-sm px-2 py-1.5 text-sm hover:bg-accent transition-colors" onClick={() => toggleStatus(status)}>
                      {localStatuses.includes(status) ? <CheckSquare className="h-4 w-4 text-emerald-600" /> : <Square className="h-4 w-4 text-muted-foreground" />}
                      <Badge variant="outline" className="border-0 text-xs" style={{ backgroundColor: `${EMPLOYEE_STATUS_COLORS[status]}18`, color: EMPLOYEE_STATUS_COLORS[status] }}>
                        {EMPLOYEE_STATUS_LABELS[status]}
                      </Badge>
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
            </div>

            {/* Employment Type Multi-Select */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Employment Type</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full justify-start text-left font-normal">
                    {localEmploymentTypes.length > 0 ? `${localEmploymentTypes.length} selected` : 'Select types'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 max-h-48 overflow-y-auto p-2" align="start">
                  {EMPLOYMENT_TYPES.map((type) => (
                    <button key={type} className="flex items-center gap-2 w-full rounded-sm px-2 py-1.5 text-sm hover:bg-accent transition-colors" onClick={() => toggleEmploymentType(type)}>
                      {localEmploymentTypes.includes(type) ? <CheckSquare className="h-4 w-4 text-emerald-600" /> : <Square className="h-4 w-4 text-muted-foreground" />}
                      {EMPLOYMENT_TYPE_LABELS[type]}
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
      {selectedEmployeeIds.size > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-lg border bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800">
          <span className="text-sm font-medium">{selectedEmployeeIds.size} selected</span>
          <Button size="sm" variant="outline" onClick={() => onBulkAction('activate')}>
            <UserCheck className="mr-2 h-4 w-4" />
            Activate
          </Button>
          <Button size="sm" variant="outline" onClick={() => onBulkAction('deactivate')}>
            <UserX className="mr-2 h-4 w-4" />
            Deactivate
          </Button>
          {canDelete('employees') && (
            <Button size="sm" variant="destructive" onClick={() => onBulkAction('delete')}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          )}
          {onFinancialSummary && (
            <Button size="sm" variant="outline" onClick={onFinancialSummary}>
              <Calculator className="mr-2 h-4 w-4" />
              Financial Summary
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
                <TableRow
                  key={row.id}
                  data-state={selectedEmployeeIds.has(row.original.id) ? 'selected' : undefined}
                  onClick={() => onViewProfile(row.original)}
                  className="cursor-pointer"
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-64">
                  <EmptyState
                    icon={Users}
                    title="No employees found"
                    description={searchInput
                      ? `No employees match "${searchInput}" in ${SEARCH_FIELD_LABELS[searchField].toLowerCase()}.`
                      : activeFilterCount > 0
                        ? 'Try adjusting your filters.'
                        : 'Get started by adding your first employee.'}
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
            Showing <span className="font-medium text-foreground">{startIndex}</span>{' '}
            to <span className="font-medium text-foreground">{endIndex}</span>{' '}
            of <span className="font-medium text-foreground">{pagination.total}</span>{' '}
            {pagination.total === 1 ? 'result' : 'results'}
            {filters.search && (
              <> for "<span className="font-medium text-foreground">{filters.search}</span>"</>
            )}
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Rows:</span>
              <select value={pagination.pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="h-8 rounded-md border bg-transparent px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                {[10, 25, 50, 100].map((size) => (<option key={size} value={size}>{size}</option>))}
              </select>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage(pagination.page - 1)} disabled={pagination.page <= 1}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {pageNumbers.map((page, idx) =>
                page === -1 ? (
                  <span key={`ellipsis-${idx}`} className="px-2 text-muted-foreground">...</span>
                ) : (
                  <Button key={page} variant={page === pagination.page ? 'default' : 'outline'} size="icon" className={`h-8 w-8 ${page === pagination.page ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}`} onClick={() => setPage(page)}>
                    {page}
                  </Button>
                )
              )}
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage(pagination.page + 1)} disabled={pagination.page >= pagination.totalPages}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {isLoading && employees.length > 0 && (
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
