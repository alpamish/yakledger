'use client';

import { useCallback, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useContractorStore } from '@/hooks/use-contractor-store';
import { ContractorDashboard } from '@/components/contractor/contractor-dashboard';
import { ContractorTable } from '@/components/contractor/contractor-table';
import { ContractorForm } from '@/components/contractor/contractor-form';
import { ContractorProfile } from '@/components/contractor/contractor-profile';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import type { Contractor } from '@/types/contractor';
import { Plus, HardHat, LayoutDashboard, List } from 'lucide-react';
import { toast } from 'sonner';
import { usePermissions } from '@/hooks/use-permissions';

export function ContractorPage() {
  const { canCreate, canEdit, canDelete } = usePermissions();
  const openForm = useContractorStore((s) => s.openForm);
  const deleteContractor = useContractorStore((s) => s.deleteContractor);
  const bulkAction = useContractorStore((s) => s.bulkAction);
  const selectedContractorIds = useContractorStore((s) => s.selectedContractorIds);
  const selectedContractor = useContractorStore((s) => s.selectedContractor);
  const fetchContractorProfile = useContractorStore((s) => s.fetchContractorProfile);
  const clearSelectedContractor = useContractorStore((s) => s.clearSelectedContractor);

  // Active tab: 'dashboard' | 'list' | 'profile'
  const [activeTab, setActiveTab] = useState('dashboard');

  // Delete confirmation state
  const [deleteConfirm, setDeleteConfirm] = useState<{
    open: boolean;
    contractor: Contractor | null;
  }>({ open: false, contractor: null });

  // Bulk action confirmation state
  const [bulkConfirm, setBulkConfirm] = useState<{
    open: boolean;
    action: 'delete' | 'activate' | 'suspend';
  }>({ open: false, action: 'delete' });

  // Keyboard shortcut: Alt+N to open Add Contractor form
  useEffect(() => {
    if (!canCreate('contractors')) return;
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

  // If profile is selected, compute active tab
  const computedTab = selectedContractor ? 'profile' : activeTab;
  const effectiveTab = activeTab === 'profile' && !selectedContractor ? 'dashboard' : computedTab;

  const handleEdit = useCallback(
    (contractor: Contractor) => {
      if (!canEdit('contractors')) return;
      openForm(contractor);
    },
    [openForm, canEdit]
  );

  const handleDelete = useCallback((contractor: Contractor) => {
    if (!canDelete('contractors')) return;
    setDeleteConfirm({ open: true, contractor });
  }, [canDelete]);

  const handleDeleteConfirm = useCallback(async () => {
    if (deleteConfirm.contractor) {
      await deleteContractor(deleteConfirm.contractor.id);
    }
    setDeleteConfirm({ open: false, contractor: null });
  }, [deleteConfirm.contractor, deleteContractor]);

  const handleViewProfile = useCallback(
    (contractor: Contractor) => {
      fetchContractorProfile(contractor.id);
    },
    [fetchContractorProfile]
  );

  const handleBulkAction = useCallback((action: 'delete' | 'activate' | 'suspend') => {
    setBulkConfirm({ open: true, action });
  }, []);

  const handleBulkConfirm = useCallback(async () => {
    await bulkAction(bulkConfirm.action);
    setBulkConfirm({ open: false, action: 'delete' });
    toast.success(`Bulk ${bulkConfirm.action} completed successfully`);
  }, [bulkAction, bulkConfirm.action]);

  const handleTabChange = useCallback((value: string) => {
    setActiveTab(value);
    if (value !== 'profile') {
      clearSelectedContractor();
    }
  }, [clearSelectedContractor]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <HardHat className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            Contractors
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage contractors, timesheets, fuel usage, and machinery
          </p>
        </div>
        {canCreate('contractors') && (
          <Button onClick={() => openForm()} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            <Plus className="mr-2 h-4 w-4" />
            Add Contractor
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
            Contractor List
          </TabsTrigger>
          {selectedContractor && (
            <TabsTrigger value="profile" className="gap-1.5">
              Profile
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="dashboard" className="mt-6">
          <ContractorDashboard />
        </TabsContent>

        <TabsContent value="list" className="mt-6">
          <Card>
            <CardContent className="p-4 sm:p-6">
              <ContractorTable
                onEdit={handleEdit}
                onDelete={handleDelete}
                onViewProfile={handleViewProfile}
                onBulkAction={handleBulkAction}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {selectedContractor && (
          <TabsContent value="profile" className="mt-6">
            <ContractorProfile />
          </TabsContent>
        )}
      </Tabs>

      {/* Contractor Form Dialog */}
      <ContractorForm />

      {/* Single Delete Confirmation */}
      <ConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={(open) => setDeleteConfirm({ open, contractor: open ? deleteConfirm.contractor : null })}
        title="Delete Contractor"
        description={
          deleteConfirm.contractor
            ? `Are you sure you want to delete "${deleteConfirm.contractor.contractorName}"? This action cannot be undone.`
            : 'Are you sure you want to delete this contractor?'
        }
        onConfirm={handleDeleteConfirm}
        confirmText="Delete"
        variant="destructive"
      />

      {/* Bulk Action Confirmation */}
      <ConfirmDialog
        open={bulkConfirm.open}
        onOpenChange={(open) => setBulkConfirm({ open, action: bulkConfirm.action })}
        title={
          bulkConfirm.action === 'delete'
            ? 'Delete Selected Contractors'
            : bulkConfirm.action === 'activate'
            ? 'Activate Selected Contractors'
            : 'Suspend Selected Contractors'
        }
        description={
          bulkConfirm.action === 'delete'
            ? `Are you sure you want to delete ${selectedContractorIds.size} selected contractor${selectedContractorIds.size > 1 ? 's' : ''}? This action cannot be undone.`
            : `Are you sure you want to ${bulkConfirm.action} ${selectedContractorIds.size} selected contractor${selectedContractorIds.size > 1 ? 's' : ''}?`
        }
        onConfirm={handleBulkConfirm}
        confirmText={bulkConfirm.action === 'delete' ? 'Delete All' : bulkConfirm.action === 'activate' ? 'Activate' : 'Suspend'}
        variant={bulkConfirm.action === 'delete' ? 'destructive' : 'default'}
      />
    </div>
  );
}
