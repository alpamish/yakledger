'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AttendanceStatusControl, ATTENDANCE_STATUS_SOFT } from './attendance-status-control';
import { attendanceApi, ApiError } from '@/services/api';
import type {
  AttendanceBulkEntry,
  AttendanceDayResponse,
  AttendanceStatus,
} from '@/types/employee';
import { ATTENDANCE_STATUS_LABELS } from '@/types/employee';
import { todayDateOnly } from '@/lib/attendance-date';
import { CheckCheck, Info, Loader2, Search, Users } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface BulkAttendanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Roster date to preload. */
  initialDate: string;
  onSaved: (date: string) => void;
}

export function BulkAttendanceDialog({
  open,
  onOpenChange,
  initialDate,
  onSaved,
}: BulkAttendanceDialogProps) {
  const [date, setDate] = React.useState(initialDate || todayDateOnly());
  const [data, setData] = React.useState<AttendanceDayResponse | null>(null);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [status, setStatus] = React.useState<AttendanceStatus>('PRESENT');
  const [checkIn, setCheckIn] = React.useState('07:00');
  const [checkOut, setCheckOut] = React.useState('18:00');
  const [overtime, setOvertime] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const requestRef = React.useRef(0);

  const load = React.useCallback(async (day: string) => {
    const requestId = ++requestRef.current;
    setIsLoading(true);
    try {
      const res = await attendanceApi.getDay(day);
      if (requestId !== requestRef.current) return;
      if (res.success && res.data) {
        setData(res.data);
        // Default to the people who are not marked yet.
        setSelected(
          new Set(
            res.data.rows.filter((row) => !row.record).map((row) => row.employee.id)
          )
        );
      }
    } catch (error) {
      if (requestId !== requestRef.current) return;
      toast.error(
        error instanceof ApiError ? error.message : 'Failed to load the roster'
      );
    } finally {
      if (requestId === requestRef.current) setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!open) return;
    setDate(initialDate || todayDateOnly());
    setSearch('');
    setStatus('PRESENT');
    setOvertime('');
    load(initialDate || todayDateOnly());
  }, [open, initialDate, load]);

  const handleDateChange = (value: string) => {
    setDate(value);
    if (value) load(value);
  };

  const visibleRows = React.useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data.rows;
    return data.rows.filter(
      (row) =>
        row.employee.fullName.toLowerCase().includes(q) ||
        row.employee.jobTitle?.toLowerCase().includes(q) ||
        row.employee.department?.toLowerCase().includes(q)
    );
  }, [data, search]);

  const toggle = (employeeId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(employeeId)) next.delete(employeeId);
      else next.add(employeeId);
      return next;
    });
  };

  const allVisibleSelected =
    visibleRows.length > 0 &&
    visibleRows.every((row) => selected.has(row.employee.id));

  const toggleAllVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        visibleRows.forEach((row) => next.delete(row.employee.id));
      } else {
        visibleRows.forEach((row) => next.add(row.employee.id));
      }
      return next;
    });
  };

  const workingStatus = status === 'PRESENT' || status === 'HALF_DAY';

  const handleSave = async () => {
    if (selected.size === 0) {
      toast.error('Select at least one employee');
      return;
    }

    const records: AttendanceBulkEntry[] = Array.from(selected).map((employeeId) => ({
      employeeId,
      date,
      status,
      ...(workingStatus
        ? {
            ...(overtime.trim() === ''
              ? {}
              : { overtimeHours: Number(overtime) }),
            checkInTime: checkIn || null,
            checkOutTime: checkOut || null,
          }
        : { checkInTime: null, checkOutTime: null, overtimeHours: 0 }),
    }));

    setIsSaving(true);
    try {
      const res = await attendanceApi.bulkCreate(records);
      if (res.success && res.data) {
        toast.success(
          `${res.data.created} marked, ${res.data.updated} updated as ${ATTENDANCE_STATUS_LABELS[status]}`
        );
        onSaved(date);
        onOpenChange(false);
      } else {
        toast.error(res.error ?? 'Failed to mark attendance');
      }
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : 'Failed to mark attendance'
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            Mark attendance in bulk
          </DialogTitle>
          <DialogDescription>
            Pick a date, a status and the employees. Any date can be marked —
            past days included.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Date</label>
              <Input
                type="date"
                value={date}
                onChange={(event) => handleDateChange(event.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Status</label>
              <div>
                <AttendanceStatusControl
                  value={status}
                  onChange={setStatus}
                  size="md"
                  className="w-full justify-between"
                />
              </div>
            </div>
          </div>

          {workingStatus && (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Check in</label>
                <Input
                  type="time"
                  value={checkIn}
                  onChange={(event) => setCheckIn(event.target.value)}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Check out</label>
                <Input
                  type="time"
                  value={checkOut}
                  onChange={(event) => setCheckOut(event.target.value)}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Overtime (h)
                </label>
                <Input
                  type="number"
                  min="0"
                  step="0.5"
                  value={overtime}
                  placeholder="auto"
                  onChange={(event) => setOvertime(event.target.value)}
                  className="h-9"
                />
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[180px] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Filter employees..."
                className="h-8 pl-8 text-xs"
              />
            </div>
            <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={toggleAllVisible}>
              <CheckCheck className="mr-1 h-3 w-3" />
              {allVisibleSelected ? 'Clear all' : 'Select all'}
            </Button>
            <span className="text-xs text-muted-foreground">
              {selected.size} selected
            </span>
          </div>

          <div className="max-h-72 overflow-y-auto rounded-md border">
            {isLoading ? (
              <div className="space-y-2 p-3">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Skeleton key={index} className="h-8 w-full" />
                ))}
              </div>
            ) : visibleRows.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                No active employees match this filter.
              </p>
            ) : (
              visibleRows.map((row) => {
                const checked = selected.has(row.employee.id);
                const existingStatus = (row.record?.status as AttendanceStatus | undefined) ?? null;
                return (
                  <label
                    key={row.employee.id}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 border-b px-3 py-2 last:border-b-0 hover:bg-muted/40',
                      checked && 'bg-emerald-500/5'
                    )}
                  >
                    <Checkbox checked={checked} onCheckedChange={() => toggle(row.employee.id)} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{row.employee.fullName}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {row.employee.jobTitle}
                        {row.employee.department ? ` · ${row.employee.department}` : ''}
                      </p>
                    </div>
                    {existingStatus ? (
                      <Badge
                        variant="outline"
                        className={cn('border text-xs', ATTENDANCE_STATUS_SOFT[existingStatus])}
                      >
                        {ATTENDANCE_STATUS_LABELS[existingStatus]}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">Not marked</span>
                    )}
                  </label>
                );
              })
            )}
          </div>

          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            Existing records are updated, not duplicated. Non-admin edits return to
            pending approval before they reach payroll.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || isLoading || selected.size === 0}
            className="bg-emerald-600 text-white hover:bg-emerald-700"
          >
            {isSaving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Save {selected.size > 0 ? selected.size : ''} record{selected.size === 1 ? '' : 's'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
