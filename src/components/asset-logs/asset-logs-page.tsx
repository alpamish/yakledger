'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAssetStore } from '@/hooks/use-asset-store';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { pdf } from '@react-pdf/renderer';
import { format } from 'date-fns';
import { settingsApi } from '@/services/settings';
import AssetLogsPDFDocument from '@/components/pdf/asset-logs-pdf-document';
import {
  ClipboardList,
  Plus,
  Trash2,
  Pencil,
  CheckCircle2,
  XCircle,
  Fuel,
  Clock,
  Route,
  Download,
  Loader2,
} from 'lucide-react';
import { AssetLogForm } from './asset-log-form';
import { assetsApi } from '@/services/asset-api';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import type { Asset, AssetLog, LogStatus } from '@/types/asset';
import { LOG_STATUS_LABELS } from '@/types/asset';

const statusColorMap: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-800 border-amber-200',
  APPROVED: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  REJECTED: 'bg-red-100 text-red-800 border-red-200',
};

export function AssetLogsPage() {
  const assetLogs = useAssetStore((s) => s.assetLogs);
  const assetLogPagination = useAssetStore((s) => s.assetLogPagination);
  const logStats = useAssetStore((s) => s.logStats);
  const fetchAssetLogs = useAssetStore((s) => s.fetchAssetLogs);
  const deleteAssetLog = useAssetStore((s) => s.deleteAssetLog);
  const approveAssetLog = useAssetStore((s) => s.approveAssetLog);
  const fetchLogStats = useAssetStore((s) => s.fetchLogStats);
  const setAssetLogPage = useAssetStore((s) => s.setAssetLogPage);
  const setAssetLogFilters = useAssetStore((s) => s.setAssetLogFilters);
  const editingLog = useAssetStore((s) => s.editingLog);
  const setEditingLog = useAssetStore((s) => s.setEditingLog);

  const [formOpen, setFormOpen] = useState(false);
  const [editFormOpen, setEditFormOpen] = useState(false);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetFilter, setAssetFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string | null }>({
    open: false,
    id: null,
  });
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [companyName, setCompanyName] = useState('YakhshiLedger');

  const loadData = useCallback(() => {
    fetchAssetLogs();
    fetchLogStats();
  }, [fetchAssetLogs, fetchLogStats]);

  useEffect(() => {
    loadData();
    assetsApi.getAll({ pageSize: 100 }).then((res) => {
      if (res.data) setAssets(res.data.data);
    });
    settingsApi.get().then((res) => {
      if (res.data?.companyName) setCompanyName(res.data.companyName);
    }).catch(() => {});
  }, [loadData]);

  useEffect(() => {
    setAssetLogFilters({
      assetId: assetFilter || undefined,
      status: statusFilter || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    });
    fetchAssetLogs();
  }, [assetFilter, statusFilter, dateFrom, dateTo, fetchAssetLogs, setAssetLogFilters]);

  const handleEdit = (log: AssetLog) => {
    setEditingLog(log);
    setEditFormOpen(true);
  };

  const handleApprove = async (id: string) => {
    try {
      await approveAssetLog(id, 'APPROVED');
      toast.success('Log approved');
      fetchLogStats();
    } catch {
      toast.error('Failed to approve');
    }
  };

  const handleReject = async (id: string) => {
    try {
      await approveAssetLog(id, 'REJECTED');
      toast.success('Log rejected');
      fetchLogStats();
    } catch {
      toast.error('Failed to reject');
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm.id) return;
    try {
      await deleteAssetLog(deleteConfirm.id);
      toast.success('Log entry deleted');
      fetchLogStats();
    } catch {
      toast.error('Failed to delete');
    }
    setDeleteConfirm({ open: false, id: null });
  };

  const handleDownloadPdf = async () => {
    if (assetLogs.length === 0) return;
    setIsGeneratingPdf(true);
    try {
      const blob = await pdf(
        <AssetLogsPDFDocument
          logs={assetLogs}
          stats={logStats}
          filters={{
            assetId: assetFilter || undefined,
            status: statusFilter || undefined,
            dateFrom: dateFrom || undefined,
            dateTo: dateTo || undefined,
          }}
          generatedAt={new Date()}
        />
      ).toBlob();

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `usage-logs-report-${format(new Date(), 'yyyy-MM-dd')}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to generate PDF:', error);
      toast.error('Failed to generate PDF');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-emerald-600" />
            Usage Logs
          </h2>
          <p className="text-sm text-muted-foreground">
            Daily usage logs for vehicles and machinery
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleDownloadPdf}
            disabled={isGeneratingPdf || assetLogs.length === 0}
          >
            {isGeneratingPdf ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            {isGeneratingPdf ? 'Generating...' : 'Download PDF'}
          </Button>
          <Button onClick={() => setFormOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            <Plus className="mr-2 h-4 w-4" />
            Add Log Entry
          </Button>
        </div>
        <Dialog open={formOpen} onOpenChange={setFormOpen}>
          <DialogContent className="sm:max-w-[550px]" onInteractOutside={(e) => e.preventDefault()}>
            <DialogHeader>
              <DialogTitle>New Usage Log Entry</DialogTitle>
            </DialogHeader>
            <AssetLogForm
              onSuccess={() => {
                setFormOpen(false);
                loadData();
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ClipboardList className="h-4 w-4" />
              <span>Total Logs</span>
            </div>
            <p className="text-2xl font-bold mt-1">{logStats?.totalLogs ?? '-'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Route className="h-4 w-4" />
              <span>Total Distance</span>
            </div>
            <p className="text-2xl font-bold mt-1">
              {logStats ? `${(logStats.totalDistance / 1000).toFixed(1)}k km` : '-'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Fuel className="h-4 w-4" />
              <span>Total Fuel</span>
            </div>
            <p className="text-2xl font-bold mt-1">
              {logStats ? `${logStats.totalFuelConsumed.toFixed(0)} L` : '-'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>Engine Hours</span>
            </div>
            <p className="text-2xl font-bold mt-1">
              {logStats ? `${logStats.totalEngineHours.toFixed(0)} h` : '-'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="w-full sm:w-[200px]">
          <Select value={assetFilter} onValueChange={(v) => { setAssetFilter(v); setAssetLogPage(1); }}>
            <SelectTrigger>
              <SelectValue placeholder="All Assets" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Assets</SelectItem>
              {assets
                .filter((a) => a.category === 'VEHICLE' || a.category === 'MACHINERY')
                .map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name} {a.plateNumber ? `(${a.plateNumber})` : ''}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        <div className="w-full sm:w-[180px]">
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setAssetLogPage(1); }}>
            <SelectTrigger>
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="APPROVED">Approved</SelectItem>
              <SelectItem value="REJECTED">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Input
          type="date"
          placeholder="From"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="w-full sm:w-[160px]"
        />
        <Input
          type="date"
          placeholder="To"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="w-full sm:w-[160px]"
        />
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Log Entries</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Asset</TableHead>
                <TableHead>Operator</TableHead>
                <TableHead>Distance</TableHead>
                <TableHead>Engine Hrs</TableHead>
                <TableHead>Fuel</TableHead>
                <TableHead>Site / Project</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assetLogs.map((l) => {
                const isPending = l.status === 'PENDING' || !l.status;
                return (
                  <TableRow key={l.id}>
                    <TableCell>
                      <div className="text-sm">{new Date(l.date).toLocaleDateString()}</div>
                      {(l.startTime || l.endTime) && (
                        <div className="text-xs text-muted-foreground">
                          {l.startTime} – {l.endTime}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{l.asset?.name}</div>
                      {l.asset?.plateNumber && (
                        <div className="text-xs text-muted-foreground">{l.asset.plateNumber}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{l.operator?.fullName || 'N/A'}</TableCell>
                    <TableCell>
                      {l.distanceTraveled !== null ? (
                        <span className="font-medium">{l.distanceTraveled.toFixed(0)} km</span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {l.engineHoursUsed !== null ? (
                        <span>{l.engineHoursUsed.toFixed(1)} h</span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {l.fuelConsumed !== null ? (
                        <span>{l.fuelConsumed.toFixed(0)} L</span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div>{l.workSite || '-'}</div>
                      {l.project && <div className="text-xs text-muted-foreground">{l.project}</div>}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`text-xs font-medium ${statusColorMap[l.status || 'PENDING'] || statusColorMap.PENDING}`}
                      >
                        {LOG_STATUS_LABELS[l.status as LogStatus] || l.status || 'Pending'}
                      </Badge>
                      {l.approvedBy && (
                        <div className="text-xs text-muted-foreground mt-1">by {l.approvedBy.name}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {isPending && (
                          <>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleApprove(l.id)} title="Approve">
                              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleReject(l.id)} title="Reject">
                              <XCircle className="h-4 w-4 text-red-500" />
                            </Button>
                          </>
                        )}
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(l)} title="Edit">
                          <Pencil className="h-4 w-4 text-blue-600" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setDeleteConfirm({ open: true, id: l.id })}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {assetLogs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    No usage logs
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {assetLogPagination.totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                onClick={() => {
                  if (assetLogPagination.page > 1) {
                    setAssetLogPage(assetLogPagination.page - 1);
                    fetchAssetLogs();
                  }
                }}
                className={assetLogPagination.page <= 1 ? 'pointer-events-none opacity-50' : ''}
              />
            </PaginationItem>
            {Array.from({ length: assetLogPagination.totalPages }, (_, i) => i + 1).map((p) => (
              <PaginationItem key={p}>
                <PaginationLink
                  isActive={p === assetLogPagination.page}
                  onClick={() => {
                    setAssetLogPage(p);
                    fetchAssetLogs();
                  }}
                >
                  {p}
                </PaginationLink>
              </PaginationItem>
            ))}
            <PaginationItem>
              <PaginationNext
                onClick={() => {
                  if (assetLogPagination.page < assetLogPagination.totalPages) {
                    setAssetLogPage(assetLogPagination.page + 1);
                    fetchAssetLogs();
                  }
                }}
                className={assetLogPagination.page >= assetLogPagination.totalPages ? 'pointer-events-none opacity-50' : ''}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}

      {/* Edit Dialog */}
      <Dialog open={editFormOpen} onOpenChange={(open) => { setEditFormOpen(open); if (!open) setEditingLog(null); }}>
        <DialogContent className="sm:max-w-[550px]" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Edit Usage Log Entry</DialogTitle>
          </DialogHeader>
          <AssetLogForm
            log={editingLog}
            onSuccess={() => {
              setEditFormOpen(false);
              setEditingLog(null);
              loadData();
            }}
          />
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={(open) => setDeleteConfirm({ open, id: open ? deleteConfirm.id : null })}
        title="Delete Log Entry"
        description="Are you sure you want to delete this usage log entry?"
        onConfirm={handleDelete}
        confirmText="Delete"
        variant="destructive"
      />
    </div>
  );
}
