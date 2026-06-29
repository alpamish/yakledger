'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { TimesheetForm } from './timesheet-form';
import { BatchTimesheetForm } from './batch-timesheet-form';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { timesheetsApi } from '@/services/contractor-api';
import type { Timesheet } from '@/types/contractor';
import {
  Plus,
  Clock,
  Search,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { usePermissions } from '@/hooks/use-permissions';

export function TimesheetPage() {
  const { canCreate, canEdit, canDelete, canApprove } = usePermissions();
  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [formOpen, setFormOpen] = useState(false);
  const [batchFormOpen, setBatchFormOpen] = useState(false);
  const [editingTimesheet, setEditingTimesheet] = useState<Timesheet | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; timesheet: Timesheet | null }>({
    open: false,
    timesheet: null,
  });

  const pageSize = 20;

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await timesheetsApi.getAll({ search: search || undefined, page, pageSize });
      const d = res.data!;
      setTimesheets(d.data);
      setTotalPages(d.totalPages);
      setTotal(d.total);
    } catch {
      toast.error('Failed to load timesheets');
    } finally {
      setIsLoading(false);
    }
  }, [search, page, pageSize]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAdd = useCallback(() => {
    setEditingTimesheet(null);
    setFormOpen(true);
  }, []);

  const handleEdit = useCallback((t: Timesheet) => {
    setEditingTimesheet(t);
    setFormOpen(true);
  }, []);

  const handleDelete = useCallback((t: Timesheet) => {
    setDeleteConfirm({ open: true, timesheet: t });
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (deleteConfirm.timesheet) {
      try {
        await timesheetsApi.delete(deleteConfirm.timesheet.id);
        toast.success('Timesheet deleted successfully');
        fetchData();
      } catch {
        toast.error('Failed to delete timesheet');
      }
    }
    setDeleteConfirm({ open: false, timesheet: null });
  }, [deleteConfirm.timesheet, fetchData]);

  const handleFormSuccess = useCallback(() => {
    fetchData();
  }, [fetchData]);

  const handleApprove = useCallback(async (id: string) => {
    try {
      await timesheetsApi.approve(id);
      toast.success('Timesheet approved successfully');
      fetchData();
    } catch {
      toast.error('Failed to approve timesheet');
    }
  }, [fetchData]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Clock className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            Timesheets
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage contractor timesheets and hours
          </p>
        </div>
        {canCreate('timesheets') && (
          <div className="flex items-center gap-2">
            <Button onClick={() => setBatchFormOpen(true)} variant="outline">
              <Plus className="mr-2 h-4 w-4" />
              Batch Entry
            </Button>
            <Button onClick={handleAdd} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              <Plus className="mr-2 h-4 w-4" />
              Add Timesheet
            </Button>
          </div>
        )}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name, site, or plate number..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="pl-9"
        />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : timesheets.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Contractor</TableHead>
                    <TableHead>Operator</TableHead>
                    <TableHead>Work Site</TableHead>
                    <TableHead>Driver</TableHead>
                    <TableHead className="text-right">Hours</TableHead>
                    <TableHead className="text-right">OT</TableHead>
                    <TableHead>Machinery</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {timesheets.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="text-muted-foreground">{format(new Date(t.date), 'MMM dd, yyyy')}</TableCell>
                      <TableCell className="font-medium max-w-[150px] truncate">
                        {t.contractor?.contractorName ?? '—'}
                      </TableCell>
                      <TableCell>{t.operatorName ?? '—'}</TableCell>
                      <TableCell className="max-w-[120px] truncate">{t.workSite ?? '—'}</TableCell>
                      <TableCell>{t.machinery?.driverName ?? '—'}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{t.totalHours.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{t.overtimeHours.toFixed(2)}</TableCell>
                      <TableCell className="max-w-[150px] truncate">
                        {t.machinery ? (
                          <span>
                            {t.machinery.machineryType}
                            <span className="text-xs text-muted-foreground ml-1">({t.machinery.plateNumber ?? '—'})</span>
                          </span>
                        ) : '—'}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-muted-foreground text-sm">
                        {t.notes ?? '—'}
                      </TableCell>
                      <TableCell>
                        {t.approvedBy ? (
                          <span className="inline-flex items-center gap-1 text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 px-2 py-0.5 rounded-full font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            Approved{t.approver ? ` by ${t.approver.name}` : ''}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-2 py-0.5 rounded-full font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                            Pending
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {!t.approvedBy && canApprove('timesheets') && (
                            <Button variant="ghost" size="sm" className="text-emerald-600" onClick={() => handleApprove(t.id)}>
                              Approve
                            </Button>
                          )}
                          {canEdit('timesheets') && (
                            <Button variant="ghost" size="icon" onClick={() => handleEdit(t)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {canDelete('timesheets') && (
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(t)}>
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="py-12 text-center">
              <Clock className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                {search ? 'No timesheets match your search' : 'No timesheets added yet'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {timesheets.length} of {total} timesheets
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button variant="outline" size="icon" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Form Dialog */}
      <TimesheetForm
        open={formOpen}
        onOpenChange={setFormOpen}
        editingTimesheet={editingTimesheet}
        onSuccess={handleFormSuccess}
      />

      {/* Batch Entry Dialog */}
      <BatchTimesheetForm
        open={batchFormOpen}
        onOpenChange={setBatchFormOpen}
        onSuccess={handleFormSuccess}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={(open) => setDeleteConfirm({ open, timesheet: open ? deleteConfirm.timesheet : null })}
        title="Delete Timesheet"
        description="Are you sure you want to delete this timesheet? This action cannot be undone."
        onConfirm={handleDeleteConfirm}
        confirmText="Delete"
        variant="destructive"
      />
    </div>
  );
}
