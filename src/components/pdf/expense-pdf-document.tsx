import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import { format } from "date-fns";
import type { Expense, Category, PaymentMethod } from "@/types/expense";
import { CATEGORY_LABELS, CATEGORY_COLORS, PAYMENT_METHOD_LABELS } from "@/types/expense";

// ─── Filter type ───────────────────────────────────────────────
export interface PdfFilters {
  categories?: string[];
  dateFrom?: string;
  dateTo?: string;
}

interface ExpensePDFDocumentProps {
  expenses: Expense[];
  filters?: PdfFilters;
  companyName?: string;
}

Font.register({
  family: "Vazirmatn",
  src: "/fonts/Vazirmatn-Regular.ttf",
});

// ─── Helpers ───────────────────────────────────────────────────
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

const formatDescription = (desc: string | null | undefined): string => {
  if (!desc) return "—";
  try {
    const parsed = JSON.parse(desc);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const names = parsed
        .map((item: any) => (typeof item.itemName === "string" ? item.itemName.trim() : ""))
        .filter(Boolean);
      if (names.length === 1) return `1 item: ${names[0]}`;
      if (names.length <= 3) return `${names.length} items: ${names.join(", ")}`;
      return `${names.length} items: ${names.slice(0, 2).join(", ")} +${names.length - 2} more`;
    }
    return truncate(desc, 40);
  } catch {
    return truncate(desc, 40);
  }
};

// ─── Column widths (landscape, total ≈ 695) ────────────────────
const COL = {
  num: 25,
  title: 100,
  desc: 150,
  category: 80,
  amount: 70,
  payment: 75,
  paidTo: 75,
  paidBy: 60,
  date: 60,
} as const;

const TABLE_WIDTH = Object.values(COL).reduce((s, v) => s + v, 0); // 695

// ─── Row height for data rows ──────────────────────────────────
const ROW_HEIGHT = 22;

// ─── How many rows fit per content page ────────────────────────
// Landscape A4 height = 595, top/bottom padding = 50 each → 495 usable
// Header ≈ 130, footer on last page ≈ 130
// On first page: usable ≈ 495 - 130 - 24(table header) = ~341 → 15 rows
// On continuation pages: usable ≈ 495 - 24(table header) = ~471 → 21 rows
const FIRST_PAGE_ROWS = 14;
const CONT_PAGE_ROWS = 19;

// ─── Styles ────────────────────────────────────────────────────
const styles = StyleSheet.create({
  page: {
    padding: 50,
    fontSize: 9,
    fontFamily: "Vazirmatn",
    color: "#1e293b",
  },

  // Header
  companyName: {
    fontSize: 22,
    fontFamily: "Vazirmatn",
    color: "#059669",
    marginBottom: 2,
  },
  reportTitle: {
    fontSize: 14,
    fontFamily: "Vazirmatn",
    color: "#334155",
    marginBottom: 4,
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

  // Filter summary
  filterContainer: {
    backgroundColor: "#f0fdf4",
    borderLeftWidth: 3,
    borderLeftColor: "#059669",
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 14,
    borderRadius: 2,
  },
  filterLabel: {
    fontSize: 8,
    fontFamily: "Vazirmatn",
    color: "#059669",
    marginBottom: 2,
  },
  filterText: {
    fontSize: 8,
    color: "#475569",
    lineHeight: 1.4,
  },

  // Table
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
    fontFamily: "Vazirmatn",
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

  // No data
  noDataContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  noDataText: {
    fontSize: 12,
    color: "#94a3b8",
    fontFamily: "Vazirmatn",
  },
  noDataSubText: {
    fontSize: 9,
    color: "#cbd5e1",
    marginTop: 4,
  },

  // Footer
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
    fontFamily: "Vazirmatn",
  },
  summaryValue: {
    fontSize: 10,
    fontFamily: "Vazirmatn",
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
    fontFamily: "Vazirmatn",
    color: "#059669",
  },
  grandTotalValue: {
    fontSize: 13,
    fontFamily: "Vazirmatn",
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

  // Page number
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
    fontFamily: "Vazirmatn",
  },
});

