'use client';

import * as React from 'react';
import { cashAdvanceApi, employeesApi } from '@/services/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Check, ChevronsUpDown } from 'lucide-react';
import type { LedgerEntry, EmployeeListItem } from '@/types/expense';
import { CASH_TRANSACTION_TYPE_LABELS, CASH_TXN_TYPE_COLORS } from '@/types/expense';

export function LedgerView() {
  const [employees, setEmployees] = React.useState<EmployeeListItem[]>([]);
  const [loadingEmployees, setLoadingEmployees] = React.useState(true);
  const [employeeId, setEmployeeId] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const [ledger, setLedger] = React.useState<LedgerEntry[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [balance, setBalance] = React.useState(0);
  const [typeFilter, setTypeFilter] = React.useState<string>('ALL');
  const [dateFrom, setDateFrom] = React.useState('');
  const [dateTo, setDateTo] = React.useState('');
  const [currentPage, setCurrentPage] = React.useState(1);
  const pageSize = 10;

  React.useEffect(() => {
    employeesApi.list()
      .then((res) => { if (res.data) setEmployees(res.data.filter((e) => e.department !== 'LABOR' && e.department !== 'SECURITY')); })
      .catch(() => {})
      .finally(() => setLoadingEmployees(false));
  }, []);

  React.useEffect(() => {
    if (employeeId) {
      loadLedger();
    } else {
      setLedger([]);
      setBalance(0);
    }
  }, [employeeId]);

  const filteredLedger = React.useMemo(() => {
    let entries = ledger;
    if (typeFilter !== 'ALL') {
      entries = entries.filter(e => e.type === typeFilter);
    }
    if (dateFrom) {
      const from = new Date(dateFrom);
      from.setHours(0, 0, 0, 0);
      entries = entries.filter(e => new Date(e.date) >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      entries = entries.filter(e => new Date(e.date) <= to);
    }
    return entries;
  }, [ledger, typeFilter, dateFrom, dateTo]);

  const totalFiltered = filteredLedger.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const paginatedEntries = filteredLedger.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  React.useEffect(() => {
    setCurrentPage(1);
  }, [typeFilter, dateFrom, dateTo]);

  async function loadLedger() {
    try {
      setLoading(true);
      setError(null);
      const res = await cashAdvanceApi.getEmployeeWallet(employeeId);
      if (res.success && res.data) {
        setLedger(res.data.ledger);
        setBalance(res.data.account?.currentBalance ?? 0);
      }
    } catch (err) {
      setError('Failed to load ledger');
    } finally {
      setLoading(false);
    }
  }

  function getEntryLabel(type: string) {
    switch (type) {
      case 'ADVANCE': return 'Advance';
      case 'RETURN': return 'Return';
      case 'ADJUSTMENT': return 'Adjustment';
      case 'EXPENSE': return 'Expense';
      default: return type;
    }
  }

  function getEntryColor(type: string) {
    switch (type) {
      case 'ADVANCE': return 'text-amber-500';
      case 'RETURN': return 'text-emerald-500';
      case 'ADJUSTMENT': return 'text-indigo-500';
      case 'EXPENSE': return 'text-red-500';
      default: return '';
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Employee Ledger</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="w-full max-w-xs">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={open}
                className="w-full justify-between"
                disabled={loadingEmployees}
              >
                {employeeId
                  ? employees.find((emp) => emp.id === employeeId)?.fullName
                  : 'Select employee...'}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
              <Command>
                <CommandInput placeholder="Search employee..." />
                <CommandList>
                  <CommandEmpty>No employee found.</CommandEmpty>
                  <CommandGroup>
                    {employees.map((emp) => (
                      <CommandItem
                        key={emp.id}
                        value={emp.fullName}
                        onSelect={() => {
                          setEmployeeId(emp.id === employeeId ? '' : emp.id);
                          setOpen(false);
                        }}
                      >
                        <Check
                          className={cn(
                            'mr-2 h-4 w-4',
                            employeeId === emp.id ? 'opacity-100' : 'opacity-0'
                          )}
                        />
                        {emp.fullName}
                        <span className="ml-auto text-xs text-muted-foreground">{emp.jobTitle}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="py-4 text-center text-sm text-red-500">{error}</div>
        )}

        {!loading && !error && employeeId && ledger.length === 0 && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No transactions found for this employee.
          </div>
        )}

        {!loading && !error && employeeId && ledger.length > 0 && (
          <>
            <div className="flex flex-wrap gap-2 items-center">
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
              >
                <option value="ALL">All Types</option>
                <option value="ADVANCE">Advance</option>
                <option value="RETURN">Return</option>
                <option value="ADJUSTMENT">Adjustment</option>
                <option value="EXPENSE">Expense</option>
                <option value="TRANSFER">Transfer</option>
              </select>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                placeholder="From date"
              />
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                placeholder="To date"
              />
              {(typeFilter !== 'ALL' || dateFrom || dateTo) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setTypeFilter('ALL'); setDateFrom(''); setDateTo(''); }}
                >
                  Clear
                </Button>
              )}
            </div>

            {totalFiltered === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No transactions match the current filters.
              </div>
            ) : (
              <div className="space-y-1">
                {paginatedEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">
                        {getEntryLabel(entry.type)}
                      </Badge>
                      <span>{entry.description}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className={`font-medium ${getEntryColor(entry.type)}`}>
                        {entry.amount > 0 ? '+' : ''}{entry.amount.toLocaleString()} AFN
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(entry.date).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))}

                {totalPages > 1 && (
                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xs text-muted-foreground">
                      Showing {(currentPage - 1) * pageSize + 1}-{Math.min(currentPage * pageSize, totalFiltered)} of {totalFiltered} entries
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={currentPage <= 1}
                        onClick={() => setCurrentPage((p) => p - 1)}
                      >
                        Previous
                      </Button>
                      <span className="text-xs text-muted-foreground">
                        Page {currentPage} of {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={currentPage >= totalPages}
                        onClick={() => setCurrentPage((p) => p + 1)}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between border-t pt-2 mt-2 font-semibold">
                  <span>Balance</span>
                  <span className={balance >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                    {balance.toLocaleString()} AFN
                  </span>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
