// Deductions breakdown PDF (Phase 6): totals by deduction type per contractor
// (type columns are derived from the data since the type set is open-ended).
import { Document, Page } from "@react-pdf/renderer";
import type { DeductionsReport } from "@/types/contractor";
import {
  formatMoney,
  windowLabel,
  reportStyles,
  ReportHeader,
  SummaryCards,
  ReportTable,
  ReportFooter,
} from "./finance-report-shared";

const TYPE_LABELS: Record<string, string> = {
  FUEL: "Fuel",
  PENALTY: "Penalty",
  MATERIALS: "Materials",
  ACCOMMODATION: "Accommodation",
  FOOD: "Food",
  TRANSPORT: "Transport",
  TAX: "Tax",
  OTHER: "Other",
};

export default function DeductionsReportPdfDocument({
  report,
  companyName,
}: {
  report: DeductionsReport;
  companyName?: string;
}) {
  const types = [...new Set(report.rows.flatMap((r) => Object.keys(r.byType)))].sort();

  // Contractor 26%, grand-total 16%, the rest split evenly across type columns.
  const typeWidth = `${Math.max(8, Math.floor(58 / Math.max(1, types.length)))}%`;
  const columns = [
    { label: "Contractor", width: "26%" },
    ...types.map((t) => ({ label: TYPE_LABELS[t] ?? t, width: typeWidth, align: "right" as const })),
    { label: "Total", width: "16%", align: "right" as const },
  ];

  const rows = report.rows.map((r) => [
    r.contractorName,
    ...types.map((t) => formatMoney(r.byType[t] ?? 0)),
    formatMoney(r.total),
  ]);

  const totalDeductions = report.rows.reduce((s, r) => s + r.deductionCount, 0);

  return (
    <Document>
      <Page size="A4" style={reportStyles.page}>
        <ReportHeader
          title="Contractor Deductions Report"
          companyName={companyName}
          window={windowLabel(report.from, report.to)}
        />
        <SummaryCards
          items={[
            { label: "Total deductions", value: formatMoney(report.grandTotal) },
            { label: "Deduction entries", value: String(totalDeductions) },
            {
              label: "Top type",
              value: (() => {
                const top = Object.entries(report.totalsByType).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0];
                return top ? `${TYPE_LABELS[top[0]] ?? top[0]} — ${formatMoney(top[1] ?? 0)}` : "—";
              })(),
            },
          ]}
        />
        <ReportTable
          columns={columns}
          rows={rows}
          totals={[
            "Total",
            ...types.map((t) => formatMoney(report.totalsByType[t] ?? 0)),
            formatMoney(report.grandTotal),
          ]}
        />
        <ReportFooter companyName={companyName} />
      </Page>
    </Document>
  );
}
