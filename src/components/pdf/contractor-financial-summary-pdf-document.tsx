import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import type { ExpenseBrief } from "@/types/contractor";

Font.register({
  family: "Vazirmatn",
  src: "/fonts/Vazirmatn-Regular.ttf",
});

function formatCurrency(amount: number): string {
  return `AFN ${Math.round(amount).toLocaleString("en-US")}`;
}

interface RateTierRow {
  machineryName: string;
  machineryType: string;
  driverName: string;
  plateNumber: string;
  rateName: string;
  hourlyRate: number;
  dailyRate: number;
  monthlyRate: number;
  isDefault: boolean;
}

interface MonthlyEntry {
  month: string;
  machineryName: string;
  plateNumber?: string;
  machineryType?: string;
  rateLabel: string;
  hours: number;
  revenue: number;
  isTotal?: boolean;
}

interface Props {
  contractorName: string;
  companyName?: string;
  dateFrom?: string;
  dateTo?: string;
  totalHours: number;
  totalOvertime: number;
  timesheetRevenue: number;
  totalExpenses: number;
  totalFuelCost: number;
  totalFuelQty: number;
  netFinancial: number;
  netWithoutFuel: number;
  rateTierRows: RateTierRow[];
  monthlyEntries: MonthlyEntry[];
  expenses: ExpenseBrief[];
}

const COL = {
  machineryName: "30%",
  rateName: "16%",
  hourly: "15%",
  daily: "17%",
  monthly: "20%",
} as const;

const MCOL = {
  month: "14%",
  machinery: "16%",
  type: "10%",
  rateLabel: "14%",
  rateHr: "12%",
  hours: "16%",
  revenue: "18%",
} as const;

const ECOL = {
  title: "18%",
  notes: "18%",
  paidBy: "16%",
  amount: "16%",
  date: "16%",
  method: "16%",
} as const;

const styles = StyleSheet.create({
  page: {
    padding: 35,
    fontSize: 8,
    fontFamily: "Vazirmatn",
    color: "#1e293b",
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 8,
    textAlign: "center",
    color: "#64748b",
    marginBottom: 4,
  },
  filterInfo: {
    fontSize: 7,
    textAlign: "center",
    color: "#64748b",
    marginBottom: 6,
  },
  divider: {
    height: 1,
    backgroundColor: "#374151",
    marginBottom: 8,
  },
  summaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
    marginBottom: 10,
  },
  summaryCard: {
    width: "31%",
    padding: 6,
    borderWidth: 1,
    borderColor: "#059669",
    borderRadius: 3,
  },
  summaryLabel: {
    fontSize: 6,
    color: "#059669",
    textTransform: "uppercase",
    marginBottom: 1,
  },
  summaryValue: {
    fontSize: 8,
    color: "#059669",
  },
  summaryValueDanger: {
    fontSize: 8,
    color: "#dc2626",
  },
  tableContainer: {
    width: "100%",
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#059669",
    marginBottom: 4,
    marginTop: 2,
  },
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: "#059669",
    minHeight: 18,
    alignItems: "center",
  },
  tableHeaderCell: {
    paddingHorizontal: 2,
    paddingVertical: 3,
    color: "#ffffff",
    fontSize: 6,
  },
  tableDataRow: {
    flexDirection: "row",
    minHeight: 16,
    alignItems: "center",
    borderBottomWidth: 0.5,
    borderBottomColor: "#e2e8f0",
  },
  tableDataCell: {
    paddingHorizontal: 2,
    paddingVertical: 2,
    fontSize: 6.5,
    color: "#334155",
  },
  noData: {
    fontSize: 8,
    color: "#94a3b8",
    textAlign: "center",
    paddingVertical: 20,
  },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 35,
  },
  footerText: {
    fontSize: 6,
    color: "#94a3b8",
  },
});

function SummaryCard({ label, value, isNegative }: { label: string; value: string; isNegative?: boolean }) {
  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={isNegative ? styles.summaryValueDanger : styles.summaryValue}>
        {value}
      </Text>
    </View>
  );
}

