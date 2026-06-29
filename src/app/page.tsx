'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';

import { useExpenseStore } from '@/hooks/use-expense-store';
import { LoginPage } from '@/components/auth/login-page';
import { AppShell } from '@/components/layout/app-shell';
import type { NavSection } from '@/components/layout/sidebar-nav';
import { DashboardPage } from '@/components/dashboard/dashboard-page';
import { ExpensePage } from '@/components/expense/expense-page';
import { EmployeePage } from '@/components/employee/employee-page';
import { ContractorPage } from '@/components/contractor/contractor-page';
import { MachineryPage } from '@/components/machinery/machinery-page';
import { TimesheetPage } from '@/components/timesheet/timesheet-page';
import { FuelUsagePage } from '@/components/fuel-usage/fuel-usage-page';
import { ReportsPage } from '@/components/reports/reports-page';
import { CashAdvancePage } from '@/components/cash-advance/cash-advance-page';
import { SettingsPage } from '@/components/settings/settings-page';
import { AssetsPage } from '@/components/assets/assets-page';
import { UsersPage } from '@/components/users/users-page';

function SectionContent({ section }: { section: NavSection }) {
  switch (section) {
    case 'dashboard':
      return <DashboardPage />;
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
}

export default function Home() {
  const { isAuthenticated, isLoadingAuth, user, checkAuth, logout } = useExpenseStore();

  React.useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const handleLogout = React.useCallback(() => {
    logout();
  }, [logout]);

  // Show loading spinner while checking authentication
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

  // Show login page if not authenticated
  if (!isAuthenticated) {
    return <LoginPage />;
  }

  // Show main app if authenticated
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
