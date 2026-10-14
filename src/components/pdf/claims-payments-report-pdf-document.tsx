// Claims & payments summary PDF (Phase 6): two tables per window — posted
// claims (gross → retention/deductions → net → paid → outstanding) and
// payments (completed vs reversed), each with portfolio totals.
import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { ClaimsPaymentsReport } from "@/types/contractor";
import {
  formatMoney,
  windowLabel,
  reportStyles,
  ReportHeader,
  SummaryCards,
  ReportTable,
  ReportFooter,
} from "./finance-report-shared";

const CCOL = {
  contractor: "16%",
  claims: "7%",
  gross: "13%",
  retention: "13%",
  deductions: "13%",
  net: "13%",
  paid: "12%",
  outstanding: "13%",
} as const;

const PCOL = {
  contractor: "25%",
  payments: "15%",
  total: "30%",
  reversed: "30%",
} as const;

export default function ClaimsPaymentsReportPdfDocument({
  report,
  companyName,
}: {
  report: ClaimsPaymentsReport;
  companyName?: string;
}) {
  const claimRows = report.rows.map((r) => [
    r.contractorName,
    String(r.claimCount),
    formatMoney(r.grossAmount),
    formatMoney(r.retentionAmount),
    formatMoney(r.deductionsTotal),
    formatMoney(r.netAmount),
    formatMoney(r.paidAmount),
    formatMoney(r.outstanding),
  ]);

  const paymentRows = report.rows
    .filter((r) => r.paymentCount > 0 || r.reversedTotal > 0)
    .map((r) => [
      r.contractorName,
      String(r.paymentCount),
      formatMoney(r.paymentsTotal),
      formatMoney(r.reversedTotal),
    ]);

  const t = report.totals;

  return (
    <Document>
      <Page size="A4" style={reportStyles.page}>
        <ReportHeader
          title="Claims & Payments Report"
          companyName={companyName}
          window={windowLabel(report.from, report.to)}
        />
        <SummaryCards
          items={[
            { label: "Claims gross", value: formatMoney(t.grossAmount) },
            { label: "Claims net", value: formatMoney(t.netAmount) },
            { label: "Outstanding", value: formatMoney(t.outstanding), danger: t.outstanding > 0 },
            { label: "Claims paid", value: formatMoney(t.paidAmount) },
            { label: "Payments total", value: formatMoney(t.paymentsTotal) },
            { label: "Reversed", value: formatMoney(t.reversedTotal), danger: t.reversedTotal > 0 },
          ]}
        />

        <Text style={reportStyles.sectionTitle}>Claims (by period end)</Text>
        <ReportTable
          columns={[
            { label: "Contractor", width: CCOL.contractor },
            { label: "#", width: CCOL.claims, align: "right" },
            { label: "Gross", width: CCOL.gross, align: "right" },
            { label: "Retention", width: CCOL.retention, align: "right" },
            { label: "Deductions", width: CCOL.deductions, align: "right" },
            { label: "Net", width: CCOL.net, align: "right" },
            { label: "Paid", width: CCOL.paid, align: "right" },
            { label: "Outstanding", width: CCOL.outstanding, align: "right" },
          ]}
          rows={claimRows}
          totals={[
            "Total",
            String(t.claimCount),
            formatMoney(t.grossAmount),
            formatMoney(t.retentionAmount),
            formatMoney(t.deductionsTotal),
            formatMoney(t.netAmount),
            formatMoney(t.paidAmount),
            formatMoney(t.outstanding),
          ]}
        />

        <View style={{ marginTop: 4 }}>
          <Text style={reportStyles.sectionTitle}>Payments (by payment date)</Text>
          <ReportTable
            columns={[
              { label: "Contractor", width: PCOL.contractor },
              { label: "#", width: PCOL.payments, align: "right" },
              { label: "Paid", width: PCOL.total, align: "right" },
              { label: "Reversed", width: PCOL.reversed, align: "right" },
            ]}
            rows={paymentRows}
            totals={[
              "Total",
              String(t.paymentCount),
              formatMoney(t.paymentsTotal),
              formatMoney(t.reversedTotal),
            ]}
          />
        </View>

        <ReportFooter companyName={companyName} />
      </Page>
    </Document>
  );
}
