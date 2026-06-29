'use client';

import { useCallback, useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useEmployeeStore } from '@/hooks/use-employee-store';
import { EmployeeDashboard } from '@/components/employee/employee-dashboard';
import { EmployeeTable } from '@/components/employee/employee-table';
import { EmployeeForm } from '@/components/employee/employee-form';
import { EmployeeProfile } from '@/components/employee/employee-profile';
import { EmployeeFinancialSummary } from '@/components/employee/employee-financial-summary';
import { AttendancePanel } from '@/components/attendance/attendance-panel';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import type { Employee } from '@/types/employee';
import { Plus, Users, LayoutDashboard, List, ClipboardCheck } from 'lucide-react';
import { toast } from 'sonner';
import { usePermissions } from '@/hooks/use-permissions';

export function EmployeePage() {
  const { canCreate, canEdit, canDelete } = usePermissions();
  const openForm = useEmployeeStore((s) => s.openForm);
  const deleteEmployee = useEmployeeStore((s) => s.deleteEmployee);
  const bulkAction = useEmployeeStore((s) => s.bulkAction);
  const selectedEmployeeIds = useEmployeeStore((s) => s.selectedEmployeeIds);
  const selectedEmployee = useEmployeeStore((s) => s.selectedEmployee);
  const fetchEmployeeProfile = useEmployeeStore((s) => s.fetchEmployeeProfile);
  const clearSelectedEmployee = useEmployeeStore((s) => s.clearSelectedEmployee);

  // Active tab: 'dashboard' | 'list' | 'profile'
  const [activeTab, setActiveTab] = useState('dashboard');

  // Delete confirmation state
  const [deleteConfirm, setDeleteConfirm] = useState<{
    open: boolean;
    employee: Employee | null;
  }>({ open: false, employee: null });

  // Financial summary dialog state
  const [financialSummaryOpen, setFinancialSummaryOpen] = useState(false);

  const handleFinancialSummary = useCallback(() => {
    if (selectedEmployeeIds.size > 0) {
      setFinancialSummaryOpen(true);
    }
  }, [selectedEmployeeIds]);

  const handleViewProfileFromSummary = useCallback(
    (id: string) => {
      setFinancialSummaryOpen(false);
      fetchEmployeeProfile(id);
    },
    [fetchEmployeeProfile]
  );

  // Bulk action confirmation state
  const [bulkConfirm, setBulkConfirm] = useState<{
    open: boolean;
    action: 'delete' | 'activate' | 'deactivate';
  }>({ open: false, action: 'delete' });

  // If profile is selected, compute active tab
  const computedTab = selectedEmployee ? 'profile' : activeTab;
  const effectiveTab = activeTab === 'profile' && !selectedEmployee ? 'dashboard' : computedTab;

  const handleEdit = useCallback(
    (employee: Employee) => {
      if (!canEdit('employees')) return;
      openForm(employee);
    },
    [openForm, canEdit]
  );

  const handleDelete = useCallback((employee: Employee) => {
    if (!canDelete('employees')) return;
    setDeleteConfirm({ open: true, employee });
  }, [canDelete]);

  const handleDeleteConfirm = useCallback(async () => {
    if (deleteConfirm.employee) {
      await deleteEmployee(deleteConfirm.employee.id);
    }
    setDeleteConfirm({ open: false, employee: null });
  }, [deleteConfirm.employee, deleteEmployee]);

  const handleViewProfile = useCallback(
    (employee: Employee) => {
      fetchEmployeeProfile(employee.id);
    },
    [fetchEmployeeProfile]
  );

  const handleBulkAction = useCallback((action: 'delete' | 'activate' | 'deactivate') => {
    setBulkConfirm({ open: true, action });
  }, []);

  const handleBulkConfirm = useCallback(async () => {
    await bulkAction(bulkConfirm.action);
    setBulkConfirm({ open: false, action: 'delete' });
    toast.success(`Bulk ${bulkConfirm.action} completed successfully`);
  }, [bulkAction, bulkConfirm.action]);

  const handleTabChange = useCallback((value: string) => {
    setActiveTab(value);
    if (value !== 'profile' && value !== 'attendance') {
      clearSelectedEmployee();
    }
  }, [clearSelectedEmployee]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Users className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            Employees
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage your workforce and employee records
          </p>
        </div>
        {canCreate('employees') && (
          <Button onClick={() => openForm()} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            <Plus className="mr-2 h-4 w-4" />
            Add Employee
          </Button>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={effectiveTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="dashboard" className="gap-1.5">
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="list" className="gap-1.5">
            <List className="h-4 w-4" />
            Employee List
          </TabsTrigger>
          {selectedEmployee && (
            <TabsTrigger value="profile" className="gap-1.5">
              Profile
            </TabsTrigger>
          )}
          <TabsTrigger value="attendance" className="gap-1.5">
            <ClipboardCheck className="h-4 w-4" />
            Attendance
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-6">
          <EmployeeDashboard onViewProfile={handleViewProfile} />
        </TabsContent>

        <TabsContent value="list" className="mt-6">
          <Card>
            <CardContent className="p-4 sm:p-6">
              <EmployeeTable
                onEdit={handleEdit}
                onDelete={handleDelete}
                onViewProfile={handleViewProfile}
                onBulkAction={handleBulkAction}
                onFinancialSummary={handleFinancialSummary}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {selectedEmployee && (
          <TabsContent value="profile" className="mt-6">
            <EmployeeProfile />
          </TabsContent>
        )}
        <TabsContent value="attendance" className="mt-6">
          <AttendancePanel />
        </TabsContent>
      </Tabs>

      {/* Employee Form Dialog */}
      <EmployeeForm />

      {/* Single Delete Confirmation */}
      <ConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={(open) => setDeleteConfirm({ open, employee: open ? deleteConfirm.employee : null })}
        title="Delete Employee"
        description={
          deleteConfirm.employee
            ? `Are you sure you want to delete "${deleteConfirm.employee.fullName}"? This action cannot be undone.`
            : 'Are you sure you want to delete this employee?'
        }
        onConfirm={handleDeleteConfirm}
        confirmText="Delete"
        variant="destructive"
      />

      {/* Financial Summary Dialog */}
      <EmployeeFinancialSummary
        open={financialSummaryOpen}
        onOpenChange={setFinancialSummaryOpen}
        employeeIds={Array.from(selectedEmployeeIds)}
        onViewProfile={handleViewProfileFromSummary}
      />

      {/* Bulk Action Confirmation */}
      <ConfirmDialog
        open={bulkConfirm.open}
        onOpenChange={(open) => setBulkConfirm({ open, action: bulkConfirm.action })}
        title={
          bulkConfirm.action === 'delete'
            ? 'Delete Selected Employees'
            : bulkConfirm.action === 'activate'
            ? 'Activate Selected Employees'
            : 'Deactivate Selected Employees'
        }
        description={
          bulkConfirm.action === 'delete'
            ? `Are you sure you want to delete ${selectedEmployeeIds.size} selected employee${selectedEmployeeIds.size > 1 ? 's' : ''}? This action cannot be undone.`
            : `Are you sure you want to ${bulkConfirm.action} ${selectedEmployeeIds.size} selected employee${selectedEmployeeIds.size > 1 ? 's' : ''}?`
        }
        onConfirm={handleBulkConfirm}
        confirmText={bulkConfirm.action === 'delete' ? 'Delete All' : bulkConfirm.action === 'activate' ? 'Activate' : 'Deactivate'}
        variant={bulkConfirm.action === 'delete' ? 'destructive' : 'default'}
      />
    </div>
  );
}
