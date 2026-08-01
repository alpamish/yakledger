import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import { format } from "date-fns";
import type { Employee, Department } from "@/types/employee";
import type { Expense } from "@/types/expense";
import { CATEGORY_LABELS } from "@/types/expense";
import { DEPARTMENT_LABELS } from "@/types/employee";

Font.register({
  family: "Vazirmatn",
  src: "/fonts/Vazirmatn-Regular.ttf",
});

function formatCurrency(amount: number): string {
  return `AFN ${Math.round(amount).toLocaleString("en-US")}`;
}

const ECOL = {
  title: "24%",
  category: "16%",
  notes: "24%",
  amount: "18%",
  date: "18%",
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
    fontSize: 7,
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
    fontSize: 7.5,
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

function ExpensesTable({ title, rows }: { title: string; rows: Expense[] }) {
  const totalAmount = rows.reduce((s, e) => s + e.amount, 0);
  if (rows.length === 0) return null;
  return (
    <View style={styles.tableContainer}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.tableHeaderRow} fixed>
        <Text style={[styles.tableHeaderCell, { width: ECOL.title }]}>Title</Text>
        <Text style={[styles.tableHeaderCell, { width: ECOL.category }]}>Category</Text>
        <Text style={[styles.tableHeaderCell, { width: ECOL.amount, textAlign: "right" }]}>Amount</Text>
        <Text style={[styles.tableHeaderCell, { width: ECOL.date }]}>Date</Text>
        <Text style={[styles.tableHeaderCell, { width: ECOL.notes }]}>Notes</Text>
      </View>
      {rows.map((e, i) => (
        <View key={e.id} style={[styles.tableDataRow, { backgroundColor: i % 2 === 0 ? "#f8fafc" : "#ffffff" }]}>
          <Text style={[styles.tableDataCell, { width: ECOL.title }]}>{e.title}</Text>
          <Text style={[styles.tableDataCell, { width: ECOL.category }]}>
            {CATEGORY_LABELS[e.category as keyof typeof CATEGORY_LABELS] ?? e.category}
          </Text>
          <Text style={[styles.tableDataCell, { width: ECOL.amount, textAlign: "right" }]}>{formatCurrency(e.amount)}</Text>
          <Text style={[styles.tableDataCell, { width: ECOL.date }]}>
            {e.expenseDate?.slice(0, 10) || "—"}
          </Text>
          <Text style={[styles.tableDataCell, { width: ECOL.notes }]}>{e.notes || "—"}</Text>
        </View>
      ))}
      <View style={[styles.tableDataRow, { backgroundColor: "#f0fdf4", minHeight: 18 }]}>
        <Text style={[styles.tableDataCell, { width: ECOL.title, fontWeight: "bold" }]}>Total</Text>
        <Text style={[styles.tableDataCell, { width: ECOL.category }]} />
        <Text style={[styles.tableDataCell, { width: ECOL.amount, textAlign: "right", fontWeight: "bold" }]}>{formatCurrency(totalAmount)}</Text>
        <Text style={[styles.tableDataCell, { width: ECOL.date }]} />
        <Text style={[styles.tableDataCell, { width: ECOL.notes }]} />
      </View>
    </View>
  );
}

interface EmployeeFinancialPDFDocumentProps {
  employee: Employee;
  expensesPaidBy: Expense[];
  expensesPaidTo: Expense[];
  walletBalance: number;
  companyName?: string;
  dateFrom?: string;
  dateTo?: string;
}

export default function EmployeeFinancialPDFDocument({
  employee: e,
  expensesPaidBy,
  expensesPaidTo,
  walletBalance,
  companyName = "YakhshiLedger",
  dateFrom,
  dateTo,
}: EmployeeFinancialPDFDocumentProps) {
  const genDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const dailySalary = e.salary / 30;
  const totalSalaryPaid = e.totalSalaryPaid ?? 0;
  const totalRewards = e.totalRewards ?? 0;
  const totalTaken = e.totalExpensesPaidTo ?? 0;
  const totalSpent = e.totalExpensesPaidBy ?? 0;
  const remaining = e.salary - totalSalaryPaid - walletBalance;
  const isRemainingNegative = remaining < 0;

  const allExpenses = [...expensesPaidTo, ...expensesPaidBy].sort(
    (a, b) => new Date(b.expenseDate).getTime() - new Date(a.expenseDate).getTime()
  );

  return (
    <Document
      title={`${e.fullName} - Financial Summary`}
      author={companyName}
      creator={companyName}
    >
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Employee Financial Summary</Text>
        <Text style={styles.subtitle}>
          {companyName} | {e.fullName} | {e.jobTitle} | Generated: {genDate}
        </Text>
        <Text style={styles.subtitle}>
          {DEPARTMENT_LABELS[e.department as Department] ?? e.department}
        </Text>
        {(dateFrom || dateTo) && (
          <Text style={styles.filterInfo}>
            {dateFrom && `From: ${dateFrom}`}
            {dateFrom && dateTo ? " | " : ""}
            {dateTo && `To: ${dateTo}`}
          </Text>
        )}
        <View style={styles.divider} />

        <View style={styles.summaryRow}>
          <SummaryCard label="Monthly Salary" value={formatCurrency(e.salary)} />
          <SummaryCard label="Daily Salary" value={formatCurrency(dailySalary)} />
          <SummaryCard label="Salary Paid" value={formatCurrency(totalSalaryPaid)} />
          <SummaryCard label="Rewards" value={formatCurrency(totalRewards)} />
          <SummaryCard
            label={`Overtime (${(e.totalOvertimeHours ?? 0).toFixed(1)} hrs)`}
            value={formatCurrency(e.overtimePay ?? 0)}
          />
          <SummaryCard label="Wallet Balance" value={formatCurrency(walletBalance)} />
          <SummaryCard
            label="Net Remaining"
            value={formatCurrency(Math.abs(remaining)) + (isRemainingNegative ? " (Owes)" : " (Owed)")}
            isNegative={isRemainingNegative}
          />
        </View>

        {expensesPaidTo.length > 0 && (
          <ExpensesTable title="Expenses Paid To Employee" rows={expensesPaidTo} />
        )}

        {expensesPaidBy.length > 0 && (
          <ExpensesTable title="Expenses Paid By Employee" rows={expensesPaidBy} />
        )}

        {allExpenses.length === 0 && (
          <Text style={styles.noData}>No expense records found for this employee</Text>
        )}

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