function MachineryRateTable({ rows }: { rows: RateTierRow[] }) {
  return (
    <View style={styles.tableContainer}>
      <View style={styles.tableHeaderRow} fixed>
        <Text style={[styles.tableHeaderCell, { width: COL.machineryName }]}>Machinery</Text>
        <Text style={[styles.tableHeaderCell, { width: COL.rateName }]}>Rate Tier</Text>
        <Text style={[styles.tableHeaderCell, { width: COL.hourly, textAlign: "right" }]}>Hourly</Text>
        <Text style={[styles.tableHeaderCell, { width: COL.daily, textAlign: "right" }]}>Daily</Text>
        <Text style={[styles.tableHeaderCell, { width: COL.monthly, textAlign: "right" }]}>Monthly</Text>
      </View>
      {rows.map((r, i) => (
        <View key={i} style={[styles.tableDataRow, { backgroundColor: i % 2 === 0 ? "#f8fafc" : "#ffffff" }]}>
          <Text style={[styles.tableDataCell, { width: COL.machineryName, fontSize: 8 }]}>
            {r.machineryName}{r.plateNumber ? ` (${r.plateNumber})` : ''}{r.isDefault ? ' ★' : ''}
          </Text>
          <Text style={[styles.tableDataCell, { width: COL.rateName }]}>{r.rateName}</Text>
          <Text style={[styles.tableDataCell, { width: COL.hourly, textAlign: "right" }]}>{formatCurrency(r.hourlyRate)}</Text>
          <Text style={[styles.tableDataCell, { width: COL.daily, textAlign: "right" }]}>{formatCurrency(r.dailyRate)}</Text>
          <Text style={[styles.tableDataCell, { width: COL.monthly, textAlign: "right" }]}>{formatCurrency(r.monthlyRate)}</Text>
        </View>
      ))}
    </View>
  );
}

