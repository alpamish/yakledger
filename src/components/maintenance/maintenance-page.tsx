'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAssetStore } from '@/hooks/use-asset-store';
import { maintenanceApi } from '@/services/asset-api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { Wrench, Plus, Trash2, AlertCircle } from 'lucide-react';
import { MaintenanceForm } from './maintenance-form';
import { MAINTENANCE_TYPE_LABELS } from '@/types/asset';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import type { MaintenanceRecord } from '@/types/asset';

export function MaintenancePage() {
  const maintenanceRecords = useAssetStore((s) => s.maintenanceRecords);
  const maintenancePagination = useAssetStore((s) => s.maintenancePagination);
  const fetchMaintenanceRecords = useAssetStore((s) => s.fetchMaintenanceRecords);
  const deleteMaintenanceRecord = useAssetStore((s) => s.deleteMaintenanceRecord);
  const setMaintenancePage = useAssetStore((s) => s.setMaintenancePage);

  const [formOpen, setFormOpen] = useState(false);
  const [upcoming, setUpcoming] = useState<MaintenanceRecord[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string | null }>({
    open: false,
    id: null,
  });

  const loadData = useCallback(() => {
    fetchMaintenanceRecords();
    maintenanceApi.getAll({ upcoming: true, pageSize: 20 }).then((res) => {
      if (res.data) setUpcoming(res.data.data);
    });
  }, [fetchMaintenanceRecords]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDelete = async () => {
    if (!deleteConfirm.id) return;
    try {
      await deleteMaintenanceRecord(deleteConfirm.id);
      toast.success('Maintenance record deleted');
      loadData();
    } catch {
      toast.error('Failed to delete');
    }
    setDeleteConfirm({ open: false, id: null });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Wrench className="h-5 w-5 text-emerald-600" />
            Maintenance Records
          </h2>
        </div>
        <Dialog open={formOpen} onOpenChange={setFormOpen}>
          <DialogTrigger asChild>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white">
              <Plus className="mr-2 h-4 w-4" />
              Add Record
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>New Maintenance Record</DialogTitle>
            </DialogHeader>
            <MaintenanceForm
              onSuccess={() => {
                setFormOpen(false);
                loadData();
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* Upcoming Maintenance Alert */}
      {upcoming.length > 0 && (
        <Card className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-amber-800 dark:text-amber-300">
                {upcoming.length} upcoming service reminder{upcoming.length > 1 ? 's' : ''}
              </p>
              <ul className="text-sm text-amber-700 dark:text-amber-400 mt-1 space-y-1">
                {upcoming.map((r) => (
                  <li key={r.id}>
                    {r.asset?.name} - {MAINTENANCE_TYPE_LABELS[r.serviceType]} due{' '}
                    {r.nextServiceDate ? new Date(r.nextServiceDate).toLocaleDateString() : 'soon'}
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">All Records</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Asset</TableHead>
                <TableHead>Service Type</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Next Service</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {maintenanceRecords.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{new Date(r.serviceDate).toLocaleDateString()}</TableCell>
                  <TableCell>
                    {r.asset?.name}
                    {r.asset?.plateNumber && (
                      <span className="text-muted-foreground text-xs ml-1">({r.asset.plateNumber})</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{MAINTENANCE_TYPE_LABELS[r.serviceType]}</Badge>
                  </TableCell>
                  <TableCell className="font-medium">${r.cost.toLocaleString()}</TableCell>
                  <TableCell>{r.vendor || '-'}</TableCell>
                  <TableCell>
                    {r.nextServiceDate ? (
                      <span
                        className={
                          new Date(r.nextServiceDate) <= new Date()
                            ? 'text-red-500 font-medium'
                            : ''
                        }
                      >
                        {new Date(r.nextServiceDate).toLocaleDateString()}
                      </span>
                    ) : (
                      '-'
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteConfirm({ open: true, id: r.id })}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {maintenanceRecords.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No maintenance records
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {maintenancePagination.totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                onClick={() => {
                  if (maintenancePagination.page > 1) {
                    setMaintenancePage(maintenancePagination.page - 1);
                    fetchMaintenanceRecords();
                  }
                }}
                className={maintenancePagination.page <= 1 ? 'pointer-events-none opacity-50' : ''}
              />
            </PaginationItem>
            {Array.from({ length: maintenancePagination.totalPages }, (_, i) => i + 1).map((p) => (
              <PaginationItem key={p}>
                <PaginationLink
                  isActive={p === maintenancePagination.page}
                  onClick={() => {
                    setMaintenancePage(p);
                    fetchMaintenanceRecords();
                  }}
                >
                  {p}
                </PaginationLink>
              </PaginationItem>
            ))}
            <PaginationItem>
              <PaginationNext
                onClick={() => {
                  if (maintenancePagination.page < maintenancePagination.totalPages) {
                    setMaintenancePage(maintenancePagination.page + 1);
                    fetchMaintenanceRecords();
                  }
                }}
                className={maintenancePagination.page >= maintenancePagination.totalPages ? 'pointer-events-none opacity-50' : ''}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}

      <ConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={(open) => setDeleteConfirm({ open, id: open ? deleteConfirm.id : null })}
        title="Delete Maintenance Record"
        description="Are you sure you want to delete this maintenance record?"
        onConfirm={handleDelete}
        confirmText="Delete"
        variant="destructive"
      />
    </div>
  );
}
