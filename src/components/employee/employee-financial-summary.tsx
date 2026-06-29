'use client';

import * as React from 'react';
import { pdf } from '@react-pdf/renderer';
import { format } from 'date-fns';
import { employeesApi } from '@/services/employee-api';
import {
  DEPARTMENT_LABELS,
  DEPARTMENT_COLORS,
} from '@/types/employee';
import type {
  EmployeeFinancialSummaryItem,
  EmployeeFinancialTotals,
} from '@/types/employee';
import type { Department } from '@/types/employee';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/common/loading-spinner';
import { EmptyState } from '@/components/common/empty-state';
import {
  Calculator,
  Users,
  Eye,
  Download,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'AFN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

interface EmployeeFinancialSummaryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeIds: string[];
  onViewProfile?: (id: string) => void;
}

export function EmployeeFinancialSummary({
  open,
  onOpenChange,
  employeeIds,
  onViewProfile,
}: EmployeeFinancialSummaryProps) {
  const [employees, setEmployees] = React.useState<EmployeeFinancialSummaryItem[]>([]);
  const [totals, setTotals] = React.useState<EmployeeFinancialTotals | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isPdfGenerating, setIsPdfGenerating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open || employeeIds.length === 0) return;

    setIsLoading(true);
    setError(null);

    employeesApi
      .financialSummary(employeeIds)
      .then((res) => {
        if (res.success && res.data) {
          setEmployees(res.data.employees);
          setTotals(res.data.totals);
        } else {
          setError('Failed to load financial summary');
        }
      })
      .catch((err) => {
        setError(err.message ?? 'Failed to load financial summary');
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [open, employeeIds]);

  const handleDownloadPDF = React.useCallback(async () => {
    if (!totals || employees.length === 0) return;
    setIsPdfGenerating(true);
    try {
      const { FinancialSummaryPDFDocument } = await import(
        '@/components/pdf/financial-summary-pdf-document'
      );

      const blob = await pdf(
        <FinancialSummaryPDFDocument employees={employees} totals={totals} />
      ).toBlob();

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `financial-summary-${format(new Date(), 'yyyy-MM-dd')}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success('Financial summary PDF downloaded successfully');
    } catch (err) {
      console.error('PDF generation failed:', err);
      toast.error('Failed to generate financial summary PDF');
    } finally {
      setIsPdfGenerating(false);
    }
  }, [employees, totals]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Calculator className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            Financial Summary
          </DialogTitle>
          <DialogDescription>
            Financial overview for {employeeIds.length} selected employee{employeeIds.length > 1 ? 's' : ''}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <LoadingSpinner size="lg" text="Loading financial data..." />
          </div>
        ) : error ? (
          <div className="flex h-64 items-center justify-center">
            <EmptyState
              icon={Calculator}
              title="Failed to load data"
              description={error}
            />
          </div>
        ) : employees.length === 0 ? (
          <div className="flex h-64 items-center justify-center">
            <EmptyState
              icon={Users}
              title="No data"
              description="No financial data available for selected employees."
            />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Totals Bar */}
            {totals && (
              <div className="grid grid-cols-4 gap-3">
                <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-3">
                  <p className="text-xs text-emerald-700 dark:text-emerald-400 mb-1">Total Salary</p>
                  <p className="text-lg font-bold font-mono text-emerald-700 dark:text-emerald-400">
                    {formatCurrency(totals.totalSalary)}
                  </p>
                </div>
                <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3">
                  <p className="text-xs text-blue-700 dark:text-blue-400 mb-1">Total Taken</p>
                  <p className="text-lg font-bold font-mono text-blue-700 dark:text-blue-400">
                    {formatCurrency(totals.totalExpensesPaidTo)}
                  </p>
                </div>
                <div className="rounded-lg bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 p-3">
                  <p className="text-xs text-orange-700 dark:text-orange-400 mb-1">Total Spent</p>
                  <p className="text-lg font-bold font-mono text-orange-700 dark:text-orange-400">
                    {formatCurrency(totals.totalExpensesPaidBy)}
                  </p>
                </div>
                <div className={`rounded-lg border p-3 ${
                  totals.totalNetBalance > 0
                    ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800'
                    : 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800'
                }`}>
                  <p className="text-xs mb-1">Net Balance</p>
                  <p className={`text-lg font-bold font-mono ${
                    totals.totalNetBalance > 0
                      ? 'text-red-700 dark:text-red-400'
                      : 'text-emerald-700 dark:text-emerald-400'
                  }`}>
                    {formatCurrency(Math.abs(totals.totalNetBalance))}
                    <span className="text-xs ml-1">{totals.totalNetBalance > 0 ? '(Owes)' : '(Owed)'}</span>
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-2">
                {employees.map((emp) => {
                  const isOwing = emp.netBalance > 0;
                  return (
                    <div
                      key={emp.id}
                      className="rounded-lg border p-3 transition-colors hover:bg-muted/30"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600/10 text-emerald-700 dark:text-emerald-400 text-xs font-semibold">
                            {emp.fullName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-sm truncate">{emp.fullName}</p>
                              {onViewProfile && (
                                <button
                                  type="button"
                                  onClick={() => onViewProfile(emp.id)}
                                  className="text-muted-foreground hover:text-foreground transition-colors"
                                  title="View profile"
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground truncate">{emp.jobTitle}</p>
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className="border-0 text-[10px] shrink-0"
                          style={{
                            backgroundColor: `${DEPARTMENT_COLORS[emp.department as Department] ?? '#78716c'}18`,
                            color: DEPARTMENT_COLORS[emp.department as Department] ?? '#78716c',
                          }}
                        >
                          {DEPARTMENT_LABELS[emp.department as Department] ?? emp.department}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-5 gap-2 text-xs">
                        <div>
                          <span className="text-muted-foreground">Salary</span>
                          <p className="font-mono font-medium">{formatCurrency(emp.salary)}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Days</span>
                          <p className="font-mono font-medium">{emp.daysWorked}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Earned</span>
                          <p className="font-mono font-medium">{formatCurrency(emp.earnedSalary)}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Taken</span>
                          <p className="font-mono font-medium">{formatCurrency(emp.totalExpensesPaidTo)}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Spent</span>
                          <p className="font-mono font-medium">{formatCurrency(emp.totalExpensesPaidBy)}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Advances</span>
                          <p className="font-mono font-medium">{formatCurrency(emp.totalAdvanceReceived)}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Wallet</span>
                          <p className="font-mono font-medium">{formatCurrency(emp.walletBalance)}</p>
                        </div>
                        <div className="col-span-2">
                          <span className="text-muted-foreground">Net Balance</span>
                          <p className={`font-mono font-medium ${isOwing ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                            {formatCurrency(Math.abs(emp.netBalance))}
                            <span className="text-[10px] ml-1">{isOwing ? '(Owes)' : '(Owed)'}</span>
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
          </div>
        )}

        {!isLoading && !error && employees.length > 0 && (
          <DialogFooter className="border-t pt-4">
            <Button
              onClick={handleDownloadPDF}
              disabled={isPdfGenerating}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {isPdfGenerating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              {isPdfGenerating ? 'Generating PDF...' : 'Download PDF'}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
