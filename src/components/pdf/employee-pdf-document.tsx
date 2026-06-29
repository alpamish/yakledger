import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import { format } from "date-fns";
import type { Employee } from "@/types/employee";
import type { Expense, LedgerEntry } from "@/types/expense";
import { CATEGORY_LABELS, CASH_TRANSACTION_TYPE_LABELS } from "@/types/expense";
import {
  DEPARTMENT_LABELS,
  EMPLOYMENT_TYPE_LABELS,
  EMPLOYEE_STATUS_LABELS,
  GENDER_LABELS,
  EMPLOYEE_STATUS_COLORS,
} from "@/types/employee";

Font.register({
  family: "Vazirmatn",
  src: "/fonts/Vazirmatn-Regular.ttf",
});

export interface EmployeePDFFilters {
  dateFrom?: string;
  dateTo?: string;
}

interface EmployeePDFDocumentProps {
  employee: Employee;
  expensesPaidBy: Expense[];
  expensesPaidTo: Expense[];
  ledger: LedgerEntry[];
  walletBalance: number;
  filters?: EmployeePDFFilters;
  companyName?: string;
  showPersonalInfo?: boolean;
  showJobInfo?: boolean;
  showSalarySummary?: boolean;
  showExpensesPaidTo?: boolean;
  showExpensesPaidBy?: boolean;
  showLedger?: boolean;
}

