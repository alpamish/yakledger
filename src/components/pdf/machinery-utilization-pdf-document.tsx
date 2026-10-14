// Machinery utilization PDF (Phase 6, Batch B): worked/idle/breakdown hours
// from daily logs, downtime hours from records, and utilization % per machine.
import { Document, Page, Text } from "@react-pdf/renderer";
import type { UtilizationReport } from "@/types/contractor";
import {
  reportStyles,
  ReportHeader,
  SummaryCards,
  ReportTable,
  ReportFooter,
} from "./finance-report-shared";

const fmtH = (n: number) => `${n.toFixed(1)} h`;
const fmtPct = (p: number | null) => (p === null ? "—" : `${p}%`);

const COL = {
  machine: "17%",
  type: "10%",
  plate: "8%",
  contractor: "13%",
  days: "6%",
  worked: "10%",
  idle: "9%",
  down: "9%",
  chargeable: "9%",
  util: "9%",
} as const;

export default function MachineryUtilizationPdfDocument({
  report,
  companyName,
}: {
  report: UtilizationReport;
  companyName?: string;
}) {
  const rows = report.rows.map((r) => [
    r.machineryName,
    r.machineryType,
    r.plateNumber ?? "—",
    r.assignedContractorName ?? "—",
    String(r.loggedDays),
    fmtH(r.workedHours),
    fmtH(r.idleHours),
    fmtH(r.downtimeHours),
    fmtH(r.chargeableDowntimeHours),
    fmtPct(r.utilizationPercent),
  ]);

  const t = report.totals;

  return (
    <Document>
      <Page size="A4" style={reportStyles.page}>
        <ReportHeader
          title="Machinery Utilization Report"
          companyName={companyName}
          window={report.from || report.to ? `${report.from ?? "…"} → ${report.to ?? "…"}` : undefined}
        />
        <SummaryCards
          items={[
            { label: "Fleet utilization", value: fmtPct(t.utilizationPercent) },
            { label: "Worked hours", value: fmtH(t.workedHours) },
            { label: "Idle hours", value: fmtH(t.idleHours) },
            { label: "Downtime hours", value: fmtH(t.downtimeHours), danger: t.downtimeHours > 0 },
            { label: "Chargeable downtime", value: fmtH(t.chargeableDowntimeHours) },
            { label: "Log days", value: String(t.loggedDays) },
          ]}
        />
        {report.rows.length === 0 ? (
          <Text style={reportStyles.noData}>No machinery in scope.</Text>
        ) : (
          <ReportTable
            columns={[
              { label: "Machine", width: COL.machine },
              { label: "Type", width: COL.type },
              { label: "Plate", width: COL.plate },
              { label: "Contractor", width: COL.contractor },
              { label: "Days", width: COL.days, align: "right" },
              { label: "Worked", width: COL.worked, align: "right" },
              { label: "Idle", width: COL.idle, align: "right" },
              { label: "Down", width: COL.down, align: "right" },
              { label: "Chg. down", width: COL.chargeable, align: "right" },
              { label: "Util %", width: COL.util, align: "right" },
            ]}
            rows={rows}
            totals={[
              "Total",
              "",
              "",
              "",
              String(t.loggedDays),
              fmtH(t.workedHours),
              fmtH(t.idleHours),
              fmtH(t.downtimeHours),
              fmtH(t.chargeableDowntimeHours),
              fmtPct(t.utilizationPercent),
            ]}
          />
        )}
        <ReportFooter companyName={companyName} />
      </Page>
    </Document>
  );
}
