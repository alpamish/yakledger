'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ATTENDANCE_STATUSES,
  ATTENDANCE_STATUS_LABELS,
  ATTENDANCE_STATUS_COLORS,
} from '@/types/employee';
import type { AttendanceStatus } from '@/types/employee';
import { attendanceApi } from '@/services/api';
import { CalendarDays, Loader2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { format, eachDayOfInterval, parse } from 'date-fns';

function getDatesInRange(from: string, to: string): string[] {
  const start = parse(from, 'yyyy-MM-dd', new Date());
  const end = parse(to, 'yyyy-MM-dd', new Date());
  const days = eachDayOfInterval({ start, end });
  return days.map((d) => format(d, 'yyyy-MM-dd'));
}

interface BulkAttendanceFormProps {
  employeeIds: { id: string; fullName: string }[];
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (date: string) => void;
  onDateToChange: (date: string) => void;
  onSuccess: () => void;
}

export function BulkAttendanceForm({
  employeeIds,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  onSuccess,
}: BulkAttendanceFormProps) {
  const [status, setStatus] = React.useState<AttendanceStatus>('PRESENT');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const handleMarkAll = async () => {
    if (employeeIds.length === 0) {
      toast.error('No active employees available');
      return;
    }

    const dates = dateTo
      ? getDatesInRange(dateFrom, dateTo)
      : [dateFrom || format(new Date(), 'yyyy-MM-dd')];

    if (dates.length === 0) {
      toast.error('Invalid date range');
      return;
    }

    setIsSubmitting(true);
    try {
      const records = employeeIds.flatMap((emp) =>
        dates.map((d) => ({
          employeeId: emp.id,
          date: d,
          status,
        }))
      );

      const res = await attendanceApi.bulkCreate(records);
      if (res.success) {
        const totalEmployees = employeeIds.length;
        const totalDays = dates.length;
        toast.success(
          `Marked ${totalEmployees} employee(s) × ${totalDays} day(s) as ${ATTENDANCE_STATUS_LABELS[status]}`
        );
        onSuccess();
      } else {
        toast.error(res.error ?? 'Failed to mark attendance');
      }
    } catch {
      toast.error('Failed to mark attendance');
    } finally {
      setIsSubmitting(false);
    }
  };

  const datesCount = dateTo ? getDatesInRange(dateFrom, dateTo).length : 1;
  const totalRecords = employeeIds.length * datesCount;

  return (
    <div className="flex flex-wrap items-end gap-2 p-3 rounded-lg border bg-muted/30">
      <CalendarDays className="h-4 w-4 text-muted-foreground mb-1" />
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">From</label>
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => onDateFromChange(e.target.value)}
          className="h-8 w-36 text-xs"
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">To</label>
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => onDateToChange(e.target.value)}
          className="h-8 w-36 text-xs"
          placeholder="Same day"
        />
      </div>
      {dateTo && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs"
          onClick={() => onDateToChange('')}
        >
          <RotateCcw className="h-3 w-3 mr-1" />
          Single day
        </Button>
      )}
      <Select value={status} onValueChange={(v) => setStatus(v as AttendanceStatus)}>
        <SelectTrigger className="h-8 w-28 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ATTENDANCE_STATUSES.map((s) => {
            const c = ATTENDANCE_STATUS_COLORS[s];
            return (
              <SelectItem key={s} value={s} className="text-xs">
                <span className="inline-block h-2 w-2 rounded-full mr-2" style={{ backgroundColor: c }} />
                {ATTENDANCE_STATUS_LABELS[s]}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
      <Button
        size="sm"
        className="h-8 text-xs"
        onClick={handleMarkAll}
        disabled={isSubmitting || employeeIds.length === 0}
      >
        {isSubmitting ? (
          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
        ) : null}
        {isSubmitting
          ? 'Marking...'
          : `Mark All (${employeeIds.length} × ${datesCount}d)`}
      </Button>
    </div>
  );
}