const formatCurrency = (amount: number) =>
  `AFN ${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatDate = (dateStr: string) => {
  try {
    return format(new Date(dateStr), "MMM dd, yyyy");
  } catch {
    return dateStr;
  }
};

const truncate = (str: string, maxLen: number) =>
  str.length > maxLen ? str.slice(0, maxLen - 1) + "…" : str;

const PADDING = 50;
const PAGE_WIDTH = 595;
const CONTENT_WIDTH = PAGE_WIDTH - PADDING * 2;

const ROW_HEIGHT = 22;

const FIRST_PAGE_ROWS = 18;
const CONT_PAGE_ROWS = 28;

const styles = StyleSheet.create({
  page: {
    padding: PADDING,
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
    marginBottom: 3,
  },
  generatedDate: {
    fontSize: 9,
    color: "#64748b",
    marginBottom: 8,
  },
  divider: {
    height: 2,
    backgroundColor: "#059669",
    marginBottom: 10,
  },
  filterContainer: {
    backgroundColor: "#f0fdf4",
    borderLeftWidth: 3,
    borderLeftColor: "#059669",
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 10,
  },
  filterLabel: {
    fontSize: 8,
    color: "#059669",
    marginBottom: 2,
  },
  filterText: {
    fontSize: 8,
    color: "#475569",
  },

  sectionTitle: {
    fontSize: 18,
    color: "#059669",
    marginBottom: 8,
    marginTop: 6,
  },

  infoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 8,
  },
  infoCol: {
    width: "50%",
    marginBottom: 3,
  },
  infoLabel: {
    fontSize: 8,
    color: "#64748b",
  },
  infoValue: {
    fontSize: 9,
    color: "#1e293b",
  },

  salaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
    backgroundColor: "#f8fafc",
    padding: 8,
    borderRadius: 3,
  },
  salaryBox: {
    alignItems: "center",
  },
  salaryLabel: {
    fontSize: 8,
    color: "#64748b",
  },
  salaryValue: {
    fontSize: 11,
    color: "#059669",
  },

  tableContainer: {
    width: CONTENT_WIDTH,
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
    fontSize: 8,
  },
  tableDataRow: {
    flexDirection: "row",
    minHeight: ROW_HEIGHT,
    alignItems: "center",
    borderBottomWidth: 0.5,
    borderBottomColor: "#e2e8f0",
  },
  tableDataCell: {
    paddingHorizontal: 3,
    paddingVertical: 2,
    fontSize: 8,
    color: "#334155",
  },

  summaryCards: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: "#f0fdf4",
    padding: 6,
    borderRadius: 3,
    alignItems: "center",
  },
  summaryCardLabel: {
    fontSize: 8,
    color: "#64748b",
  },
  summaryCardValue: {
    fontSize: 10,
    color: "#059669",
  },

  noDataContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
  },
  noDataText: {
    fontSize: 11,
    color: "#94a3b8",
  },

  footerDivider: {
    height: 1,
    backgroundColor: "#059669",
    marginTop: 16,
    marginBottom: 10,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 3,
  },
  summaryLabel: {
    fontSize: 10,
    color: "#475569",
  },
  summaryValue: {
    fontSize: 10,
    color: "#1e293b",
  },
  grandTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
    marginBottom: 14,
  },
  grandTotalLabel: {
    fontSize: 14,
    color: "#059669",
  },
  grandTotalValue: {
    fontSize: 14,
    color: "#059669",
  },
  signaturesContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 24,
    marginBottom: 16,
  },
  signatureLine: {
    width: 180,
    borderTopWidth: 1,
    borderTopColor: "#94a3b8",
    paddingTop: 4,
    fontSize: 9,
    color: "#64748b",
  },
  footerNote: {
    fontSize: 8,
    color: "#94a3b8",
    textAlign: "center",
    marginTop: 6,
  },
  pageNumberContainer: {
    position: "absolute",
    bottom: 25,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  pageNumberText: {
    fontSize: 8,
    color: "#94a3b8",
  },

  statusBadge: {
    fontSize: 8,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 2,
  },
});

function FilterSummary({ dateFrom, dateTo }: { dateFrom?: string; dateTo?: string }) {
  if (!dateFrom && !dateTo) return null;
  const from = dateFrom ? formatDate(dateFrom) : "…";
  const to = dateTo ? formatDate(dateTo) : "…";
  return (
    <View style={styles.filterContainer}>
      <Text style={styles.filterLabel}>Date Range</Text>
      <Text style={styles.filterText}>{from} — {to}</Text>
    </View>
  );
}

function StatusBadge({ value, color }: { value: string; color: string }) {
  return (
    <Text style={[styles.statusBadge, { backgroundColor: `${color}18`, color }]}>{value}</Text>
  );
}

function InfoField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <View style={styles.infoCol}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value || "—"}</Text>
    </View>
  );
}

function CoverPage({
  employee: e,
  dateFrom,
  dateTo,
  walletBalance,
  companyName,
  showPersonalInfo = true,
  showJobInfo = true,
  showSalarySummary = true,
}: {
  employee: Employee;
  dateFrom?: string;
  dateTo?: string;
  walletBalance: number;
  companyName: string;
  showPersonalInfo?: boolean;
  showJobInfo?: boolean;
  showSalarySummary?: boolean;
}) {
  const statusColor = EMPLOYEE_STATUS_COLORS[e.status as keyof typeof EMPLOYEE_STATUS_COLORS] ?? "#78716c";

  return (
    <View>
      <Text style={styles.companyName}>{companyName}</Text>
      <Text style={styles.reportTitle}>Employee Report</Text>
      <Text style={styles.generatedDate}>Generated on: {format(new Date(), "MMMM d, yyyy")}</Text>
      <View style={styles.divider} />
      {(dateFrom || dateTo) && <FilterSummary dateFrom={dateFrom} dateTo={dateTo} />}

      {showPersonalInfo && (
        <View>
          <Text style={styles.sectionTitle}>Personal Information</Text>
          <View style={styles.infoGrid}>
            <InfoField label="Full Name" value={e.fullName} />
            <InfoField label="Father Name" value={e.fatherName} />
            <InfoField label="Gender" value={GENDER_LABELS[e.gender as keyof typeof GENDER_LABELS] ?? e.gender} />
            <InfoField label="Date of Birth" value={e.dateOfBirth ? formatDate(e.dateOfBirth) : null} />
            <InfoField label="National ID" value={e.nationalId} />
            <InfoField label="Phone Number" value={e.phoneNumber} />
            <InfoField label="Email" value={e.email} />
            <InfoField label="Address" value={e.address} />
          </View>
          <View style={styles.divider} />
        </View>
      )}

      {showJobInfo && (
        <View>
          <Text style={styles.sectionTitle}>Job Information</Text>
          <View style={styles.infoGrid}>
            <InfoField label="Job Title" value={e.jobTitle} />
            <InfoField label="Department" value={DEPARTMENT_LABELS[e.department as keyof typeof DEPARTMENT_LABELS] ?? e.department} />
            <InfoField label="Employment Type" value={EMPLOYMENT_TYPE_LABELS[e.employmentType as keyof typeof EMPLOYMENT_TYPE_LABELS] ?? e.employmentType} />
            <InfoField label="Hire Date" value={e.hireDate ? formatDate(e.hireDate) : null} />
            <View style={styles.infoCol}>
              <Text style={styles.infoLabel}>Status</Text>
              <StatusBadge value={EMPLOYEE_STATUS_LABELS[e.status as keyof typeof EMPLOYEE_STATUS_LABELS] ?? e.status} color={statusColor} />
            </View>
          </View>
          <View style={styles.divider} />
        </View>
      )}

      {showSalarySummary && (
        <View>
          <Text style={styles.sectionTitle}>Salary &amp; Financial Overview</Text>
          <View style={styles.salaryRow}>
            <View style={styles.salaryBox}>
              <Text style={styles.salaryLabel}>Monthly Salary</Text>
              <Text style={styles.salaryValue}>{formatCurrency(e.salary)}</Text>
            </View>
            <View style={styles.salaryBox}>
              <Text style={styles.salaryLabel}>Daily Salary</Text>
              <Text style={styles.salaryValue}>{formatCurrency(e.salary / 30)}</Text>
            </View>
            <View style={styles.salaryBox}>
              <Text style={styles.salaryLabel}>Advance Balance</Text>
              <Text style={styles.salaryValue}>{formatCurrency(walletBalance)}</Text>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

function ExpensesSection({
  expenses: rawExpenses,
  title,
  totalLabel,
  emptyMessage,
  companyName,
}: {
  expenses: Expense[];
  title: string;
  totalLabel: string;
  emptyMessage: string;
  companyName: string;
}) {
  const expenses = rawExpenses.filter(Boolean);
  const grandTotal = expenses.reduce((s, e) => s + e.amount, 0);

  const COL = { num: 20, title: 150, category: 85, amount: 85, date: 70, method: 85 };
  const TOTAL = Object.values(COL).reduce((s, v) => s + v, 0);

  const pages: Expense[][] = [];
  if (expenses.length === 0) {
    pages.push([]);
  } else {
    let remaining = [...expenses];
    pages.push(remaining.slice(0, FIRST_PAGE_ROWS));
    remaining = remaining.slice(FIRST_PAGE_ROWS);
    while (remaining.length > 0) {
      pages.push(remaining.slice(0, CONT_PAGE_ROWS));
      remaining = remaining.slice(CONT_PAGE_ROWS);
    }
  }

  let globalIndex = 0;

  return pages.map((pageData, idx) => {
    const isFirst = idx === 0;
    return (
      <Page key={`${title}-${idx}`} size="A4" style={styles.page}>
        {isFirst && (
          <View style={{ marginBottom: 6 }}>
            <Text style={styles.companyName}>{companyName}</Text>
            <Text style={styles.reportTitle}>{title}</Text>
            <View style={styles.divider} />
            <View style={styles.summaryCards}>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryCardLabel}>{totalLabel}</Text>
                <Text style={styles.summaryCardValue}>{formatCurrency(grandTotal)}</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryCardLabel}>Records</Text>
                <Text style={styles.summaryCardValue}>{expenses.length}</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryCardLabel}>Average</Text>
                <Text style={styles.summaryCardValue}>
                  {expenses.length > 0 ? formatCurrency(grandTotal / expenses.length) : formatCurrency(0)}
                </Text>
              </View>
            </View>
          </View>
        )}

        {pageData.length > 0 ? (
          <View style={[styles.tableContainer, { width: TOTAL }]}>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.tableHeaderCell, { width: COL.num }]}>#</Text>
              <Text style={[styles.tableHeaderCell, { width: COL.title }]}>Title</Text>
              <Text style={[styles.tableHeaderCell, { width: COL.category }]}>Category</Text>
              <Text style={[styles.tableHeaderCell, { width: COL.amount, textAlign: "right" }]}>Amount</Text>
              <Text style={[styles.tableHeaderCell, { width: COL.date }]}>Date</Text>
              <Text style={[styles.tableHeaderCell, { width: COL.method }]}>Payment</Text>
            </View>
            {pageData.filter(Boolean).filter((e): e is Expense => Boolean(e && e.id)).map((exp) => {
              globalIndex++;
              return (
                <View key={exp.id} style={[styles.tableDataRow, { backgroundColor: globalIndex % 2 === 0 ? "#f8fafc" : "#ffffff" }]}>
                  <Text style={[styles.tableDataCell, { width: COL.num }]}>{globalIndex}</Text>
                  <Text style={[styles.tableDataCell, { width: COL.title }]}>{truncate(exp.title, 18)}</Text>
                  <Text style={[styles.tableDataCell, { width: COL.category }]}>
                    {CATEGORY_LABELS[exp.category as keyof typeof CATEGORY_LABELS] ?? exp.category}
                  </Text>
                  <Text style={[styles.tableDataCell, { width: COL.amount, textAlign: "right" }]}>{formatCurrency(exp.amount)}</Text>
                  <Text style={[styles.tableDataCell, { width: COL.date }]}>{formatDate(exp.expenseDate)}</Text>
                  <Text style={[styles.tableDataCell, { width: COL.method }]}>{exp.paymentMethod ?? "—"}</Text>
                </View>
              );
            })}
          </View>
        ) : (
          <View style={styles.noDataContainer}>
            <Text style={styles.noDataText}>{emptyMessage}</Text>
          </View>
        )}

        <View style={styles.pageNumberContainer}
          render={({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) => (
            <Text style={styles.pageNumberText}>Page {pageNumber} of {totalPages}</Text>
          )}
        />
      </Page>
    );
  });
}

function LedgerSection({
  ledger: rawLedger,
  companyName,
}: {
  ledger: LedgerEntry[];
  companyName: string;
}) {
  const ledger = rawLedger.filter(Boolean);
  const COL = { num: 20, date: 75, type: 70, description: 160, amount: 85, balance: 85 };
  const TOTAL = Object.values(COL).reduce((s, v) => s + v, 0);

  const pages: LedgerEntry[][] = [];
  if (ledger.length === 0) {
    pages.push([]);
  } else {
    let remaining = [...ledger];
    pages.push(remaining.slice(0, FIRST_PAGE_ROWS));
    remaining = remaining.slice(FIRST_PAGE_ROWS);
    while (remaining.length > 0) {
      pages.push(remaining.slice(0, CONT_PAGE_ROWS));
      remaining = remaining.slice(CONT_PAGE_ROWS);
    }
  }

  let globalIndex = 0;

  return pages.map((pageData, idx) => {
    const isFirst = idx === 0;
    return (
      <Page key={`ledger-${idx}`} size="A4" style={styles.page}>
        {isFirst && (
          <View style={{ marginBottom: 6 }}>
            <Text style={styles.companyName}>{companyName}</Text>
            <Text style={styles.reportTitle}>Cash Advance / Wallet Ledger</Text>
            <View style={styles.divider} />
          </View>
        )}

        {pageData.length > 0 ? (
          <View style={[styles.tableContainer, { width: TOTAL }]}>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.tableHeaderCell, { width: COL.num }]}>#</Text>
              <Text style={[styles.tableHeaderCell, { width: COL.date }]}>Date</Text>
              <Text style={[styles.tableHeaderCell, { width: COL.type }]}>Type</Text>
              <Text style={[styles.tableHeaderCell, { width: COL.description }]}>Description</Text>
              <Text style={[styles.tableHeaderCell, { width: COL.amount, textAlign: "right" }]}>Amount</Text>
              <Text style={[styles.tableHeaderCell, { width: COL.balance, textAlign: "right" }]}>Balance</Text>
            </View>
            {pageData.filter(Boolean).filter((e): e is LedgerEntry => Boolean(e && e.id)).map((entry) => {
              globalIndex++;
              return (
                <View key={entry.id} style={[styles.tableDataRow, { backgroundColor: globalIndex % 2 === 0 ? "#f8fafc" : "#ffffff" }]}>
                  <Text style={[styles.tableDataCell, { width: COL.num }]}>{globalIndex}</Text>
                  <Text style={[styles.tableDataCell, { width: COL.date }]}>{formatDate(entry.date)}</Text>
                  <Text style={[styles.tableDataCell, { width: COL.type }]}>
                    {CASH_TRANSACTION_TYPE_LABELS[entry.type as keyof typeof CASH_TRANSACTION_TYPE_LABELS] ?? entry.type}
                  </Text>
                  <Text style={[styles.tableDataCell, { width: COL.description }]}>{truncate(entry.description, 24)}</Text>
                  <Text style={[styles.tableDataCell, { width: COL.amount, textAlign: "right" }]}>{formatCurrency(entry.amount)}</Text>
                  <Text style={[styles.tableDataCell, { width: COL.balance, textAlign: "right" }]}>{formatCurrency(entry.runningBalance)}</Text>
                </View>
              );
            })}
          </View>
        ) : (
          <View style={styles.noDataContainer}>
            <Text style={styles.noDataText}>No ledger entries found</Text>
          </View>
        )}

        <View style={styles.pageNumberContainer}
          render={({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) => (
            <Text style={styles.pageNumberText}>Page {pageNumber} of {totalPages}</Text>
          )}
        />
      </Page>
    );
  });
}

function SummaryPage({
  employee: e,
  expensesPaidBy,
  expensesPaidTo,
  walletBalance,
  companyName,
}: {
  employee: Employee;
  expensesPaidBy: Expense[];
  expensesPaidTo: Expense[];
  walletBalance: number;
  companyName: string;
}) {
  const dailySalary = e.salary / 30;
  const hireDateObj = new Date(e.hireDate);
  const currentDate = new Date();
  const isActive = e.status === "ACTIVE";
  const endDate = isActive ? currentDate : (e.quitingDate ? new Date(e.quitingDate) : currentDate);
  const daysWorked = Math.max(0, Math.floor((endDate.getTime() - hireDateObj.getTime()) / (1000 * 60 * 60 * 24)));
  const earnedSalary = dailySalary * daysWorked;
  const totalTaken = expensesPaidTo.reduce((s, exp) => s + exp.amount, 0);
  const walletEffect = -walletBalance;
  const remainingToBePaid = earnedSalary - totalTaken - walletBalance;

  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.companyName}>{companyName}</Text>
      <Text style={styles.reportTitle}>Financial Summary</Text>
      <View style={styles.divider} />

      <Text style={styles.sectionTitle}>{e.fullName}</Text>

      <View style={[styles.summaryCards, { marginTop: 8 }]}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryCardLabel}>Earned Salary</Text>
          <Text style={styles.summaryCardValue}>{formatCurrency(earnedSalary)}</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryCardLabel}>Total Taken</Text>
          <Text style={styles.summaryCardValue}>{formatCurrency(totalTaken)}</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryCardLabel}>Advance Balance</Text>
          <Text style={styles.summaryCardValue}>{formatCurrency(walletBalance)}</Text>
        </View>
      </View>

      <View style={styles.footerDivider} />

      <View style={styles.summaryRow}>
        <Text style={styles.summaryLabel}>Monthly Salary:</Text>
        <Text style={styles.summaryValue}>{formatCurrency(e.salary)}</Text>
      </View>
      <View style={styles.summaryRow}>
        <Text style={styles.summaryLabel}>Daily Salary (Salary / 30):</Text>
        <Text style={styles.summaryValue}>{formatCurrency(dailySalary)}</Text>
      </View>
      <View style={styles.summaryRow}>
        <Text style={styles.summaryLabel}>Days Since Hire:</Text>
        <Text style={styles.summaryValue}>{daysWorked} days</Text>
      </View>
      <View style={styles.summaryRow}>
        <Text style={styles.summaryLabel}>Earned Salary (Daily × Days):</Text>
        <Text style={styles.summaryValue}>{formatCurrency(earnedSalary)}</Text>
      </View>
      <View style={styles.summaryRow}>
        <Text style={styles.summaryLabel}>Total Expenses Taken (Paid To):</Text>
        <Text style={styles.summaryValue}>({formatCurrency(totalTaken)})</Text>
      </View>
      <View style={styles.summaryRow}>
        <Text style={styles.summaryLabel}>Cash Advance / Wallet Balance:</Text>
        <Text style={[styles.summaryValue, { color: walletEffect >= 0 ? "#059669" : "#dc2626" }]}>
          {walletEffect >= 0 ? "+" : "("}{formatCurrency(Math.abs(walletEffect))}{walletEffect < 0 ? ")" : ""}
        </Text>
      </View>

      <View style={styles.grandTotalRow}>
        <Text style={styles.grandTotalLabel}>Remaining to be Paid:</Text>
        <Text style={[styles.grandTotalValue, { color: remainingToBePaid >= 0 ? "#059669" : "#dc2626" }]}>
          {formatCurrency(Math.abs(remainingToBePaid))}
        </Text>
      </View>

      <View style={styles.signaturesContainer}>
        <Text style={styles.signatureLine}>Authorized By: _______________</Text>
        <Text style={styles.signatureLine}>Approved By: _______________</Text>
      </View>

      <Text style={styles.footerNote}>
        This report was generated by {companyName}
      </Text>

      <View style={styles.pageNumberContainer}
        render={({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) => (
          <Text style={styles.pageNumberText}>Page {pageNumber} of {totalPages}</Text>
        )}
      />
    </Page>
  );
}

function EmployeePDFDocument({
  employee,
  expensesPaidBy: rawExpensesPaidBy,
  expensesPaidTo: rawExpensesPaidTo,
  ledger: rawLedger,
  walletBalance,
  filters,
  companyName = "YakhshiLedger",
  showPersonalInfo = true,
  showJobInfo = true,
  showSalarySummary = true,
  showExpensesPaidTo = true,
  showExpensesPaidBy = true,
  showLedger = true,
}: EmployeePDFDocumentProps) {
  const dateFrom = filters?.dateFrom;
  const dateTo = filters?.dateTo;
  const expensesPaidBy = (Array.isArray(rawExpensesPaidBy) ? rawExpensesPaidBy : []).filter(
    (e): e is Expense => Boolean(e && e.id)
  );
  const expensesPaidTo = (Array.isArray(rawExpensesPaidTo) ? rawExpensesPaidTo : []).filter(
    (e): e is Expense => Boolean(e && e.id)
  );
  const ledger = (Array.isArray(rawLedger) ? rawLedger : []).filter(
    (e): e is LedgerEntry => Boolean(e && e.id)
  );

  return (
    <Document
      title={`Employee Report - ${employee.fullName}`}
      author={companyName}
      creator={companyName}
    >
      <Page size="A4" style={styles.page}>
        <CoverPage employee={employee} dateFrom={dateFrom} dateTo={dateTo} walletBalance={walletBalance} companyName={companyName} showPersonalInfo={showPersonalInfo} showJobInfo={showJobInfo} showSalarySummary={showSalarySummary} />
        <View style={styles.pageNumberContainer}
          render={({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) => (
            <Text style={styles.pageNumberText}>Page {pageNumber} of {totalPages}</Text>
          )}
        />
      </Page>

      {showExpensesPaidTo && ExpensesSection({
        expenses: expensesPaidTo,
        title: "Expenses Paid To Employee",
        totalLabel: "Total Taken",
        emptyMessage: "No expense records found (paid to)",
        companyName,
      })}

      {showExpensesPaidBy && ExpensesSection({
        expenses: expensesPaidBy,
        title: "Expenses Paid By Employee",
        totalLabel: "Total Spent",
        emptyMessage: "No expense records found (paid by)",
        companyName,
      })}

      {showLedger && LedgerSection({ ledger, companyName })}

      {showSalarySummary && (
        <SummaryPage
          employee={employee}
          expensesPaidBy={expensesPaidBy}
          expensesPaidTo={expensesPaidTo}
          walletBalance={walletBalance}
          companyName={companyName}
        />
      )}
    </Document>
  );
}

export default EmployeePDFDocument;
