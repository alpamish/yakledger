// Per-project contractor cost PDF (Phase 6, Batch B): contract budget vs
// approved claim value vs retention vs paid vs outstanding per contract.
import { Document, Page } from "@react-pdf/renderer";
import type { ProjectCostReport } from "@/types/contractor";
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
  project: "16%",
  contract: "16%",
  contractor: "13%",
  value: "11%",
  approved: "11%",
  retention: "10%",
  paid: "11%",
  outstanding: "12%",
} as const;

export default function ContractorProjectCostPdfDocument({
  report,
  companyName,
}: {
  report: ProjectCostReport;
  companyName?: string;
}) {
  const rows = report.rows.map((r) => [
    r.projectName ?? "—",
    r.contractTitle,
    r.contractorName,
    formatMoney(r.contractValue),
    formatMoney(r.approvedNet),
    formatMoney(r.retentionHeld),
    formatMoney(r.paidAmount),
    formatMoney(r.outstanding),
  ]);

  const t = report.totals;

  return (
    <Document>
      <Page size="A4" style={reportStyles.page}>
        <ReportHeader
          title="Per-Project Contractor Cost"
          companyName={companyName}
          window={windowLabel(report.from, report.to)}
        />
        <SummaryCards
          items={[
            { label: "Contract value", value: formatMoney(t.contractValue) },
            { label: "Approved (net)", value: formatMoney(t.approvedNet) },
            { label: "Paid", value: formatMoney(t.paidAmount) },
            { label: "Outstanding", value: formatMoney(t.outstanding), danger: t.outstanding > 0 },
            { label: "Retention held", value: formatMoney(t.retentionHeld) },
            { label: "Advance recovered", value: formatMoney(t.advanceRecovered) },
          ]}
        />
        <ReportTable
          columns={[
            { label: "Project", width: COL.project },
            { label: "Contract", width: COL.contract },
            { label: "Contractor", width: COL.contractor },
            { label: "Value", width: COL.value, align: "right" },
            { label: "Approved", width: COL.approved, align: "right" },
            { label: "Retention", width: COL.retention, align: "right" },
            { label: "Paid", width: COL.paid, align: "right" },
            { label: "Outstanding", width: COL.outstanding, align: "right" },
          ]}
          rows={rows}
          totals={[
            "Total",
            "",
            "",
            formatMoney(t.contractValue),
            formatMoney(t.approvedNet),
            formatMoney(t.retentionHeld),
            formatMoney(t.paidAmount),
            formatMoney(t.outstanding),
          ]}
        />
        <ReportFooter companyName={companyName} />
      </Page>
    </Document>
  );
}
