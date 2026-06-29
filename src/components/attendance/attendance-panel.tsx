'use client';

import * as React from 'react';
import { format, startOfMonth, endOfMonth, isSameDay, eachDayOfInterval, parse, addDays } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { AttendanceCalendar } from './attendance-calendar';
import { AttendanceTable } from './attendance-table';
import { BulkAttendanceForm } from './bulk-attendance-form';
import { attendanceApi, employeesApi } from '@/services/api';
import { useEmployeeStore } from '@/hooks/use-employee-store';
import type { AttendanceRecord, AttendanceStatus } from '@/types/employee';
import type { EmployeeListItem } from '@/types/expense';
import {
  CalendarDays,
  List,
  ClipboardCheck,
  RefreshCw,
  Check,
  ChevronsUpDown,
  Users,
  Loader2,
  RotateCcw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { usePermissions } from '@/hooks/use-permissions';
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

function getDatesInRange(from: string, to: string): string[] {
  const start = parse(from, 'yyyy-MM-dd', new Date());
  const end = parse(to, 'yyyy-MM-dd', new Date());
  const days = eachDayOfInterval({ start, end });
  return days.map((d) => format(d, 'yyyy-MM-dd'));
}

export function AttendancePanel() {
  const { canCreate } = usePermissions();
  const selectedEmployee = useEmployeeStore((s) => s.selectedEmployee);

  const [activeTab, setActiveTab] = React.useState<'list' | 'calendar'>('calendar');
  const [records, setRecords] = React.useState<AttendanceRecord[]>([]);
  const [total, setTotal] = React.useState(0);
  const [isLoading, setIsLoading] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const [pageSize] = React.useState(31);
  const [dateFrom, setDateFrom] = React.useState('');
  const [dateTo, setDateTo] = React.useState('');
  const [selectedCalendarDate, setSelectedCalendarDate] = React.useState<Date | null>(null);
  const [calendarMonth, setCalendarMonth] = React.useState(format(new Date(), 'yyyy-MM'));

  // Quick mark: from/to range
  const [quickDateFrom, setQuickDateFrom] = React.useState(format(new Date(), 'yyyy-MM-dd'));
  const [quickDateTo, setQuickDateTo] = React.useState('');
  const [quickStatus, setQuickStatus] = React.useState<AttendanceStatus>('PRESENT');

  // Local employee selection
  const [localEmployeeId, setLocalEmployeeId] = React.useState<string | null>(null);
  const [localEmployeeName, setLocalEmployeeName] = React.useState('');
  const [employeeSelectOpen, setEmployeeSelectOpen] = React.useState(false);
  const [employeeList, setEmployeeList] = React.useState<EmployeeListItem[]>([]);
  const [employeeListLoading, setEmployeeListLoading] = React.useState(false);

  // Fetch employee list on mount
  React.useEffect(() => {
    setEmployeeListLoading(true);
    employeesApi.list()
      .then((res) => {
        if (res.success && res.data) {
          setEmployeeList(res.data);
        }
      })
      .catch(() => {})
      .finally(() => setEmployeeListLoading(false));
  }, []);

  // Only active employees for dropdown and bulk marking
  const activeEmployees = React.useMemo(
    () => employeeList.filter((e) => (e as EmployeeListItem & { status?: string }).status !== 'INACTIVE' && (e as EmployeeListItem & { status?: string }).status !== 'TERMINATED'),
    [employeeList]
  );

  const targetEmployeeId = localEmployeeId ?? selectedEmployee?.id ?? null;
  const employeeName = localEmployeeName || selectedEmployee?.fullName || '';

  const bulkEmployeeIds: { id: string; fullName: string }[] = React.useMemo(
    () => activeEmployees.map((e) => ({ id: e.id, fullName: e.fullName })),
    [activeEmployees]
  );

  const fetchRecords = React.useCallback(async (params?: {
    employeeId?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
  }) => {
    setIsLoading(true);
    try {
      const res = await attendanceApi.getAll({
        employeeId: params?.employeeId ?? targetEmployeeId ?? undefined,
        dateFrom: params?.dateFrom ?? (dateFrom || undefined),
        dateTo: params?.dateTo ?? (dateTo || undefined),
        page: params?.page ?? page,
        pageSize,
      });
      if (res.success && res.data) {
        setRecords(res.data.data);
        setTotal(res.data.total);
      }
    } catch {
      toast.error('Failed to load attendance records');
    } finally {
      setIsLoading(false);
    }
  }, [targetEmployeeId, dateFrom, dateTo, page, pageSize]);

  React.useEffect(() => {
    if (targetEmployeeId || dateFrom || dateTo) {
      fetchRecords();
    } else {
      const now = new Date();
      const from = format(startOfMonth(now), 'yyyy-MM-dd');
      const to = format(endOfMonth(now), 'yyyy-MM-dd');
      fetchRecords({ dateFrom: from, dateTo: to });
    }
  }, [targetEmployeeId, dateFrom, dateTo, page]);

  React.useEffect(() => {
    if (targetEmployeeId && activeTab === 'calendar' && calendarMonth) {
      const [year, mon] = calendarMonth.split('-').map(Number);
      const date = new Date(year, mon - 1);
      const from = format(startOfMonth(date), 'yyyy-MM-dd');
      const to = format(endOfMonth(date), 'yyyy-MM-dd');
      setIsLoading(true);
      attendanceApi.getAll({
        employeeId: targetEmployeeId,
        dateFrom: from,
        dateTo: to,
        page: 1,
        pageSize: 31,
      }).then((res) => {
        if (res.success && res.data) {
          setRecords(res.data.data);
          setTotal(res.data.total);
        }
      }).catch(() => {
        toast.error('Failed to load calendar data');
      }).finally(() => setIsLoading(false));
    }
  }, [calendarMonth, targetEmployeeId, activeTab]);

  const handleStatusChange = async (id: string, status: AttendanceStatus) => {
    try {
      const res = await attendanceApi.update(id, { status });
      if (res.success) {
        setRecords((prev) =>
          prev.map((r) => (r.id === id ? { ...r, status } : r))
        );
      }
    } catch {
      toast.error('Failed to update status');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await attendanceApi.delete(id);
      if (res.success) {
        setRecords((prev) => prev.filter((r) => r.id !== id));
        setTotal((prev) => prev - 1);
        toast.success('Attendance record deleted');
      }
    } catch {
      toast.error('Failed to delete record');
    }
  };

  const handleCalendarDateClick = async (date: Date) => {
    if (!targetEmployeeId) {
      toast.error('Please select an employee first');
      return;
    }

    setSelectedCalendarDate(date);

    const dateStr = format(date, 'yyyy-MM-dd');
    const existing = records.find((r) => isSameDay(new Date(r.date), date));

    if (existing) {
      const statuses: AttendanceStatus[] = ['PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE', 'HOLIDAY'];
      const currentIdx = statuses.indexOf(existing.status as AttendanceStatus);
      const nextStatus = statuses[(currentIdx + 1) % statuses.length];
      await handleStatusChange(existing.id, nextStatus);
      toast.success(`${ATTENDANCE_STATUS_LABELS[nextStatus]} for ${dateStr}`);
    } else {
      try {
        const res = await attendanceApi.create({
          employeeId: targetEmployeeId,
          date: dateStr,
          status: quickStatus,
        });
        if (res.success) {
          const newRecord = res.data as AttendanceRecord;
          setRecords((prev) => [...prev, newRecord]);
          setTotal((prev) => prev + 1);
          toast.success(`Marked as ${ATTENDANCE_STATUS_LABELS[quickStatus]}`);
        }
      } catch {
        toast.error('Failed to mark attendance');
      }
    }
  };

  const handleQuickMark = async () => {
    if (!targetEmployeeId) {
      toast.error('Please select an employee first');
      return;
    }

    const dates = quickDateTo
      ? getDatesInRange(quickDateFrom, quickDateTo)
      : [quickDateFrom];

    if (dates.length === 0) {
      toast.error('Invalid date range');
      return;
    }

    const records = dates.map((d) => ({
      employeeId: targetEmployeeId,
      date: d,
      status: quickStatus,
    }));

    try {
      const res = await attendanceApi.bulkCreate(records);
      if (res.success) {
        toast.success(`Marked ${dates.length} day(s) as ${ATTENDANCE_STATUS_LABELS[quickStatus]}`);
        fetchRecords();
      } else {
        toast.error(res.error ?? 'Failed to mark attendance');
      }
    } catch {
      toast.error('Failed to mark attendance');
    }
  };

  return (
    <div className="space-y-4">
      {/* Employee Selector */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            Select Employee
          </CardTitle>
          <CardDescription>Choose an active employee to manage their attendance</CardDescription>
        </CardHeader>
        <CardContent>
          <Popover open={employeeSelectOpen} onOpenChange={setEmployeeSelectOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={employeeSelectOpen}
                className="w-full justify-between"
                disabled={employeeListLoading}
              >
                {targetEmployeeId && employeeName ? (
                  <span className="truncate">{employeeName}</span>
                ) : (
                  <span className="text-muted-foreground">Select employee...</span>
                )}
                {employeeListLoading ? (
                  <Loader2 className="ml-2 h-4 w-4 shrink-0 animate-spin opacity-50" />
                ) : (
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
              <Command>
                <CommandInput placeholder="Search active employees..." />
                <CommandList>
                  <CommandEmpty>No active employee found.</CommandEmpty>
                  <CommandGroup heading="Active Employees">
                    {activeEmployees.map((emp) => (
                      <CommandItem
                        key={emp.id}
                        value={emp.id}
                        onSelect={(currentValue) => {
                          if (currentValue === localEmployeeId) {
                            setLocalEmployeeId(null);
                            setLocalEmployeeName('');
                          } else {
                            setLocalEmployeeId(emp.id);
                            setLocalEmployeeName(emp.fullName);
                          }
                          setEmployeeSelectOpen(false);
                        }}
                      >
                        <Check
                          className={cn(
                            'mr-2 h-4 w-4',
                            localEmployeeId === emp.id ? 'opacity-100' : 'opacity-0'
                          )}
                        />
                        <div className="flex flex-col">
                          <span>{emp.fullName}</span>
                          <span className="text-xs text-muted-foreground">{emp.jobTitle}</span>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </CardContent>
      </Card>

      {/* Quick Mark Attendance */}
      {targetEmployeeId && canCreate('employees') && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              Quick Mark Attendance
            </CardTitle>
            <CardDescription>
              Mark {employeeName} for a single day or a date range
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">From</label>
                <Input
                  type="date"
                  value={quickDateFrom}
                  onChange={(e) => setQuickDateFrom(e.target.value)}
                  className="h-8 w-36 text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">To</label>
                <Input
                  type="date"
                  value={quickDateTo}
                  onChange={(e) => setQuickDateTo(e.target.value)}
                  className="h-8 w-36 text-xs"
                  placeholder="Same day"
                />
              </div>
              {quickDateTo && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setQuickDateTo('')}
                >
                  <RotateCcw className="h-3 w-3 mr-1" />
                  Single day
                </Button>
              )}
              <Select
                value={quickStatus}
                onValueChange={(v) => setQuickStatus(v as AttendanceStatus)}
              >
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
                onClick={handleQuickMark}
              >
                <ClipboardCheck className="h-3 w-3 mr-1" />
                {quickDateTo
                  ? `Mark ${getDatesInRange(quickDateFrom, quickDateTo).length} days`
                  : `Mark ${quickDateFrom}`}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bulk Mark All Active Employees */}
      {bulkEmployeeIds.length > 0 && canCreate('employees') && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <RefreshCw className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              Mark All Active Employees
            </CardTitle>
            <CardDescription>
              Mark attendance for all {bulkEmployeeIds.length} active employees at once
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BulkAttendanceForm
              employeeIds={bulkEmployeeIds}
              dateFrom={quickDateFrom}
              dateTo={quickDateTo}
              onDateFromChange={setQuickDateFrom}
              onDateToChange={setQuickDateTo}
              onSuccess={() => {
                if (targetEmployeeId) fetchRecords();
              }}
            />
          </CardContent>
        </Card>
      )}

      {/* Attendance Records */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            Attendance Records
          </CardTitle>
          <CardDescription>
            {targetEmployeeId
              ? `${employeeName}'s attendance`
              : 'Select an employee above to view their attendance'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!targetEmployeeId ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Select an employee using the dropdown above to start tracking attendance
            </p>
          ) : (
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'list' | 'calendar')}>
              <TabsList className="mb-4">
                <TabsTrigger value="calendar" className="gap-1.5">
                  <CalendarDays className="h-4 w-4" />
                  Calendar
                </TabsTrigger>
                <TabsTrigger value="list" className="gap-1.5">
                  <List className="h-4 w-4" />
                  List
                </TabsTrigger>
              </TabsList>

              <TabsContent value="calendar">
                <AttendanceCalendar
                  records={records}
                  selectedDate={selectedCalendarDate}
                  onSelectDate={handleCalendarDateClick}
                  currentMonth={calendarMonth}
                  onMonthChange={setCalendarMonth}
                />
                <p className="text-xs text-muted-foreground mt-3 text-center">
                  Click a date to toggle status: {ATTENDANCE_STATUSES.map((s) => ATTENDANCE_STATUS_LABELS[s]).join(' → ')}
                </p>
              </TabsContent>

              <TabsContent value="list">
                <AttendanceTable
                  records={records}
                  total={total}
                  page={page}
                  pageSize={pageSize}
                  isLoading={isLoading}
                  dateFrom={dateFrom}
                  dateTo={dateTo}
                  selectedEmployeeId={targetEmployeeId}
                  employeeName={employeeName}
                  onPageChange={setPage}
                  onDateFromChange={(d) => { setDateFrom(d); setPage(1); }}
                  onDateToChange={(d) => { setDateTo(d); setPage(1); }}
                  onStatusChange={handleStatusChange}
                  onDelete={handleDelete}
                />
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
