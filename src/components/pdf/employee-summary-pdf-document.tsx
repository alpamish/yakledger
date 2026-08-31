import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import type { EmployeeFinancialSummaryItem, EmployeeFinancialTotals } from "@/types/employee";
import { DEPARTMENT_LABELS } from "@/types/employee";
import type { Department } from "@/types/employee";

Font.register({
  family: "Vazirmatn",
  src: "/fonts/Vazirmatn-Regular.ttf",
});

const PADDING = 30;
const PAGE_WIDTH = 595;
const CONTENT_WIDTH = PAGE_WIDTH - PADDING * 2;
const ROW_HEIGHT = 17;

function formatCurrency(n: number): string {
  return `${Math.round(n).toLocaleString("en-US")} AFN`;
}

const COL = {
  name: 80,
  dept: 50,
  jobTitle: 60,
  monthlySalary: 55,
  daysWorked: 40,
  earned: 60,
  paid: 55,
  rewards: 50,
  overtime: 50,
  netBalance: 55,
};
const TOTAL_COL = Object.values(COL).reduce((s, v) => s + v, 0);

const styles = StyleSheet.create({
  page: {
    padding: PADDING,
    fontSize: 8,
    fontFamily: "Vazirmatn",
    color: "#1e293b",
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 1,
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
    marginBottom: 3,
  },
  divider: {
    height: 1,
    backgroundColor: "#374151",
    marginBottom: 6,
  },
  table: {
    width: TOTAL_COL,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#374151",
  },
  tableRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#374151",
    minHeight: ROW_HEIGHT,
    alignItems: "center",
  },
  tableHeaderRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#374151",
    minHeight: ROW_HEIGHT + 2,
    alignItems: "center",
    backgroundColor: "#374151",
  },
  cell: {
    paddingHorizontal: 2,
    paddingVertical: 1,
    fontSize: 6.5,
    textAlign: "center",
    color: "#1e293b",
    fontFamily: "Vazirmatn",
  },
  headerCell: {
    paddingHorizontal: 2,
    paddingVertical: 1,
    fontSize: 6.5,
    textAlign: "center",
    fontWeight: "bold",
    color: "#ffffff",
    fontFamily: "Vazirmatn",
  },
  totalRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#374151",
    minHeight: ROW_HEIGHT + 3,
    alignItems: "center",
    backgroundColor: "#f3f4f6",
  },
  totalCell: {
    paddingHorizontal: 2,
    paddingVertical: 1,
    fontSize: 7,
    textAlign: "center",
    fontWeight: "bold",
    color: "#1e293b",
    fontFamily: "Vazirmatn",
  },
  pageNumber: {
    position: "absolute",
    bottom: 15,
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: 7,
    color: "#94a3b8",
    fontFamily: "Vazirmatn",
  },
  emptyState: {
    textAlign: "center",
    fontSize: 10,
    color: "#94a3b8",
    marginTop: 40,
    fontFamily: "Vazirmatn",
  },
});

function colStyle(width: number) {
  return { width };
}

interface Props {
  data: EmployeeFinancialSummaryItem[];
  totals: EmployeeFinancialTotals;
  companyName?: string;
  dateFrom?: string;
  dateTo?: string;
}

