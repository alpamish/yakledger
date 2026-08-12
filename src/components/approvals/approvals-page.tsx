'use client';

import * as React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, XCircle, Loader2, Inbox } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { approvalsApi } from '@/services/api';
import { usePermissions } from '@/hooks/use-permissions';
import type { ApprovalItem, ApprovalStatus } from '@/types/expense';

const ENTITY_LABELS: Record<string, string> = {
  expense: 'Expense',
  timesheet: 'Timesheet',
  fuelUsage: 'Fuel Usage',
  cashTransaction: 'Cash Transaction',
  transfer: 'Transfer',
  attendance: 'Attendance',
  assetLog: 'Asset Log',
};

const ENTITY_COLORS: Record<string, string> = {
  expense: '#ef4444',
  timesheet: '#3b82f6',
  fuelUsage: '#f59e0b',
  cashTransaction: '#10b981',
  transfer: '#8b5cf6',
  attendance: '#06b6d4',
  assetLog: '#6366f1',
};

function formatAmount(value?: number): string {
  if (value === undefined) return '';
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export function ApprovalsPage() {
  const { canApprove } = usePermissions();
  const [status, setStatus] = useState<ApprovalStatus>('PENDING');
  const [entity, setEntity] = useState<string>('all');
  const [items, setItems] = useState<ApprovalItem[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkApproving, setBulkApproving] = useState(false);

  const canApproveAny = canApprove('expenses') || canApprove('timesheets') || canApprove('fuelUsage') || canApprove('cashAdvance') || canApprove('employees') || canApprove('assets');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await approvalsApi.getAll({ status, entity: entity === 'all' ? undefined : entity });
      setItems(res.data?.items ?? []);
      setCounts(res.data?.counts ?? {});
    } catch {
      toast.error('Failed to load approvals');
    } finally {
      setLoading(false);
    }
  }, [status, entity]);

  useEffect(() => {
    load();
  }, [load]);

  const entityTabs = useMemo(() => {
    const tabs: { key: string; label: string; count: number }[] = [
      { key: 'all', label: 'All', count: Object.values(counts).reduce((a, b) => a + b, 0) },
    ];
    for (const key of ['expense', 'timesheet', 'fuelUsage', 'cashTransaction', 'transfer', 'attendance', 'assetLog']) {
      tabs.push({ key, label: ENTITY_LABELS[key], count: counts[key] ?? 0 });
    }
    return tabs;
  }, [counts]);

  const handleAction = async (item: ApprovalItem, action: 'approve' | 'reject') => {
    setActingId(`${action}:${item.entity}:${item.id}`);
    try {
      if (action === 'approve') {
        await approvalsApi.approve(item.entity, item.id);
        toast.success('Record approved');
      } else {
        await approvalsApi.reject(item.entity, item.id);
        toast.success('Record rejected');
      }
      load();
    } catch {
      toast.error(action === 'approve' ? 'Failed to approve record' : 'Failed to reject record');
    } finally {
      setActingId(null);
    }
  };

  const toggleSelect = (item: ApprovalItem) => {
    const key = `${item.entity}:${item.id}`;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelected((prev) => {
      const keys = items.map((i) => `${i.entity}:${i.id}`);
      const allSelected = keys.length > 0 && keys.every((k) => prev.has(k));
      if (allSelected) return new Set();
      return new Set(keys);
    });
  };

  const handleBulkApprove = async () => {
    const bulkItems = Array.from(selected).map((key) => {
      const idx = key.indexOf(':');
      return { entity: key.slice(0, idx), id: key.slice(idx + 1) };
    });
    if (bulkItems.length === 0) return;

    setBulkApproving(true);
    try {
      const res = await approvalsApi.approveMany(bulkItems);
      const { approved, skipped } = res.data ?? { approved: 0, skipped: 0 };
      toast.success(`${approved} approved${skipped > 0 ? `, ${skipped} skipped` : ''}`);
      setSelected(new Set());
      load();
    } catch {
      toast.error('Failed to approve selected records');
    } finally {
      setBulkApproving(false);
    }
  };

  if (!canApproveAny) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <Inbox className="h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-muted-foreground">You do not have permission to approve records.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-vazirmatn">
      <div>
        <h1 className="text-2xl font-bold">Approvals</h1>
        <p className="text-muted-foreground text-sm">
          Review and approve pending records before they count toward totals.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {entityTabs.map((tab) => (
          <Button
            key={tab.key}
            variant={entity === tab.key ? 'default' : 'outline'}
            size="sm"
            onClick={() => setEntity(tab.key)}
            className={entity === tab.key ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
          >
            {tab.label}
            <span className="ml-1 rounded-full px-1.5 text-xs">
              {tab.count}
            </span>
          </Button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <Select value={status} onValueChange={(v) => setStatus(v as ApprovalStatus)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="APPROVED">Approved</SelectItem>
            <SelectItem value="REJECTED">Rejected</SelectItem>
          </SelectContent>
        </Select>
        {status === 'PENDING' && (
          <Button
            variant="default"
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700"
            onClick={handleBulkApprove}
            disabled={selected.size === 0 || bulkApproving}
          >
            {bulkApproving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
            Approve Selected ({selected.size})
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{status === 'PENDING' ? 'Awaiting Approval' : `${status.charAt(0) + status.slice(1).toLowerCase()} Records`}</CardTitle>
          <CardDescription>
            {items.length} record{items.length === 1 ? '' : 's'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-500 mb-3" />
              <p className="text-muted-foreground">No records found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {status === 'PENDING' && (
                      <TableHead className="w-10">
                        <Checkbox
                          checked={items.length > 0 && items.every((i) => selected.has(`${i.entity}:${i.id}`))}
                          onCheckedChange={toggleSelectAll}
                        />
                      </TableHead>
                    )}
                    <TableHead>Type</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Submitted By</TableHead>
                    {status === 'REJECTED' && <TableHead>Note</TableHead>}
                    {status === 'PENDING' && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={`${item.entity}:${item.id}`}>
                      {status === 'PENDING' && (
                        <TableCell>
                          <Checkbox
                            checked={selected.has(`${item.entity}:${item.id}`)}
                            onCheckedChange={() => toggleSelect(item)}
                          />
                        </TableCell>
                      )}
                      <TableCell>
                        <Badge
                          variant="outline"
                          className="gap-1"
                          style={{ borderColor: `${ENTITY_COLORS[item.entity]}40`, color: ENTITY_COLORS[item.entity] }}
                        >
                          <span className="size-2 rounded-full inline-block" style={{ backgroundColor: ENTITY_COLORS[item.entity] }} />
                          {ENTITY_LABELS[item.entity] ?? item.entity}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[300px] truncate">{item.summary}</TableCell>
                      <TableCell>{formatAmount(item.amount)}</TableCell>
                      <TableCell>{item.date ? new Date(item.date).toLocaleDateString() : '—'}</TableCell>
                      <TableCell>{item.createdBy?.name ?? 'Unknown'}</TableCell>
                      {status === 'REJECTED' && (
                        <TableCell>{item.approvalNote ?? '—'}</TableCell>
                      )}
                      {status === 'PENDING' && (
                        <TableCell className="text-right space-x-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-emerald-600 hover:bg-emerald-50 border-emerald-600/30"
                            onClick={() => handleAction(item, 'approve')}
                            disabled={actingId === `approve:${item.entity}:${item.id}`}
                          >
                            {actingId === `approve:${item.entity}:${item.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive hover:bg-destructive/10 border-destructive/30"
                            onClick={() => handleAction(item, 'reject')}
                            disabled={actingId === `reject:${item.entity}:${item.id}`}
                          >
                            {actingId === `reject:${item.entity}:${item.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                            Reject
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
