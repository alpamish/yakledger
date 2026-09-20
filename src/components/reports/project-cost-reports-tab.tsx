'use client';

import { useState, useCallback, useEffect } from 'react';
import { pdf } from '@react-pdf/renderer';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Calculator, Fuel, Truck, Users, Receipt, FileDown, Loader2 } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/common/loading-spinner';
import { EmptyState } from '@/components/common/empty-state';
import ProjectCostSummaryPDFDocument, {
  type ProjectCostSummaryData,
} from '@/components/pdf/project-cost-summary-pdf-document';
import { formatCurrency } from '@/lib/utils';
import { downloadPdfBlob } from '@/lib/pdf-utils';
import { Category, CATEGORY_LABELS, CATEGORY_COLORS } from '@/types/expense';

interface ProjectCostReportsTabProps {
  companyName: string;
  hasPermission: (action: string) => boolean;
}

export default function ProjectCostReportsTab({
  companyName,
  hasPermission,
}: ProjectCostReportsTabProps) {
  const [summaryPdfLoading, setSummaryPdfLoading] = useState(false);
  const [summaryData, setSummaryData] = useState<ProjectCostSummaryData | null>(
    null
  );
  const [summaryLoading, setSummaryLoading] = useState(false);

  useEffect(() => {
    if (!summaryData && !summaryLoading) {
      setSummaryLoading(true);
      const token = localStorage.getItem('auth_token');
      fetch('/api/project-cost/summary', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
        .then((r) => r.json())
        .then((json) => {
          if (json.success) setSummaryData(json.data);
          else toast.error(json.error ?? 'Failed to load summary');
        })
        .catch(() => toast.error('Failed to load summary'))
        .finally(() => setSummaryLoading(false));
    }
  }, [summaryData, summaryLoading]);

  const handleSummaryDownloadPDF = useCallback(async () => {
    setSummaryPdfLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const res = await fetch('/api/project-cost/summary', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? 'Failed to fetch summary');
      const data: ProjectCostSummaryData = json.data;

      const blob = await pdf(
        <ProjectCostSummaryPDFDocument data={data} companyName={companyName} />
      ).toBlob();

      downloadPdfBlob(
        blob,
        `project-cost-summary-${format(new Date(), 'yyyy-MM-dd')}.pdf`
      );
      toast.success('Project cost summary downloaded');
    } catch (err) {
      console.error('PDF generation failed:', err);
      toast.error('Failed to generate summary report');
    } finally {
      setSummaryPdfLoading(false);
    }
  }, [companyName]);

  return (
    <div className="space-y-6 mt-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Project Cost Summary</h2>
          <p className="text-sm text-muted-foreground">
            Total fuel, machinery cost, employee salary, and expenses overview
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {hasPermission('reports:generatePdf') && (
            <Button
              variant="default"
              size="sm"
              className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleSummaryDownloadPDF}
              disabled={summaryPdfLoading}
            >
              {summaryPdfLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
              ) : (
                <FileDown className="h-3.5 w-3.5 mr-1" />
              )}
              {summaryPdfLoading ? 'Generating...' : 'Download Summary PDF'}
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-emerald-600" />
            Cost Summary Report
          </CardTitle>
          <CardDescription>
            Click the button above to download a detailed PDF with fuel, machinery, salary, and expense totals including paid/remaining breakdowns.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {summaryLoading && !summaryData ? (
            <div className="flex items-center justify-center py-12">
              <LoadingSpinner size="lg" text="Loading summary data..." />
            </div>
          ) : summaryData ? (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card className="transition-shadow hover:shadow-md">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Fuel Purchased</CardTitle>
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-600/10">
                      <Fuel className="h-4 w-4 text-red-600 dark:text-red-400" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold tracking-tight">{formatCurrency(summaryData.totalFuel)}</div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {summaryData.fuelBreakdown.length} fuel type{summaryData.fuelBreakdown.length !== 1 ? 's' : ''}
                    </p>
                  </CardContent>
                </Card>

                <Card className="transition-shadow hover:shadow-md">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Machinery Cost</CardTitle>
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-600/10">
                      <Truck className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold tracking-tight">{formatCurrency(summaryData.totalMachinery)}</div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Paid: {formatCurrency(summaryData.machineryPaid)} | Remaining: {formatCurrency(summaryData.machineryRemaining)}
                    </p>
                  </CardContent>
                </Card>

                <Card className="transition-shadow hover:shadow-md">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Employee Salary</CardTitle>
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600/10">
                      <Users className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold tracking-tight">{formatCurrency(summaryData.totalSalary)}</div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Paid: {formatCurrency(summaryData.salaryPaid)} | Remaining: {formatCurrency(summaryData.salaryRemaining)}
                    </p>
                  </CardContent>
                </Card>

                <Card className="transition-shadow hover:shadow-md">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Expenses</CardTitle>
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600/10">
                      <Receipt className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold tracking-tight">{formatCurrency(summaryData.totalExpenses)}</div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Excl. machinery &amp; employees
                    </p>
                  </CardContent>
                </Card>
              </div>

              <Card className="border-2 border-emerald-600 bg-emerald-50 dark:bg-emerald-950/20">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-emerald-800 dark:text-emerald-200 uppercase">Grand Total</p>
                      <p className="text-xs text-emerald-600 dark:text-emerald-400">Fuel + Machinery + Salary + Expenses</p>
                    </div>
                    <p className="text-3xl font-bold text-emerald-700 dark:text-emerald-300">{formatCurrency(summaryData.grandTotal)}</p>
                  </div>
                </CardContent>
              </Card>

              {summaryData.expenseBreakdown.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Receipt className="h-5 w-5 text-blue-600" />
                      Expenses Breakdown by Category
                    </CardTitle>
                    <CardDescription>Excluding machinery contractor &amp; employee payments</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="py-3 text-left font-medium text-muted-foreground">Category</th>
                            <th className="py-3 text-right font-medium text-muted-foreground">Amount</th>
                            <th className="py-3 text-right font-medium text-muted-foreground">% of Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {summaryData.expenseBreakdown.map((e, i) => {
                            const catColor = CATEGORY_COLORS[e.category as Category] ?? '#78716c';
                            const percentage = summaryData.totalExpenses > 0 ? (e.amount / summaryData.totalExpenses) * 100 : 0;
                            return (
                              <tr key={i} className="border-b last:border-0 hover:bg-muted/50">
                                <td className="py-3">
                                  <div className="flex items-center gap-2">
                                    <div
                                      className="h-3 w-3 rounded-sm shrink-0"
                                      style={{ backgroundColor: catColor }}
                                    />
                                    <span className="font-medium">{CATEGORY_LABELS[e.category as Category] ?? e.category}</span>
                                  </div>
                                </td>
                                <td className="py-3 text-right font-medium">{formatCurrency(e.amount)}</td>
                                <td className="py-3 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <div className="h-2 w-16 rounded-full bg-muted overflow-hidden">
                                      <div
                                        className="h-full rounded-full"
                                        style={{ width: `${percentage}%`, backgroundColor: catColor }}
                                      />
                                    </div>
                                    <span className="text-muted-foreground tabular-nums w-12 text-right">
                                      {percentage.toFixed(1)}%
                                    </span>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 font-semibold">
                            <td className="pt-3">Total</td>
                            <td className="pt-3 text-right">{formatCurrency(summaryData.totalExpenses)}</td>
                            <td className="pt-3 text-right">100%</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          ) : (
            <EmptyState
              icon={Calculator}
              title="No data available"
              description="No project cost data found. Check your permissions or try again."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
