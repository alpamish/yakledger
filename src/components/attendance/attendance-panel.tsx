'use client';

import * as React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
import { AttendanceRoster } from './attendance-roster';
import { AttendanceCalendar } from './attendance-calendar';
import { AttendanceDayEditor } from './attendance-day-editor';
import { AttendanceRecordsTab } from './attendance-records-tab';
import { attendanceApi, employeesApi, ApiError } from '@/services/api';
import { usePermissions } from '@/hooks/use-permissions';
import { useEmployeeStore } from '@/hooks/use-employee-store';
import type { AttendanceRecord } from '@/types/employee';
import type { EmployeeListItem } from '@/types/expense';
import {
  endOfMonthDateOnly,
  formatDateOnly,
  todayDateOnly,
} from '@/lib/attendance-date';
import {
  CalendarDays,
  Check,
  ChevronsUpDown,
  ClipboardCheck,
  List,
  Loader2,
  UserRound,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type AttendanceTab = 'roster' | 'calendar' | 'records';

export function AttendancePanel() {
  const { hasPermission } = usePermissions();
  const selectedEmployee = useEmployeeStore((state) => state.selectedEmployee);

  const canManage =
    hasPermission('employees:attendance:manage') ||
    hasPermission('employees:create');
  const canDelete =
    hasPermission('employees:attendance:manage') ||
    hasPermission('employees:delete');

  const [activeTab, setActiveTab] = React.useState<AttendanceTab>('roster');
  const [rosterDate, setRosterDate] = React.useState(todayDateOnly());

  const [employeeList, setEmployeeList] = React.useState<EmployeeListItem[]>([]);
  const [employeeListLoading, setEmployeeListLoading] = React.useState(false);
  const [employeeId, setEmployeeId] = React.useState<string | null>(
    selectedEmployee?.id ?? null
  );
  const [calendarMonth, setCalendarMonth] = React.useState(
    todayDateOnly().slice(0, 7)
  );
  const [selectedDate, setSelectedDate] = React.useState(todayDateOnly());
  const [monthRecords, setMonthRecords] = React.useState<AttendanceRecord[]>([]);
  const [isLoadingMonth, setIsLoadingMonth] = React.useState(false);
  const requestRef = React.useRef(0);

  React.useEffect(() => {
    setEmployeeListLoading(true);
    employeesApi
      .list({ status: 'ACTIVE', lite: true })
      .then((res) => {
        if (res.success && res.data) setEmployeeList(res.data);
      })
      .catch(() => {
        toast.error('Failed to load employees');
      })
      .finally(() => setEmployeeListLoading(false));
  }, []);

  // Fall back to the employee selected elsewhere in the HR module.
  React.useEffect(() => {
    if (!employeeId && selectedEmployee?.id) {
      setEmployeeId(selectedEmployee.id);
    }
  }, [selectedEmployee?.id, employeeId]);

  const loadMonth = React.useCallback(async (id: string, month: string) => {
    const requestId = ++requestRef.current;
    setIsLoadingMonth(true);
    try {
      const dateFrom = `${month}-01`;
      const dateTo = endOfMonthDateOnly(dateFrom);

      const res = await attendanceApi.getAll({
        employeeId: id,
        dateFrom,
        dateTo,
        page: 1,
        pageSize: 62,
      });
      if (requestId !== requestRef.current) return;
      if (res.success && res.data) setMonthRecords(res.data.data);
    } catch (error) {
      if (requestId !== requestRef.current) return;
      toast.error(
        error instanceof ApiError ? error.message : 'Failed to load calendar data'
      );
    } finally {
      if (requestId === requestRef.current) setIsLoadingMonth(false);
    }
  }, []);

  React.useEffect(() => {
    if (activeTab !== 'calendar' || !employeeId) return;
    loadMonth(employeeId, calendarMonth);
  }, [activeTab, employeeId, calendarMonth, loadMonth]);

  const openCalendarFor = (id: string) => {
    setEmployeeId(id);
    setSelectedDate(rosterDate);
    setCalendarMonth(rosterDate.slice(0, 7));
    setActiveTab('calendar');
  };

  const employeeName =
    employeeList.find((employee) => employee.id === employeeId)?.fullName ??
    selectedEmployee?.fullName ??
    'Employee';

  const selectedRecord = React.useMemo(() => {
    if (!selectedDate) return null;
    return (
      monthRecords.find((record) => formatDateOnly(record.date) === selectedDate) ??
      null
    );
  }, [monthRecords, selectedDate]);

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => setActiveTab(value as AttendanceTab)}
      className="space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TabsList>
          <TabsTrigger value="roster" className="gap-1.5">
            <Users className="h-4 w-4" />
            Daily roster
          </TabsTrigger>
          <TabsTrigger value="calendar" className="gap-1.5">
            <CalendarDays className="h-4 w-4" />
            Calendar
          </TabsTrigger>
          <TabsTrigger value="records" className="gap-1.5">
            <List className="h-4 w-4" />
            Records
          </TabsTrigger>
        </TabsList>

        {activeTab === 'calendar' && (
          <EmployeePicker
            employees={employeeList}
            value={employeeId}
            loading={employeeListLoading}
            onChange={(id) => {
              setEmployeeId(id);
              setSelectedDate((current) =>
                current.slice(0, 7) === calendarMonth
                  ? current
                  : `${calendarMonth}-01`
              );
            }}
          />
        )}
      </div>

      <TabsContent value="roster" className="mt-0">
        <AttendanceRoster
          date={rosterDate}
          onDateChange={setRosterDate}
          canManage={canManage}
          onOpenCalendar={openCalendarFor}
        />
      </TabsContent>

      <TabsContent value="calendar" className="mt-0">
        {!employeeId ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600/10">
                <UserRound className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-base font-semibold">Select an employee</p>
                <p className="text-sm text-muted-foreground">
                  Pick someone above to see their month and edit individual days.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
            <Card>
              <CardContent className="pt-4">
                <AttendanceCalendar
                  records={monthRecords}
                  month={calendarMonth}
                  onMonthChange={(month) => {
                    setCalendarMonth(month);
                    setSelectedDate(`${month}-01`);
                  }}
                  selectedDate={selectedDate}
                  onSelectDate={setSelectedDate}
                  isLoading={isLoadingMonth}
                />
              </CardContent>
            </Card>

            <div>
              <AttendanceDayEditor
                employeeId={employeeId}
                employeeName={employeeName}
                date={selectedDate}
                record={selectedRecord}
                workStartTime={
                  employeeList.find((employee) => employee.id === employeeId)
                    ?.workStartTime ?? null
                }
                workEndTime={
                  employeeList.find((employee) => employee.id === employeeId)
                    ?.workEndTime ?? null
                }
                canManage={canManage}
                canDelete={canDelete}
                onSaved={() => loadMonth(employeeId, calendarMonth)}
                onDeleted={() => loadMonth(employeeId, calendarMonth)}
              />
            </div>
          </div>
        )}
      </TabsContent>

      <TabsContent value="records" className="mt-0">
        <AttendanceRecordsTab canManage={canManage} canDelete={canDelete} />
      </TabsContent>
    </Tabs>
  );
}

interface EmployeePickerProps {
  employees: EmployeeListItem[];
  value: string | null;
  loading: boolean;
  onChange: (id: string) => void;
}

function EmployeePicker({ employees, value, loading, onChange }: EmployeePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');

  const selected = employees.find((employee) => employee.id === value) ?? null;
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(
      (employee) =>
        employee.fullName.toLowerCase().includes(q) ||
        employee.jobTitle?.toLowerCase().includes(q)
    );
  }, [employees, query]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-9 w-full justify-between gap-2 sm:w-[280px]"
        >
          <span className="flex min-w-0 items-center gap-2">
            <ClipboardCheck className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span className="truncate">
              {selected ? selected.fullName : 'Select employee'}
            </span>
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="end">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search employee..."
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {loading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <CommandEmpty>No active employee found.</CommandEmpty>
            ) : (
              <CommandGroup>
                {filtered.map((employee) => (
                  <CommandItem
                    key={employee.id}
                    value={employee.id}
                    onSelect={() => {
                      onChange(employee.id);
                      setOpen(false);
                      setQuery('');
                    }}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        value === employee.id ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate">{employee.fullName}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {employee.jobTitle}
                        {employee.department ? ` · ${employee.department}` : ''}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
