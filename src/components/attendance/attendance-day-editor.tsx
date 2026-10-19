'use client';

import * as React from 'react';
import { format, parse } from 'date-fns';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ApprovalStatusBadge } from '@/components/common/approval-status-badge';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { AttendanceStatusControl } from './attendance-status-control';
import { attendanceApi, ApiError } from '@/services/api';
import type { AttendanceRecord, AttendanceStatus } from '@/types/employee';
import { ATTENDANCE_STATUS_LABELS } from '@/types/employee';
import { toClockTime } from '@/lib/attendance-date';
import { CalendarDays, Info, Loader2, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface AttendanceDayEditorProps {
  employeeId: string;
  employeeName: string;
  date: string;
  record: AttendanceRecord | null;
  workStartTime?: string | null;
  workEndTime?: string | null;
  canManage: boolean;
  canDelete: boolean;
  onSaved: () => void;
  onDeleted: () => void;
}

export function AttendanceDayEditor({
  employeeId,
  employeeName,
  date,
  record,
  workStartTime,
  workEndTime,
  canManage,
  canDelete,
  onSaved,
  onDeleted,
}: AttendanceDayEditorProps) {
  const [status, setStatus] = React.useState<AttendanceStatus>('PRESENT');
  const [checkIn, setCheckIn] = React.useState('');
  const [checkOut, setCheckOut] = React.useState('');
  const [overtime, setOvertime] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [isSaving, setIsSaving] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  React.useEffect(() => {
    if (record) {
      setStatus((record.status as AttendanceStatus) ?? 'PRESENT');
      setCheckIn(record.checkInTime ? toClockTime(record.checkInTime) : '');
      setCheckOut(record.checkOutTime ? toClockTime(record.checkOutTime) : '');
      setOvertime(String(record.overtimeHours ?? 0));
      setNotes(record.notes ?? '');
    } else {
      setStatus('PRESENT');
      setCheckIn(workStartTime ?? '');
      setCheckOut(workEndTime ?? '');
      setOvertime('');
      setNotes('');
    }
  }, [record, date, employeeId, workStartTime, workEndTime]);

  const working = status === 'PRESENT' || status === 'HALF_DAY';

  const handleSave = async () => {
    if (!working) {
      setCheckIn('');
      setCheckOut('');
    }

    const payload = {
      status,
      notes: notes.trim() ? notes : null,
      ...(working
        ? {
            checkInTime: checkIn || null,
            checkOutTime: checkOut || null,
            ...(overtime.trim() === ''
              ? {}
              : { overtimeHours: Number(overtime) }),
          }
        : { checkInTime: null, checkOutTime: null, overtimeHours: 0 }),
    };

    setIsSaving(true);
    try {
      const res = record
        ? await attendanceApi.update(record.id, payload)
        : await attendanceApi.create({ employeeId, date, ...payload });
      if (res.success) {
        toast.success(
          `${ATTENDANCE_STATUS_LABELS[status]} saved for ${format(
            parse(date, 'yyyy-MM-dd', new Date()),
            'MMM d'
          )}`
        );
        onSaved();
      } else {
        toast.error(res.error ?? 'Failed to save attendance');
      }
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : 'Failed to save attendance'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!record) return;
    setIsDeleting(true);
    try {
      const res = await attendanceApi.delete(record.id);
      if (res.success) {
        toast.success('Attendance record deleted');
        onDeleted();
      } else {
        toast.error(res.error ?? 'Failed to delete attendance');
      }
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : 'Failed to delete attendance'
      );
    } finally {
      setIsDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              {record ? 'Edit day' : 'Mark day'}
            </CardTitle>
            <CardDescription>
              {employeeName} ·{' '}
              {format(parse(date, 'yyyy-MM-dd', new Date()), 'EEEE, MMM d, yyyy')}
            </CardDescription>
          </div>
          <ApprovalStatusBadge status={record?.approvalStatus} />
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Status</label>
          <AttendanceStatusControl
            value={status}
            onChange={(next) => {
              setStatus(next);
              if ((next === 'PRESENT' || next === 'HALF_DAY') && !checkIn) {
                setCheckIn(workStartTime ?? '');
                setCheckOut(workEndTime ?? '');
              }
            }}
            size="md"
            disabled={!canManage}
            className="w-full justify-between"
          />
        </div>

        {working && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Check in</label>
              <Input
                type="time"
                value={checkIn}
                disabled={!canManage}
                onChange={(event) => setCheckIn(event.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Check out</label>
              <Input
                type="time"
                value={checkOut}
                disabled={!canManage}
                onChange={(event) => setCheckOut(event.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Overtime (hours)
              </label>
              <Input
                type="number"
                min="0"
                step="0.5"
                value={overtime}
                disabled={!canManage}
                placeholder="auto"
                onChange={(event) => setOvertime(event.target.value)}
                className="h-9"
              />
              <p className="text-[11px] text-muted-foreground">
                Leave blank to compute from the work schedule.
              </p>
            </div>
            {record?.workedHours !== undefined && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Worked hours
                </label>
                <div className="flex h-9 items-center rounded-md border bg-muted/40 px-3 text-sm tabular-nums">
                  {(record.workedHours ?? 0).toFixed(2)} h
                </div>
              </div>
            )}
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Notes</label>
          <Textarea
            value={notes}
            disabled={!canManage}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Optional note for this day..."
            rows={2}
            className="min-h-[60px] text-sm"
          />
        </div>

        {!record && (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            This day is not marked yet. Saving creates a new record.
          </p>
        )}

        {record?.approvalStatus === 'PENDING' && (
          <p className="flex items-start gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-xs text-amber-800 dark:text-amber-300">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Pending approval — payroll picks this day up once an approver
            accepts it on the Approvals page.
          </p>
        )}

        <div className="flex items-center justify-between gap-2">
          {record && canDelete ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-red-600 hover:text-red-700 dark:text-red-400"
              onClick={() => setConfirmDelete(true)}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="mr-1 h-3.5 w-3.5" />
              )}
              Delete
            </Button>
          ) : (
            <span />
          )}

          <Button
            type="button"
            size="sm"
            className="bg-emerald-600 text-white hover:bg-emerald-700"
            onClick={handleSave}
            disabled={!canManage || isSaving}
          >
            {isSaving ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="mr-1 h-3.5 w-3.5" />
            )}
            {record ? 'Update day' : 'Save day'}
          </Button>
        </div>
      </CardContent>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete attendance record"
        description={`Remove ${employeeName}'s attendance for ${date}? This cannot be undone.`}
        confirmText="Delete"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </Card>
  );
}
