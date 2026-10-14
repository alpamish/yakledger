// Machinery downtime PDF (Phase 6, Batch B): per-machine totals plus a
// portfolio breakdown by downtime reason, with the chargeable split.
import { Document, Page, Text } from "@react-pdf/renderer";
import type { DowntimeReport } from "@/types/contractor";
import {
  reportStyles,
  ReportHeader,
  SummaryCards,
  ReportTable,
  ReportFooter,
} from "./finance-report-shared";

const fmtH = (n: number) => `${n.toFixed(1)} h`;

const MCOL = { machine: "25%", contractor: "18%", records: "12%", total: "22%", chargeable: "23%" } as const;
const RCOL = { reason: "40%", records: "20%", hours: "20%", chargeable: "20%" } as const;

export default function MachineryDowntimePdfDocument({
  report,
  companyName,
}: {
  report: DowntimeReport;
  companyName?: string;
}) {
  const machineRows = report.rows.map((r) => [
    r.machineryName,
    r.assignedContractorName ?? "—",
    String(r.recordCount),
    fmtH(r.totalHours),
    fmtH(r.chargeableHours),
  ]);

  const reasonRows = report.byReason.map((r) => [
    r.reason,
    String(r.recordCount),
    fmtH(r.hours),
    fmtH(r.chargeableHours),
  ]);

  return (
    <Document>
      <Page size="A4" style={reportStyles.page}>
        <ReportHeader
          title="Machinery Downtime Report"
          companyName={companyName}
          window={report.from || report.to ? `${report.from ?? "…"} → ${report.to ?? "…"}` : undefined}
        />
        <SummaryCards
          items={[
            { label: "Total downtime", value: fmtH(report.totalHours), danger: report.totalHours > 0 },
            { label: "Chargeable", value: fmtH(report.chargeableHours) },
            { label: "Machines affected", value: String(report.rows.length) },
          ]}
        />

        <Text style={reportStyles.sectionTitle}>By machine</Text>
        <ReportTable
          columns={[
            { label: "Machine", width: MCOL.machine },
            { label: "Contractor", width: MCOL.contractor },
            { label: "Records", width: MCOL.records, align: "right" },
            { label: "Total hours", width: MCOL.total, align: "right" },
            { label: "Chargeable", width: MCOL.chargeable, align: "right" },
          ]}
          rows={machineRows}
          totals={[
            "Total",
            "",
            String(report.rows.reduce((s, r) => s + r.recordCount, 0)),
            fmtH(report.totalHours),
            fmtH(report.chargeableHours),
          ]}
        />

        <Text style={reportStyles.sectionTitle}>By reason</Text>
        <ReportTable
          columns={[
            { label: "Reason", width: RCOL.reason },
            { label: "Records", width: RCOL.records, align: "right" },
            { label: "Hours", width: RCOL.hours, align: "right" },
            { label: "Chargeable", width: RCOL.chargeable, align: "right" },
          ]}
          rows={reasonRows}
          totals={[
            "Total",
            String(report.byReason.reduce((s, r) => s + r.recordCount, 0)),
            fmtH(report.totalHours),
            fmtH(report.chargeableHours),
          ]}
        />

        <ReportFooter companyName={companyName} />
      </Page>
    </Document>
  );
}
