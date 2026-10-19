'use client';

import * as React from 'react';
import { addMonths, format, parse } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { AttendanceRecord, AttendanceStatus } from '@/types/employee';
import { ATTENDANCE_STATUSES, ATTENDANCE_STATUS_LABELS } from '@/types/employee';
import { formatDateOnly, todayDateOnly } from '@/lib/attendance-date';
import { formatShamsi } from '@/lib/shamsi';
import {
  ATTENDANCE_STATUS_DOT,
  ATTENDANCE_STATUS_SOFT,
} from './attendance-status-control';
import { cn } from '@/lib/utils';

interface AttendanceCalendarProps {
  records: AttendanceRecord[];
  month: string;
  onMonthChange: (month: string) => void;
  selectedDate: string;
  onSelectDate: (date: string) => void;
  isLoading?: boolean;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function AttendanceCalendar({
  records,
  month,
  onMonthChange,
  selectedDate,
  onSelectDate,
  isLoading = false,
}: AttendanceCalendarProps) {
  const monthDate = React.useMemo(
    () => parse(month, 'yyyy-MM', new Date()),
    [month]
  );
  const year = monthDate.getFullYear();
  const monthIndex = monthDate.getMonth();
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const today = todayDateOnly();

  const recordByDay = React.useMemo(() => {
    const map = new Map<string, AttendanceRecord>();
    for (const record of records) {
      map.set(formatDateOnly(record.date), record);
    }
    return map;
  }, [records]);

  const summary = React.useMemo(() => {
    const result = {
      present: 0,
      absent: 0,
      half: 0,
      leave: 0,
      holiday: 0,
      overtime: 0,
    };
    for (const record of records) {
      result.overtime += record.overtimeHours ?? 0;
      switch (record.status) {
        case 'PRESENT':
          result.present++;
          break;
        case 'ABSENT':
          result.absent++;
          break;
        case 'HALF_DAY':
          result.half++;
          break;
        case 'LEAVE':
          result.leave++;
          break;
        case 'HOLIDAY':
          result.holiday++;
          break;
      }
    }
    result.overtime = +result.overtime.toFixed(2);
    return result;
  }, [records]);

  const monthPrefix = `${String(year).padStart(4, '0')}-${String(monthIndex + 1).padStart(2, '0')}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            aria-label="Previous month"
            onClick={() =>
              onMonthChange(format(addMonths(monthDate, -1), 'yyyy-MM'))
            }
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-[10rem] text-center">
            <p className="text-sm font-semibold">{format(monthDate, 'MMMM yyyy')}</p>
            <p className="text-[11px] text-muted-foreground">
              {formatShamsi(monthDate, 'MMMM yyyy')}
            </p>
          </div>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            aria-label="Next month"
            onClick={() =>
              onMonthChange(format(addMonths(monthDate, 1), 'yyyy-MM'))
            }
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex flex-wrap gap-1.5 text-[11px]">
          <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-emerald-700 dark:text-emerald-300">
            {summary.present} present
          </span>
          <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-amber-700 dark:text-amber-300">
            {summary.half} half
          </span>
          <span className="rounded-full border border-red-500/25 bg-red-500/10 px-2 py-0.5 text-red-700 dark:text-red-300">
            {summary.absent} absent
          </span>
          <span className="rounded-full border border-blue-500/25 bg-blue-500/10 px-2 py-0.5 text-blue-700 dark:text-blue-300">
            {summary.leave} leave
          </span>
          <span className="rounded-full border border-violet-500/25 bg-violet-500/10 px-2 py-0.5 text-violet-700 dark:text-violet-300">
            {summary.holiday} holiday
          </span>
          <span className="rounded-full border border-orange-500/25 bg-orange-500/10 px-2 py-0.5 text-orange-700 dark:text-orange-300">
            {summary.overtime} OT h
          </span>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {DAY_NAMES.map((name) => (
          <div
            key={name}
            className="py-1 text-[11px] font-medium text-muted-foreground"
          >
            {name}
          </div>
        ))}
      </div>

      {isLoading && records.length === 0 ? (
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 35 }).map((_, index) => (
            <Skeleton key={index} className="h-14 rounded-md" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: firstWeekday }).map((_, index) => (
            <div key={`empty-${index}`} className="h-14" />
          ))}

          {Array.from({ length: daysInMonth }).map((_, index) => {
            const dayNumber = index + 1;
            const dayKey = `${monthPrefix}-${String(dayNumber).padStart(2, '0')}`;
            const record = recordByDay.get(dayKey);
            const status = (record?.status as AttendanceStatus | undefined) ?? null;
            const isSelected = selectedDate === dayKey;
            const isToday = today === dayKey;
            const weekday = new Date(year, monthIndex, dayNumber).getDay();
            const isWeekend = weekday === 5;

            return (
              <button
                key={dayKey}
                type="button"
                onClick={() => onSelectDate(dayKey)}
                aria-label={`${format(monthDate, 'MMMM')} ${dayNumber}, ${
                  status ? ATTENDANCE_STATUS_LABELS[status] : 'not marked'
                }`}
                aria-pressed={isSelected}
                className={cn(
                  'relative flex h-14 flex-col items-start justify-between rounded-md border p-1.5 text-left transition-colors',
                  status
                    ? ATTENDANCE_STATUS_SOFT[status]
                    : 'border-border/60 hover:bg-muted/60',
                  isWeekend && !status && 'bg-muted/30',
                  isSelected && 'ring-2 ring-emerald-500 ring-offset-1',
                  isToday && !isSelected && 'ring-1 ring-muted-foreground/40'
                )}
              >
                <span
                  className={cn(
                    'text-xs font-semibold tabular-nums',
                    isToday && 'text-emerald-700 dark:text-emerald-300'
                  )}
                >
                  {dayNumber}
                </span>

                {status && (
                  <span className="flex w-full items-center justify-between gap-1">
                    <span className="flex items-center gap-1 truncate text-[10px] font-medium">
                      <span
                        className={cn(
                          'inline-block h-1.5 w-1.5 shrink-0 rounded-full',
                          ATTENDANCE_STATUS_DOT[status]
                        )}
                      />
                      <span className="hidden truncate sm:inline">
                        {ATTENDANCE_STATUS_LABELS[status]}
                      </span>
                    </span>
                    {(record?.overtimeHours ?? 0) > 0 && (
                      <span className="text-[9px] font-semibold text-orange-600 dark:text-orange-400">
                        OT
                      </span>
                    )}
                  </span>
                )}

                {record?.approvalStatus === 'PENDING' && (
                  <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-amber-500" />
                )}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-muted-foreground">
        {ATTENDANCE_STATUSES.map((status) => (
          <span key={status} className="flex items-center gap-1.5">
            <span
              className={cn('inline-block h-2 w-2 rounded-full', ATTENDANCE_STATUS_DOT[status])}
            />
            {ATTENDANCE_STATUS_LABELS[status]}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
          Pending approval
        </span>
      </div>
    </div>
  );
}
