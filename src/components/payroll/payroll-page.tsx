"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
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
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { PayrollActions } from "@/components/payroll/payroll-actions";
import { PayrollGenerateDialog } from "@/components/payroll/payroll-generate-dialog";
import { PayrollAdjustmentDialog } from "@/components/payroll/payroll-adjustment-dialog";
import { PayrollExportDropdown } from "@/components/payroll/payroll-export-dropdown";
import {
  PayrollFiltersBar,
  DEFAULT_PAYROLL_FILTERS,
  type PayrollFilters,
} from "@/components/payroll/payroll-filters";
import { payrollApi, type PayrollListParams, type UpdatePayrollLineBody } from "@/services/payroll-api";
import { walletApi } from "@/services/wallet-api";
import { formatMinor, toMinor } from "@/lib/money";
import { PAYROLL_TYPE_LABELS, isPayrollEditable } from "@/lib/payroll-status";
import { usePermissions } from "@/hooks/use-permissions";
import { useDebounce } from "@/hooks/use-debounce";
import { useLiveRefresh } from "@/hooks/use-live-refresh";
import { toast } from "sonner";
import {
  Wallet,
  ChevronLeft,
  ChevronRight,
  Plus,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Loader2,
  SlidersHorizontal,
  RefreshCw,
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
  adjustmentsDeductedMinor: number;
  adjustmentsEarnedMinor: number;
  previousAdjustmentsDeductedMinor: number;
  previousAdjustmentsEarnedMinor: number;
  loanDeductionMinor: number;
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
  type?: string;
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
  /** Amount actually payable to employees (floored per payroll at 0). */
  totalPayableMinor: number;
  /** Everything recorded as paid against the filtered set. */
  totalPaidMinor: number;
  /** Unpaid salary on approved / partially paid payrolls. */
  totalOutstandingMinor: number;
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

// Which column headers drive a server-side sort. Money columns are not
// server-sortable (Prisma cannot order by a related line field), so they stay
// unsorted rather than pretending to sort just the current page.
const SORT_COLUMN_MAP: Record<string, string> = {
  period: "period",
  employee: "employee",
  payment: "status",
};

const COLUMN_OPTIONS: { id: string; label: string }[] = [
  { id: "period", label: "Period" },
  { id: "employee", label: "Employee" },
  { id: "overtime", label: "OT Hours" },
  { id: "gross", label: "Gross" },
  { id: "expenses", label: "Expenses" },
  { id: "allowances", label: "Allowances" },
  { id: "bonuses", label: "Bonuses" },
  { id: "deductions", label: "Deductions" },
  { id: "received", label: "Already Received" },
  { id: "prevDebt", label: "Prev Debt" },
  { id: "loanDeduction", label: "Loan Repayment" },
  { id: "netPayable", label: "Net Payable" },
  { id: "remainingDebt", label: "Remaining Debt" },
  { id: "payment", label: "Payment" },
  { id: "wallet", label: "Wallet" },
  { id: "approvedBy", label: "By" },
];

interface PayrollView {
  filters: PayrollFilters;
  page: number;
  pageSize: number;
  sorting: SortingState;
  columnVisibility: Record<string, boolean>;
}

const VIEW_KEY = "payroll.view.v1";
const DEFAULT_VIEW: PayrollView = {
  filters: DEFAULT_PAYROLL_FILTERS,
  page: 1,
  pageSize: 10,
  sorting: [{ id: "period", desc: true }],
  columnVisibility: {},
};

function loadStoredView(): PayrollView {
  if (typeof window === "undefined") return DEFAULT_VIEW;
  try {
    const raw = sessionStorage.getItem(VIEW_KEY);
    if (!raw) return DEFAULT_VIEW;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_VIEW,
      page: typeof parsed?.page === "number" ? parsed.page : DEFAULT_VIEW.page,
      pageSize:
        typeof parsed?.pageSize === "number" ? parsed.pageSize : DEFAULT_VIEW.pageSize,
      filters: { ...DEFAULT_PAYROLL_FILTERS, ...(parsed?.filters ?? {}) },
      sorting:
        Array.isArray(parsed?.sorting) && parsed.sorting.length
          ? parsed.sorting
          : DEFAULT_VIEW.sorting,
      columnVisibility: parsed?.columnVisibility ?? {},
    };
  } catch {
    return DEFAULT_VIEW;
  }
}

