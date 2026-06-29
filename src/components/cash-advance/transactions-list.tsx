'use client';

import * as React from 'react';
import { cashAdvanceApi } from '@/services/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Search, X, Filter, ChevronLeft, ChevronRight, Slash } from 'lucide-react';
import { useDebounce } from '@/hooks/use-debounce';
import type { CashTransaction, Transfer as TransferType } from '@/types/expense';

interface CombinedEntry {
  id: string;
  type: string;
  amount: number;
  createdAt: string;
  description: string;
}

export function TransactionsList() {
  const [transactions, setTransactions] = React.useState<CashTransaction[]>([]);
  const [transfers, setTransfers] = React.useState<TransferType[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const [searchInput, setSearchInput] = React.useState('');
  const debouncedSearch = useDebounce(searchInput, 300);

  const [typeFilter, setTypeFilter] = React.useState<string>('ALL');
  const [dateFrom, setDateFrom] = React.useState('');
  const [dateTo, setDateTo] = React.useState('');
  const [amountMin, setAmountMin] = React.useState('');
  const [amountMax, setAmountMax] = React.useState('');
  const [filtersOpen, setFiltersOpen] = React.useState(false);

  const [currentPage, setCurrentPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(15);

  React.useEffect(() => {
    loadAll();
  }, []);

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && document.activeElement !== searchInputRef.current) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  async function loadAll() {
    try {
      setLoading(true);
      setError(null);
      const [txnRes, trfRes] = await Promise.all([
        cashAdvanceApi.getTransactions(),
        cashAdvanceApi.getTransfers(),
      ]);
      if (txnRes.success && txnRes.data) {
        setTransactions(txnRes.data);
      }
      if (trfRes.success && trfRes.data) {
        setTransfers(trfRes.data);
      }
    } catch (err) {
      setError('Failed to load transactions');
    } finally {
      setLoading(false);
    }
  }

  const hasActiveFilters = typeFilter !== 'ALL' || dateFrom || dateTo || amountMin || amountMax;

  const activeFilterCount = React.useMemo(() => {
    let count = 0;
    if (typeFilter !== 'ALL') count++;
    if (dateFrom) count++;
    if (dateTo) count++;
    if (amountMin) count++;
    if (amountMax) count++;
    return count;
  }, [typeFilter, dateFrom, dateTo, amountMin, amountMax]);

  const allEntries = React.useMemo(() => {
    const cashEntries: CombinedEntry[] = transactions.map((t) => ({
      id: `txn-${t.id}`,
      type: t.type,
      amount: t.type === 'ADVANCE' ? t.amount : -t.amount,
      createdAt: t.createdAt,
      description: `${t.employee?.fullName ?? 'Unknown'}${t.note ? ` — ${t.note}` : ''}`,
    }));

    const transferEntries: CombinedEntry[] = transfers.map((t) => ({
      id: `trf-${t.id}`,
      type: 'TRANSFER',
      amount: t.amount,
      createdAt: t.createdAt,
      description: `${t.fromEmployee?.fullName ?? 'Unknown'} → ${t.toEmployee?.fullName ?? 'Unknown'}${t.note ? ` — ${t.note}` : ''}`,
    }));

    return [...cashEntries, ...transferEntries].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [transactions, transfers]);

  const filteredEntries = React.useMemo(() => {
    let entries = allEntries;

    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      entries = entries.filter((e) => e.description.toLowerCase().includes(q));
    }

    if (typeFilter !== 'ALL') {
      entries = entries.filter((e) => e.type === typeFilter);
    }

    if (dateFrom) {
      const from = new Date(dateFrom);
      from.setHours(0, 0, 0, 0);
      entries = entries.filter((e) => new Date(e.createdAt) >= from);
    }

    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      entries = entries.filter((e) => new Date(e.createdAt) <= to);
    }

    if (amountMin) {
      const min = parseFloat(amountMin);
      if (!isNaN(min)) {
        entries = entries.filter((e) => Math.abs(e.amount) >= min);
      }
    }

    if (amountMax) {
      const max = parseFloat(amountMax);
      if (!isNaN(max)) {
        entries = entries.filter((e) => Math.abs(e.amount) <= max);
      }
    }

    return entries;
  }, [allEntries, debouncedSearch, typeFilter, dateFrom, dateTo, amountMin, amountMax]);

  const totalFiltered = filteredEntries.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const paginatedEntries = filteredEntries.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  React.useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, typeFilter, dateFrom, dateTo, amountMin, amountMax, pageSize]);

  const startIndex = totalFiltered > 0 ? (currentPage - 1) * pageSize + 1 : 0;
  const endIndex = Math.min(currentPage * pageSize, totalFiltered);

  const pageNumbers = React.useMemo(() => {
    const pages: number[] = [];
    const total = totalPages;
    const current = currentPage;

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
  }, [totalPages, currentPage]);

  function getBadgeColor(type: string) {
    switch (type) {
      case 'ADVANCE': return { bg: '#f59e0b20', color: '#f59e0b' };
      case 'RETURN': return { bg: '#10b98120', color: '#10b981' };
      case 'ADJUSTMENT': return { bg: '#6366f120', color: '#6366f1' };
      case 'TRANSFER': return { bg: '#3b82f620', color: '#3b82f6' };
      default: return { bg: '#6b728020', color: '#6b7280' };
    }
  }

  function getLabel(type: string) {
    switch (type) {
      case 'ADVANCE': return 'Advance';
      case 'RETURN': return 'Return';
      case 'ADJUSTMENT': return 'Adjustment';
      case 'TRANSFER': return 'Transfer';
      default: return type;
    }
  }

  function resetFilters() {
    setTypeFilter('ALL');
    setDateFrom('');
    setDateTo('');
    setAmountMin('');
    setAmountMax('');
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">{error}</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>All Transactions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search & Filter Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
          <div className="relative flex-1 w-full sm:max-w-md group">
            <div className="absolute left-0 top-0 h-full flex items-center pointer-events-none pl-3">
              <Search className="h-4 w-4 text-muted-foreground" />
            </div>
            <Input
              ref={searchInputRef}
              placeholder="Search transactions..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9 pr-8 h-9"
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

            {(searchInput || hasActiveFilters) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { resetFilters(); setSearchInput(''); }}
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Type</label>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                >
                  <option value="ALL">All Types</option>
                  <option value="ADVANCE">Advance</option>
                  <option value="RETURN">Return</option>
                  <option value="ADJUSTMENT">Adjustment</option>
                  <option value="TRANSFER">Transfer</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Date Range</label>
                <div className="flex items-center gap-2">
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="text-sm"
                  />
                  <span className="text-muted-foreground text-xs">to</span>
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="text-sm"
                  />
                </div>
              </div>

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
                      value={amountMin}
                      onChange={(e) => setAmountMin(e.target.value)}
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
                      value={amountMax}
                      onChange={(e) => setAmountMax(e.target.value)}
                      className="pl-7 text-sm"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={resetFilters}
                className="text-muted-foreground"
              >
                Reset All
              </Button>
            </div>
          </div>
        )}

        {allEntries.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No cash transactions recorded yet.
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No transactions match the current filters.
          </div>
        ) : (
          <div className="space-y-2">
            {paginatedEntries.map((entry) => {
              const colors = getBadgeColor(entry.type);
              return (
                <div
                  key={entry.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Badge style={{ backgroundColor: colors.bg, color: colors.color }}>
                      {getLabel(entry.type)}
                    </Badge>
                    <span className="text-sm truncate">{entry.description}</span>
                  </div>
                  <div className="flex items-center gap-4 flex-shrink-0">
                    <span className={`text-sm font-semibold ${
                      entry.type === 'ADVANCE' ? 'text-amber-500' :
                      entry.type === 'TRANSFER' ? 'text-blue-500' : 'text-emerald-500'
                    }`}>
                      {entry.amount > 0 ? '+' : ''}{entry.amount.toLocaleString()} AFN
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(entry.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              );
            })}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
                <div className="text-sm text-muted-foreground">
                  Showing{' '}
                  <span className="font-medium text-foreground">{startIndex}</span>
                  {' '}to{' '}
                  <span className="font-medium text-foreground">{endIndex}</span>
                  {' '}of{' '}
                  <span className="font-medium text-foreground">{totalFiltered}</span>{' '}
                  entries
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Rows:</span>
                    <select
                      value={pageSize}
                      onChange={(e) => setPageSize(Number(e.target.value))}
                      className="h-8 rounded-md border bg-transparent px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      {[15, 30, 50, 100].map((size) => (
                        <option key={size} value={size}>{size}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setCurrentPage((p) => p - 1)}
                      disabled={currentPage <= 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      <span className="sr-only">Previous page</span>
                    </Button>

                    {pageNumbers.map((page, idx) =>
                      page === -1 ? (
                        <span key={`ellipsis-${idx}`} className="px-2 text-muted-foreground">...</span>
                      ) : (
                        <Button
                          key={page}
                          variant={page === currentPage ? 'default' : 'outline'}
                          size="icon"
                          className={`h-8 w-8 ${
                            page === currentPage ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''
                          }`}
                          onClick={() => setCurrentPage(page)}
                        >
                          {page}
                        </Button>
                      )
                    )}

                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setCurrentPage((p) => p + 1)}
                      disabled={currentPage >= totalPages}
                    >
                      <ChevronRight className="h-4 w-4" />
                      <span className="sr-only">Next page</span>
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
