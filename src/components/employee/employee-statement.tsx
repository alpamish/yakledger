'use client';

import * as React from 'react';
import { format } from 'date-fns';
import { employeesApi } from '@/services/employee-api';
import {
  STATEMENT_CATEGORY_LABELS,
  type EmployeeStatement,
  type StatementEntry,
} from '@/types/statement';
import { formatMinor } from '@/lib/money';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadingSpinner } from '@/components/common/loading-spinner';
import { EmptyState } from '@/components/common/empty-state';
import { ArrowDownLeft, ArrowUpRight, Scale, Wallet } from 'lucide-react';

interface EmployeeStatementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: { id: string; fullName: string } | null;
}

export function EmployeeStatementDialog({
  open,
  onOpenChange,
  employee,
}: EmployeeStatementDialogProps) {
  const [statement, setStatement] = React.useState<EmployeeStatement | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [dateFrom, setDateFrom] = React.useState('');
  const [dateTo, setDateTo] = React.useState('');

  const load = React.useCallback(async () => {
    if (!employee) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await employeesApi.getStatement(employee.id, {
        from: dateFrom || undefined,
        to: dateTo || undefined,
      });
      if (res.success && res.data) {
        setStatement(res.data);
      } else {
        setError(res.error ?? 'Failed to load statement');
      }
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load statement');
    } finally {
      setIsLoading(false);
    }
  }, [employee, dateFrom, dateTo]);

  React.useEffect(() => {
    if (open && employee) {
      load();
    }
    if (!open) {
      setStatement(null);
      setError(null);
      setDateFrom('');
      setDateTo('');
    }
  }, [open, employee, load]);

  const entries = statement?.entries ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-emerald-600" />
            Financial Statement — {employee?.fullName}
          </DialogTitle>
          <DialogDescription>
            All salary, payment, advance, deduction, transfer, reimbursement
            and correction activity with debit/credit totals (Plan-payroll.pdf
            §2 action 10). Debit increases what the employee owes the company;
            credit reduces it.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">From</label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">To</label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-40"
            />
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={isLoading}>
            Apply
          </Button>
          {(dateFrom || dateTo) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setDateFrom('');
                setDateTo('');
              }}
            >
              Clear
            </Button>
          )}
        </div>

        {isLoading && (
          <div className="flex justify-center py-10">
            <LoadingSpinner />
          </div>
        )}

        {!isLoading && error && (
          <EmptyState
            icon={Scale}
            title="Could not load statement"
            description={error}
          />
        )}

        {!isLoading && !error && statement && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <TotalsCard
                label="Debit total"
                value={statement.totals.debitMinor}
                icon={<ArrowDownLeft className="h-4 w-4 text-rose-600" />}
              />
              <TotalsCard
                label="Credit total"
                value={statement.totals.creditMinor}
                icon={<ArrowUpRight className="h-4 w-4 text-emerald-600" />}
              />
              <TotalsCard
                label="Net (period)"
                value={statement.totals.netMinor}
                icon={<Scale className="h-4 w-4 text-sky-600" />}
              />
              <TotalsCard
                label="Net balance"
                value={statement.balance.closingMinor}
                icon={<Wallet className="h-4 w-4 text-amber-600" />}
                hint="Positive = employee owes the company"
              />
            </div>

            <p className="text-xs text-muted-foreground">
              Opening balance {formatMinor(statement.balance.openingMinor)} →
              closing balance {formatMinor(statement.balance.closingMinor)}
              {statement.dateFrom || statement.dateTo
                ? ` for the selected period`
                : ` (all time)`}
            </p>

            {entries.length === 0 ? (
              <EmptyState
                icon={Wallet}
                title="No activity"
                description="No financial activity for this employee in the selected period."
              />
            ) : (
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left">
                    <tr>
                      <th className="px-3 py-2 font-medium">Date</th>
                      <th className="px-3 py-2 font-medium">Category</th>
                      <th className="px-3 py-2 font-medium">Description</th>
                      <th className="px-3 py-2 font-medium text-right">Debit</th>
                      <th className="px-3 py-2 font-medium text-right">Credit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e) => (
                      <StatementRow key={`${e.id}-${e.direction}`} entry={e} />
                    ))}
                  </tbody>
                  <tfoot className="bg-muted/40 font-medium">
                    <tr>
                      <td colSpan={3} className="px-3 py-2 text-right">
                        Totals
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {formatMinor(statement.totals.debitMinor)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {formatMinor(statement.totals.creditMinor)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TotalsCard({
  label,
  value,
  icon,
  hint,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border p-3 space-y-1">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="font-mono tabular-nums text-sm font-semibold">
        {formatMinor(value)}
      </div>
      {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function StatementRow({ entry }: { entry: StatementEntry }) {
  const isDebit = entry.direction === 'DEBIT';
  return (
    <tr className={entry.memo ? 'opacity-60' : undefined}>
      <td className="px-3 py-1.5 whitespace-nowrap text-muted-foreground">
        {format(new Date(entry.date), 'MMM dd, yyyy')}
      </td>
      <td className="px-3 py-1.5 whitespace-nowrap">
        <Badge variant="outline" className="text-[10px]">
          {STATEMENT_CATEGORY_LABELS[entry.category]}
        </Badge>
        {entry.memo && (
          <Badge variant="secondary" className="ml-1 text-[10px]">
            pending
          </Badge>
        )}
      </td>
      <td className="px-3 py-1.5">{entry.description}</td>
      <td className="px-3 py-1.5 text-right font-mono tabular-nums text-rose-700 dark:text-rose-400">
        {isDebit ? formatMinor(entry.amountMinor) : ''}
      </td>
      <td className="px-3 py-1.5 text-right font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
        {!isDebit ? formatMinor(entry.amountMinor) : ''}
      </td>
    </tr>
  );
}
