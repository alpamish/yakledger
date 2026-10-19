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
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ApprovalStatusBadge } from '@/components/common/approval-status-badge';
import { AttendanceStatusControl, ATTENDANCE_STATUS_SOFT } from './attendance-status-control';
import { BulkAttendanceDialog } from './bulk-attendance-dialog';
import { attendanceApi, ApiError } from '@/services/api';
import type {
  AttendanceBulkEntry,
  AttendanceDayResponse,
  AttendanceDayRow,
  AttendanceStatus,
} from '@/types/employee';
import { ATTENDANCE_STATUS_LABELS } from '@/types/employee';
import {
  addDateOnlyDays,
  todayDateOnly,
  toClockTime,
} from '@/lib/attendance-date';
import {
  CalendarDays,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Info,
  Loader2,
  RotateCcw,
  Save,
  Search,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Draft {
  status: AttendanceStatus | null;
  overtime: string;
  checkIn: string;
  checkOut: string;
  notes: string;
}

interface AttendanceRosterProps {
  date: string;
  onDateChange: (date: string) => void;
  canManage: boolean;
  onOpenCalendar: (employeeId: string) => void;
}

function baseline(row: AttendanceDayRow): Draft {
  const record = row.record;
  return {
    status: (record?.status as AttendanceStatus | undefined) ?? null,
    overtime: record ? String(record.overtimeHours ?? 0) : '',
    checkIn: record?.checkInTime ? toClockTime(record.checkInTime) : '',
    checkOut: record?.checkOutTime ? toClockTime(record.checkOutTime) : '',
    notes: record?.notes ?? '',
  };
}

function draftFromRow(row: AttendanceDayRow): Draft {
  const base = baseline(row);
  return {
    ...base,
    status: base.status ?? 'PRESENT',
    checkIn: base.checkIn || row.employee.workStartTime || '',
    checkOut: base.checkOut || row.employee.workEndTime || '',
  };
}

function isWorking(status: AttendanceStatus | null): boolean {
  return status === 'PRESENT' || status === 'HALF_DAY';
}

export function AttendanceRoster({
  date,
  onDateChange,
  canManage,
  onOpenCalendar,
}: AttendanceRosterProps) {
  const [data, setData] = React.useState<AttendanceDayResponse | null>(null);
  const [drafts, setDrafts] = React.useState<Record<string, Draft>>({});
  const [search, setSearch] = React.useState('');
  const [department, setDepartment] = React.useState('ALL');
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);
  const [bulkOpen, setBulkOpen] = React.useState(false);
  const requestRef = React.useRef(0);

  const load = React.useCallback(async (day: string) => {
    const requestId = ++requestRef.current;
    setIsLoading(true);
    try {
      const res = await attendanceApi.getDay(day);
      if (requestId !== requestRef.current) return;
      if (res.success && res.data) {
        setData(res.data);
        setDrafts({});
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
    load(date);
  }, [date, load]);

  const departments = React.useMemo(() => {
    const set = new Set<string>();
    data?.rows.forEach((row) => {
      if (row.employee.department) set.add(row.employee.department);
    });
    return Array.from(set).sort();
  }, [data]);

  const deferredSearch = React.useDeferredValue(search);

  const visibleRows = React.useMemo(() => {
    if (!data) return [];
    const q = deferredSearch.trim().toLowerCase();
    return data.rows.filter((row) => {
      if (department !== 'ALL' && row.employee.department !== department) return false;
      if (!q) return true;
      return (
        row.employee.fullName.toLowerCase().includes(q) ||
        row.employee.jobTitle?.toLowerCase().includes(q) ||
        row.employee.department?.toLowerCase().includes(q)
      );
    });
  }, [data, deferredSearch, department]);

  const setDraft = React.useCallback((row: AttendanceDayRow, patch: Partial<Draft>) => {
    setDrafts((prev) => {
      const current = prev[row.employee.id] ?? draftFromRow(row);
      return { ...prev, [row.employee.id]: { ...current, ...patch } };
    });
  }, []);

  const isDirty = React.useCallback(
    (row: AttendanceDayRow) => {
      const draft = drafts[row.employee.id];
      if (!draft) return false;
      const base = baseline(row);
      return (
        draft.status !== base.status ||
        draft.overtime.trim() !== base.overtime ||
        draft.checkIn !== base.checkIn ||
        draft.checkOut !== base.checkOut ||
        draft.notes !== base.notes
      );
    },
    [drafts]
  );

  const dirtyRows = React.useMemo(
    () => (data ? data.rows.filter((row) => isDirty(row)) : []),
    [data, isDirty]
  );

  const counts = React.useMemo(() => {
    const result = {
      present: 0,
      absent: 0,
      half: 0,
      leave: 0,
      holiday: 0,
      unmarked: 0,
      overtime: 0,
    };
    for (const row of data?.rows ?? []) {
      const draft = drafts[row.employee.id];
      const status =
        draft?.status ?? ((row.record?.status as AttendanceStatus | undefined) ?? null);
      switch (status) {
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
        default:
          result.unmarked++;
      }
      const ot = draft ? draft.overtime : row.record ? String(row.record.overtimeHours ?? 0) : '';
      result.overtime += Number(ot) || 0;
    }
    result.overtime = +result.overtime.toFixed(2);
    return result;
  }, [data, drafts]);

  const fillUnmarkedPresent = () => {
    if (!data) return;
    setDrafts((prev) => {
      const next = { ...prev };
      for (const row of data.rows) {
        if (row.record || next[row.employee.id]) continue;
        next[row.employee.id] = { ...draftFromRow(row), status: 'PRESENT' };
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (dirtyRows.length === 0) return;

    const records: AttendanceBulkEntry[] = [];
    for (const row of dirtyRows) {
      const draft = drafts[row.employee.id];
      if (!draft?.status) continue;
      const working = isWorking(draft.status);
      records.push({
        employeeId: row.employee.id,
        date,
        status: draft.status,
        notes: draft.notes.trim() ? draft.notes : null,
        ...(working
          ? {
              checkInTime: draft.checkIn || null,
              checkOutTime: draft.checkOut || null,
              ...(draft.overtime.trim() === ''
                ? {}
                : { overtimeHours: Number(draft.overtime) }),
            }
          : { checkInTime: null, checkOutTime: null, overtimeHours: 0 }),
      });
    }

    if (records.length === 0) {
      toast.error('No attendance status selected');
      return;
    }

    setIsSaving(true);
    try {
      const res = await attendanceApi.bulkCreate(records);
      if (res.success && res.data) {
        toast.success(
          `${res.data.created} created, ${res.data.updated} updated`
        );
        await load(date);
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

  const savedDateLabel = format(parse(date, 'yyyy-MM-dd', new Date()), 'EEEE, MMM d, yyyy');
  const isToday = date === todayDateOnly();

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              Daily roster
            </CardTitle>
            <CardDescription>
              {savedDateLabel} · {counts.present + counts.absent + counts.half + counts.leave + counts.holiday + counts.unmarked} active employees
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => onDateChange(addDateOnlyDays(date, -1))}
              aria-label="Previous day"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Input
              type="date"
              value={date}
              onChange={(event) => event.target.value && onDateChange(event.target.value)}
              className="h-8 w-36 text-xs"
            />
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => onDateChange(addDateOnlyDays(date, 1))}
              aria-label="Next day"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant={isToday ? 'secondary' : 'outline'}
              size="sm"
              className="h-8 text-xs"
              onClick={() => onDateChange(todayDateOnly())}
            >
              Today
            </Button>
            {canManage && (
              <Button
                size="sm"
                className="h-8 text-xs bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={() => setBulkOpen(true)}
              >
                <CheckCheck className="mr-1 h-3.5 w-3.5" />
                Bulk mark
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          <SummaryChip label="Present" value={counts.present} tone="emerald" />
          <SummaryChip label="Half day" value={counts.half} tone="amber" />
          <SummaryChip label="Absent" value={counts.absent} tone="red" />
          <SummaryChip label="Leave" value={counts.leave} tone="blue" />
          <SummaryChip label="Holiday" value={counts.holiday} tone="violet" />
          <SummaryChip label="Unmarked" value={counts.unmarked} tone="muted" />
          <SummaryChip label="OT hours" value={counts.overtime} tone="orange" />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Filter by name, title or department..."
              className="h-8 pl-8 text-xs"
            />
          </div>
          <Select value={department} onValueChange={setDepartment}>
            <SelectTrigger className="h-8 w-44 text-xs">
              <SelectValue placeholder="All departments" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL" className="text-xs">
                All departments
              </SelectItem>
              {departments.map((dep) => (
                <SelectItem key={dep} value={dep} className="text-xs">
                  {dep}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {canManage && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={fillUnmarkedPresent}
              >
                <CheckCheck className="mr-1 h-3.5 w-3.5" />
                Fill unmarked as Present
              </Button>
              {dirtyRows.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setDrafts({})}
                >
                  <RotateCcw className="mr-1 h-3.5 w-3.5" />
                  Discard changes
                </Button>
              )}
            </>
          )}
        </div>

        <div className="max-h-[60vh] overflow-y-auto rounded-md border">
          <div className="sticky top-0 z-10 hidden items-center gap-3 border-b bg-muted/80 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground backdrop-blur md:flex">
            <span className="min-w-0 flex-1">Employee</span>
            <span className="w-[19rem] shrink-0">Status</span>
            <span className="w-[9.5rem] shrink-0">Hours</span>
            <span className="w-16 shrink-0 text-right">OT</span>
            <span className="w-24 shrink-0 text-right">Approval</span>
          </div>

          {isLoading ? (
            <div className="space-y-2 p-3">
              {Array.from({ length: 8 }).map((_, index) => (
                <Skeleton key={index} className="h-9 w-full" />
              ))}
            </div>
          ) : visibleRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <CalendarDays className="mb-2 h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {data?.rows.length === 0
                  ? 'No active employees found.'
                  : 'No employees match this filter.'}
              </p>
            </div>
          ) : (
            visibleRows.map((row) => {
              const draft = drafts[row.employee.id];
              const record = row.record;
              const status =
                draft?.status ?? ((record?.status as AttendanceStatus | undefined) ?? null);
              const dirty = isDirty(row);
              const checkIn = draft
                ? draft.checkIn
                : record?.checkInTime
                  ? toClockTime(record.checkInTime)
                  : row.employee.workStartTime ?? '';
              const checkOut = draft
                ? draft.checkOut
                : record?.checkOutTime
                  ? toClockTime(record.checkOutTime)
                  : row.employee.workEndTime ?? '';
              const overtime = draft
                ? draft.overtime
                : record
                  ? String(record.overtimeHours ?? 0)
                  : '';

              return (
                <div
                  key={row.employee.id}
                  className={cn(
                    'flex flex-wrap items-center gap-3 border-b px-3 py-2 last:border-b-0 md:flex-nowrap',
                    dirty && 'bg-amber-500/5'
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">{row.employee.fullName}</p>
                      {record && status && (
                        <span
                          className={cn(
                            'hidden rounded border px-1.5 py-0.5 text-[10px] font-medium sm:inline',
                            ATTENDANCE_STATUS_SOFT[status]
                          )}
                        >
                          {ATTENDANCE_STATUS_LABELS[status]}
                        </span>
                      )}
                      {dirty && (
                        <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                          unsaved
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {row.employee.jobTitle}
                      {row.employee.department ? ` · ${row.employee.department}` : ''}
                    </p>
                  </div>

                  <div className="w-full md:w-[19rem] md:shrink-0">
                    <AttendanceStatusControl
                      value={status}
                      disabled={!canManage}
                      className="w-full"
                      onChange={(next) => {
                        const patch: Partial<Draft> = { status: next };
                        if (isWorking(next) && !checkIn) {
                          patch.checkIn = row.employee.workStartTime ?? '';
                          patch.checkOut = row.employee.workEndTime ?? '';
                        }
                        setDraft(row, patch);
                      }}
                    />
                  </div>

                  <div className="flex w-[9.5rem] shrink-0 items-center gap-1">
                    {isWorking(status) ? (
                      <>
                        <Input
                          type="time"
                          value={checkIn}
                          disabled={!canManage}
                          onChange={(event) => setDraft(row, { checkIn: event.target.value })}
                          className="h-7 w-[4.4rem] px-1 text-[11px]"
                          aria-label={`${row.employee.fullName} check in`}
                        />
                        <span className="text-[10px] text-muted-foreground">–</span>
                        <Input
                          type="time"
                          value={checkOut}
                          disabled={!canManage}
                          onChange={(event) => setDraft(row, { checkOut: event.target.value })}
                          className="h-7 w-[4.4rem] px-1 text-[11px]"
                          aria-label={`${row.employee.fullName} check out`}
                        />
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </div>

                  <div className="w-16 shrink-0 text-right">
                    {isWorking(status) ? (
                      <Input
                        type="number"
                        min="0"
                        step="0.5"
                        value={overtime}
                        disabled={!canManage}
                        placeholder="auto"
                        onChange={(event) => setDraft(row, { overtime: event.target.value })}
                        className="h-7 w-16 px-1 text-right text-[11px]"
                        aria-label={`${row.employee.fullName} overtime hours`}
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </div>

                  <div className="flex w-24 shrink-0 items-center justify-end gap-1">
                    {record?.approvalStatus ? (
                      <ApprovalStatusBadge status={record.approvalStatus} />
                    ) : (
                      <span className="text-[10px] text-muted-foreground">—</span>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground"
                      title="Open calendar for this employee"
                      onClick={() => onOpenCalendar(row.employee.id)}
                    >
                      <CalendarDays className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5" />
            {dirtyRows.length > 0
              ? `${dirtyRows.length} unsaved change${dirtyRows.length === 1 ? '' : 's'}`
              : 'Changes are saved for the selected date only'}
          </p>
          <Button
            size="sm"
            className="h-8 text-xs bg-emerald-600 text-white hover:bg-emerald-700"
            disabled={!canManage || dirtyRows.length === 0 || isSaving}
            onClick={handleSave}
          >
            {isSaving ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="mr-1 h-3.5 w-3.5" />
            )}
            {isSaving
              ? 'Saving...'
              : dirtyRows.length > 0
                ? `Save ${dirtyRows.length} change${dirtyRows.length === 1 ? '' : 's'}`
                : 'Save changes'}
          </Button>
        </div>
      </CardContent>

      <BulkAttendanceDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        initialDate={date}
        onSaved={(savedDate) => {
          if (savedDate !== date) onDateChange(savedDate);
          else load(date);
        }}
      />
    </Card>
  );
}

const CHIP_TONES: Record<string, string> = {
  emerald: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25',
  amber: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/25',
  red: 'bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/25',
  blue: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/25',
  violet: 'bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/25',
  orange: 'bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/25',
  muted: 'bg-muted text-muted-foreground border-border',
};

function SummaryChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: keyof typeof CHIP_TONES;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs',
        CHIP_TONES[tone]
      )}
    >
      <span className="font-semibold tabular-nums">{value}</span>
      <span className="opacity-80">{label}</span>
    </span>
  );
}