// ─── Category Summary Styles ───────────────────────────────────
const summaryStyles = StyleSheet.create({
  page: {
    padding: 50,
    fontSize: 9,
    fontFamily: "Vazirmatn",
    color: "#1e293b",
  },
  title: {
    fontSize: 18,
    fontFamily: "Vazirmatn",
    color: "#059669",
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 13,
    color: "#334155",
    marginBottom: 4,
  },
  date: {
    fontSize: 9,
    color: "#64748b",
    marginBottom: 12,
  },
  divider: {
    height: 2,
    backgroundColor: "#059669",
    marginBottom: 16,
  },
  table: {
    width: "100%",
  },
  headerRow: {
    flexDirection: "row",
    backgroundColor: "#059669",
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    minHeight: 22,
    alignItems: "center",
  },
  headerCell: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    color: "#ffffff",
    fontFamily: "Vazirmatn",
    fontSize: 8,
  },
  dataRow: {
    flexDirection: "row",
    minHeight: 20,
    alignItems: "center",
    borderBottomWidth: 0.5,
    borderBottomColor: "#e2e8f0",
  },
  dataCell: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    fontSize: 8,
    color: "#334155",
  },
  totalRow: {
    flexDirection: "row",
    minHeight: 22,
    alignItems: "center",
    backgroundColor: "#f0fdf4",
    borderBottomWidth: 1,
    borderBottomColor: "#059669",
  },
  totalCell: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    fontSize: 8,
    fontFamily: "Vazirmatn",
    color: "#059669",
  },
  note: {
    fontSize: 7,
    color: "#94a3b8",
    textAlign: "center",
    marginTop: 8,
  },
  colCategory: { width: "30%" },
  colCount: { width: "15%" },
  colAmount: { width: "30%" },
  colPercent: { width: "25%" },
  categoryRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  swatch: {
    width: 8,
    height: 8,
    borderRadius: 1,
    marginRight: 4,
  },
});

// ─── Category Summary Table ────────────────────────────────────
function CategorySummaryTable({ expenses }: { expenses: Expense[] }) {
  const categoryMap = new Map<string, { count: number; amount: number }>();

  for (const e of expenses) {
    const cat = e.category;
    const existing = categoryMap.get(cat) ?? { count: 0, amount: 0 };
    existing.count += 1;
    existing.amount += e.amount;
    categoryMap.set(cat, existing);
  }

  const rows = Array.from(categoryMap.entries())
    .map(([cat, { count, amount }]) => ({
      cat,
      label: CATEGORY_LABELS[cat as Category] ?? cat,
      count,
      amount,
    }))
    .sort((a, b) => b.amount - a.amount);

  const grandTotal = rows.reduce((s, r) => s + r.amount, 0);

  return (
    <View style={summaryStyles.table}>
      <View style={summaryStyles.headerRow}>
        <Text style={[summaryStyles.headerCell, summaryStyles.colCategory]}>Category</Text>
        <Text style={[summaryStyles.headerCell, summaryStyles.colCount]}>Count</Text>
        <Text style={[summaryStyles.headerCell, summaryStyles.colAmount]}>Amount</Text>
        <Text style={[summaryStyles.headerCell, summaryStyles.colPercent]}>% of Total</Text>
      </View>
      {rows.length === 0 ? (
        <View style={summaryStyles.dataRow}>
          <Text style={[summaryStyles.dataCell, { width: "100%", textAlign: "center" }]}>—</Text>
        </View>
      ) : (
        rows.map((row, i) => {
          const pct = grandTotal > 0 ? ((row.amount / grandTotal) * 100).toFixed(1) : "0.0";
          return (
            <View
              key={row.cat}
              style={[summaryStyles.dataRow, { backgroundColor: i % 2 === 0 ? "#f8fafc" : "#ffffff" }]}
            >
              <View style={[summaryStyles.dataCell, summaryStyles.colCategory]}>
              <View style={summaryStyles.categoryRow}>
                <View style={[summaryStyles.swatch, { backgroundColor: CATEGORY_COLORS[row.cat as Category] ?? "#78716c" }]} />
                <Text>{row.label}</Text>
              </View>
            </View>
              <Text style={[summaryStyles.dataCell, summaryStyles.colCount]}>{row.count}</Text>
              <Text style={[summaryStyles.dataCell, summaryStyles.colAmount]}>{formatCurrency(row.amount)}</Text>
              <Text style={[summaryStyles.dataCell, summaryStyles.colPercent]}>{pct}%</Text>
            </View>
          );
        })
      )}
      <View style={summaryStyles.totalRow}>
        <Text style={[summaryStyles.totalCell, summaryStyles.colCategory]}>Grand Total</Text>
        <Text style={[summaryStyles.totalCell, summaryStyles.colCount]}>{rows.reduce((s, r) => s + r.count, 0)}</Text>
        <Text style={[summaryStyles.totalCell, summaryStyles.colAmount]}>{formatCurrency(grandTotal)}</Text>
        <Text style={[summaryStyles.totalCell, summaryStyles.colPercent]}>100%</Text>
      </View>
    </View>
  );
}

