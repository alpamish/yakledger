// Printable contractor statement (Phase 6). One document, two render modes:
// `lang="en"` (default, LTR) and `lang="fa"` (Dari/RTL, Vazirmatn + Shamsi
// dates), mirroring the existing contractor-financial-summary Farsi precedent.
// Every figure comes from StatementReport (server-computed by the ledger
// engine) — this component only renders.
import { Document, Page, Text, View, Font } from "@react-pdf/renderer";
import { format } from "date-fns";
import type { StatementLine, StatementReport } from "@/types/contractor";
import { toShamsiYear, toShamsiMonth, toShamsiDay } from "@/lib/shamsi";
import {
  formatMoney,
  formatSigned,
  windowLabel,
  reportStyles,
  ReportHeader,
  ReportTable,
  ReportFooter,
} from "./finance-report-shared";

Font.register({
  family: "Vazirmatn",
  src: "/fonts/Vazirmatn-Regular.ttf",
});

const EN_TYPE_LABELS: Record<string, string> = {
  CLAIM_POSTED: "Claim posted",
  CLAIM_REVERSAL: "Claim reversed",
  RETENTION_HELD: "Retention held",
  RETENTION_RELEASED: "Retention released",
  ADVANCE_DISBURSED: "Advance disbursed",
  ADVANCE_RECOVERY: "Advance recovered",
  PAYMENT: "Payment",
  PAYMENT_REVERSAL: "Payment reversed",
  WRITE_OFF: "Write-off",
};

const FA_TYPE_LABELS: Record<string, string> = {
  CLAIM_POSTED: "ثبت مطالبه",
  CLAIM_REVERSAL: "استرداد مطالبه",
  RETENTION_HELD: "کسور ضمانت",
  RETENTION_RELEASED: "آزادسازی ضمانت",
  ADVANCE_DISBURSED: "پیش‌پرداخت",
  ADVANCE_RECOVERY: "بازیافت پیش‌پرداخت",
  PAYMENT: "پرداخت",
  PAYMENT_REVERSAL: "استرداد پرداخت",
  WRITE_OFF: "بخشش بدهی",
};

type Lang = "en" | "fa";

const pad = (n: number) => String(n).padStart(2, "0");

function lineDate(iso: string, lang: Lang): string {
  const d = new Date(iso);
  if (lang === "fa") {
    const y = { y: toShamsiYear(d), m: toShamsiMonth(d) + 1, d: toShamsiDay(d) };
    return `${y.y}/${pad(y.m)}/${pad(y.d)}`;
  }
  return format(d, "dd MMM yyyy");
}

const T = {
  en: {
    title: "Contractor Statement",
    period: "Period",
    opening: "Opening balance",
    movement: "Movement in period",
    closing: "Closing balance",
    current: "Current balance",
    date: "Date",
    type: "Type",
    reference: "Reference",
    amount: "Amount",
    balance: "Balance",
    totalsTitle: "Totals by type",
    tType: "Type",
    tTotal: "Total",
    contractor: "Contractor",
  },
  fa: {
    title: "صورت حساب پیمانکار",
    period: "دوره",
    opening: "مانده ابتدای دوره",
    movement: "حرکت در دوره",
    closing: "مانده انتهای دوره",
    current: "مانده فعلی",
    date: "تاریخ",
    type: "نوع",
    reference: "مرجع",
    amount: "مبلغ",
    balance: "مانده",
    totalsTitle: "جمع بر اساس نوع",
    tType: "نوع",
    tTotal: "جمع",
    contractor: "پیمانکار",
  },
} as const;

const COL = { date: "14%", type: "22%", reference: "24%", amount: "20%", balance: "20%" } as const;
const TCOL = { type: "55%", total: "45%" } as const;

export default function ContractorStatementPdfDocument({
  report,
  companyName,
  lang = "en",
}: {
  report: StatementReport;
  companyName?: string;
  lang?: Lang;
}) {
  const t = T[lang];
  const rtl = lang === "fa";
  const labels = rtl ? FA_TYPE_LABELS : EN_TYPE_LABELS;

  const lines: (string | number)[][] = report.lines.map((l: StatementLine) => [
    lineDate(l.occurredAt, lang),
    labels[l.type] ?? l.type,
    l.reference ?? "—",
    formatSigned(l.amount),
    formatMoney(l.balanceAfter),
  ]);

  const totalsEntries = Object.entries(report.totalsByType);
  const totalsRows = totalsEntries.map(([type, total]) => [labels[type] ?? type, formatSigned(total ?? 0)]);

  return (
    <Document>
      <Page
        size="A4"
        style={[reportStyles.page, rtl ? { fontFamily: "Vazirmatn", direction: "rtl" } : {}]}
      >
        <ReportHeader
          title={t.title}
          companyName={companyName}
          window={windowLabel(report.from, report.to)}
        />
        <Text style={[reportStyles.subtitle, { fontWeight: "bold", fontSize: 9 }]}>
          {t.contractor}: {report.contractorName}
        </Text>

        <View style={reportStyles.summaryRow}>
          {[
            { label: t.opening, value: formatMoney(report.openingBalance) },
            { label: t.movement, value: formatSigned(report.totalInPeriod) },
            { label: t.closing, value: formatMoney(report.closingBalance) },
            { label: t.current, value: formatMoney(report.currentBalance) },
          ].map((it, i) => (
            <View key={i} style={reportStyles.summaryCard}>
              <Text style={reportStyles.summaryLabel}>{it.label}</Text>
              <Text style={reportStyles.summaryValue}>{it.value}</Text>
            </View>
          ))}
        </View>

        <ReportTable
          columns={[
            { label: t.date, width: COL.date },
            { label: t.type, width: COL.type },
            { label: t.reference, width: COL.reference },
            { label: t.amount, width: COL.amount, align: "right" },
            { label: t.balance, width: COL.balance, align: "right" },
          ]}
          rows={lines}
          totals={
            lines.length > 0
              ? [
                  "",
                  "",
                  "",
                  formatSigned(report.totalInPeriod),
                  formatMoney(report.closingBalance),
                ]
              : undefined
          }
        />

        {totalsRows.length > 0 && (
          <View style={{ marginTop: 6 }}>
            <Text style={reportStyles.sectionTitle}>{t.totalsTitle}</Text>
            <ReportTable
              columns={[
                { label: t.tType, width: TCOL.type },
                { label: t.tTotal, width: TCOL.total, align: "right" },
              ]}
              rows={totalsRows}
              totals={[t.tTotal, formatSigned(report.totalInPeriod)]}
            />
          </View>
        )}

        <ReportFooter companyName={companyName} />
      </Page>
    </Document>
  );
}
