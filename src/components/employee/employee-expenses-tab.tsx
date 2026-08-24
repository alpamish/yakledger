'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { LoadingSpinner } from '@/components/common/loading-spinner';
import { EmptyState } from '@/components/common/empty-state';
import { ApprovalStatusBadge } from '@/components/common/approval-status-badge';
import { expensesApi } from '@/services/api';
import { CATEGORY_LABELS, CATEGORY_COLORS } from '@/types/expense';
import type { Expense, Category } from '@/types/expense';
import {
  Receipt,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'AFN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function EmployeeExpensesTab({ employeeId }: { employeeId: string }) {
  const [rows, setRows] = useState<Expense[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchExpenses = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await expensesApi.getAll({
        paidToId: employeeId,
        page,
        pageSize,
        sortBy: 'expenseDate',
        sortOrder: 'desc',
      });
      if (res.success && res.data) {
        setRows(res.data.data);
        setTotal(res.data.total);
        setTotalPages(res.data.totalPages);
      } else {
        setError(res.error ?? 'Failed to load expenses');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load expenses');
    } finally {
      setIsLoading(false);
    }
  }, [employeeId, page, pageSize]);

  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

  const totalAmount = useMemo(
    () => rows.reduce((sum, e) => sum + e.amount, 0),
    [rows]
  );

  const startIndex = total > 0 ? (page - 1) * pageSize + 1 : 0;
  const endIndex = Math.min(page * pageSize, total);

  const pageNumbers = useMemo(() => {
    const pages: number[] = [];
    const current = page;
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
  }, [totalPages, page]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Receipt className="h-4 w-4" />
          <span>{total} expense{total !== 1 ? 's' : ''} paid to this employee</span>
          {total > 0 && (
            <span className="font-medium text-foreground">
              · Total: {formatCurrency(totalAmount)}
            </span>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {['Title', 'Category', 'Amount', 'Status', 'Paid By', 'Date'].map((h) => (
                    <TableHead key={h}>{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((__, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-24" /></TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : error ? (
        <div className="flex h-40 items-center justify-center">
          <EmptyState icon={Receipt} title="Failed to load expenses" description={error} />
        </div>
      ) : rows.length === 0 ? (
        <div className="flex h-40 items-center justify-center">
          <EmptyState
            icon={Receipt}
            title="No expenses"
            description="No expenses have been paid to this employee yet."
          />
        </div>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Paid By</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((exp) => (
                <TableRow key={exp.id}>
                  <TableCell>
                    <span className="font-medium max-w-[200px] truncate block">{exp.title}</span>
                  </TableCell>
                  <TableCell>
                    <Badge
                      className="text-white border-0 text-xs"
                      style={{ backgroundColor: CATEGORY_COLORS[exp.category as Category] }}
                    >
                      {CATEGORY_LABELS[exp.category as Category] ?? exp.category}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono tabular-nums">{formatCurrency(exp.amount)}</span>
                  </TableCell>
                  <TableCell>
                    <ApprovalStatusBadge status={exp.approvalStatus} />
                  </TableCell>
                  <TableCell>
                    <span className="max-w-[120px] truncate block">{exp.paidBy}</span>
                  </TableCell>
                  <TableCell>
                    {format(new Date(exp.expenseDate), 'MMM dd, yyyy')}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {!isLoading && !error && total > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-sm text-muted-foreground">
            Showing <span className="font-medium text-foreground">{startIndex}</span>{' '}
            to <span className="font-medium text-foreground">{endIndex}</span>{' '}
            of <span className="font-medium text-foreground">{total}</span>{' '}
            {total === 1 ? 'result' : 'results'}
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Rows:</span>
              <select
                value={pageSize}
                onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                className="h-8 rounded-md border bg-transparent px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {[10, 25, 50, 100].map((size) => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage(page - 1)} disabled={page <= 1}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {pageNumbers.map((p, idx) =>
                p === -1 ? (
                  <span key={`ellipsis-${idx}`} className="px-2 text-muted-foreground">...</span>
                ) : (
                  <Button
                    key={p}
                    variant={p === page ? 'default' : 'outline'}
                    size="icon"
                    className={`h-8 w-8 ${p === page ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}`}
                    onClick={() => setPage(p)}
                  >
                    {p}
                  </Button>
                )
              )}
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage(page + 1)} disabled={page >= totalPages}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}