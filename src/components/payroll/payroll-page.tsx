"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/common/empty-state";
import { PayrollActions } from "@/components/payroll/payroll-actions";
import { PayrollGenerateDialog } from "@/components/payroll/payroll-generate-dialog";
import { PayrollExportDropdown } from "@/components/payroll/payroll-export-dropdown";
import { payrollApi, type PayrollListParams, type UpdatePayrollLineBody } from "@/services/payroll-api";
import { walletApi } from "@/services/wallet-api";
import { formatMinor } from "@/lib/money";
import { usePermissions } from "@/hooks/use-permissions";
import { useDebounce } from "@/hooks/use-debounce";
import { useLiveRefresh } from "@/hooks/use-live-refresh";
import { toast } from "sonner";
import {
  Wallet,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Loader2,
} from "lucide-react";

interface PayrollLine {
  id: string;
  baseSalaryMinor: number;
  currency: string;
  attendanceDays: number;
  overtimeHours: number;
  overtimePayMinor: number;
  allowancesMinor: number;
  bonusesMinor: number;
  deductionsMinor: number;
  grossPayMinor: number;
  amountAlreadyReceivedMinor: number;
  previousDebtMinor: number;
  advancesDeductedMinor: number;
  netPayableMinor: number;
  remainingEmployeeDebtMinor: number;
  paymentStatus: string;
  paymentMethod: string | null;
  netPayMinor: number;
  expensesPaidMinor: number;
  deductExpenses: boolean;
}

interface PayrollRecord {
  id: string;
  employeeId: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  walletId: string | null;
  totalPaidMinor?: number;
  employee: {
    id: string;
    fullName: string;
    employeeNumber: string | null;
  } | null;
  lines: PayrollLine[];
  wallet: {
    id: string;
    name: string;
    currency: string;
  } | null;
  createdBy: { id: string; name: string } | null;
  approvedBy: { id: string; name: string } | null;
}

interface PayrollSummary {
  totalGrossMinor: number;
  totalAlreadyReceivedMinor: number;
  totalNetPayableMinor: number;
  totalRemainingDebtMinor: number;
  totalExpensesMinor: number;
  paidLines: number;
  unpaidLines: number;
}

interface PayrollListResponse {
  data: PayrollRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  summary: PayrollSummary;
}

const PAGE_SIZES = [10, 25, 50, 100];

function fmtDate(d?: string | null) {
  if (!d) return "—";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function SortableHeader({
  column,
  children,
}: {
  column: { getIsSorted: () => false | "asc" | "desc"; toggleSorting: (asc: boolean) => void };
  children: React.ReactNode;
}) {
  const sorted = column.getIsSorted();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-3 h-8"
      onClick={() => column.toggleSorting(sorted === "asc")}
    >
      {children}
      {sorted === "asc" ? (
        <ArrowUp className="ml-1 h-4 w-4" />
      ) : sorted === "desc" ? (
        <ArrowDown className="ml-1 h-4 w-4" />
      ) : (
        <ArrowUpDown className="ml-1 h-4 w-4 opacity-50" />
      )}
    </Button>
  );
}

