// Portfolio payable aging PDF (Phase 6): unpaid posted claims bucketed by
// days since periodEnd against `asOf`, per contractor, with portfolio totals.
import { Document, Page } from "@react-pdf/renderer";
import type { PayableAgingReport } from "@/types/contractor";
import {
  formatMoney,
  reportStyles,
  ReportHeader,
  SummaryCards,
  ReportTable,
  ReportFooter,
} from "./finance-report-shared";

const COL = {
  contractor: "24%",
  claims: "10%",
  current: "13%",
  b030: "13%",
  b3160: "13%",
  b6190: "13%",
  b90: "14%",
} as const;

export default function PayableAgingPdfDocument({
  report,
  companyName,
}: {
  report: PayableAgingReport;
  companyName?: string;
}) {
  const rows = report.rows.map((r) => [
    r.contractorName,
    String(r.claimCount),
    formatMoney(r.buckets.current),
    formatMoney(r.buckets["0-30"]),
    formatMoney(r.buckets["31-60"]),
    formatMoney(r.buckets["61-90"]),
    formatMoney(r.buckets["90+"]),
  ]);

  return (
    <Document>
      <Page size="A4" style={reportStyles.page}>
        <ReportHeader
          title="Payable Aging Report"
          companyName={companyName}
          asOf={report.asOf.slice(0, 10)}
        />
        <SummaryCards
          items={[
            { label: "Total outstanding", value: formatMoney(report.grandTotal) },
            { label: "Current", value: formatMoney(report.totals.current) },
            { label: "0-30 days", value: formatMoney(report.totals["0-30"]) },
            { label: "31-60 days", value: formatMoney(report.totals["31-60"]) },
            { label: "61-90 days", value: formatMoney(report.totals["61-90"]) },
            { label: "90+ days", value: formatMoney(report.totals["90+"]), danger: report.totals["90+"] > 0 },
          ]}
        />
        <ReportTable
          columns={[
            { label: "Contractor", width: COL.contractor },
            { label: "Claims", width: COL.claims, align: "right" },
            { label: "Current", width: COL.current, align: "right" },
            { label: "0-30", width: COL.b030, align: "right" },
            { label: "31-60", width: COL.b3160, align: "right" },
            { label: "61-90", width: COL.b6190, align: "right" },
            { label: "90+", width: COL.b90, align: "right" },
          ]}
          rows={rows}
          totals={[
            "Total",
            String(report.rows.reduce((s, r) => s + r.claimCount, 0)),
            formatMoney(report.totals.current),
            formatMoney(report.totals["0-30"]),
            formatMoney(report.totals["31-60"]),
            formatMoney(report.totals["61-90"]),
            formatMoney(report.totals["90+"]),
          ]}
        />
        <ReportFooter companyName={companyName} />
      </Page>
    </Document>
  );
}
