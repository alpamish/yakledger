import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import { format } from "date-fns";
import type { Expense, Category } from "@/types/expense";
import { CATEGORY_LABELS } from "@/types/expense";

interface EmployeeExpensePDFDocumentProps {
  expenses: Expense[];
  employeeName: string;
  type: 'taken' | 'spent';
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

const COL = {
  num: 30,
  title: 120,
  category: 90,
  amount: 80,
  date: 80,
} as const;

const TABLE_WIDTH = Object.values(COL).reduce((s, v) => s + v, 0);

const ROW_HEIGHT = 22;
const FIRST_PAGE_ROWS = 25;
const CONT_PAGE_ROWS = 30;

const styles = StyleSheet.create({
  page: {
    padding: 50,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: "#1e293b",
  },
  companyName: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    color: "#059669",
    marginBottom: 2,
  },
  reportTitle: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: "#334155",
    marginBottom: 4,
  },
  employeeName: {
    fontSize: 11,
    color: "#475569",
    marginBottom: 2,
  },
  expenseType: {
    fontSize: 10,
    color: "#059669",
    fontFamily: "Helvetica-Bold",
    marginBottom: 10,
  },
  generatedDate: {
    fontSize: 9,
    color: "#64748b",
    marginBottom: 10,
  },
  divider: {
    height: 2,
    backgroundColor: "#059669",
    marginBottom: 12,
  },
  tableContainer: {
    width: TABLE_WIDTH,
  },
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: "#059669",
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    minHeight: 24,
    alignItems: "center",
  },
  tableHeaderCell: {
    paddingHorizontal: 4,
    paddingVertical: 5,
    color: "#ffffff",
    fontFamily: "Helvetica-Bold",
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
    paddingHorizontal: 4,
    paddingVertical: 3,
    fontSize: 8,
    color: "#334155",
  },
  noDataContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  noDataText: {
    fontSize: 12,
    color: "#94a3b8",
    fontFamily: "Helvetica",
  },
  footerDivider: {
    height: 1,
    backgroundColor: "#059669",
    marginTop: 20,
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  summaryLabel: {
    fontSize: 10,
    color: "#475569",
  },
  summaryValue: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: "#1e293b",
  },
  grandTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
    marginBottom: 16,
  },
  grandTotalLabel: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: "#059669",
  },
  grandTotalValue: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: "#059669",
  },
  signaturesContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 30,
    marginBottom: 20,
  },
  signatureLine: {
    width: 200,
    borderTopWidth: 1,
    borderTopColor: "#94a3b8",
    paddingTop: 4,
    fontSize: 9,
    color: "#64748b",
  },
  footerNote: {
    fontSize: 7,
    color: "#94a3b8",
    textAlign: "center",
    marginTop: 8,
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
});

function TableHeader() {
  return (
    <View style={styles.tableHeaderRow} fixed>
      <Text style={[styles.tableHeaderCell, { width: COL.num }]}>#</Text>
      <Text style={[styles.tableHeaderCell, { width: COL.title }]}>Title</Text>
      <Text style={[styles.tableHeaderCell, { width: COL.category }]}>Category</Text>
      <Text style={[styles.tableHeaderCell, { width: COL.amount, textAlign: "right" }]}>Amount</Text>
      <Text style={[styles.tableHeaderCell, { width: COL.date }]}>Date</Text>
    </View>
  );
}

function TableDataRow({
  expense,
  index,
  isEven,
}: {
  expense: Expense;
  index: number;
  isEven: boolean;
}) {
  const bgColor = isEven ? "#f8fafc" : "#ffffff";

  return (
    <View style={[styles.tableDataRow, { backgroundColor: bgColor }]}>
      <Text style={[styles.tableDataCell, { width: COL.num }]}>{index}</Text>
      <Text style={[styles.tableDataCell, { width: COL.title }]}>
        {truncate(expense.title, 22)}
      </Text>
      <Text style={[styles.tableDataCell, { width: COL.category }]}>
        {CATEGORY_LABELS[expense.category] ?? expense.category}
      </Text>
      <Text
        style={[
          styles.tableDataCell,
          { width: COL.amount, textAlign: "right", fontFamily: "Helvetica-Bold" },
        ]}
      >
        {formatCurrency(expense.amount)}
      </Text>
      <Text style={[styles.tableDataCell, { width: COL.date }]}>
        {formatDate(expense.expenseDate)}
      </Text>
    </View>
  );
}