function MonthlyBreakdownTable({ rows }: { rows: MonthlyEntry[] }) {
  let lastMonth = '';
  return (
    <View style={styles.tableContainer}>
      <View style={styles.tableHeaderRow} fixed>
        <Text style={[styles.tableHeaderCell, { width: MCOL.month }]}>Month</Text>
        <Text style={[styles.tableHeaderCell, { width: MCOL.machinery }]}>Machinery</Text>
        <Text style={[styles.tableHeaderCell, { width: MCOL.type }]}>Type</Text>
        <Text style={[styles.tableHeaderCell, { width: MCOL.rateLabel }]}>Rate Tier</Text>
        <Text style={[styles.tableHeaderCell, { width: MCOL.rateHr, textAlign: "right" }]}>Rate</Text>
        <Text style={[styles.tableHeaderCell, { width: MCOL.hours, textAlign: "right" }]}>Hours</Text>
        <Text style={[styles.tableHeaderCell, { width: MCOL.revenue, textAlign: "right" }]}>Revenue</Text>
      </View>
      {rows.map((r, i) => {
        const showMonth = r.month !== lastMonth;
        lastMonth = r.month;
        const isTotal = r.isTotal;
        const rowStyle = isTotal
          ? [styles.tableDataRow, { backgroundColor: "#f0fdf4", minHeight: 18 }]
          : [styles.tableDataRow, { backgroundColor: i % 2 === 0 ? "#f8fafc" : "#ffffff" }];
        return (
          <View key={i} style={rowStyle}>
            <Text style={[styles.tableDataCell, { width: MCOL.month, fontWeight: isTotal ? 'bold' : 'normal' }]}>
              {showMonth ? r.month : ''}
            </Text>
            <Text style={[styles.tableDataCell, { width: MCOL.machinery, fontWeight: isTotal ? 'bold' : 'normal' }]}>
              {isTotal ? '' : `${r.machineryName}${r.plateNumber ? ` (${r.plateNumber})` : ''}`}
            </Text>
            <Text style={[styles.tableDataCell, { width: MCOL.type }]}>
              {isTotal ? '' : r.machineryType}
            </Text>
            <Text style={[styles.tableDataCell, { width: MCOL.rateLabel, fontWeight: isTotal ? 'bold' : 'normal' }]}>
              {r.rateLabel}
            </Text>
            <Text style={[styles.tableDataCell, { width: MCOL.rateHr, textAlign: "right" }]}>
              {isTotal ? '' : formatCurrency(r.revenue > 0 && r.hours > 0 ? r.revenue / r.hours : 0)}
            </Text>
            <Text style={[styles.tableDataCell, { width: MCOL.hours, textAlign: "right", fontWeight: isTotal ? 'bold' : 'normal' }]}>
              {r.hours.toFixed(1)}
            </Text>
            <Text style={[styles.tableDataCell, { width: MCOL.revenue, textAlign: "right", fontWeight: isTotal ? 'bold' : 'normal' }]}>
              {formatCurrency(r.revenue)}
            </Text>
          </View>
        );
      })}
      {/* Grand Total */}
      {rows.length > 0 && (() => {
        const gt = rows.reduce(
          (acc, r) => r.isTotal ? acc : { hours: acc.hours + r.hours, revenue: acc.revenue + r.revenue },
          { hours: 0, revenue: 0 },
        );
        return (
          <View style={[styles.tableDataRow, { backgroundColor: "#065f46", minHeight: 20 }]}>
            <Text style={[styles.tableDataCell, { width: MCOL.month, fontWeight: "bold", color: "#fff" }]}>GRAND TOTAL</Text>
            <Text style={[styles.tableDataCell, { width: MCOL.machinery, color: "#fff" }]} />
            <Text style={[styles.tableDataCell, { width: MCOL.type, color: "#fff" }]} />
            <Text style={[styles.tableDataCell, { width: MCOL.rateLabel, color: "#fff" }]} />
            <Text style={[styles.tableDataCell, { width: MCOL.rateHr, color: "#fff" }]} />
            <Text style={[styles.tableDataCell, { width: MCOL.hours, textAlign: "right", fontWeight: "bold", color: "#fff" }]}>
              {gt.hours.toFixed(1)}
            </Text>
            <Text style={[styles.tableDataCell, { width: MCOL.revenue, textAlign: "right", fontWeight: "bold", color: "#fff" }]}>
              {formatCurrency(gt.revenue)}
            </Text>
          </View>
        );
      })()}
    </View>
  );
}

function ExpensesTable({ rows }: { rows: ExpenseBrief[] }) {
  const totalAmount = rows.reduce((s, e) => s + e.amount, 0);
  return (
    <View style={styles.tableContainer}>
      <View style={styles.tableHeaderRow} fixed>
        <Text style={[styles.tableHeaderCell, { width: ECOL.title }]}>Title</Text>
        <Text style={[styles.tableHeaderCell, { width: ECOL.notes }]}>Notes</Text>
        <Text style={[styles.tableHeaderCell, { width: ECOL.paidBy }]}>Paid By</Text>
        <Text style={[styles.tableHeaderCell, { width: ECOL.amount, textAlign: "right" }]}>Amount</Text>
        <Text style={[styles.tableHeaderCell, { width: ECOL.date }]}>Date</Text>
        <Text style={[styles.tableHeaderCell, { width: ECOL.method }]}>Payment</Text>
      </View>
      {rows.map((e, i) => (
        <View key={e.id} style={[styles.tableDataRow, { backgroundColor: i % 2 === 0 ? "#f8fafc" : "#ffffff" }]}>
          <Text style={[styles.tableDataCell, { width: ECOL.title }]}>{e.title}</Text>
          <Text style={[styles.tableDataCell, { width: ECOL.notes }]}>{e.notes || '—'}</Text>
          <Text style={[styles.tableDataCell, { width: ECOL.paidBy }]}>{e.paidBy || '—'}</Text>
          <Text style={[styles.tableDataCell, { width: ECOL.amount, textAlign: "right" }]}>{formatCurrency(e.amount)}</Text>
          <Text style={[styles.tableDataCell, { width: ECOL.date }]}>{e.expenseDate?.slice(0, 10) || '—'}</Text>
          <Text style={[styles.tableDataCell, { width: ECOL.method }]}>{e.paymentMethod || '—'}</Text>
        </View>
      ))}
      {/* Total row */}
      <View style={[styles.tableDataRow, { backgroundColor: "#f0fdf4", minHeight: 18 }]}>
        <Text style={[styles.tableDataCell, { width: ECOL.title, fontWeight: "bold" }]}>Total</Text>
        <Text style={[styles.tableDataCell, { width: ECOL.notes }]} />
        <Text style={[styles.tableDataCell, { width: ECOL.paidBy }]} />
        <Text style={[styles.tableDataCell, { width: ECOL.amount, textAlign: "right", fontWeight: "bold" }]}>{formatCurrency(totalAmount)}</Text>
        <Text style={[styles.tableDataCell, { width: ECOL.date }]} />
        <Text style={[styles.tableDataCell, { width: ECOL.method }]} />
      </View>
    </View>
  );
}

