"use client";

import { useCallback, useEffect, useState } from "react";
import { pdf } from "@react-pdf/renderer";
import * as XLSX from "xlsx";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getToken } from "@/services/api";
import { settingsApi } from "@/services/settings";
import {
  buildPayrollQuery,
  type PayrollListParams,
} from "@/services/payroll-api";
import { usePermissions } from "@/hooks/use-permissions";
import { formatMinor, fromMinor } from "@/lib/money";
import { toast } from "sonner";
import { Download, FileSpreadsheet, FileText, Loader2, ChevronDown } from "lucide-react";
import PayrollPDFDocument from "@/components/pdf/payroll-pdf-document";
import PayrollSummaryPDFDocument from "@/components/pdf/payroll-summary-pdf-document";

interface ExportDropdownProps {
  /** Active list filters; the export mirrors what is on screen. */
  filters?: PayrollListParams;
}

function buildExcel(rows: any[]) {
  const dataRows = rows.flatMap((p: any) =>
    (p.lines ?? []).map((l: any) => ({
      "Employee No": p.employee?.employeeNumber ?? "",
      "Employee": p.employee?.fullName ?? "",
      "Department": p.employee?.department ?? "",
      "Period Start": p.periodStart?.slice(0, 10) ?? "",
      "Period End": p.periodEnd?.slice(0, 10) ?? "",
      "Status": p.status ?? "",
      "Gross (AFN)": Number(fromMinor(l.grossPayMinor).toFixed(2)),
      "Already Received (AFN)": Number(fromMinor(l.amountAlreadyReceivedMinor).toFixed(2)),
      "Previous Debt (AFN)": Number(fromMinor(l.previousDebtMinor).toFixed(2)),
      "Net Payable (AFN)": Number(fromMinor(l.netPayableMinor).toFixed(2)),
      "Remaining Debt (AFN)": Number(fromMinor(l.remainingEmployeeDebtMinor).toFixed(2)),
      "Payment Status":
        l.paymentStatus === "PARTIALLY_PAID"
          ? "Partially Paid"
          : (l.paymentStatus ?? ""),
      "Payment Method": l.paymentMethod ?? "",
      "Wallet": p.wallet?.name ?? "",
      "Approved By": p.approvedBy?.name ?? "",
    }))
  );

  const ws = XLSX.utils.json_to_sheet(dataRows);
  const keys = dataRows[0] ? Object.keys(dataRows[0]) : [];
  ws["!cols"] = keys.map((key) => ({
    wch: Math.max(key.length, ...dataRows.map((r) => String(r[key]).length).slice(0, 20)) + 2,
  }));

  const totals = rows.reduce(
    (acc: any, p: any) => {
      for (const l of p.lines ?? []) {
        acc.gross += l.grossPayMinor ?? 0;
        acc.received += l.amountAlreadyReceivedMinor ?? 0;
        acc.prevDebt += l.previousDebtMinor ?? 0;
        acc.netPayable += l.netPayableMinor ?? 0;
        acc.remaining += l.remainingEmployeeDebtMinor ?? 0;
        if (l.paymentStatus === "PAID") acc.paid += 1;
        else acc.unpaid += 1;
      }
      return acc;
    },
    { gross: 0, received: 0, prevDebt: 0, netPayable: 0, remaining: 0, paid: 0, unpaid: 0 }
  );

  const summaryRows = [
    { Metric: "Payroll Records", Value: rows.length },
    { Metric: "Paid Lines", Value: totals.paid },
    { Metric: "Unpaid Lines", Value: totals.unpaid },
    { Metric: "Total Gross (AFN)", Value: Number(fromMinor(totals.gross).toFixed(2)) },
    { Metric: "Total Already Received (AFN)", Value: Number(fromMinor(totals.received).toFixed(2)) },
    { Metric: "Total Previous Debt (AFN)", Value: Number(fromMinor(totals.prevDebt).toFixed(2)) },
    { Metric: "Total Net Payable (AFN)", Value: Number(fromMinor(totals.netPayable).toFixed(2)) },
    { Metric: "Total Remaining Debt (AFN)", Value: Number(fromMinor(totals.remaining).toFixed(2)) },
  ];
  const ws2 = XLSX.utils.json_to_sheet(summaryRows);
  ws2["!cols"] = [{ wch: 30 }, { wch: 20 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Payroll");
  XLSX.utils.book_append_sheet(wb, ws2, "Summary");
  return wb;
}

export function PayrollExportDropdown({ filters }: ExportDropdownProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState("YakhshiLedger");
  const { hasPermission } = usePermissions();
  const canPdf = hasPermission("reports:generatePdf");
  const status = filters?.status;

  useEffect(() => {
    settingsApi
      .get()
      .then((res) => {
        if (res.data?.companyName) setCompanyName(res.data.companyName);
      })
      .catch(() => {});
  }, []);

  const fetchJson = useCallback(async () => {
    const qs = buildPayrollQuery(filters ?? {});
    const res = await fetch(`/api/payroll/export?format=json${qs ? `&${qs}` : ""}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) throw new Error("Failed to load payroll data");
    const json = await res.json();
    if (!json.success) throw new Error(json.error || "Failed to load payroll data");
    return json.data ?? [];
  }, [filters]);

  const handleCsv = useCallback(async () => {
    setBusy("csv");
    try {
      const qs = buildPayrollQuery(filters ?? {});
      const res = await fetch(`/api/payroll/export${qs ? `?${qs}` : ""}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `payroll-report-${format(new Date(), "yyyy-MM-dd")}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success("Payroll CSV downloaded");
    } catch (e: any) {
      toast.error(e?.message || "Export failed");
    } finally {
      setBusy(null);
    }
  }, [filters]);

  const handleExcel = useCallback(async () => {
    setBusy("excel");
    try {
      const rows = await fetchJson();
      const wb = buildExcel(rows);
      XLSX.writeFile(wb, `payroll-report-${format(new Date(), "yyyy-MM-dd")}.xlsx`);
      toast.success("Payroll Excel report downloaded");
    } catch (e: any) {
      toast.error(e?.message || "Excel export failed");
    } finally {
      setBusy(null);
    }
  }, [fetchJson]);

  const handlePdf = useCallback(async () => {
    setBusy("pdf");
    try {
      const rows = await fetchJson();
      const blob = await pdf(
        <PayrollPDFDocument rows={rows} status={status} companyName={companyName} />
      ).toBlob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `payroll-report-${format(new Date(), "yyyy-MM-dd")}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success("Payroll PDF report downloaded");
    } catch (e: any) {
      toast.error(e?.message || "PDF export failed");
    } finally {
      setBusy(null);
    }
  }, [fetchJson, status, companyName]);

  const handleSummaryPdf = useCallback(async () => {
    setBusy("pdf-summary");
    try {
      const rows = await fetchJson();
      const blob = await pdf(
        <PayrollSummaryPDFDocument rows={rows} status={status} companyName={companyName} />
      ).toBlob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `payroll-summary-${format(new Date(), "yyyy-MM-dd")}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success("Payroll Summary PDF downloaded");
    } catch (e: any) {
      toast.error(e?.message || "PDF export failed");
    } finally {
      setBusy(null);
    }
  }, [fetchJson, status, companyName]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={busy !== null}>
          {busy ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          {busy ? "Exporting..." : "Export"}
          <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Export payroll report</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleCsv}>
          <FileText className="mr-2 h-4 w-4" />
          CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleExcel}>
          <FileSpreadsheet className="mr-2 h-4 w-4 text-emerald-600" />
          Excel (.xlsx)
        </DropdownMenuItem>
        {canPdf && (
          <DropdownMenuItem onClick={handlePdf}>
            <FileText className="mr-2 h-4 w-4 text-red-500" />
            PDF (Full)
          </DropdownMenuItem>
        )}
        {canPdf && (
          <DropdownMenuItem onClick={handleSummaryPdf}>
            <FileText className="mr-2 h-4 w-4 text-orange-500" />
            PDF (Summary)
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