function ReportFooter({
  totalExpenses,
  grandTotal,
}: {
  totalExpenses: number;
  grandTotal: number;
}) {
  return (
    <View>
      <View style={styles.footerDivider} />
      <View style={styles.summaryRow}>
        <Text style={styles.summaryLabel}>Total Transactions:</Text>
        <Text style={styles.summaryValue}>{totalExpenses}</Text>
      </View>
      <View style={styles.grandTotalRow}>
        <Text style={styles.grandTotalLabel}>Grand Total:</Text>
        <Text style={styles.grandTotalValue}>{formatCurrency(grandTotal)}</Text>
      </View>
      <View style={styles.signaturesContainer}>
        <Text style={styles.signatureLine}>Authorized By: _______________</Text>
        <Text style={styles.signatureLine}>Approved By: _______________</Text>
      </View>
      <Text style={styles.footerNote}>
        This report was generated by Yakhshi Ledger Pro
      </Text>
    </View>
  );
}

function EmployeeExpensePDFDocument({
  expenses: rawExpenses,
  employeeName,
  type,
}: EmployeeExpensePDFDocumentProps) {
  const expenses = (Array.isArray(rawExpenses) ? rawExpenses : []).filter(
    (e): e is Expense => Boolean(e && e.id)
  );
  const grandTotal = expenses.reduce((sum, e) => sum + e.amount, 0);
  const generatedDate = format(new Date(), "MMMM d, yyyy");
  const typeLabel = type === 'taken' ? 'Expenses Paid To' : 'Expenses Paid By';
  const totalLabel = type === 'taken' ? 'Total Received' : 'Total Spent';

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

  return (
    <Document title={`${typeLabel} - ${employeeName}`} author="Yakhshi Ledger Pro" creator="Yakhshi Ledger Pro">
      {pages.map((pageExpenses, pageIdx) => {
        const isFirstPage = pageIdx === 0;
        const isLastPage = pageIdx === pages.length - 1;

        return (
          <Page key={pageIdx} size="A4" style={styles.page}>
            {isFirstPage && (
              <View style={{ marginBottom: 10 }}>
                <Text style={styles.companyName}>Yakhshi Ledger Pro</Text>
                <Text style={styles.reportTitle}>{typeLabel} Report</Text>
                <Text style={styles.employeeName}>Employee: {employeeName}</Text>
                <Text style={styles.expenseType}>{totalLabel}: {formatCurrency(grandTotal)}</Text>
                <Text style={styles.generatedDate}>Generated on: {generatedDate}</Text>
                <View style={styles.divider} />
              </View>
            )}

            {pageExpenses.length > 0 ? (
              <View style={styles.tableContainer}>
                <TableHeader />
                {pageExpenses.map(() => {
                  globalIndex++;
                  return (
                    <TableDataRow
                      key={globalIndex}
                      expense={pageExpenses[globalIndex - 1 - (pageIdx * (isFirstPage ? FIRST_PAGE_ROWS : CONT_PAGE_ROWS))]}
                      index={globalIndex}
                      isEven={globalIndex % 2 === 0}
                    />
                  );
                })}
              </View>
            ) : (
              <View style={styles.noDataContainer}>
                <Text style={styles.noDataText}>No expenses recorded</Text>
              </View>
            )}

            {isLastPage && (
              <ReportFooter totalExpenses={expenses.length} grandTotal={grandTotal} />
            )}

            <View style={styles.pageNumberContainer} render={({ pageNumber, totalPages }) => (
              <Text style={styles.pageNumberText}>Page {pageNumber} of {totalPages}</Text>
            )} />
          </Page>
        );
      })}
    </Document>
  );
}

export default EmployeeExpensePDFDocument;