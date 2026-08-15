"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { EmptyState } from "@/components/common/empty-state";
import { PayrollActions } from "@/components/payroll/payroll-actions";
import { PayrollGenerateDialog } from "@/components/payroll/payroll-generate-dialog";
import { payrollApi } from "@/services/payroll-api";
import { getToken } from "@/services/api";
import { formatMinor } from "@/lib/money";
import { usePermissions } from "@/hooks/use-permissions";
import { toast } from "sonner";
import {
  Wallet,
  ChevronLeft,
  ChevronRight,
  Download,
  Plus,
} from "lucide-react";

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

const PAGE_SIZES = [10, 25, 50, 100];

export function PayrollPage() {
  const { hasPermission } = usePermissions();
  const canView = hasPermission("employees:payroll:view");
  const canManage = hasPermission("employees:payroll:manage");

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [status, setStatus] = useState<string>("");
  const [generateOpen, setGenerateOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await payrollApi.list({
        status: status || undefined,
        page,
        pageSize,
      });
      if (res.success) setData(res.data);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load payroll");
    } finally {
      setLoading(false);
    }
  }, [status, page, pageSize]);

  useEffect(() => {
    if (canView) load();
  }, [load, canView]);

  const rows: any[] = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const summary = data?.summary ?? {};

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

  async function handleExport() {
    try {
      const res = await fetch("/api/payroll/export", {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "payroll-export.csv";
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success("Payroll CSV downloaded");
    } catch (e: any) {
      toast.error(e?.message || "Export failed");
    }
  }

  if (!canView) return null;

  const startIndex = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIndex = Math.min(page * pageSize, total);

  const summaryCards = [
    { label: "Total Gross", value: formatMinor(summary.totalGrossMinor) },
    { label: "Already Received", value: formatMinor(summary.totalAlreadyReceivedMinor) },
    { label: "Net Payable", value: formatMinor(summary.totalNetPayableMinor), highlight: true },
    { label: "Remaining Debt", value: formatMinor(summary.totalRemainingDebtMinor) },
  ];

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
          <Button variant="outline" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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

      {/* Payroll table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Payroll Records</CardTitle>
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
        </CardHeader>
        <CardContent>
          {loading ? (
            <LoadingSpinner text="Loading payroll..." />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="No payroll records"
              description="Generate a payroll draft to get started."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Gross</TableHead>
                  <TableHead>Already Received</TableHead>
                  <TableHead>Prev Debt</TableHead>
                  <TableHead>Net Payable</TableHead>
                  <TableHead>Remaining Debt</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Wallet</TableHead>
                  <TableHead>By</TableHead>
                  {canManage && <TableHead>Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => {
                  const line = p.lines?.[0];
                  const prevDebt = line?.previousDebtMinor ?? 0;
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="whitespace-nowrap">
                        {fmtDate(p.periodStart)} → {fmtDate(p.periodEnd)}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{p.employee?.fullName ?? "—"}</div>
                        {p.employee?.employeeNumber && (
                          <div className="text-xs text-muted-foreground">
                            {p.employee.employeeNumber}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="font-mono">
                        {line ? formatMinor(line.grossPayMinor ?? line.netPayMinor, line.currency) : "—"}
                      </TableCell>
                      <TableCell className="font-mono">
                        {line ? formatMinor(line.amountAlreadyReceivedMinor ?? 0) : "—"}
                      </TableCell>
                      <TableCell className="font-mono">
                        {prevDebt === 0 ? "—" : formatMinor(prevDebt)}
                      </TableCell>
                      <TableCell className="font-mono font-semibold">
                        {line ? formatMinor(line.netPayableMinor ?? line.netPayMinor) : "—"}
                      </TableCell>
                      <TableCell className="font-mono">
                        {(line?.remainingEmployeeDebtMinor ?? 0) === 0
                          ? "—"
                          : formatMinor(line.remainingEmployeeDebtMinor)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={p.status === "APPROVED" ? "default" : "secondary"}>
                          {line?.paymentStatus === "PAID"
                            ? `Paid${line.paymentMethod ? ` (${line.paymentMethod})` : ""}`
                            : p.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {p.wallet?.name ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {p.approvedBy?.name ?? p.createdBy?.name ?? "—"}
                      </TableCell>
                      {canManage && (
                        <TableCell>
                          <PayrollActions
                            payrollId={p.id}
                            employeeId={p.employeeId}
                            status={p.status}
                            defaultWalletId={p.walletId}
                            onChanged={load}
                          />
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
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