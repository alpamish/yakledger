'use client';

import * as React from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, parse, addMonths, subMonths, isToday } from 'date-fns';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { AttendanceRecord, AttendanceStatus } from '@/types/employee';
import { ATTENDANCE_STATUS_COLORS, ATTENDANCE_STATUS_LABELS } from '@/types/employee';

interface AttendanceCalendarProps {
  records: AttendanceRecord[];
  selectedDate: Date | null;
  onSelectDate: (date: Date) => void;
  currentMonth: string;
  onMonthChange: (month: string) => void;
}

const STATUS_BG_COLORS: Record<AttendanceStatus, string> = {
  PRESENT: 'bg-emerald-500',
  ABSENT: 'bg-red-500',
  HALF_DAY: 'bg-amber-400',
  LEAVE: 'bg-blue-500',
  HOLIDAY: 'bg-violet-500',
};

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function AttendanceCalendar({
  records,
  selectedDate,
  onSelectDate,
  currentMonth,
  onMonthChange,
}: AttendanceCalendarProps) {
  const monthDate = parse(currentMonth, 'yyyy-MM', new Date());
  const start = startOfMonth(monthDate);
  const end = endOfMonth(monthDate);
  const days = eachDayOfInterval({ start, end });

  const startDayOfWeek = start.getDay();

  const getStatusForDate = (date: Date): AttendanceStatus | null => {
    const record = records.find((r) => isSameDay(new Date(r.date), date));
    return record ? (record.status as AttendanceStatus) : null;
  };

  const getOvertimeForDate = (date: Date): number => {
    const record = records.find((r) => isSameDay(new Date(r.date), date));
    return record?.overtimeHours ?? 0;
  };

  return (
    <div className="space-y-3">
      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onMonthChange(format(subMonths(monthDate, 1), 'yyyy-MM'))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-semibold">{format(monthDate, 'MMMM yyyy')}</span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onMonthChange(format(addMonths(monthDate, 1), 'yyyy-MM'))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Day names */}
      <div className="grid grid-cols-7 gap-1 text-center">
        {DAY_NAMES.map((name) => (
          <div key={name} className="text-xs text-muted-foreground py-1 font-medium">
            {name}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {/* Empty cells for days before month starts */}
        {Array.from({ length: startDayOfWeek }).map((_, i) => (
          <div key={`empty-${i}`} className="h-9" />
        ))}

        {days.map((day) => {
          const status = getStatusForDate(day);
          const overtime = getOvertimeForDate(day);
          const isSelected = selectedDate && isSameDay(day, selectedDate);
          const today = isToday(day);

          return (
            <button
              key={day.toISOString()}
              onClick={() => onSelectDate(day)}
              className={`h-9 rounded-md text-xs font-medium flex flex-col items-center justify-center transition-colors relative ${
                isSelected
                  ? 'ring-2 ring-emerald-500 ring-offset-1'
                  : 'hover:bg-muted'
              } ${today && !isSelected ? 'ring-1 ring-muted-foreground/30' : ''}`}
            >
              <span className={today ? 'font-bold' : ''}>{format(day, 'd')}</span>
              {status && (
                <span
                  className={`absolute bottom-1 h-1.5 w-1.5 rounded-full ${STATUS_BG_COLORS[status]}`}
                />
              )}
              {overtime > 0 && (
                <span className="absolute top-0.5 right-0.5 text-[8px] font-bold text-orange-500">
                  OT
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 pt-2 text-xs text-muted-foreground">
        {(Object.keys(ATTENDANCE_STATUS_COLORS) as AttendanceStatus[]).map((status) => (
          <div key={status} className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${STATUS_BG_COLORS[status]}`} />
            {ATTENDANCE_STATUS_LABELS[status]}
          </div>
        ))}
      </div>
    </div>
  );
}
