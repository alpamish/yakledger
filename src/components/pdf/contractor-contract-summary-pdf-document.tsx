// Contract summary PDF (Phase 6): per-contract budget vs approved work vs
// approved variations vs paid. Budget figures are point-in-time (base +
// variations = revised, always); work/retention/paid/outstanding are windowed
// server-side — this document only renders the aggregated rows.
import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { ContractSummaryReport } from "@/types/contractor";
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
  contract: "13%",
  project: "15%",
  budget: "13%",
  variations: "11%",
  approved: "13%",
  retention: "11%",
  paid: "12%",
  outstanding: "12%",
} as const;

export default function ContractSummaryPdfDocument({
  report,
  companyName,
}: {
  report: ContractSummaryReport;
  companyName?: string;
}) {
  const rowCells = report.rows.map((r) => [
    r.contractNumber,
    r.projectName ?? r.title ?? "—",
    formatMoney(r.revisedValue),
    r.variationsTotal !== 0 ? formatMoney(r.variationsTotal) : "—",
    formatMoney(r.approvedNet),
    formatMoney(r.retentionBalance),
    formatMoney(r.paidAmount),
    formatMoney(r.outstanding),
  ]);

  const t = report.totals;

  return (
    <Document>
      <Page size="A4" style={reportStyles.page}>
        <ReportHeader
          title="Contract Summary Report"
          companyName={companyName}
          window={windowLabel(report.from, report.to)}
        />
        <SummaryCards
          items={[
            { label: "Budget (base)", value: formatMoney(t.baseValue) },
            { label: "Approved variations", value: formatMoney(t.variationsTotal) },
            { label: "Budget (revised)", value: formatMoney(t.revisedValue) },
            { label: "Approved work (net)", value: formatMoney(t.approvedNet) },
            { label: "Paid", value: formatMoney(t.paidAmount) },
            { label: "Outstanding", value: formatMoney(t.outstanding), danger: t.outstanding > 0 },
          ]}
        />

        <Text style={reportStyles.sectionTitle}>
          Contracts — budget vs approved work (claims by period end; budget point-in-time)
        </Text>
        <ReportTable
          columns={[
            { label: "Contract", width: COL.contract },
            { label: "Project", width: COL.project },
            { label: "Budget", width: COL.budget, align: "right" },
            { label: "Variations", width: COL.variations, align: "right" },
            { label: "Approved", width: COL.approved, align: "right" },
            { label: "Retention", width: COL.retention, align: "right" },
            { label: "Paid", width: COL.paid, align: "right" },
            { label: "Outstanding", width: COL.outstanding, align: "right" },
          ]}
          rows={rowCells}
          totals={[
            "Total",
            "",
            formatMoney(t.revisedValue),
            formatMoney(t.variationsTotal),
            formatMoney(t.approvedNet),
            formatMoney(t.retentionBalance),
            formatMoney(t.paidAmount),
            formatMoney(t.outstanding),
          ]}
        />

        <View style={{ marginTop: 6 }}>
          <Text style={reportStyles.filterInfo}>
            {`${t.claimCount} posted claim${t.claimCount === 1 ? "" : "s"} · ` +
              `${t.variationCount} approved variation${t.variationCount === 1 ? "" : "s"} · ` +
              `deductions ${formatMoney(t.deductionsTotal)} · advance recovered ${formatMoney(t.advanceRecovered)}`}
          </Text>
        </View>

        <ReportFooter companyName={companyName} />
      </Page>
    </Document>
  );
}
