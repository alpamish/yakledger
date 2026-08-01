'use client';

import * as React from 'react';
import { format } from 'date-fns';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/common/loading-spinner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ATTENDANCE_STATUSES,
  ATTENDANCE_STATUS_LABELS,
  ATTENDANCE_STATUS_COLORS,
} from '@/types/employee';
import type { AttendanceRecord, AttendanceStatus } from '@/types/employee';
import { Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { usePermissions } from '@/hooks/use-permissions';

interface AttendanceTableProps {
  records: AttendanceRecord[];
  total: number;
  page: number;
  pageSize: number;
  isLoading: boolean;
  dateFrom: string;
  dateTo: string;
  selectedEmployeeId: string | null;
  employeeName: string;
  search?: string;
  onPageChange: (page: number) => void;
  onDateFromChange: (date: string) => void;
  onDateToChange: (date: string) => void;
  onStatusChange: (id: string, status: AttendanceStatus) => Promise<void>;
  onOvertimeChange: (id: string, overtimeHours: number) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function AttendanceTable({
  records,
  total,
  page,
  pageSize,
  isLoading,
  dateFrom,
  dateTo,
  selectedEmployeeId,
  employeeName,
  search,
  onPageChange,
  onDateFromChange,
  onDateToChange,
  onStatusChange,
  onOvertimeChange,
  onDelete,
}: AttendanceTableProps) {
  const { canEdit, canDelete } = usePermissions();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const handleStatusChange = async (id: string, status: string) => {
    await onStatusChange(id, status as AttendanceStatus);
    toast.success(`Status updated to ${ATTENDANCE_STATUS_LABELS[status as AttendanceStatus]}`);
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => onDateFromChange(e.target.value)}
            className="h-8 w-36 text-xs"
            placeholder="From"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => onDateToChange(e.target.value)}
            className="h-8 w-36 text-xs"
            placeholder="To"
          />
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner size="lg" text="Loading attendance records..." />
        </div>
      ) : records.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Search className="h-8 w-8 mb-2" />
          <p className="text-sm">No attendance records found</p>
          <p className="text-xs mt-1">
            {selectedEmployeeId
              ? `No records for ${employeeName} in the selected period`
              : search
                ? `No records matching "${search}" in the selected period`
                : 'Select an employee and date range to view records'}
          </p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>OT Hours</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((record) => {
                const statusColor = ATTENDANCE_STATUS_COLORS[record.status as AttendanceStatus] ?? '#78716c';
                return (
                  <TableRow key={record.id}>
                    <TableCell className="font-mono text-xs">
                      {format(new Date(record.date), 'MMM dd, yyyy')}
                    </TableCell>
                    <TableCell className="text-sm font-medium">
                      {(record as unknown as { employee?: { fullName: string } }).employee?.fullName ?? employeeName}
                    </TableCell>
                    <TableCell>
                      {canEdit('employees') ? (
                        <Select
                          value={record.status}
                          onValueChange={(value) => handleStatusChange(record.id, value)}
                        >
                          <SelectTrigger className="h-7 w-32 text-xs">
                            <SelectValue>
                              <Badge
                                variant="outline"
                                className="border-0 text-xs px-2 py-0"
                                style={{ backgroundColor: `${statusColor}18`, color: statusColor }}
                              >
                                {ATTENDANCE_STATUS_LABELS[record.status as AttendanceStatus] ?? record.status}
                              </Badge>
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {ATTENDANCE_STATUSES.map((s) => {
                              const c = ATTENDANCE_STATUS_COLORS[s];
                              return (
                                <SelectItem key={s} value={s} className="text-xs">
                                  <span
                                    className="inline-block h-2 w-2 rounded-full mr-2"
                                    style={{ backgroundColor: c }}
                                  />
                                  {ATTENDANCE_STATUS_LABELS[s]}
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge
                          variant="outline"
                          className="border-0 text-xs px-2 py-0"
                          style={{ backgroundColor: `${statusColor}18`, color: statusColor }}
                        >
                          {ATTENDANCE_STATUS_LABELS[record.status as AttendanceStatus] ?? record.status}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                      {record.notes || '—'}
                    </TableCell>
                    <TableCell>
                      {canEdit('employees') ? (
                        <Input
                          type="number"
                          min="0"
                          step="0.5"
                          defaultValue={record.overtimeHours ?? 0}
                          className="h-7 w-20 text-xs"
                          onBlur={(e) => {
                            const val = parseFloat(e.target.value);
                            const next = isNaN(val) ? 0 : Math.max(0, val);
                            if (next !== (record.overtimeHours ?? 0)) {
                              onOvertimeChange(record.id, next);
                            }
                          }}
                        />
                      ) : (
                        <span className="text-xs font-mono tabular-nums">
                          {(record.overtimeHours ?? 0).toFixed(1)} h
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {canDelete('employees') && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-red-600"
                          onClick={() => onDelete(record.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      {total > 0 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Showing {((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, total)} of {total}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
            >
              Previous
            </Button>
            <span className="px-2">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
