// Retention held & released PDF (Phase 6): retention snapshotted on posted
// claims vs RetentionRelease rows, per contractor in the window.
import { Document, Page } from "@react-pdf/renderer";
import type { RetentionReport } from "@/types/contractor";
import {
  formatMoney,
  windowLabel,
  reportStyles,
  ReportHeader,
  SummaryCards,
  ReportTable,
  ReportFooter,
} from "./finance-report-shared";

const COL = {
  contractor: "30%",
  claims: "12%",
  held: "19%",
  released: "19%",
  balance: "20%",
} as const;

export default function RetentionReportPdfDocument({
  report,
  companyName,
}: {
  report: RetentionReport;
  companyName?: string;
}) {
  const rows = report.rows.map((r) => [
    r.contractorName,
    String(r.claimCount),
    formatMoney(r.held),
    formatMoney(r.released),
    formatMoney(r.balance),
  ]);

  return (
    <Document>
      <Page size="A4" style={reportStyles.page}>
        <ReportHeader
          title="Retention Held & Released"
          companyName={companyName}
          window={windowLabel(report.from, report.to)}
        />
        <SummaryCards
          items={[
            { label: "Total held", value: formatMoney(report.totalHeld) },
            { label: "Total released", value: formatMoney(report.totalReleased) },
            { label: "Still withheld", value: formatMoney(report.totalBalance), danger: report.totalBalance < 0 },
          ]}
        />
        <ReportTable
          columns={[
            { label: "Contractor", width: COL.contractor },
            { label: "Claims", width: COL.claims, align: "right" },
            { label: "Held", width: COL.held, align: "right" },
            { label: "Released", width: COL.released, align: "right" },
            { label: "Balance", width: COL.balance, align: "right" },
          ]}
          rows={rows}
          totals={[
            "Total",
            String(report.rows.reduce((s, r) => s + r.claimCount, 0)),
            formatMoney(report.totalHeld),
            formatMoney(report.totalReleased),
            formatMoney(report.totalBalance),
          ]}
        />
        <ReportFooter companyName={companyName} />
      </Page>
    </Document>
  );
}