// ─── Filter Summary ────────────────────────────────────────────
function FilterSummary({ filters }: { filters: PdfFilters }) {
  const parts: string[] = [];

  if (filters.categories && filters.categories.length > 0) {
    const labels = filters.categories.map(
      (c) => CATEGORY_LABELS[c as Category] ?? c
    );
    parts.push(`Categories: ${labels.join(", ")}`);
  }

  if (filters.dateFrom || filters.dateTo) {
    const from = filters.dateFrom ? formatDate(filters.dateFrom) : "…";
    const to = filters.dateTo ? formatDate(filters.dateTo) : "…";
    parts.push(`Date Range: ${from} — ${to}`);
  }

  if (parts.length === 0) return null;

  return (
    <View style={styles.filterContainer}>
      <Text style={styles.filterLabel}>Applied Filters</Text>
      <Text style={styles.filterText}>{parts.join("  |  ")}</Text>
    </View>
  );
}

// ─── Table Header Row ──────────────────────────────────────────
function TableHeader() {
  return (
    <View style={styles.tableHeaderRow} fixed>
      <Text style={[styles.tableHeaderCell, { width: COL.num }]}>#</Text>
      <Text style={[styles.tableHeaderCell, { width: COL.title }]}>Title</Text>
      <Text style={[styles.tableHeaderCell, { width: COL.desc }]}>
        Description
      </Text>
      <Text style={[styles.tableHeaderCell, { width: COL.category }]}>
        Category
      </Text>
      <Text
        style={[
          styles.tableHeaderCell,
          { width: COL.amount, textAlign: "right" },
        ]}
      >
        Amount
      </Text>
      <Text style={[styles.tableHeaderCell, { width: COL.payment }]}>
        Payment
      </Text>
      <Text style={[styles.tableHeaderCell, { width: COL.paidTo }]}>
        Paid To
      </Text>
      <Text style={[styles.tableHeaderCell, { width: COL.paidBy }]}>
        Paid By
      </Text>
      <Text style={[styles.tableHeaderCell, { width: COL.date }]}>Date</Text>
    </View>
  );
}

// ─── Table Data Row ────────────────────────────────────────────
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
          {expense.title}
        </Text>
        <Text style={[styles.tableDataCell, { width: COL.desc }]}>
          {formatDescription(expense.description)}
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
        <Text style={[styles.tableDataCell, { width: COL.payment }]}>
          {truncate(PAYMENT_METHOD_LABELS[expense.paymentMethod] ?? expense.paymentMethod, 14)}
        </Text>
        <Text style={[styles.tableDataCell, { width: COL.paidTo }]}>
          {truncate(expense.paidTo, 16)}
        </Text>
        <Text style={[styles.tableDataCell, { width: COL.paidBy }]}>
          {truncate(expense.paidBy, 12)}
        </Text>
        <Text style={[styles.tableDataCell, { width: COL.date }]}>
          {formatDate(expense.expenseDate)}
        </Text>
    </View>
  );
}

