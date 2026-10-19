'use client';

import * as React from 'react';
import { format } from 'date-fns';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ApprovalStatusBadge } from '@/components/common/approval-status-badge';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import {
  AttendanceStatusControl,
  ATTENDANCE_STATUS_SOFT,
} from './attendance-status-control';
import { attendanceApi, ApiError } from '@/services/api';
import type { AttendanceRecord, AttendanceStatus } from '@/types/employee';
import {
  ATTENDANCE_STATUSES,
  ATTENDANCE_STATUS_LABELS,
} from '@/types/employee';
import {
  endOfMonthDateOnly,
  parseDateOnly,
  startOfMonthDateOnly,
  toClockTime,
  todayDateOnly,
} from '@/lib/attendance-date';
import { Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface AttendanceRecordsTabProps {
  canManage: boolean;
  canDelete: boolean;
}

export function AttendanceRecordsTab({
  canManage,
  canDelete,
}: AttendanceRecordsTabProps) {
  const today = todayDateOnly();
  const [dateFrom, setDateFrom] = React.useState(startOfMonthDateOnly(today));
  const [dateTo, setDateTo] = React.useState(endOfMonthDateOnly(today));
  const [status, setStatus] = React.useState<string>('ALL');
  const [searchInput, setSearchInput] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [page, setPage] = React.useState(1);
  const pageSize = 20;

  const [records, setRecords] = React.useState<AttendanceRecord[]>([]);
  const [total, setTotal] = React.useState(0);
  const [isLoading, setIsLoading] = React.useState(true);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<AttendanceRecord | null>(null);
  const requestRef = React.useRef(0);

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const load = React.useCallback(async () => {
    const requestId = ++requestRef.current;
    setIsLoading(true);
    try {
      const res = await attendanceApi.getAll({
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        status: status === 'ALL' ? undefined : (status as AttendanceStatus),
        search: search || undefined,
        page,
        pageSize,
      });
      if (requestId !== requestRef.current) return;
      if (res.success && res.data) {
        setRecords(res.data.data);
        setTotal(res.data.total);
      }
    } catch (error) {
      if (requestId !== requestRef.current) return;
      toast.error(
        error instanceof ApiError ? error.message : 'Failed to load attendance records'
      );
    } finally {
      if (requestId === requestRef.current) setIsLoading(false);
    }
  }, [dateFrom, dateTo, status, search, page]);

  React.useEffect(() => {
    load();
  }, [load]);

  const mergeRecord = (updated: AttendanceRecord) => {
    setRecords((prev) =>
      prev.map((record) => (record.id === updated.id ? { ...record, ...updated } : record))
    );
  };

  const handleStatusChange = async (record: AttendanceRecord, next: AttendanceStatus) => {
    setBusyId(record.id);
    try {
      const res = await attendanceApi.update(record.id, { status: next });
      if (res.success && res.data) {
        mergeRecord(res.data);
        toast.success(`Status set to ${ATTENDANCE_STATUS_LABELS[next]}`);
      } else {
        toast.error(res.error ?? 'Failed to update status');
      }
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : 'Failed to update status'
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleOvertimeChange = async (record: AttendanceRecord, value: string) => {
    const parsed = Math.max(0, Number(value));
    if (Number.isNaN(parsed) || parsed === (record.overtimeHours ?? 0)) return;

    setBusyId(record.id);
    try {
      const res = await attendanceApi.update(record.id, { overtimeHours: parsed });
      if (res.success && res.data) {
        mergeRecord(res.data);
        toast.success('Overtime updated');
      } else {
        toast.error(res.error ?? 'Failed to update overtime');
      }
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : 'Failed to update overtime'
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    const record = pendingDelete;
    try {
      const res = await attendanceApi.delete(record.id);
      if (res.success) {
        toast.success('Attendance record deleted');
        setPendingDelete(null);
        load();
      } else {
        toast.error(res.error ?? 'Failed to delete record');
      }
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : 'Failed to delete record'
      );
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Attendance records</CardTitle>
        <CardDescription>
          Approved and rejected records. Pending entries are handled on the
          Approvals page.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">From</label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(event) => {
                setDateFrom(event.target.value);
                setPage(1);
              }}
              className="h-8 w-36 text-xs"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">To</label>
            <Input
              type="date"
              value={dateTo}
              onChange={(event) => {
                setDateTo(event.target.value);
                setPage(1);
              }}
              className="h-8 w-36 text-xs"
            />
          </div>
          <Select
            value={status}
            onValueChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-8 w-32 text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL" className="text-xs">
                All statuses
              </SelectItem>
              {ATTENDANCE_STATUSES.map((value) => (
                <SelectItem key={value} value={value} className="text-xs">
                  {ATTENDANCE_STATUS_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative min-w-[180px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search employee..."
              className="h-8 pl-8 text-xs"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
            <Search className="mb-2 h-8 w-8" />
            <p className="text-sm">No attendance records found</p>
            <p className="text-xs">
              Try a different date range or mark the day from the roster.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Date</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead className="w-64">Status</TableHead>
                  <TableHead className="w-24">In / Out</TableHead>
                  <TableHead className="w-20 text-right">OT</TableHead>
                  <TableHead className="w-24">Approval</TableHead>
                  <TableHead className="w-14" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((record) => {
                  const employeeName = record.employee?.fullName ?? '—';
                  const statusValue = record.status as AttendanceStatus;
                  const working =
                    statusValue === 'PRESENT' || statusValue === 'HALF_DAY';
                  return (
                    <TableRow key={record.id} className={cn(busyId === record.id && 'opacity-60')}>
                      <TableCell className="font-mono text-xs">
                        {format(
                          parseDateOnly(record.date) ?? new Date(record.date),
                          'MMM d, yyyy'
                        )}
                      </TableCell>
                      <TableCell>
                        <p className="text-sm font-medium">{employeeName}</p>
                        <p className="text-xs text-muted-foreground">
                          {record.employee?.jobTitle}
                          {record.employee?.department
                            ? ` · ${record.employee.department}`
                            : ''}
                        </p>
                      </TableCell>
                      <TableCell>
                        {canManage ? (
                          <AttendanceStatusControl
                            value={statusValue}
                            disabled={busyId === record.id}
                            onChange={(next) => handleStatusChange(record, next)}
                          />
                        ) : (
                          <Badge
                            variant="outline"
                            className={cn('border text-xs', ATTENDANCE_STATUS_SOFT[statusValue])}
                          >
                            {ATTENDANCE_STATUS_LABELS[statusValue] ?? record.status}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {working && (record.checkInTime || record.checkOutTime)
                          ? `${record.checkInTime ? toClockTime(record.checkInTime) : '—'} – ${
                              record.checkOutTime ? toClockTime(record.checkOutTime) : '—'
                            }`
                          : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        {canManage && working ? (
                          <Input
                            type="number"
                            min="0"
                            step="0.5"
                            key={`ot-${record.id}-${record.overtimeHours ?? 0}`}
                            defaultValue={record.overtimeHours ?? 0}
                            disabled={busyId === record.id}
                            className="ml-auto h-7 w-16 px-1 text-right text-[11px]"
                            onBlur={(event) => handleOvertimeChange(record, event.target.value)}
                          />
                        ) : (
                          <span className="text-xs tabular-nums">
                            {(record.overtimeHours ?? 0).toFixed(1)} h
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <ApprovalStatusBadge status={record.approvalStatus} />
                      </TableCell>
                      <TableCell className="text-right">
                        {canDelete && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-red-600"
                            onClick={() => setPendingDelete(record)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {total > 0 && (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                disabled={page <= 1 || isLoading}
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              >
                Previous
              </Button>
              <span className="px-2">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                disabled={page >= totalPages || isLoading}
                onClick={() => setPage((prev) => prev + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </CardContent>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Delete attendance record"
        description={`Delete ${pendingDelete?.employee?.fullName ?? 'this'} attendance for ${
          pendingDelete ? format(new Date(pendingDelete.date), 'MMM d, yyyy') : ''
        }?`}
        confirmText="Delete"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </Card>
  );
}
