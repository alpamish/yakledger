'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useExpenseStore } from '@/hooks/use-expense-store';
import { usePermissions } from '@/hooks/use-permissions';
import { CATEGORY_LABELS, PAYMENT_METHOD_LABELS } from '@/types/expense';
import type { Category } from '@/types/expense';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LoadingSpinner } from '@/components/common/loading-spinner';
import { EmptyState } from '@/components/common/empty-state';
import { BarChart3, User, Truck, Fuel, Calculator, ClipboardList, Gauge } from 'lucide-react';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { settingsApi } from '@/services/settings-api';

import ExpenseReportsTab from './expense-reports-tab';
import { ContractorReportsTab } from './contractor-reports-tab';
import { ContractorFinanceReportsTab } from './contractor-finance-reports-tab';
import { ContractorOpsReportsTab } from './contractor-ops-reports-tab';
import { EmployeeReportsTab } from './employee-reports-tab';
import MachineryReportsTab from './machinery-reports-tab';
import FuelReportsTab from './fuel-reports-tab';
import ProjectCostReportsTab from './project-cost-reports-tab';

export function ReportsPage() {
  const { dashboardStats, fetchDashboard, expenses, fetchExpenses, selectedExpenseIds, isLoading } = useExpenseStore();
  const [hasFetched, setHasFetched] = useState(false);
  const [activeReportTab, setActiveReportTab] = useState('expenses');
  const [companyName, setCompanyName] = useState('YakhshiLedger');
  const [timesheetDialogOpen, setTimesheetDialogOpen] = useState(false);

  useEffect(() => {
    if (!hasFetched) {
      fetchDashboard();
      fetchExpenses();
      setHasFetched(true);
    }
  }, [fetchDashboard, fetchExpenses, hasFetched]);

  useEffect(() => {
    settingsApi.get().then((res) => {
      if (res.data?.companyName) setCompanyName(res.data.companyName);
    }).catch(() => {});
  }, []);

  const selectedExpenses = useMemo(() => {
    if (selectedExpenseIds.size === 0) return expenses;
    return expenses.filter((e) => selectedExpenseIds.has(e.id));
  }, [expenses, selectedExpenseIds]);

  const exportCSV = useCallback(() => {
    const data = selectedExpenses.map((e, i) => ({
      '#': i + 1,
      Title: e.title,
      Category: CATEGORY_LABELS[e.category as Category] ?? e.category,
      Amount: e.amount,
      'Payment Method': PAYMENT_METHOD_LABELS[e.paymentMethod] ?? e.paymentMethod,
      'Paid To': e.paidTo,
      'Paid By': e.paidBy,
      Date: format(new Date(e.expenseDate), 'yyyy-MM-dd'),
      Description: e.description ?? '',
      Tags: e.tags ?? '',
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Expenses');

    const colWidths = Object.keys(data[0] || {}).map((key) => ({
      wch: Math.max(key.length, ...data.map((row) => String(row[key as keyof typeof row]).length).slice(0, 10)),
    }));
    ws['!cols'] = colWidths;

    XLSX.writeFile(wb, `expense-report-${format(new Date(), 'yyyy-MM-dd')}.csv`, { bookType: 'csv' });
  }, [selectedExpenses]);

  const exportExcel = useCallback(() => {
    const data = selectedExpenses.map((e, i) => ({
      '#': i + 1,
      Title: e.title,
      Category: CATEGORY_LABELS[e.category as Category] ?? e.category,
      Amount: e.amount,
      'Payment Method': PAYMENT_METHOD_LABELS[e.paymentMethod] ?? e.paymentMethod,
      'Paid To': e.paidTo,
      'Paid By': e.paidBy,
      Date: format(new Date(e.expenseDate), 'yyyy-MM-dd'),
      Description: e.description ?? '',
      Tags: e.tags ?? '',
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Expenses');

    const summaryData = dashboardStats
      ? [
          { Metric: 'Total Expenses', Value: dashboardStats.totalExpenses },
          { Metric: 'Total Amount', Value: dashboardStats.totalAmount },
          { Metric: 'Average Amount', Value: dashboardStats.averageAmount },
          { Metric: 'This Month Count', Value: dashboardStats.expensesThisMonth },
          { Metric: 'This Month Amount', Value: dashboardStats.amountThisMonth },
        ]
      : [];
    const ws2 = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, ws2, 'Summary');

    XLSX.writeFile(wb, `expense-report-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  }, [selectedExpenses, dashboardStats]);

  const { canView, hasPermission } = usePermissions();

  if (isLoading && !dashboardStats) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <LoadingSpinner size="lg" text="Loading reports..." />
      </div>
    );
  }

  if (!dashboardStats) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <EmptyState
          icon={BarChart3}
          title="No report data"
          description="Start adding expenses to generate reports and analytics."
        />
      </div>
    );
  }

  if (!canView('reports')) return null;

  return (
    <div className="space-y-6">
      <Tabs value={activeReportTab} onValueChange={setActiveReportTab}>
        <TabsList>
          {canView('expenses') && (
            <TabsTrigger value="expenses" className="gap-1.5">
              <BarChart3 className="h-4 w-4" />
              Expense Reports
            </TabsTrigger>
          )}
          {canView('contractors') && (
            <TabsTrigger value="contractors" className="gap-1.5">
              <User className="h-4 w-4" />
              Contractor Reports
            </TabsTrigger>
          )}
          {canView('contractors') && hasPermission('reports:view') && (
            <TabsTrigger value="contractorFinance" className="gap-1.5">
              <ClipboardList className="h-4 w-4" />
              Contractor Finance
            </TabsTrigger>
          )}
          {canView('machinery') && hasPermission('reports:view') && (
            <TabsTrigger value="contractorOps" className="gap-1.5">
              <Gauge className="h-4 w-4" />
              Contractor Ops
            </TabsTrigger>
          )}
          {canView('employees') && (
            <TabsTrigger value="employees" className="gap-1.5">
              <User className="h-4 w-4" />
              Employee Reports
            </TabsTrigger>
          )}
          {canView('machinery') && (
            <TabsTrigger value="machineryReport" className="gap-1.5">
              <Truck className="h-4 w-4" />
              Machinery Report
            </TabsTrigger>
          )}
          {canView('fuelUsage') && (
            <TabsTrigger value="fuelUsageReport" className="gap-1.5">
              <Fuel className="h-4 w-4" />
              Fuel Usage Reports
            </TabsTrigger>
          )}
          {canView('projectCost') && (
            <TabsTrigger value="projectCostSummary" className="gap-1.5">
              <Calculator className="h-4 w-4" />
              Cost Summary
            </TabsTrigger>
          )}
        </TabsList>

        {canView('expenses') && (
          <TabsContent value="expenses" className="space-y-6 mt-6">
            <ExpenseReportsTab
              dashboardStats={dashboardStats}
              selectedExpenses={selectedExpenses}
              selectedExpenseIds={selectedExpenseIds}
              exportCSV={exportCSV}
              exportExcel={exportExcel}
              hasPermission={hasPermission}
            />
          </TabsContent>
        )}

        {canView('contractors') && (
          <TabsContent value="contractors" className="space-y-6 mt-6">
            <ContractorReportsTab
              companyName={companyName}
              hasPermission={hasPermission}
              onOpenTimesheetDialog={() => setTimesheetDialogOpen(true)}
            />
          </TabsContent>
        )}

        {canView('contractors') && hasPermission('reports:view') && (
          <TabsContent value="contractorFinance" className="space-y-6 mt-6">
            <ContractorFinanceReportsTab
              companyName={companyName}
              hasPermission={hasPermission}
            />
          </TabsContent>
        )}

        {canView('machinery') && hasPermission('reports:view') && (
          <TabsContent value="contractorOps" className="space-y-6 mt-6">
            <ContractorOpsReportsTab
              companyName={companyName}
              hasPermission={hasPermission}
            />
          </TabsContent>
        )}

        {canView('employees') && (
          <TabsContent value="employees" className="space-y-6 mt-6">
            <EmployeeReportsTab
              companyName={companyName}
              hasPermission={hasPermission}
            />
          </TabsContent>
        )}

        {canView('machinery') && (
          <TabsContent value="machineryReport" className="space-y-6 mt-6">
            <MachineryReportsTab
              companyName={companyName}
              hasPermission={hasPermission}
            />
          </TabsContent>
        )}

        {canView('fuelUsage') && (
          <TabsContent value="fuelUsageReport" className="space-y-6 mt-6">
            <FuelReportsTab
              companyName={companyName}
              hasPermission={hasPermission}
            />
          </TabsContent>
        )}

        {canView('projectCost') && (
          <TabsContent value="projectCostSummary" className="space-y-6 mt-6">
            <ProjectCostReportsTab
              companyName={companyName}
              hasPermission={hasPermission}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