// ─── Report Footer ─────────────────────────────────────────────
function ReportFooter({
  totalExpenses,
  grandTotal,
  companyName,
}: {
  totalExpenses: number;
  grandTotal: number;
  companyName: string;
}) {
  return (
    <View>
      <View style={styles.footerDivider} />
      <View style={styles.summaryRow}>
        <Text style={styles.summaryLabel}>Total Selected Expenses:</Text>
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
        This report was generated by {companyName}
      </Text>
    </View>
  );
}

// ─── Main Document ─────────────────────────────────────────────
function ExpensePDFDocument({ expenses, filters, companyName = "YakhshiLedger" }: ExpensePDFDocumentProps) {
  const validExpenses = (Array.isArray(expenses) ? expenses : []).filter(
    (e): e is Expense => Boolean(e && e.id)
  );
  const grandTotal = validExpenses.reduce((sum, e) => sum + e.amount, 0);
  const generatedDate = format(new Date(), "MMMM d, yyyy");
  const hasFilters =
    filters &&
    ((filters.categories && filters.categories.length > 0) ||
      filters.dateFrom ||
      filters.dateTo);

  // Split expenses into pages
  const pages: Expense[][] = [];

  if (validExpenses.length === 0) {
    pages.push([]);
  } else {
    let remaining = [...validExpenses];
    // First page
    pages.push(remaining.slice(0, FIRST_PAGE_ROWS));
    remaining = remaining.slice(FIRST_PAGE_ROWS);
    // Continuation pages
    while (remaining.length > 0) {
      pages.push(remaining.slice(0, CONT_PAGE_ROWS));
      remaining = remaining.slice(CONT_PAGE_ROWS);
    }
  }

  let globalIndex = 0;

  return (
    <Document
      title="Expense Report"
      author={companyName}
      creator={companyName}
    >
      {validExpenses.length > 0 && (
        <Page size={{ width: 842, height: 595 }} style={summaryStyles.page}>
          <Text style={summaryStyles.title}>{companyName}</Text>
          <Text style={summaryStyles.subtitle}>Category Summary</Text>
          <Text style={summaryStyles.date}>Generated on: {generatedDate}</Text>
          <View style={summaryStyles.divider} />
          <CategorySummaryTable expenses={validExpenses} />
          <Text style={summaryStyles.note}>
            Detailed expense report follows on the next pages.
          </Text>
        </Page>
      )}

      {pages.map((pageExpenses, pageIdx) => {
        const isFirstPage = pageIdx === 0;
        const isLastPage = pageIdx === pages.length - 1;

        return (
          <Page key={pageIdx} size={{ width: 842, height: 595 }} style={styles.page}>
            {/* ── Header (first page only) ── */}
            {isFirstPage && (
              <View style={{ marginBottom: 10 }}>
                <Text style={styles.companyName}>{companyName}</Text>
                <Text style={styles.reportTitle}>Expense Report</Text>
                <Text style={styles.generatedDate}>
                  Generated on: {generatedDate}
                </Text>
                <View style={styles.divider} />
                {hasFilters && filters && <FilterSummary filters={filters} />}
              </View>
            )}

            {/* ── Table ── */}
            {pageExpenses.length > 0 ? (
              <View style={styles.tableContainer}>
                <TableHeader />
                {pageExpenses.map((expense) => {
                  globalIndex++;
                  return (
                    <TableDataRow
                      key={expense.id}
                      expense={expense}
                      index={globalIndex}
                      isEven={globalIndex % 2 === 0}
                    />
                  );
                })}
              </View>
            ) : (
              <View style={styles.noDataContainer}>
                <Text style={styles.noDataText}>No expenses selected</Text>
                <Text style={styles.noDataSubText}>
                  Adjust your filters or select expenses to generate a report.
                </Text>
              </View>
            )}

            {/* ── Footer (last page only) ── */}
            {isLastPage && (
              <ReportFooter
                totalExpenses={validExpenses.length}
                grandTotal={grandTotal}
                companyName={companyName}
              />
            )}

            {/* ── Page number ── */}
            <View style={styles.pageNumberContainer} fixed>
              <Text style={styles.pageNumberText}>Page</Text>
            </View>
          </Page>
        );
      })}
    </Document>
  );
}

export default ExpensePDFDocument;
