'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import {
  ATTENDANCE_STATUSES,
  ATTENDANCE_STATUS_LABELS,
} from '@/types/employee';
import type { AttendanceStatus } from '@/types/employee';

export const ATTENDANCE_STATUS_SHORT: Record<AttendanceStatus, string> = {
  PRESENT: 'P',
  HALF_DAY: '½',
  ABSENT: 'A',
  LEAVE: 'L',
  HOLIDAY: 'H',
};

/** Solid colour used for the active segment of the status control. */
export const ATTENDANCE_STATUS_ACTIVE: Record<AttendanceStatus, string> = {
  PRESENT: 'bg-emerald-600 text-white border-emerald-600',
  HALF_DAY: 'bg-amber-500 text-white border-amber-500',
  ABSENT: 'bg-red-600 text-white border-red-600',
  LEAVE: 'bg-blue-600 text-white border-blue-600',
  HOLIDAY: 'bg-violet-600 text-white border-violet-600',
};

/** Soft tint used for calendar cells and row highlights. */
export const ATTENDANCE_STATUS_SOFT: Record<AttendanceStatus, string> = {
  PRESENT:
    'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  HALF_DAY:
    'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  ABSENT: 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30',
  LEAVE: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30',
  HOLIDAY:
    'bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30',
};

export const ATTENDANCE_STATUS_DOT: Record<AttendanceStatus, string> = {
  PRESENT: 'bg-emerald-500',
  HALF_DAY: 'bg-amber-500',
  ABSENT: 'bg-red-500',
  LEAVE: 'bg-blue-500',
  HOLIDAY: 'bg-violet-500',
};

interface AttendanceStatusControlProps {
  value: AttendanceStatus | null;
  onChange: (status: AttendanceStatus) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Five explicit status buttons. Deliberately not a click-to-cycle control:
 * cycling silently rewrote approved attendance when a user just wanted to look
 * at a day.
 */
export function AttendanceStatusControl({
  value,
  onChange,
  disabled = false,
  size = 'sm',
  className,
}: AttendanceStatusControlProps) {
  return (
    <div
      role="group"
      aria-label="Attendance status"
      className={cn(
        'inline-flex overflow-hidden rounded-md border bg-background',
        className
      )}
    >
      {ATTENDANCE_STATUSES.map((status, index) => {
        const active = value === status;
        return (
          <button
            key={status}
            type="button"
            aria-pressed={active}
            aria-label={ATTENDANCE_STATUS_LABELS[status]}
            title={ATTENDANCE_STATUS_LABELS[status]}
            disabled={disabled}
            onClick={() => onChange(status)}
            className={cn(
              'font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
              size === 'sm'
                ? 'h-7 flex-1 px-1.5 text-[10px] whitespace-nowrap'
                : 'h-8 flex-1 px-2 text-xs whitespace-nowrap',
              index > 0 && 'border-l',
              active
                ? ATTENDANCE_STATUS_ACTIVE[status]
                : 'text-muted-foreground hover:bg-muted'
            )}
          >
            <span className="hidden sm:inline">
              {ATTENDANCE_STATUS_LABELS[status]}
            </span>
            <span className="sm:hidden">{ATTENDANCE_STATUS_SHORT[status]}</span>
          </button>
        );
      })}
    </div>
  );
}
