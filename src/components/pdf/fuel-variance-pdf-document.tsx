// Fuel variance PDF (Phase 6, Batch B): per-machinery expected (consumption
// rate × worked hours from daily logs) vs actual fuel, variance, and logging
// coverage — rendered from the existing Phase 3 fuel-variance engine.
import { Document, Page, Text } from "@react-pdf/renderer";
import type { FuelVarianceSummary } from "@/types/contractor";
import {
  reportStyles,
  ReportHeader,
  SummaryCards,
  ReportTable,
  ReportFooter,
} from "./finance-report-shared";

const fmtL = (n: number) => `${n.toFixed(1)} L`;

const COL = {
  machine: "24%",
  rate: "12%",
  expected: "16%",
  actual: "16%",
  variance: "14%",
  days: "18%",
} as const;

export default function FuelVariancePdfDocument({
  summary,
  companyName,
  from,
  to,
}: {
  summary: FuelVarianceSummary[];
  companyName?: string;
  from?: string;
  to?: string;
}) {
  const totalExpected = summary.reduce((s, r) => s + r.expectedLiters, 0);
  const totalActual = summary.reduce((s, r) => s + r.actualLiters, 0);
  const totalVariance = summary.reduce((s, r) => s + r.variance, 0);
  const avgCoverage =
    summary.length > 0
      ? Math.round(summary.reduce((s, r) => s + r.coveragePercent, 0) / summary.length)
      : 0;

  const rows = summary.map((r) => [
    r.machineryName,
    `${r.consumptionRate.toFixed(1)} L/h`,
    fmtL(r.expectedLiters),
    fmtL(r.actualLiters),
    fmtL(r.variance),
    `${r.expectedDays}/${r.totalDays} (${r.coveragePercent}%)`,
  ]);

  return (
    <Document>
      <Page size="A4" style={reportStyles.page}>
        <ReportHeader
          title="Fuel Variance Report"
          companyName={companyName}
          window={from || to ? `${from ?? "…"} → ${to ?? "…"}` : undefined}
        />
        <SummaryCards
          items={[
            { label: "Expected", value: fmtL(totalExpected) },
            { label: "Actual", value: fmtL(totalActual) },
            { label: "Variance", value: fmtL(totalVariance), danger: totalVariance > 0 },
            { label: "Machines", value: String(summary.length) },
            { label: "Avg. log coverage", value: `${avgCoverage}%`, danger: avgCoverage < 80 },
          ]}
        />
        <ReportTable
          columns={[
            { label: "Machine", width: COL.machine },
            { label: "Rate", width: COL.rate, align: "right" },
            { label: "Expected", width: COL.expected, align: "right" },
            { label: "Actual", width: COL.actual, align: "right" },
            { label: "Variance", width: COL.variance, align: "right" },
            { label: "Logged days", width: COL.days, align: "right" },
          ]}
          rows={rows}
          totals={
            rows.length > 0
              ? [
                  "Total",
                  "",
                  fmtL(totalExpected),
                  fmtL(totalActual),
                  fmtL(totalVariance),
                  `${summary.reduce((s, r) => s + r.expectedDays, 0)}/${summary.reduce((s, r) => s + r.totalDays, 0)}`,
                ]
              : undefined
          }
        />
        {rows.length === 0 && (
          <Text style={reportStyles.noData}>
            No fuel usage with a machinery reference in this period.
          </Text>
        )}
        <ReportFooter companyName={companyName} />
      </Page>
    </Document>
  );
}
