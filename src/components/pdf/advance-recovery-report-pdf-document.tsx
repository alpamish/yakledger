// Advance recovery PDF (Phase 6): cash advances disbursed vs recovered vs
// written off vs outstanding, per contractor in the window.
import { Document, Page } from "@react-pdf/renderer";
import type { AdvanceRecoveryReport } from "@/types/contractor";
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
  disbursed: "17%",
  recovered: "17%",
  writtenOff: "18%",
  outstanding: "18%",
} as const;

export default function AdvanceRecoveryReportPdfDocument({
  report,
  companyName,
}: {
  report: AdvanceRecoveryReport;
  companyName?: string;
}) {
  const rows = report.rows.map((r) => [
    r.contractorName,
    formatMoney(r.disbursed),
    formatMoney(r.recovered),
    formatMoney(r.writtenOff),
    formatMoney(r.outstanding),
  ]);

  return (
    <Document>
      <Page size="A4" style={reportStyles.page}>
        <ReportHeader
          title="Advance Recovery Report"
          companyName={companyName}
          window={windowLabel(report.from, report.to)}
        />
        <SummaryCards
          items={[
            { label: "Disbursed", value: formatMoney(report.totalDisbursed) },
            { label: "Recovered", value: formatMoney(report.totalRecovered) },
            { label: "Written off", value: formatMoney(report.totalWrittenOff), danger: report.totalWrittenOff > 0 },
            { label: "Outstanding", value: formatMoney(report.totalOutstanding), danger: report.totalOutstanding > 0 },
          ]}
        />
        <ReportTable
          columns={[
            { label: "Contractor", width: COL.contractor },
            { label: "Disbursed", width: COL.disbursed, align: "right" },
            { label: "Recovered", width: COL.recovered, align: "right" },
            { label: "Written off", width: COL.writtenOff, align: "right" },
            { label: "Outstanding", width: COL.outstanding, align: "right" },
          ]}
          rows={rows}
          totals={[
            "Total",
            formatMoney(report.totalDisbursed),
            formatMoney(report.totalRecovered),
            formatMoney(report.totalWrittenOff),
            formatMoney(report.totalOutstanding),
          ]}
        />
        <ReportFooter companyName={companyName} />
      </Page>
    </Document>
  );
}
