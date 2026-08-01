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
  Loader2,
  RotateCcw,
  Search,
  X,
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
  const [quickOvertime, setQuickOvertime] = React.useState(0);

  // Local employee selection
  const [localEmployeeId, setLocalEmployeeId] = React.useState<string | null>(null);
  const [localEmployeeName, setLocalEmployeeName] = React.useState('');
  const [employeeList, setEmployeeList] = React.useState<EmployeeListItem[]>([]);
  const [employeeListLoading, setEmployeeListLoading] = React.useState(false);

  // Search state
  const [searchText, setSearchText] = React.useState('');

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

  // Client-side filtered employees for the search list
  const filteredEmployees = React.useMemo(
    () => {
      if (!searchText.trim()) return activeEmployees;
      const q = searchText.toLowerCase();
      return activeEmployees.filter((e) =>
        e.fullName.toLowerCase().includes(q) ||
        (e.jobTitle && e.jobTitle.toLowerCase().includes(q))
      );
    },
    [activeEmployees, searchText]
  );

  const targetEmployeeId = localEmployeeId ?? selectedEmployee?.id ?? null;
  const employeeName = localEmployeeName || selectedEmployee?.fullName || '';
  const effectiveSearch = targetEmployeeId ? undefined : (searchText.trim() || undefined);

  const bulkEmployeeIds: { id: string; fullName: string }[] = React.useMemo(
    () => activeEmployees.map((e) => ({ id: e.id, fullName: e.fullName })),
    [activeEmployees]
  );

  const fetchRecords = React.useCallback(async (params?: {
    employeeId?: string;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
  }) => {
    setIsLoading(true);
    try {
      const res = await attendanceApi.getAll({
        employeeId: params?.employeeId ?? targetEmployeeId ?? undefined,
        search: params?.search ?? effectiveSearch,
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
  }, [targetEmployeeId, effectiveSearch, dateFrom, dateTo, page, pageSize]);

  React.useEffect(() => {
    if (targetEmployeeId || dateFrom || dateTo || effectiveSearch) {
      fetchRecords();
    } else {
      const now = new Date();
      const from = format(startOfMonth(now), 'yyyy-MM-dd');
      const to = format(endOfMonth(now), 'yyyy-MM-dd');
      fetchRecords({ dateFrom: from, dateTo: to });
    }
  }, [targetEmployeeId, effectiveSearch, dateFrom, dateTo, page]);

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

  const handleOvertimeChange = async (id: string, overtimeHours: number) => {
    try {
      const res = await attendanceApi.update(id, { overtimeHours });
      if (res.success) {
        setRecords((prev) =>
          prev.map((r) => (r.id === id ? { ...r, overtimeHours } : r))
        );
        toast.success('Overtime hours updated');
      }
    } catch {
      toast.error('Failed to update overtime hours');
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
      overtimeHours: quickStatus === 'PRESENT' ? quickOvertime : 0,
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
      {/* Search Employee */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Search className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            Search Employee
          </CardTitle>
          <CardDescription>Type an employee name to find and manage their attendance</CardDescription>
        </CardHeader>
        <CardContent>
          <Command className="rounded-lg border" shouldFilter={false}>
            <CommandInput
              placeholder="Search employee by name..."
              value={searchText}
              onValueChange={setSearchText}
            />
            <CommandList>
              {(searchText.length > 0 || activeEmployees.length > 0) && (
                <>
                  {filteredEmployees.length === 0 && (
                    <CommandEmpty>No employee found.</CommandEmpty>
                  )}
                  {filteredEmployees.length > 0 && (
                    <CommandGroup heading="Matching Employees">
                      {filteredEmployees.map((emp) => (
                        <CommandItem
                          key={emp.id}
                          value={emp.id}
                          onSelect={() => {
                            if (localEmployeeId === emp.id) {
                              setLocalEmployeeId(null);
                              setLocalEmployeeName('');
                              setSearchText('');
                            } else {
                              setLocalEmployeeId(emp.id);
                              setLocalEmployeeName(emp.fullName);
                              setSearchText('');
                            }
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
                  )}
                </>
              )}
              {!employeeListLoading && activeEmployees.length === 0 && searchText.length === 0 && (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  No active employees found
                </div>
              )}
              {employeeListLoading && (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              )}
            </CommandList>
          </Command>
          {localEmployeeName && !searchText && (
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-muted-foreground">Selected:</span>
              <span className="text-sm font-medium">{localEmployeeName}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs text-muted-foreground"
                onClick={() => {
                  setLocalEmployeeId(null);
                  setLocalEmployeeName('');
                }}
              >
                <X className="h-3 w-3 mr-1" />
                Clear
              </Button>
            </div>
          )}
          {effectiveSearch && !localEmployeeName && (
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-muted-foreground">
                Searching attendance for: &quot;{effectiveSearch}&quot;
              </span>
            </div>
          )}
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
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">OT Hours</label>
                <Input
                  type="number"
                  min="0"
                  step="0.5"
                  value={quickOvertime}
                  onChange={(e) => setQuickOvertime(Math.max(0, parseFloat(e.target.value) || 0))}
                  disabled={quickStatus !== 'PRESENT'}
                  className="h-8 w-20 text-xs"
                  placeholder="0"
                />
              </div>
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
              : effectiveSearch
                ? `Attendance records matching "${effectiveSearch}"`
                : 'Search for an employee or type a name to view attendance'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!targetEmployeeId && !effectiveSearch && !isLoading && records.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Search for an employee above to start tracking attendance
            </p>
          ) : (
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'list' | 'calendar')}>
              <TabsList className="mb-4">
                <TabsTrigger value="calendar" className="gap-1.5" disabled={!targetEmployeeId}>
                  <CalendarDays className="h-4 w-4" />
                  Calendar
                </TabsTrigger>
                <TabsTrigger value="list" className="gap-1.5">
                  <List className="h-4 w-4" />
                  List
                </TabsTrigger>
              </TabsList>

              <TabsContent value="calendar">
                {targetEmployeeId ? (
                  <>
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
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Select a specific employee to view the calendar
                  </p>
                )}
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
                  search={effectiveSearch}
                  onPageChange={setPage}
                  onDateFromChange={(d) => { setDateFrom(d); setPage(1); }}
                  onDateToChange={(d) => { setDateTo(d); setPage(1); }}
                  onStatusChange={handleStatusChange}
                  onOvertimeChange={handleOvertimeChange}
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