export default function EmployeeSummaryPDFDocument({
  data,
  totals,
  companyName = "YakLedger",
  dateFrom,
  dateTo,
}: Props) {
  const genDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <Document
      title="Employee Summary Report"
      author={companyName}
      creator={companyName}
    >
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Employee Summary</Text>
        <Text style={styles.subtitle}>
          {companyName} | Generated: {genDate}
        </Text>
        {(dateFrom || dateTo) && (
          <Text style={styles.filterInfo}>
            {dateFrom && `From: ${dateFrom}`}
            {dateFrom && dateTo ? " | " : ""}
            {dateTo && `To: ${dateTo}`}
          </Text>
        )}
        <View style={styles.divider} />

        {data.length === 0 ? (
          <Text style={styles.emptyState}>No employee data found</Text>
        ) : (
          <View style={styles.table}>
            {/* Header Row */}
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.headerCell, colStyle(COL.netBalance)]}>Net Balance</Text>
              <Text style={[styles.headerCell, colStyle(COL.overtime)]}>Overtime</Text>
              <Text style={[styles.headerCell, colStyle(COL.rewards)]}>Rewards</Text>
              <Text style={[styles.headerCell, colStyle(COL.paid)]}>Paid</Text>
              <Text style={[styles.headerCell, colStyle(COL.earned)]}>Earned</Text>
              <Text style={[styles.headerCell, colStyle(COL.daysWorked)]}>Days</Text>
              <Text style={[styles.headerCell, colStyle(COL.monthlySalary)]}>Salary</Text>
              <Text style={[styles.headerCell, colStyle(COL.jobTitle)]}>Job Title</Text>
              <Text style={[styles.headerCell, colStyle(COL.dept)]}>Dept</Text>
              <Text style={[styles.headerCell, colStyle(COL.name)]}>Employee</Text>
            </View>

            {/* Data Rows */}
            {data.map((item, i) => (
              <View
                key={item.id ?? i}
                style={[
                  styles.tableRow,
                  { backgroundColor: i % 2 === 0 ? "#ffffff" : "#f9fafb" },
                ]}
              >
                <Text style={[styles.cell, colStyle(COL.netBalance)]}>{formatCurrency(item.netBalance)}</Text>
                <Text style={[styles.cell, colStyle(COL.overtime)]}>{formatCurrency(item.overtimePay)}</Text>
                <Text style={[styles.cell, colStyle(COL.rewards)]}>{formatCurrency(item.totalRewards)}</Text>
                <Text style={[styles.cell, colStyle(COL.paid)]}>{formatCurrency(item.totalSalaryPaid)}</Text>
                <Text style={[styles.cell, colStyle(COL.earned)]}>{formatCurrency(item.earnedSalary)}</Text>
                <Text style={[styles.cell, colStyle(COL.daysWorked)]}>{item.daysWorked.toFixed(1)}</Text>
                <Text style={[styles.cell, colStyle(COL.monthlySalary)]}>{formatCurrency(item.salary)}</Text>
                <Text style={[styles.cell, colStyle(COL.jobTitle)]}>{item.jobTitle}</Text>
                <Text style={[styles.cell, colStyle(COL.dept)]}>{DEPARTMENT_LABELS[item.department as Department] ?? item.department}</Text>
                <Text style={[styles.cell, colStyle(COL.name)]}>{item.fullName}</Text>
              </View>
            ))}

            {/* Grand Total Row */}
            <View style={styles.totalRow}>
              <Text style={[styles.totalCell, colStyle(COL.netBalance)]}>{formatCurrency(totals.totalNetBalance)}</Text>
              <Text style={[styles.totalCell, colStyle(COL.overtime)]}>{formatCurrency(totals.totalOvertimePay)}</Text>
              <Text style={[styles.totalCell, colStyle(COL.rewards)]}>{formatCurrency(totals.totalRewards)}</Text>
              <Text style={[styles.totalCell, colStyle(COL.paid)]}>{formatCurrency(totals.totalSalaryPaid)}</Text>
              <Text style={[styles.totalCell, colStyle(COL.earned)]}>{formatCurrency(totals.totalEarnedSalary)}</Text>
              <Text style={[styles.totalCell, colStyle(COL.daysWorked)]}>—</Text>
              <Text style={[styles.totalCell, colStyle(COL.monthlySalary)]}>{formatCurrency(totals.totalSalary)}</Text>
              <Text style={[styles.totalCell, colStyle(COL.jobTitle)]}>—</Text>
              <Text style={[styles.totalCell, colStyle(COL.dept)]}>—</Text>
              <Text style={[styles.totalCell, colStyle(COL.name)]}>Grand Total ({totals.employeeCount})</Text>
            </View>
          </View>
        )}

        <Text
          style={styles.pageNumber}
          render={({ pageNumber, totalPages }) =>
            `Page ${pageNumber} of ${totalPages}`
          }
          fixed
        />
      </Page>
    </Document>
  );
}
