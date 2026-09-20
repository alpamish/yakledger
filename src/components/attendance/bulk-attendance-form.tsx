'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
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
import { CalendarDays, Loader2, Info } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface BulkAttendanceFormProps {
  employeeIds: { id: string; fullName: string }[];
  onSuccess: () => void;
}

export function BulkAttendanceForm({
  employeeIds,
  onSuccess,
}: BulkAttendanceFormProps) {
  const [status, setStatus] = React.useState<AttendanceStatus>('PRESENT');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const today = format(new Date(), 'yyyy-MM-dd');
  const todayDisplay = format(new Date(), 'MMM dd, yyyy');

  const handleMarkAll = async () => {
    if (employeeIds.length === 0) {
      toast.error('No active employees available');
      return;
    }

    setIsSubmitting(true);
    try {
      const records = employeeIds.map((emp) => ({
        employeeId: emp.id,
        date: today,
        status,
      }));

      const res = await attendanceApi.bulkCreate(records);
      if (res.success) {
        const totalEmployees = employeeIds.length;
        toast.success(
          `Marked ${totalEmployees} employee(s) as ${ATTENDANCE_STATUS_LABELS[status]} for today`
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

  return (
    <div className="flex flex-wrap items-center gap-3 p-3 rounded-lg border bg-muted/30">
      <CalendarDays className="h-4 w-4 text-muted-foreground" />
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Date:</span>
        <span className="text-sm font-medium">{todayDisplay}</span>
        <span className="text-xs text-muted-foreground">(Today only)</span>
      </div>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Info className="h-3 w-3" />
        <span>Bulk marking is only available for the current date</span>
      </div>
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
          : `Mark All (${employeeIds.length}) for Today`}
      </Button>
    </div>
  );
}
