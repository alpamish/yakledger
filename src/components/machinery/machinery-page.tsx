'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useMachineryStore } from '@/hooks/use-machinery-store';
import { MachineryTable } from '@/components/machinery/machinery-table';
import { MachineryForm } from '@/components/machinery/machinery-form';
import { MachinerySummary } from '@/components/machinery/machinery-summary';
import { MachineryTimesheetTemplate } from '@/components/machinery/machinery-timesheet-template';
import { TimesheetFormDialog } from '@/components/machinery/timesheet-form-dialog';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { contractorsApi } from '@/services/contractor-api';
import type { Machinery, Contractor } from '@/types/contractor';
import {
  Plus,
  Truck,
  BarChart3,
  FileSpreadsheet,
} from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';

type MachineryTab = 'list' | 'summary' | 'templates';

export function MachineryPage() {
  const { canCreate, canEdit, canDelete } = usePermissions();
  const openForm = useMachineryStore((s) => s.openForm);
  const deleteMachinery = useMachineryStore((s) => s.deleteMachinery);

  const [activeTab, setActiveTab] = useState<MachineryTab>('list');

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<{
    open: boolean;
    machinery: Machinery | null;
  }>({ open: false, machinery: null });

  // Timesheet dialog
  const [timesheetDialogOpen, setTimesheetDialogOpen] = useState(false);
  const [timesheetMachinery, setTimesheetMachinery] = useState<Machinery | null>(null);
  const [timesheetContractor, setTimesheetContractor] = useState<Contractor | null>(null);
  const [timesheetLoading, setTimesheetLoading] = useState(false);

  // Timesheet templates
  const [farsiTemplateOpen, setFarsiTemplateOpen] = useState(false);
  const [preselectedMachineryIds, setPreselectedMachineryIds] = useState<string[] | undefined>(undefined);

  // Keyboard shortcut: Alt+N to open Add Machinery form
  useEffect(() => {
    if (!canCreate('machinery')) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key === 'n') {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
        e.preventDefault();
        openForm();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [openForm, canCreate]);

  const handleEdit = useCallback(
    (m: Machinery) => {
      if (!canEdit('machinery')) return;
      openForm(m);
    },
    [openForm, canEdit]
  );

  const handleDelete = useCallback((m: Machinery) => {
    if (!canDelete('machinery')) return;
    setDeleteConfirm({ open: true, machinery: m });
  }, [canDelete]);

  const handleDeleteConfirm = useCallback(async () => {
    if (deleteConfirm.machinery) {
      await deleteMachinery(deleteConfirm.machinery.id);
    }
    setDeleteConfirm({ open: false, machinery: null });
  }, [deleteConfirm.machinery, deleteMachinery]);

  const handleTimesheetForm = useCallback(async (m: Machinery) => {
    setTimesheetMachinery(m);
    setTimesheetLoading(true);
    setTimesheetDialogOpen(true);
    try {
      if (m.assignedContractorId) {
        const res = await contractorsApi.getById(m.assignedContractorId);
        if (res.data) setTimesheetContractor(res.data);
      }
    } catch {
      setTimesheetContractor(null);
    } finally {
      setTimesheetLoading(false);
    }
  }, []);

  const handleOpenFarsiTemplate = useCallback(() => {
    setPreselectedMachineryIds(undefined);
    setFarsiTemplateOpen(true);
  }, []);

  const handleBulkFarsiTimesheet = useCallback((ids: string[]) => {
    setPreselectedMachineryIds(ids);
    setFarsiTemplateOpen(true);
    setActiveTab('templates');
  }, []);

  const handleOpenStandardTemplate = useCallback(() => {
    setTimesheetMachinery(null);
    setTimesheetContractor(null);
    setTimesheetDialogOpen(true);
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Truck className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            Machinery
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage all machinery and equipment
          </p>
        </div>
        {activeTab === 'list' && canCreate('machinery') && (
          <Button onClick={() => openForm()} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            <Plus className="mr-2 h-4 w-4" />
            Add Machinery
          </Button>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as MachineryTab)}>
        <TabsList>
          <TabsTrigger value="list" className="flex items-center gap-2">
            <Truck className="h-4 w-4" />
            Machinery List
          </TabsTrigger>
          <TabsTrigger value="summary" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Summary
          </TabsTrigger>
          <TabsTrigger value="templates" className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4" />
            Timesheet Templates
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="mt-6">
          <Card>
            <CardContent className="p-4 sm:p-6">
              <MachineryTable
                onTimesheet={handleTimesheetForm}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onBulkFarsiTimesheet={handleBulkFarsiTimesheet}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="summary" className="mt-6">
          <MachinerySummary />
        </TabsContent>

        <TabsContent value="templates" className="space-y-4 mt-6">
          {farsiTemplateOpen ? (
            <MachineryTimesheetTemplate onBack={() => { setFarsiTemplateOpen(false); setPreselectedMachineryIds(undefined); }} initialMachineryIds={preselectedMachineryIds} />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={handleOpenStandardTemplate}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Truck className="h-5 w-5 text-emerald-600" />
                    Standard Timesheet (PDF)
                  </CardTitle>
                  <CardDescription>
                    Generate a printable PDF timesheet form with configurable period (weekly/biweekly/monthly)
                    and fill mode. English layout with company letterhead.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>• Weekly, biweekly, or monthly periods</p>
                    <p>• Pre-fill or blank mode</p>
                    <p>• Auto-fill dates option</p>
                    <p>• English PDF format</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={handleOpenFarsiTemplate}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
                    Farsi Timesheet (تایم شیت ماشینری)
                  </CardTitle>
                  <CardDescription>
                    Printable monthly machinery timesheet in Farsi/Dari with daily work hour tracking,
                    payment records, and fuel usage. Data auto-filled from the system.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>• Monthly 31-day timesheet table</p>
                    <p>• Auto-filled from existing timesheet records</p>
                    <p>• Fuel usage tracking section</p>
                    <p>• Farsi/Dari RTL layout — ready to print</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Form Dialog */}
      <MachineryForm />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={(open) => setDeleteConfirm({ open, machinery: open ? deleteConfirm.machinery : null })}
        title="Delete Machinery"
        description={
          deleteConfirm.machinery
            ? `Are you sure you want to delete "${deleteConfirm.machinery.machineryName}"? This action cannot be undone.`
            : 'Are you sure you want to delete this machinery?'
        }
        onConfirm={handleDeleteConfirm}
        confirmText="Delete"
        variant="destructive"
      />

      {/* Timesheet Form Dialog */}
      <TimesheetFormDialog
        open={timesheetDialogOpen}
        onOpenChange={setTimesheetDialogOpen}
        machinery={timesheetMachinery}
        contractor={timesheetContractor}
      />
    </div>
  );
}
