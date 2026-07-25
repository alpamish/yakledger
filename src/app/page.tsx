'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

import { useExpenseStore } from '@/hooks/use-expense-store';
import { LoginPage } from '@/components/auth/login-page';
import { AppShell } from '@/components/layout/app-shell';
import type { NavSection } from '@/components/layout/sidebar-nav';

const DashboardPage = dynamic(() => import('@/components/dashboard/dashboard-page').then(mod => mod.DashboardPage), { loading: PageSkeleton });
const ExpensePage = dynamic(() => import('@/components/expense/expense-page').then(mod => mod.ExpensePage), { loading: PageSkeleton });
const EmployeePage = dynamic(() => import('@/components/employee/employee-page').then(mod => mod.EmployeePage), { loading: PageSkeleton });
const ContractorPage = dynamic(() => import('@/components/contractor/contractor-page').then(mod => mod.ContractorPage), { loading: PageSkeleton });
const MachineryPage = dynamic(() => import('@/components/machinery/machinery-page').then(mod => mod.MachineryPage), { loading: PageSkeleton });
const TimesheetPage = dynamic(() => import('@/components/timesheet/timesheet-page').then(mod => mod.TimesheetPage), { loading: PageSkeleton });
const FuelUsagePage = dynamic(() => import('@/components/fuel-usage/fuel-usage-page').then(mod => mod.FuelUsagePage), { loading: PageSkeleton });
const ProjectCostPage = dynamic(() => import('@/components/project-cost/project-cost-page').then(mod => mod.ProjectCostPage), { loading: PageSkeleton });
const ReportsPage = dynamic(() => import('@/components/reports/reports-page').then(mod => mod.ReportsPage), { loading: PageSkeleton });
const CashAdvancePage = dynamic(() => import('@/components/cash-advance/cash-advance-page').then(mod => mod.CashAdvancePage), { loading: PageSkeleton });
const SettingsPage = dynamic(() => import('@/components/settings/settings-page').then(mod => mod.SettingsPage), { loading: PageSkeleton });
const AssetsPage = dynamic(() => import('@/components/assets/assets-page').then(mod => mod.AssetsPage), { loading: PageSkeleton });
const UsersPage = dynamic(() => import('@/components/users/users-page').then(mod => mod.UsersPage), { loading: PageSkeleton });

function PageSkeleton() {
  return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
    </div>
  );
}

const SectionContent = React.memo(function SectionContent({ section }: { section: NavSection }) {
  switch (section) {
    case 'dashboard':
      return <DashboardPage />;
    case 'projectCost':
      return <ProjectCostPage />;
    case 'expenses':
      return <ExpensePage />;
    case 'employees':
      return <EmployeePage />;
    case 'contractors':
      return <ContractorPage />;
    case 'timesheets':
      return <TimesheetPage />;
    case 'fuelUsage':
      return <FuelUsagePage />;
    case 'machinery':
      return <MachineryPage />;
    case 'reports':
      return <ReportsPage />;
    case 'assets':
      return <AssetsPage />;
    case 'cashAdvance':
      return <CashAdvancePage />;
    case 'settings':
      return <SettingsPage />;
    case 'users':
      return <UsersPage />;
    default:
      return <DashboardPage />;
  }
});

export default function Home() {
  const { isAuthenticated, isLoadingAuth, user, checkAuth, logout } = useExpenseStore();

  React.useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  React.useEffect(() => {
    if (!isAuthenticated && !isLoadingAuth) {
      document.title = 'Yakhshi Ledger - Login';
    }
  }, [isAuthenticated, isLoadingAuth]);

  const handleLogout = React.useCallback(() => {
    logout();
  }, [logout]);

  if (isLoadingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <AppShell
      userName={user?.name}
      userEmail={user?.email}
      onLogout={handleLogout}
    >
      {(section) => <SectionContent section={section} />}
    </AppShell>
  );
}
