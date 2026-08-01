import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import { format } from "date-fns";
import type {
  EmployeeFinancialSummaryItem,
  EmployeeFinancialTotals,
  Department,
} from "@/types/employee";
import { DEPARTMENT_LABELS } from "@/types/employee";

Font.register({
  family: "Vazirmatn",
  src: "/fonts/Vazirmatn-Regular.ttf",
});

interface FinancialSummaryPDFDocumentProps {
  employees: EmployeeFinancialSummaryItem[];
  totals: EmployeeFinancialTotals;
}

const formatCurrency = (amount: number) =>
  `AFN ${amount.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const COL = {
  name: "14%",
  dept: "8%",
  salary: "8%",
  earned: "9%",
  ot: "9%",
  salaryPaid: "9%",
  rewards: "8%",
  spent: "9%",
  advances: "8%",
  wallet: "8%",
  net: "10%",
} as const;

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
  summaryRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  summaryCard: {
    flex: 1,
    padding: 8,
    borderWidth: 1,
    borderColor: "#059669",
    borderRadius: 3,
  },
  summaryLabel: {
    fontSize: 7,
    color: "#059669",
    marginBottom: 2,
    textTransform: "uppercase",
  },
  summaryValue: {
    fontSize: 10,
    color: "#059669",
  },
  summaryValueDanger: {
    fontSize: 10,
    color: "#dc2626",
  },
  tableContainer: {
    width: "100%",
  },
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: "#059669",
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    minHeight: 22,
    alignItems: "center",
  },
  tableHeaderCell: {
    paddingHorizontal: 3,
    paddingVertical: 4,
    color: "#ffffff",
    fontSize: 7,
  },
  tableDataRow: {
    flexDirection: "row",
    minHeight: 20,
    alignItems: "center",
    borderBottomWidth: 0.5,
    borderBottomColor: "#e2e8f0",
  },
  tableDataCell: {
    paddingHorizontal: 3,
    paddingVertical: 3,
    fontSize: 7,
    color: "#334155",
  },
  tableTotalRow: {
    flexDirection: "row",
    backgroundColor: "#f0fdf4",
    minHeight: 22,
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#059669",
  },
  tableTotalCell: {
    paddingHorizontal: 3,
    paddingVertical: 4,
    fontSize: 7,
    color: "#059669",
  },
  footer: {
    position: "absolute",
    bottom: 25,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 40,
  },
  footerText: {
    fontSize: 7,
    color: "#94a3b8",
  },
  noData: {
    fontSize: 10,
    color: "#94a3b8",
    textAlign: "center",
    paddingVertical: 40,
  },
});

export function FinancialSummaryPDFDocument({
  employees: rawEmployees,
  totals,
}: FinancialSummaryPDFDocumentProps) {
  const employees = (Array.isArray(rawEmployees) ? rawEmployees : []).filter(
    (e): e is EmployeeFinancialSummaryItem => Boolean(e && e.id)
  );
  const generatedDate = format(new Date(), "MMMM d, yyyy, HH:mm");

  return (
    <Document
      title="Financial Summary Report"
      author="YakhshiLedger"
      creator="YakhshiLedger"
    >
      <Page size="A4" orientation="landscape" style={styles.page}>
        <Text style={styles.companyName}>YakhshiLedger</Text>
        <Text style={styles.reportTitle}>Employee Financial Summary</Text>
        <Text style={styles.generatedDate}>Generated on: {generatedDate}</Text>
        <Text style={styles.generatedDate}>
          Employees: {totals.employeeCount}
        </Text>

        <View style={styles.headerDivider} />

        {/* Summary Cards */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Total Salary</Text>
            <Text style={styles.summaryValue}>
              {formatCurrency(totals.totalSalary)}
            </Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Salary Paid</Text>
            <Text style={styles.summaryValue}>
              {formatCurrency(totals.totalSalaryPaid)}
            </Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Total Rewards</Text>
            <Text style={styles.summaryValue}>
              {formatCurrency(totals.totalRewards)}
            </Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Overtime</Text>
            <Text style={styles.summaryValue}>
              {formatCurrency(totals.totalOvertimePay)}
            </Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Total Spent</Text>
            <Text style={styles.summaryValue}>
              {formatCurrency(totals.totalExpensesPaidBy)}
            </Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Total Advances</Text>
            <Text style={styles.summaryValue}>
              {formatCurrency(totals.totalAdvanceReceived)}
            </Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Net Balance</Text>
            <Text
              style={
                totals.totalNetBalance > 0
                  ? styles.summaryValueDanger
                  : styles.summaryValue
              }
            >
              {formatCurrency(Math.abs(totals.totalNetBalance))}
              {totals.totalNetBalance > 0 ? " (Owes)" : " (Owed)"}
            </Text>
          </View>
        </View>

        {/* Table */}
        <View style={styles.tableContainer}>
          {/* Table Header */}
          <View style={styles.tableHeaderRow} fixed>
            <Text style={[styles.tableHeaderCell, { width: COL.name }]}>
              Name
            </Text>
            <Text style={[styles.tableHeaderCell, { width: COL.dept }]}>
              Dept.
            </Text>
            <Text
              style={[styles.tableHeaderCell, { width: COL.salary, textAlign: "right" }]}
            >
              Salary
            </Text>
            <Text
              style={[styles.tableHeaderCell, { width: COL.earned, textAlign: "right" }]}
            >
              Earned
            </Text>
            <Text
              style={[styles.tableHeaderCell, { width: COL.ot, textAlign: "right" }]}
            >
              OT (hrs)
            </Text>
            <Text
              style={[styles.tableHeaderCell, { width: COL.salaryPaid, textAlign: "right" }]}
            >
              Salary Paid
            </Text>
            <Text
              style={[styles.tableHeaderCell, { width: COL.rewards, textAlign: "right" }]}
            >
              Rewards
            </Text>
            <Text
              style={[styles.tableHeaderCell, { width: COL.spent, textAlign: "right" }]}
            >
              Spent
            </Text>
            <Text
              style={[styles.tableHeaderCell, { width: COL.advances, textAlign: "right" }]}
            >
              Advances
            </Text>
            <Text
              style={[styles.tableHeaderCell, { width: COL.wallet, textAlign: "right" }]}
            >
              Wallet
            </Text>
            <Text
              style={[styles.tableHeaderCell, { width: COL.net, textAlign: "right" }]}
            >
              Net Balance
            </Text>
          </View>

          {/* Table Body */}
          {employees.length === 0 ? (
            <Text style={styles.noData}>No employee data available</Text>
          ) : (
            employees.map((emp, index) => (
              <View
                key={emp.id}
                style={[
                  styles.tableDataRow,
                  { backgroundColor: index % 2 === 0 ? "#f8fafc" : "#ffffff" },
                ]}
              >
                <Text style={[styles.tableDataCell, { width: COL.name }]}>
                  {emp.fullName}
                </Text>
                <Text style={[styles.tableDataCell, { width: COL.dept }]}>
                  {DEPARTMENT_LABELS[emp.department as Department] ?? emp.department}
                </Text>
                <Text
                  style={[
                    styles.tableDataCell,
                    { width: COL.salary, textAlign: "right" },
                  ]}
                >
                  {formatCurrency(emp.salary)}
                </Text>
                <Text
                  style={[
                    styles.tableDataCell,
                    { width: COL.earned, textAlign: "right" },
                  ]}
                >
                  {formatCurrency(emp.earnedSalary)}
                </Text>
                <Text
                  style={[
                    styles.tableDataCell,
                    { width: COL.ot, textAlign: "right" },
                  ]}
                >
                  {(emp.totalOvertimeHours ?? 0).toFixed(1)}
                </Text>
                <Text
                  style={[
                    styles.tableDataCell,
                    { width: COL.salaryPaid, textAlign: "right" },
                  ]}
                >
                  {formatCurrency(emp.totalSalaryPaid)}
                </Text>
                <Text
                  style={[
                    styles.tableDataCell,
                    { width: COL.rewards, textAlign: "right" },
                  ]}
                >
                  {formatCurrency(emp.totalRewards)}
                </Text>
                <Text
                  style={[
                    styles.tableDataCell,
                    { width: COL.spent, textAlign: "right" },
                  ]}
                >
                  {formatCurrency(emp.totalExpensesPaidBy)}
                </Text>
                <Text
                  style={[
                    styles.tableDataCell,
                    { width: COL.advances, textAlign: "right" },
                  ]}
                >
                  {formatCurrency(emp.totalAdvanceReceived)}
                </Text>
                <Text
                  style={[
                    styles.tableDataCell,
                    { width: COL.wallet, textAlign: "right" },
                  ]}
                >
                  {formatCurrency(emp.walletBalance)}
                </Text>
                <Text
                  style={[
                    styles.tableDataCell,
                    {
                      width: COL.net,
                      textAlign: "right",
                      color:
                        emp.netBalance > 0
                          ? "#dc2626"
                          : "#059669",
                    },
                  ]}
                >
                  {formatCurrency(Math.abs(emp.netBalance))}
                </Text>
              </View>
            ))
          )}

          {/* Totals Row */}
          {employees.length > 0 && (
            <View style={styles.tableTotalRow}>
              <Text style={[styles.tableTotalCell, { width: COL.name }]}>
                Total ({totals.employeeCount})
              </Text>
              <Text style={[styles.tableTotalCell, { width: COL.dept }]} />
              <Text
                style={[
                  styles.tableTotalCell,
                  { width: COL.salary, textAlign: "right" },
                ]}
              >
                {formatCurrency(totals.totalSalary)}
              </Text>
              <Text
                style={[
                  styles.tableTotalCell,
                  { width: COL.earned, textAlign: "right" },
                ]}
              >
                {formatCurrency(totals.totalEarnedSalary)}
              </Text>
              <Text
                style={[
                  styles.tableTotalCell,
                  { width: COL.ot, textAlign: "right" },
                ]}
              >
                {totals.totalOvertimeHours.toFixed(1)}
              </Text>
              <Text
                style={[
                  styles.tableTotalCell,
                  { width: COL.salaryPaid, textAlign: "right" },
                ]}
              >
                {formatCurrency(totals.totalSalaryPaid)}
              </Text>
              <Text
                style={[
                  styles.tableTotalCell,
                  { width: COL.rewards, textAlign: "right" },
                ]}
              >
                {formatCurrency(totals.totalRewards)}
              </Text>
              <Text
                style={[
                  styles.tableTotalCell,
                  { width: COL.spent, textAlign: "right" },
                ]}
              >
                {formatCurrency(totals.totalExpensesPaidBy)}
              </Text>
              <Text
                style={[
                  styles.tableTotalCell,
                  { width: COL.advances, textAlign: "right" },
                ]}
              >
                {formatCurrency(totals.totalAdvanceReceived)}
              </Text>
              <Text
                style={[
                  styles.tableTotalCell,
                  { width: COL.wallet, textAlign: "right" },
                ]}
              >
                {formatCurrency(totals.totalWalletBalance)}
              </Text>
              <Text
                style={[
                  styles.tableTotalCell,
                  {
                    width: COL.net,
                    textAlign: "right",
                    color:
                      totals.totalNetBalance > 0 ? "#dc2626" : "#059669",
                  },
                ]}
              >
                {formatCurrency(Math.abs(totals.totalNetBalance))}
              </Text>
            </View>
          )}
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>YakhshiLedger</Text>
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
