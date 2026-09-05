import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import { format } from "date-fns";
import { CATEGORY_LABELS } from "@/types/expense";
import { FUEL_TYPE_LABELS } from "@/types/project-cost";

Font.register({
  family: "Vazirmatn",
  src: "/fonts/Vazirmatn-Regular.ttf",
});

const formatCurrency = (amount: number) =>
  `AFN ${amount.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

// ─── Props ──────────────────────────────────────────────────────
export interface ProjectCostSummaryData {
  totalFuel: number;
  totalMachinery: number;
  machineryPaid: number;
  machineryRemaining: number;
  totalSalary: number;
  salaryPaid: number;
  salaryRemaining: number;
  totalExpenses: number;
  grandTotal: number;
  fuelBreakdown: { fuelType: string; total: number }[];
  machineryDetails: {
    name: string;
    totalHours: number;
    hourlyRate: number;
    total: number;
    paid: number;
    unpaid: number;
  }[];
  salaryDetails: {
    name: string;
    status: string;
    total: number;
    paid: number;
    unpaid: number;
  }[];
  expenseBreakdown: { category: string; amount: number }[];
  lastUpdated: string;
}

interface ProjectCostSummaryPDFProps {
  data: ProjectCostSummaryData;
  companyName?: string;
}

// ─── Styles ─────────────────────────────────────────────────────
const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 9,
    fontFamily: "Vazirmatn",
    color: "#1e293b",
  },
  companyName: {
    fontSize: 22,
    color: "#059669",
    marginBottom: 2,
  },
  reportTitle: {
    fontSize: 14,
    color: "#334155",
    marginBottom: 4,
  },
  generatedDate: {
    fontSize: 9,
    color: "#64748b",
    marginBottom: 10,
  },
  headerDivider: {
    height: 1,
    backgroundColor: "#059669",
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 12,
    color: "#059669",
    marginBottom: 8,
    marginTop: 16,
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  summaryCard: {
    width: "48%",
    padding: 10,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 4,
    marginBottom: 4,
  },
  summaryLabel: {
    fontSize: 8,
    color: "#64748b",
    marginBottom: 4,
    textTransform: "uppercase",
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#059669",
  },
  summarySubtext: {
    fontSize: 7,
    color: "#94a3b8",
    marginTop: 2,
  },
  grandTotalCard: {
    padding: 12,
    borderWidth: 2,
    borderColor: "#059669",
    borderRadius: 4,
    backgroundColor: "#f0fdf4",
    marginBottom: 16,
  },
  grandTotalLabel: {
    fontSize: 10,
    color: "#334155",
    marginBottom: 4,
    textTransform: "uppercase",
    fontWeight: "bold",
  },
  grandTotalValue: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#059669",
  },
  table: {
    width: "100%",
    borderStyle: "solid",
    borderWidth: 1,
    borderColor: "#d1d5db",
    marginTop: 4,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#059669",
    color: "white",
    fontSize: 7,
    fontWeight: "bold",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  tableRowAlt: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    backgroundColor: "#f9fafb",
  },
  tableFooter: {
    flexDirection: "row",
    backgroundColor: "#f0fdf4",
    borderTopWidth: 2,
    borderTopColor: "#059669",
    fontSize: 8,
    fontWeight: "bold",
  },
  cellName: { width: "30%", padding: 4 },
  cellNumber: { width: "20%", padding: 4, textAlign: "right" as const },
  cellWide: { width: "25%", padding: 4, textAlign: "right" as const },
  cellNarrow: { width: "15%", padding: 4, textAlign: "right" as const },
  cellCategory: { width: "40%", padding: 4 },
  cellAmount: { width: "30%", padding: 4, textAlign: "right" as const },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    fontSize: 8,
    color: "#94a3b8",
    textAlign: "center",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    paddingTop: 8,
  },
  pageNumberContainer: {
    position: "absolute",
    bottom: 30,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  pageNumberText: {
    fontSize: 8,
    color: "#94a3b8",
    fontFamily: "Vazirmatn",
  },
  emptyText: {
    fontSize: 9,
    color: "#94a3b8",
    textAlign: "center",
    padding: 20,
  },
  subLabel: {
    fontSize: 7,
    color: "#64748b",
    marginTop: 2,
  },
  paidRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
    paddingVertical: 4,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  paidLabel: {
    fontSize: 8,
    color: "#334155",
  },
  paidValue: {
    fontSize: 8,
    fontWeight: "bold",
  },
});

// ─── Component ──────────────────────────────────────────────────
export default function ProjectCostSummaryPDFDocument({
  data,
  companyName = "YakhshiLedger",
}: ProjectCostSummaryPDFProps) {
  const generatedAt = format(new Date(), "MMM dd, yyyy HH:mm");

  return (
    <Document>
      {/* ── Page 1: Summary Overview ──────────────────────────── */}
      <Page size="A4" style={styles.page}>
        <Text style={styles.companyName}>{companyName}</Text>
        <Text style={styles.reportTitle}>Project Cost Summary Report</Text>
        <Text style={styles.generatedDate}>Generated: {generatedAt}</Text>
        <View style={styles.headerDivider} />

        {/* Summary Cards */}
        <View style={styles.summaryGrid}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Total Fuel Purchased</Text>
            <Text style={styles.summaryValue}>{formatCurrency(data.totalFuel)}</Text>
            <Text style={styles.summarySubtext}>
              {data.fuelBreakdown.length} fuel type{data.fuelBreakdown.length !== 1 ? "s" : ""}
            </Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Total Machinery Cost</Text>
            <Text style={styles.summaryValue}>{formatCurrency(data.totalMachinery)}</Text>
            <Text style={styles.summarySubtext}>
              {data.machineryDetails.length} contractor{data.machineryDetails.length !== 1 ? "s" : ""}
            </Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Total Employee Salary</Text>
            <Text style={styles.summaryValue}>{formatCurrency(data.totalSalary)}</Text>
            <Text style={styles.summarySubtext}>
              {data.salaryDetails.length} employee{data.salaryDetails.length !== 1 ? "s" : ""}
            </Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Total Expenses</Text>
            <Text style={styles.summaryValue}>{formatCurrency(data.totalExpenses)}</Text>
            <Text style={styles.summarySubtext}>
              {data.expenseBreakdown.length} categor{data.expenseBreakdown.length !== 1 ? "ies" : "y"}
            </Text>
          </View>
        </View>

        {/* Grand Total */}
        <View style={styles.grandTotalCard}>
          <Text style={styles.grandTotalLabel}>Grand Total</Text>
          <Text style={styles.grandTotalValue}>{formatCurrency(data.grandTotal)}</Text>
        </View>

        {/* Fuel Breakdown */}
        {data.fuelBreakdown.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Fuel Breakdown by Type</Text>
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={{ ...styles.cellCategory, color: "white" }}>Fuel Type</Text>
                <Text style={{ ...styles.cellAmount, color: "white" }}>Total Cost</Text>
              </View>
              {data.fuelBreakdown.map((item, i) => (
                <View key={i} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
                  <Text style={styles.cellCategory}>
                    {FUEL_TYPE_LABELS[item.fuelType] ?? item.fuelType}
                  </Text>
                  <Text style={styles.cellAmount}>{formatCurrency(item.total)}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Expense Breakdown */}
        {data.expenseBreakdown.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Expenses Breakdown by Category</Text>
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={{ ...styles.cellCategory, color: "white" }}>Category</Text>
                <Text style={{ ...styles.cellAmount, color: "white" }}>Amount</Text>
              </View>
              {data.expenseBreakdown.map((item, i) => (
                <View key={i} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
                  <Text style={styles.cellCategory}>
                    {CATEGORY_LABELS[item.category as keyof typeof CATEGORY_LABELS] ?? item.category}
                  </Text>
                  <Text style={styles.cellAmount}>{formatCurrency(item.amount)}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        <View style={styles.pageNumberContainer}>
          <Text style={styles.pageNumberText}>Page 1</Text>
        </View>
      </Page>

      {/* ── Page 2: Detailed Breakdown (Paid / Remaining) ─────── */}
      <Page size="A4" style={styles.page}>
        <Text style={styles.companyName}>{companyName}</Text>
        <Text style={styles.reportTitle}>Paid & Remaining Breakdown</Text>
        <Text style={styles.generatedDate}>Generated: {generatedAt}</Text>
        <View style={styles.headerDivider} />

        {/* Machinery Breakdown */}
        <Text style={styles.sectionTitle}>Machinery Cost Breakdown</Text>
        <View style={styles.paidRow}>
          <Text style={styles.paidLabel}>Total Machinery Cost:</Text>
          <Text style={{ ...styles.paidValue, color: "#059669" }}>
            {formatCurrency(data.totalMachinery)}
          </Text>
        </View>
        <View style={styles.paidRow}>
          <Text style={styles.paidLabel}>Total Paid to Machinery:</Text>
          <Text style={{ ...styles.paidValue, color: "#3b82f6" }}>
            {formatCurrency(data.machineryPaid)}
          </Text>
        </View>
        <View style={styles.paidRow}>
          <Text style={styles.paidLabel}>Remaining to be Paid:</Text>
          <Text style={{ ...styles.paidValue, color: data.machineryRemaining > 0 ? "#ef4444" : "#059669" }}>
            {formatCurrency(data.machineryRemaining)}
          </Text>
        </View>

        {data.machineryDetails.length > 0 ? (
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={{ ...styles.cellName, color: "white" }}>Contractor</Text>
              <Text style={{ ...styles.cellNumber, color: "white" }}>Hours</Text>
              <Text style={{ ...styles.cellNumber, color: "white" }}>Rate/hr</Text>
              <Text style={{ ...styles.cellWide, color: "white" }}>Total Cost</Text>
              <Text style={{ ...styles.cellWide, color: "white" }}>Paid</Text>
              <Text style={{ ...styles.cellWide, color: "white" }}>Remaining</Text>
            </View>
            {data.machineryDetails.map((item, i) => (
              <View key={i} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
                <Text style={styles.cellName}>{item.name}</Text>
                <Text style={styles.cellNumber}>{item.totalHours.toFixed(1)}</Text>
                <Text style={styles.cellNumber}>{formatCurrency(item.hourlyRate)}</Text>
                <Text style={styles.cellWide}>{formatCurrency(item.total)}</Text>
                <Text style={styles.cellWide}>{formatCurrency(item.paid)}</Text>
                <Text style={styles.cellWide}>{formatCurrency(item.unpaid)}</Text>
              </View>
            ))}
            <View style={styles.tableFooter}>
              <Text style={styles.cellName}>Total</Text>
              <Text style={styles.cellNumber}>
                {data.machineryDetails.reduce((s, d) => s + d.totalHours, 0).toFixed(1)}
              </Text>
              <Text style={styles.cellNumber}></Text>
              <Text style={styles.cellWide}>{formatCurrency(data.totalMachinery)}</Text>
              <Text style={styles.cellWide}>{formatCurrency(data.machineryPaid)}</Text>
              <Text style={styles.cellWide}>{formatCurrency(data.machineryRemaining)}</Text>
            </View>
          </View>
        ) : (
          <Text style={styles.emptyText}>No machinery timesheet data available</Text>
        )}

        {/* Employee Salary Breakdown */}
        <Text style={styles.sectionTitle}>Employee Salary Breakdown</Text>
        <View style={styles.paidRow}>
          <Text style={styles.paidLabel}>Total Employee Salary:</Text>
          <Text style={{ ...styles.paidValue, color: "#059669" }}>
            {formatCurrency(data.totalSalary)}
          </Text>
        </View>
        <View style={styles.paidRow}>
          <Text style={styles.paidLabel}>Total Paid to Employees:</Text>
          <Text style={{ ...styles.paidValue, color: "#3b82f6" }}>
            {formatCurrency(data.salaryPaid)}
          </Text>
        </View>
        <View style={styles.paidRow}>
          <Text style={styles.paidLabel}>Remaining to be Paid:</Text>
          <Text style={{ ...styles.paidValue, color: data.salaryRemaining > 0 ? "#ef4444" : "#059669" }}>
            {formatCurrency(data.salaryRemaining)}
          </Text>
        </View>

        {data.salaryDetails.length > 0 ? (
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={{ ...styles.cellName, color: "white" }}>Employee</Text>
              <Text style={{ ...styles.cellNarrow, color: "white" }}>Status</Text>
              <Text style={{ ...styles.cellWide, color: "white" }}>Total Salary</Text>
              <Text style={{ ...styles.cellWide, color: "white" }}>Paid</Text>
              <Text style={{ ...styles.cellWide, color: "white" }}>Remaining</Text>
            </View>
            {data.salaryDetails.map((item, i) => (
              <View key={i} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
                <Text style={styles.cellName}>{item.name}</Text>
                <Text style={styles.cellNarrow}>{item.status}</Text>
                <Text style={styles.cellWide}>{formatCurrency(item.total)}</Text>
                <Text style={styles.cellWide}>{formatCurrency(item.paid)}</Text>
                <Text style={styles.cellWide}>{formatCurrency(item.unpaid)}</Text>
              </View>
            ))}
            <View style={styles.tableFooter}>
              <Text style={styles.cellName}>Total</Text>
              <Text style={styles.cellNarrow}></Text>
              <Text style={styles.cellWide}>{formatCurrency(data.totalSalary)}</Text>
              <Text style={styles.cellWide}>{formatCurrency(data.salaryPaid)}</Text>
              <Text style={styles.cellWide}>{formatCurrency(data.salaryRemaining)}</Text>
            </View>
          </View>
        ) : (
          <Text style={styles.emptyText}>No employee salary data available</Text>
        )}

        <View style={styles.pageNumberContainer}>
          <Text style={styles.pageNumberText}>Page 2</Text>
        </View>
      </Page>
    </Document>
  );
}