function parseMinor(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? toMinor(n) : undefined;
}

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
  const [view, setView] = useState<PayrollView>(() => loadStoredView());
  const [generateOpen, setGenerateOpen] = useState(false);
  const [adjustmentOpen, setAdjustmentOpen] = useState(false);
  const [reconcileOpen, setReconcileOpen] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [savingLineId, setSavingLineId] = useState<string | null>(null);
  const [wallets, setWallets] = useState<{ id: string; name: string; balance: number; currency?: string }[]>([]);

  const { filters, page, pageSize, sorting, columnVisibility } = view;

  const patchView = useCallback(
    (patch: Partial<PayrollView>) => setView((v) => ({ ...v, ...patch })),
    []
  );
  const patchFilters = useCallback(
    (patch: Partial<PayrollFilters>) =>
      setView((v) => ({ ...v, filters: { ...v.filters, ...patch }, page: 1 })),
    []
  );
  const resetFilters = useCallback(
    () => setView((v) => ({ ...v, filters: DEFAULT_PAYROLL_FILTERS, page: 1 })),
    []
  );

  const debouncedSearch = useDebounce(filters.search, 300);

  // Wallet list powers both the wallet filter and the inline wallet editor.
  useEffect(() => {
    if (!canView) return;
    walletApi
      .list()
      .then((res) => setWallets(res.data ?? []))
      .catch(() => setWallets([]));
  }, [canView]);

  // Remember the whole view (filters, page, sorting, columns) for this tab.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      sessionStorage.setItem(VIEW_KEY, JSON.stringify(view));
    } catch {
      // Storage unavailable (private mode) — filters just won't persist.
    }
  }, [view]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sortId = sorting[0]?.id;
      const params: PayrollListParams = {
        page,
        pageSize,
        search: debouncedSearch || undefined,
        status: filters.status || undefined,
        paymentState: filters.paymentState || undefined,
        periodStart: filters.dateFrom || undefined,
        periodEnd: filters.dateTo || undefined,
        department: filters.department || undefined,
        walletId: filters.walletId || undefined,
        type: filters.type || undefined,
        minNetMinor: parseMinor(filters.minNet),
        maxNetMinor: parseMinor(filters.maxNet),
        sort: sortId ? SORT_COLUMN_MAP[sortId] ?? "period" : "period",
        dir: sorting[0]?.desc === false ? "asc" : "desc",
      };
      const res = await payrollApi.list(params);
      if (res.success) setData(res.data);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load payroll");
    } finally {
      setLoading(false);
    }
  }, [
    page,
    pageSize,
    debouncedSearch,
    filters.status,
    filters.paymentState,
    filters.dateFrom,
    filters.dateTo,
    filters.department,
    filters.walletId,
    filters.type,
    filters.minNet,
    filters.maxNet,
    sorting,
  ]);

  useEffect(() => {
    if (canView) load();
  }, [load, canView]);

  useLiveRefresh(load, 30_000, { fetchOnMount: false });

  // Payrolls whose salary was recorded as an approved SALARY expense (rather
  // than through the Record Payment flow) can be marked settled from that
  // evidence. No new transactions are created by this action.
  const handleReconcile = async () => {
    setReconciling(true);
    try {
      const res = await payrollApi.reconcilePayments();
      if (res.success && res.data) {
        const { updated, paid, partiallyPaid } = res.data;
        if (updated > 0) {
          toast.success(
            `Reconciled ${updated} payroll${updated === 1 ? "" : "s"}: ` +
              `${paid} paid, ${partiallyPaid} partially paid`
          );
        } else {
          toast.success("All payrolls already match their linked salary expenses");
        }
        setReconcileOpen(false);
        await load();
      } else {
        toast.error(res.error ?? "Failed to reconcile payroll payments");
      }
    } catch (e: any) {
      toast.error(e?.message || "Failed to reconcile payroll payments");
    } finally {
      setReconciling(false);
    }
  };

  const rows: PayrollRecord[] = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const summary = data?.summary ?? ({} as PayrollSummary);

  const exportFilters = useMemo<PayrollListParams>(
    () => ({
      status: filters.status || undefined,
      paymentState: filters.paymentState || undefined,
      search: debouncedSearch || undefined,
      periodStart: filters.dateFrom || undefined,
      periodEnd: filters.dateTo || undefined,
      department: filters.department || undefined,
      walletId: filters.walletId || undefined,
      type: filters.type || undefined,
      minNetMinor: parseMinor(filters.minNet),
      maxNetMinor: parseMinor(filters.maxNet),
      sort: sorting[0] ? SORT_COLUMN_MAP[sorting[0].id] ?? "period" : "period",
      dir: sorting[0]?.desc === false ? "asc" : "desc",
    }),
    [filters, debouncedSearch, sorting]
  );

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
            {row.original.type === "FINAL_SETTLEMENT" && (
              <Badge
                variant="outline"
                className="ml-2 border-amber-500 text-amber-600 dark:text-amber-400"
              >
                {PAYROLL_TYPE_LABELS.FINAL_SETTLEMENT}
              </Badge>
            )}
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
        header: () => <span className="font-medium text-muted-foreground">OT Hours</span>,
        enableSorting: false,
        cell: ({ row }) => {
          const line = row.original.lines?.[0];
          const isEditable = isPayrollEditable(row.original.status);
          if (editMode && isEditable && line) {
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
        header: () => <span className="font-medium text-muted-foreground">Gross</span>,
        enableSorting: false,
        cell: ({ row }) => {
          const line = row.original.lines?.[0];
          const deducted = line?.adjustmentsDeductedMinor ?? 0;
          const earned = line?.adjustmentsEarnedMinor ?? 0;
          return (
            <div>
              <span className="font-mono">
                {line ? formatMinor(line.grossPayMinor ?? line.netPayMinor, line.currency) : "—"}
              </span>
              {(deducted > 0 || earned > 0) && (
                <div
                  className="text-xs text-muted-foreground whitespace-nowrap"
                  title="Manual payroll adjustments applied inside gross"
                >
                  Adj:{" "}
                  {deducted > 0 ? `−${formatMinor(deducted)}` : ""}
                  {deducted > 0 && earned > 0 ? " / " : ""}
                  {earned > 0 ? `+${formatMinor(earned)}` : ""}
                </div>
              )}
            </div>
          );
        },
      },
      {
        id: "expenses",
        accessorFn: (row) => row.lines?.[0]?.expensesPaidMinor ?? 0,
        header: () => <span className="font-medium text-muted-foreground">Expenses</span>,
        enableSorting: false,
        cell: ({ row }) => {
          const line = row.original.lines?.[0];
          return (
            <span className="font-mono" title="Employee-paid expenses are reimbursed separately from salary">
              {line ? formatMinor(line.expensesPaidMinor ?? 0) : "—"}
            </span>
          );
        },
      },
      {
        id: "allowances",
        accessorFn: (row) => row.lines?.[0]?.allowancesMinor ?? 0,
        header: () => <span className="font-medium text-muted-foreground">Allowances</span>,
        enableSorting: false,
        cell: ({ row }) => {
          const line = row.original.lines?.[0];
          const isEditable = isPayrollEditable(row.original.status);
          if (editMode && isEditable && line) {
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
        header: () => <span className="font-medium text-muted-foreground">Bonuses</span>,
        enableSorting: false,
        cell: ({ row }) => {
          const line = row.original.lines?.[0];
          const isEditable = isPayrollEditable(row.original.status);
          if (editMode && isEditable && line) {
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
        header: () => <span className="font-medium text-muted-foreground">Deductions</span>,
        enableSorting: false,
        cell: ({ row }) => {
          const line = row.original.lines?.[0];
          const isEditable = isPayrollEditable(row.original.status);
          if (editMode && isEditable && line) {
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
        header: () => <span className="font-medium text-muted-foreground">Already Received</span>,
        enableSorting: false,
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
        header: () => <span className="font-medium text-muted-foreground">Prev Debt</span>,
        enableSorting: false,
        cell: ({ row }) => {
          const line = row.original.lines?.[0];
          const prevDebt = line?.previousDebtMinor ?? 0;
          const prevDeducted = line?.previousAdjustmentsDeductedMinor ?? 0;
          const prevEarned = line?.previousAdjustmentsEarnedMinor ?? 0;
          return (
            <div>
              <span className="font-mono">
                {prevDebt === 0 ? "—" : formatMinor(prevDebt)}
              </span>
              {(prevDeducted > 0 || prevEarned > 0) && (
                <div
                  className="text-xs text-muted-foreground whitespace-nowrap"
                  title="Advance-edit adjustment already itemised inside previous debt"
                >
                  Adj:{" "}
                  {prevDeducted > 0 ? `−${formatMinor(prevDeducted)}` : ""}
                  {prevDeducted > 0 && prevEarned > 0 ? " / " : ""}
                  {prevEarned > 0 ? `+${formatMinor(prevEarned)}` : ""}
                </div>
              )}
            </div>
          );
        },
      },
      {
        id: "loanDeduction",
        accessorFn: (row) => row.lines?.[0]?.loanDeductionMinor ?? 0,
        header: () => <span className="font-medium text-muted-foreground">Loan Repayment</span>,
        enableSorting: false,
        cell: ({ row }) => {
          const line = row.original.lines?.[0];
          const isEditable = isPayrollEditable(row.original.status);
          if (editMode && isEditable && line) {
            return (
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  min={0}
                  defaultValue={(line.loanDeductionMinor ?? 0) / 100}
                  className="h-7 w-20 text-xs font-mono"
                  disabled={savingLineId === line.id}
                  onBlur={(e) => {
                    const val = parseFloat(e.target.value);
                    const next = isNaN(val) ? 0 : Math.max(0, val);
                    if (next !== ((line.loanDeductionMinor ?? 0) / 100)) {
                      handleInlineSave(row.original.id, line.id, "loanDeductionMinor", next);
                    }
                  }}
                />
                {savingLineId === line.id && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
              </div>
            );
          }
          const loanDeduction = line?.loanDeductionMinor ?? 0;
          return (
            <span className="font-mono">
              {loanDeduction === 0 ? "—" : formatMinor(loanDeduction)}
            </span>
          );
        },
      },
      {
        id: "netPayable",
        accessorFn: (row) => row.lines?.[0]?.netPayableMinor ?? 0,
        header: () => <span className="font-medium text-muted-foreground">Net Payable</span>,
        enableSorting: false,
        cell: ({ row }) => {
          const line = row.original.lines?.[0];
          const isEditable = isPayrollEditable(row.original.status);
          if (editMode && isEditable && line) {
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
        header: () => <span className="font-medium text-muted-foreground">Remaining Debt</span>,
        enableSorting: false,
        cell: ({ row }) => {
          const line = row.original.lines?.[0];
          const remaining = line?.remainingEmployeeDebtMinor ?? 0;
          const isEditable = isPayrollEditable(row.original.status);
          if (editMode && isEditable && line) {
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
        accessorFn: (row) => row.status,
        header: ({ column }) => <SortableHeader column={column}>Payment</SortableHeader>,
        cell: ({ row }) => {
          const line = row.original.lines?.[0];
          const status = row.original.status;
          const netPayMinor = Math.max(line?.netPayMinor ?? 0, 0);
          const paidMinor = row.original.totalPaidMinor ?? 0;
          // Authoritative: derived from recorded payments, not the line marker.
          const fullyPaid =
            status === "PAID" || (netPayMinor > 0 && paidMinor >= netPayMinor);
          const partiallyPaid = !fullyPaid && paidMinor > 0;
          if (fullyPaid) {
            return (
              <Badge variant="default">
                {`Paid${line?.paymentMethod ? ` (${line.paymentMethod})` : ""}`}
              </Badge>
            );
          }
          if (partiallyPaid) {
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
      },
      {
        id: "wallet",
        accessorFn: (row) => row.wallet?.name ?? "",
        header: () => <span className="font-medium text-muted-foreground">Wallet</span>,
        enableSorting: false,
        cell: ({ row }) => {
          const isEditable = isPayrollEditable(row.original.status);
          if (editMode && isEditable) {
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
      },
      {
        id: "approvedBy",
        accessorFn: (row) => row.approvedBy?.name ?? row.createdBy?.name ?? "",
        header: () => <span className="font-medium text-muted-foreground">By</span>,
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm">
            {row.original.approvedBy?.name ?? row.original.createdBy?.name ?? "—"}
          </span>
        ),
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
    state: { sorting, columnVisibility },
    onSortingChange: (updater) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      patchView({ sorting: next, page: 1 });
    },
    onColumnVisibilityChange: (updater) => {
      const next =
        typeof updater === "function" ? updater(columnVisibility) : updater;
      patchView({ columnVisibility: next });
    },
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
  });

  if (!canView) return null;

  const startIndex = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIndex = Math.min(page * pageSize, total);

  const summaryCards: {
    label: string;
    value: string;
    highlight?: boolean;
    debt?: boolean;
  }[] = [
    { label: "Total Payable", value: formatMinor(summary.totalPayableMinor ?? 0) },
    { label: "Paid", value: formatMinor(summary.totalPaidMinor ?? 0) },
    {
      label: "Remaining to Pay",
      value: formatMinor(summary.totalOutstandingMinor ?? 0),
      highlight: true,
    },
    { label: "Total Gross", value: formatMinor(summary.totalGrossMinor) },
    { label: "Expenses", value: formatMinor(summary.totalExpensesMinor ?? 0) },
    { label: "Already Received", value: formatMinor(summary.totalAlreadyReceivedMinor) },
  ];

  // Only surface employee debt when someone actually owes the company (an
  // advance larger than their salary); otherwise it just reads as a misleading
  // 0.00 next to the salary figures.
  if ((summary.totalRemainingDebtMinor ?? 0) > 0) {
    summaryCards.push({
      label: "Employee owes (advances)",
      value: formatMinor(summary.totalRemainingDebtMinor),
      debt: true,
    });
  }

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
          {canManage && (
            <Button variant="outline" onClick={() => setAdjustmentOpen(true)}>
              <SlidersHorizontal className="mr-2 h-4 w-4" />
              Adjustment
            </Button>
          )}
          {canManage && (
            <Button
              variant="outline"
              onClick={() => setReconcileOpen(true)}
              disabled={reconciling}
              title="Mark payrolls paid / partially paid from their linked salary expenses (no new transactions)"
            >
              {reconciling ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Sync Payments
            </Button>
          )}
          <PayrollExportDropdown filters={exportFilters} />
        </div>
      </div>

      {/* Summary cards — totals across every record matching the filters */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span className="font-medium">Filtered totals</span>
          <span className="text-muted-foreground">
            · {total} record{total === 1 ? "" : "s"} · {summary.paidLines ?? 0} paid ·{" "}
            {summary.unpaidLines ?? 0} unpaid
          </span>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {summaryCards.map((c) => (
            <Card
              key={c.label}
              className={
                c.highlight
                  ? "border-emerald-600/30 bg-emerald-50/50 dark:bg-emerald-950/20"
                  : c.debt
                    ? "border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20"
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
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Search & Filter Bar + Table */}
      <Card>
        <CardHeader className="space-y-3">
          <CardTitle>Payroll Records</CardTitle>
          <PayrollFiltersBar
            filters={filters}
            onChange={patchFilters}
            onReset={resetFilters}
            wallets={wallets}
            columnOptions={COLUMN_OPTIONS}
            columnVisibility={columnVisibility}
            onToggleColumn={(id) =>
              patchView({
                columnVisibility: {
                  ...columnVisibility,
                  [id]: columnVisibility[id] === false ? true : false,
                },
              })
            }
            onShowAllColumns={() => patchView({ columnVisibility: {} })}
          />
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="No payroll records"
              description={
                total === 0 && !loading
                  ? "Try adjusting your search or filters, or generate a payroll draft to get started."
                  : "Loading payroll records…"
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
                      Click any field in an open row to edit (paid rows are locked)
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
                        className={editMode && isPayrollEditable(row.original.status) ? "bg-blue-50/50" : ""}
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
                  patchView({ pageSize: Number(e.target.value), page: 1 });
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
                onClick={() => patchView({ page: Math.max(1, page - 1) })}
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
                    onClick={() => patchView({ page: pg })}
                  >
                    {pg}
                  </Button>
                )
              )}
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => patchView({ page: Math.min(totalPages, page + 1) })}
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
          patchView({ page: 1 });
          load();
        }}
      />

      <PayrollAdjustmentDialog
        open={adjustmentOpen}
        onOpenChange={setAdjustmentOpen}
        onCreated={() => load()}
      />

      <ConfirmDialog
        open={reconcileOpen}
        onOpenChange={setReconcileOpen}
        title="Sync payments from expenses"
        description="Payrolls marked Approved or Partially Paid will be updated to Paid / Partially Paid based on their approved SALARY expenses. No payment, cash, expense or accounting transactions are created."
        confirmText={reconciling ? "Syncing..." : "Sync payments"}
        onConfirm={handleReconcile}
      />
    </div>
  );
}