export function PayrollPage() {
  const { hasPermission } = usePermissions();
  const canView = hasPermission("employees:payroll:view");
  const canManage = hasPermission("employees:payroll:manage");

  const [data, setData] = useState<PayrollListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [status, setStatus] = useState<string>("");
  const [searchInput, setSearchInput] = useState("");
  const [generateOpen, setGenerateOpen] = useState(false);
  const [sortingState, setSortingState] = useState<SortingState>([]);
  const [editMode, setEditMode] = useState(false);
  const [savingLineId, setSavingLineId] = useState<string | null>(null);
  const [wallets, setWallets] = useState<{ id: string; name: string; balance: number; currency?: string }[]>([]);

  const debouncedSearch = useDebounce(searchInput, 300);

  useEffect(() => {
    if (editMode) {
      walletApi.list().then((res) => setWallets(res.data ?? [])).catch(() => setWallets([]));
    }
  }, [editMode]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: PayrollListParams = {
        page,
        pageSize,
      };
      if (status) params.status = status;
      if (debouncedSearch) params.search = debouncedSearch;
      const res = await payrollApi.list(params);
      if (res.success) setData(res.data);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load payroll");
    } finally {
      setLoading(false);
    }
  }, [status, page, pageSize, debouncedSearch]);

  useEffect(() => {
    if (canView) load();
  }, [load, canView]);

  useLiveRefresh(load, 30_000, { fetchOnMount: false });

  const rows: PayrollRecord[] = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const summary = data?.summary ?? ({} as PayrollSummary);

  const pageNumbers = useMemo(() => {
    const pages: number[] = [];
    const current = page;
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (current > 3) pages.push(-1);
      for (let i = Math.max(2, current - 1); i <= Math.min(totalPages - 1, current + 1); i++) {
        pages.push(i);
      }
      if (current < totalPages - 2) pages.push(-1);
      pages.push(totalPages);
    }
    return pages;
  }, [totalPages, page]);

  async function handleInlineSave(
    payrollId: string,
    lineId: string,
    field: string,
    value: number | boolean | string
  ) {
    setSavingLineId(lineId);
    try {
      const body: UpdatePayrollLineBody = { lineId, [field]: value };
      const res = await payrollApi.updateLine(payrollId, body);
      if (res.success) {
        setData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            data: prev.data.map((p) =>
              p.id === payrollId ? { ...p, lines: res.data.lines, wallet: res.data.wallet ?? p.wallet } : p
            ),
          };
        });
      } else {
        toast.error(res.error || "Update failed");
      }
    } catch (e: any) {
      toast.error(e?.message || "Update failed");
    } finally {
      setSavingLineId(null);
    }
  }

  const columns = useMemo<ColumnDef<PayrollRecord>[]>(
    () => [
      {
        id: "period",
        accessorFn: (row) => row.periodStart,
        header: ({ column }) => <SortableHeader column={column}>Period</SortableHeader>,
        cell: ({ row }) => (
          <span className="whitespace-nowrap">
            {fmtDate(row.original.periodStart)} → {fmtDate(row.original.periodEnd)}
          </span>
        ),
      },
      {
        id: "employee",
        accessorFn: (row) => row.employee?.fullName ?? "",
        header: ({ column }) => <SortableHeader column={column}>Employee</SortableHeader>,
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.employee?.fullName ?? "—"}</div>
            {row.original.employee?.employeeNumber && (
              <div className="text-xs text-muted-foreground">
                {row.original.employee.employeeNumber}
              </div>
            )}
          </div>
        ),
      },
      {
        id: "overtime",
        accessorFn: (row) => row.lines?.[0]?.overtimeHours ?? 0,
        header: ({ column }) => <SortableHeader column={column}>OT Hours</SortableHeader>,
        cell: ({ row }) => {
          const line = row.original.lines?.[0];
          const isDraft = row.original.status === "DRAFT";
          if (editMode && isDraft && line) {
            return (
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  defaultValue={line.overtimeHours ?? 0}
                  className="h-7 w-20 text-xs font-mono"
                  disabled={savingLineId === line.id}
                  onBlur={(e) => {
                    const val = parseFloat(e.target.value);
                    const next = isNaN(val) ? 0 : Math.max(0, val);
                    if (next !== (line.overtimeHours ?? 0)) {
                      handleInlineSave(row.original.id, line.id, "overtimeHours", next);
                    }
                  }}
                />
                {savingLineId === line.id && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
              </div>
            );
          }
          return (
            <span className="font-mono">{line?.overtimeHours ?? 0}</span>
          );
        },
      },
      {
        id: "gross",
        accessorFn: (row) => row.lines?.[0]?.grossPayMinor ?? 0,
        header: ({ column }) => <SortableHeader column={column}>Gross</SortableHeader>,
        cell: ({ row }) => {
          const line = row.original.lines?.[0];
          return (
            <span className="font-mono">
              {line ? formatMinor(line.grossPayMinor ?? line.netPayMinor, line.currency) : "—"}
            </span>
          );
        },
      },
      {
        id: "expenses",
        accessorFn: (row) => row.lines?.[0]?.expensesPaidMinor ?? 0,
        header: ({ column }) => <SortableHeader column={column}>Expenses</SortableHeader>,
        cell: ({ row }) => {
          const line = row.original.lines?.[0];
          const isDraft = row.original.status === "DRAFT";
          if (editMode && isDraft && line) {
            return (
              <div className="flex items-center gap-1">
                <Switch
                  checked={line.deductExpenses}
                  onCheckedChange={(checked) =>
                    handleInlineSave(row.original.id, line.id, "deductExpenses", checked)
                  }
                  className="h-4 w-7 [&>span]:h-3 [&>span]:w-3"
                />
                <span className="font-mono text-xs">
                  {formatMinor(line.expensesPaidMinor ?? 0)}
                </span>
                {savingLineId === line.id && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
              </div>
            );
          }
          return (
            <span className="font-mono">
              {line ? formatMinor(line.expensesPaidMinor ?? 0) : "—"}
            </span>
          );
        },
      },
      {
        id: "allowances",
        accessorFn: (row) => row.lines?.[0]?.allowancesMinor ?? 0,
        header: ({ column }) => <SortableHeader column={column}>Allowances</SortableHeader>,
        cell: ({ row }) => {
          const line = row.original.lines?.[0];
          const isDraft = row.original.status === "DRAFT";
          if (editMode && isDraft && line) {
            return (
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  min={0}
                  defaultValue={(line.allowancesMinor ?? 0) / 100}
                  className="h-7 w-20 text-xs font-mono"
                  disabled={savingLineId === line.id}
                  onBlur={(e) => {
                    const val = parseFloat(e.target.value);
                    const next = isNaN(val) ? 0 : Math.max(0, val);
                    if (next !== ((line.allowancesMinor ?? 0) / 100)) {
                      handleInlineSave(row.original.id, line.id, "allowancesMinor", next);
                    }
                  }}
                />
                {savingLineId === line.id && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
              </div>
            );
          }
          return <span className="font-mono">{formatMinor(line?.allowancesMinor ?? 0)}</span>;
        },
      },
      {
        id: "bonuses",
        accessorFn: (row) => row.lines?.[0]?.bonusesMinor ?? 0,
        header: ({ column }) => <SortableHeader column={column}>Bonuses</SortableHeader>,
        cell: ({ row }) => {
          const line = row.original.lines?.[0];
          const isDraft = row.original.status === "DRAFT";
          if (editMode && isDraft && line) {
            return (
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  min={0}
                  defaultValue={(line.bonusesMinor ?? 0) / 100}
                  className="h-7 w-20 text-xs font-mono"
                  disabled={savingLineId === line.id}
                  onBlur={(e) => {
                    const val = parseFloat(e.target.value);
                    const next = isNaN(val) ? 0 : Math.max(0, val);
                    if (next !== ((line.bonusesMinor ?? 0) / 100)) {
                      handleInlineSave(row.original.id, line.id, "bonusesMinor", next);
                    }
                  }}
                />
                {savingLineId === line.id && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
              </div>
            );
          }
          return <span className="font-mono">{formatMinor(line?.bonusesMinor ?? 0)}</span>;
        },
      },
      {
        id: "deductions",
        accessorFn: (row) => row.lines?.[0]?.deductionsMinor ?? 0,
        header: ({ column }) => <SortableHeader column={column}>Deductions</SortableHeader>,
        cell: ({ row }) => {
          const line = row.original.lines?.[0];
          const isDraft = row.original.status === "DRAFT";
          if (editMode && isDraft && line) {
            return (
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  min={0}
                  defaultValue={(line.deductionsMinor ?? 0) / 100}
                  className="h-7 w-20 text-xs font-mono"
                  disabled={savingLineId === line.id}
                  onBlur={(e) => {
                    const val = parseFloat(e.target.value);
                    const next = isNaN(val) ? 0 : Math.max(0, val);
                    if (next !== ((line.deductionsMinor ?? 0) / 100)) {
                      handleInlineSave(row.original.id, line.id, "deductionsMinor", next);
                    }
                  }}
                />
                {savingLineId === line.id && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
              </div>
            );
          }
          return <span className="font-mono">{formatMinor(line?.deductionsMinor ?? 0)}</span>;
        },
      },
      {
        id: "received",
        accessorFn: (row) => row.lines?.[0]?.amountAlreadyReceivedMinor ?? 0,
        header: ({ column }) => <SortableHeader column={column}>Already Received</SortableHeader>,
        cell: ({ row }) => {
          const line = row.original.lines?.[0];
          return (
            <span className="font-mono">
              {line ? formatMinor(line.amountAlreadyReceivedMinor ?? 0) : "—"}
            </span>
          );
        },
      },
      {
        id: "prevDebt",
        accessorFn: (row) => row.lines?.[0]?.previousDebtMinor ?? 0,
        header: ({ column }) => <SortableHeader column={column}>Prev Debt</SortableHeader>,
        cell: ({ row }) => {
          const prevDebt = row.original.lines?.[0]?.previousDebtMinor ?? 0;
          return (
            <span className="font-mono">
              {prevDebt === 0 ? "—" : formatMinor(prevDebt)}
            </span>
          );
        },
      },
      {
        id: "netPayable",
        accessorFn: (row) => row.lines?.[0]?.netPayableMinor ?? 0,
        header: ({ column }) => <SortableHeader column={column}>Net Payable</SortableHeader>,
        cell: ({ row }) => {
          const line = row.original.lines?.[0];
          const isDraft = row.original.status === "DRAFT";
          if (editMode && isDraft && line) {
            return (
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  defaultValue={(line.netPayableMinor ?? 0) / 100}
                  className="h-7 w-24 text-xs font-mono font-semibold"
                  disabled={savingLineId === line.id}
                  onBlur={(e) => {
                    const val = parseFloat(e.target.value);
                    const next = isNaN(val) ? 0 : val;
                    if (next !== ((line.netPayableMinor ?? 0) / 100)) {
                      handleInlineSave(row.original.id, line.id, "netPayableMinor", next);
                    }
                  }}
                />
                {savingLineId === line.id && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
              </div>
            );
          }
          return (
            <span className="font-mono font-semibold">
              {line ? formatMinor(line.netPayableMinor ?? line.netPayMinor) : "—"}
            </span>
          );
        },
      },
      {
        id: "remainingDebt",
        accessorFn: (row) => row.lines?.[0]?.remainingEmployeeDebtMinor ?? 0,
        header: ({ column }) => <SortableHeader column={column}>Remaining Debt</SortableHeader>,
        cell: ({ row }) => {
          const line = row.original.lines?.[0];
          const remaining = line?.remainingEmployeeDebtMinor ?? 0;
          const isDraft = row.original.status === "DRAFT";
          if (editMode && isDraft && line) {
            return (
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  defaultValue={(line.remainingEmployeeDebtMinor ?? 0) / 100}
                  className="h-7 w-24 text-xs font-mono"
                  disabled={savingLineId === line.id}
                  onBlur={(e) => {
                    const val = parseFloat(e.target.value);
                    const next = isNaN(val) ? 0 : val;
                    if (next !== ((line.remainingEmployeeDebtMinor ?? 0) / 100)) {
                      handleInlineSave(row.original.id, line.id, "remainingEmployeeDebtMinor", next);
                    }
                  }}
                />
                {savingLineId === line.id && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
              </div>
            );
          }
          return (
            <span className="font-mono">
              {remaining === 0 ? "—" : formatMinor(remaining)}
            </span>
          );
        },
      },
      {
        id: "payment",
        accessorFn: (row) => row.lines?.[0]?.paymentStatus ?? row.status,
        header: () => <span className="font-medium text-muted-foreground">Payment</span>,
        cell: ({ row }) => {
          const line = row.original.lines?.[0];
          const status = row.original.status;
          const paidMinor = row.original.totalPaidMinor ?? 0;
          if (status === "PAID" || line?.paymentStatus === "PAID") {
            return (
              <Badge variant="default">
                {`Paid${line?.paymentMethod ? ` (${line.paymentMethod})` : ""}`}
              </Badge>
            );
          }
          if (status === "PARTIALLY_PAID" || line?.paymentStatus === "PARTIALLY_PAID") {
            return (
              <Badge variant="secondary">
                {`Partially paid ${formatMinor(paidMinor)}`}
              </Badge>
            );
          }
          return (
            <Badge variant={status === "APPROVED" ? "default" : "secondary"}>
              {status}
            </Badge>
          );
        },
        enableSorting: false,
      },
      {
        id: "wallet",
        accessorFn: (row) => row.wallet?.name ?? "",
        header: () => <span className="font-medium text-muted-foreground">Wallet</span>,
        cell: ({ row }) => {
          const isDraft = row.original.status === "DRAFT";
          if (editMode && isDraft) {
            return (
              <Select
                value={row.original.walletId ?? ""}
                onValueChange={(val) => handleInlineSave(row.original.id, row.original.lines?.[0]?.id ?? "", "walletId", val)}
              >
                <SelectTrigger className="h-7 w-36 text-xs">
                  <SelectValue placeholder="Cash / no wallet" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="no-wallet">No wallet</SelectItem>
                  {wallets.map((w) => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            );
          }
          return (
            <span className="text-muted-foreground text-sm">
              {row.original.wallet?.name ?? "—"}
            </span>
          );
        },
        enableSorting: false,
      },
      {
        id: "approvedBy",
        accessorFn: (row) => row.approvedBy?.name ?? row.createdBy?.name ?? "",
        header: () => <span className="font-medium text-muted-foreground">By</span>,
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm">
            {row.original.approvedBy?.name ?? row.original.createdBy?.name ?? "—"}
          </span>
        ),
        enableSorting: false,
      },
      ...(canManage
        ? [
            {
              id: "actions" as const,
              header: () => <span className="font-medium text-muted-foreground">Actions</span>,
              cell: ({ row }: { row: { original: PayrollRecord } }) => (
                <PayrollActions
                  payrollId={row.original.id}
                  employeeId={row.original.employeeId}
                  status={row.original.status}
                  defaultWalletId={row.original.walletId ?? undefined}
                  netPayMinor={row.original.lines?.[0]?.netPayMinor ?? 0}
                  totalPaidMinor={row.original.totalPaidMinor ?? 0}
                  onChanged={load}
                />
              ),
              enableSorting: false,
              size: 60,
            },
          ]
        : []),
    ],
    [canManage, load, editMode, savingLineId, wallets]
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting: sortingState },
    onSortingChange: setSortingState,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualPagination: true,
  });

  if (!canView) return null;

  const startIndex = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIndex = Math.min(page * pageSize, total);

  const summaryCards = [
    { label: "Total Gross", value: formatMinor(summary.totalGrossMinor) },
    { label: "Expenses", value: formatMinor(summary.totalExpensesMinor ?? 0) },
    { label: "Already Received", value: formatMinor(summary.totalAlreadyReceivedMinor) },
    { label: "Net Payable", value: formatMinor(summary.totalNetPayableMinor), highlight: true },
    { label: "Remaining Debt", value: formatMinor(summary.totalRemainingDebtMinor) },
  ];

  // Skeleton loading for initial load
  if (loading && rows.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-6 w-6 rounded" />
              <Skeleton className="h-8 w-32" />
            </div>
            <Skeleton className="h-4 w-64 mt-2" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-40" />
            <Skeleton className="h-9 w-24" />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-28" />
                <Skeleton className="h-3 w-20 mt-2" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-36" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-6 w-16" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Wallet className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            Payroll
          </h1>
          <p className="text-muted-foreground mt-1">
            Generate, approve, and track employee payroll records
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canManage && (
            <Button
              onClick={() => setGenerateOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Plus className="mr-2 h-4 w-4" />
              Generate Payroll
            </Button>
          )}
          <PayrollExportDropdown status={status || undefined} />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {summaryCards.map((c) => (
          <Card
            key={c.label}
            className={
              c.highlight
                ? "border-emerald-600/30 bg-emerald-50/50 dark:bg-emerald-950/20"
                : ""
            }
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {c.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono tracking-tight">
                {c.value}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {summary.paidLines ?? 0} paid · {summary.unpaidLines ?? 0} unpaid
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search & Filter Bar + Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>Payroll Records</CardTitle>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search employee..."
                value={searchInput}
                onChange={(e) => {
                  setSearchInput(e.target.value);
                  setPage(1);
                }}
                className="h-8 w-56 pl-8"
              />
            </div>
            <select
              value={status}
              onChange={(e) => {
                setPage(1);
                setStatus(e.target.value);
              }}
              className="h-8 rounded-md border bg-transparent px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">All statuses</option>
              <option value="DRAFT">DRAFT</option>
              <option value="APPROVED">APPROVED</option>
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="No payroll records"
              description={
                searchInput || status
                  ? "Try adjusting your search or filters."
                  : "Generate a payroll draft to get started."
              }
            />
          ) : (
            <>
              {/* Edit Mode toggle */}
              {canManage && (
                <div className="flex items-center gap-2 mb-3">
                  <Switch
                    id="edit-mode"
                    checked={editMode}
                    onCheckedChange={setEditMode}
                  />
                  <Label htmlFor="edit-mode" className="text-sm font-medium cursor-pointer">
                    Edit Mode
                  </Label>
                  {editMode && (
                    <span className="text-xs text-muted-foreground ml-2">
                      Click any field in a DRAFT row to edit
                    </span>
                  )}
                </div>
              )}
              <div className="relative">
                <Table>
                  <TableHeader>
                    {table.getHeaderGroups().map((headerGroup) => (
                      <TableRow key={headerGroup.id}>
                        {headerGroup.headers.map((header) => (
                          <TableHead key={header.id}>
                            {header.isPlaceholder
                              ? null
                              : flexRender(header.column.columnDef.header, header.getContext())}
                          </TableHead>
                        ))}
                      </TableRow>
                    ))}
                  </TableHeader>
                  <TableBody>
                    {table.getRowModel().rows.map((row) => (
                      <TableRow
                        key={row.id}
                        className={editMode && row.original.status === "DRAFT" ? "bg-blue-50/50" : ""}
                      >
                        {row.getVisibleCells().map((cell) => (
                          <TableCell key={cell.id}>
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {/* Updating indicator */}
                {loading && rows.length > 0 && (
                  <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center py-1 bg-emerald-50/80 dark:bg-emerald-950/20 border-t border-emerald-200 dark:border-emerald-800">
                    <Loader2 className="h-3 w-3 animate-spin text-emerald-600 mr-1.5" />
                    <span className="text-xs text-emerald-700 dark:text-emerald-300">Updating...</span>
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {total > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-sm text-muted-foreground">
            Showing <span className="font-medium text-foreground">{startIndex}</span> to{" "}
            <span className="font-medium text-foreground">{endIndex}</span> of{" "}
            <span className="font-medium text-foreground">{total}</span> results
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Rows:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="h-8 rounded-md border bg-transparent px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {PAGE_SIZES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
                <span className="sr-only">Previous page</span>
              </Button>
              {pageNumbers.map((pg, idx) =>
                pg === -1 ? (
                  <span key={`ellipsis-${idx}`} className="px-2 text-muted-foreground">
                    ...
                  </span>
                ) : (
                  <Button
                    key={pg}
                    variant={pg === page ? "default" : "outline"}
                    size="icon"
                    className={`h-8 w-8 ${
                      pg === page ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""
                    }`}
                    onClick={() => setPage(pg)}
                  >
                    {pg}
                  </Button>
                )
              )}
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                <ChevronRight className="h-4 w-4" />
                <span className="sr-only">Next page</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      <PayrollGenerateDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        scopeLabel="all active employees"
        onGenerated={() => {
          setPage(1);
          load();
        }}
      />
    </div>
  );
}