export default function ContractorFinancialSummaryPDFDocument({
  contractorName,
  companyName = "YakhshiLedger",
  dateFrom,
  dateTo,
  totalHours,
  totalOvertime,
  timesheetRevenue,
  totalExpenses,
  totalFuelCost,
  totalFuelQty,
  netFinancial,
  netWithoutFuel,
  rateTierRows,
  monthlyEntries,
  expenses,
}: Props) {
  const genDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <Document
      title={`${contractorName} - Financial Summary`}
      author={companyName}
      creator={companyName}
    >
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Contractor Financial Summary</Text>
        <Text style={styles.subtitle}>
          {companyName} | {contractorName} | Generated: {genDate}
        </Text>
        {(dateFrom || dateTo) && (
          <Text style={styles.filterInfo}>
            {dateFrom && `From: ${dateFrom}`}
            {dateFrom && dateTo ? " | " : ""}
            {dateTo && `To: ${dateTo}`}
          </Text>
        )}
        <View style={styles.divider} />

        {/* Summary Cards */}
        <View style={styles.summaryRow}>
          <SummaryCard label="Total Hours" value={`${totalHours.toFixed(1)} hrs`} />
          <SummaryCard label="Est. Revenue" value={formatCurrency(timesheetRevenue)} />
          <SummaryCard label="Total Expenses" value={formatCurrency(totalExpenses)} />
          <SummaryCard label="Total Fuel Cost" value={`${formatCurrency(totalFuelCost)} (${totalFuelQty.toFixed(1)}L)`} />
          <SummaryCard label="Net (Revenue - All Costs)" value={formatCurrency(Math.abs(netFinancial))} isNegative={netFinancial < 0} />
          <SummaryCard label="Net (Revenue - Expenses)" value={formatCurrency(Math.abs(netWithoutFuel))} isNegative={netWithoutFuel < 0} />
        </View>

        {/* Machinery Rate Tiers */}
        {rateTierRows.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Machinery Rate Overview</Text>
            <MachineryRateTable rows={rateTierRows} />
          </>
        )}

        {/* Monthly Breakdown */}
        {monthlyEntries.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Monthly Breakdown</Text>
            <MonthlyBreakdownTable rows={monthlyEntries} />
          </>
        )}

        {/* Expenses */}
        {expenses.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Expenses</Text>
            <ExpensesTable rows={expenses} />
          </>
        )}

        {/* Empty state */}
        {totalHours === 0 && totalExpenses === 0 && totalFuelCost === 0 && (
          <Text style={styles.noData}>No financial data available for this contractor</Text>
        )}

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>{companyName}</Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) =>
              `Page ${pageNumber} of ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}
