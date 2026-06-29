import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import { format } from "date-fns";
import type { Expense, ExpenseItem } from "@/types/expense";
import {
  CATEGORY_LABELS,
  CATEGORY_COLORS,
  PAYMENT_METHOD_LABELS,
} from "@/types/expense";

Font.register({
  family: "Vazirmatn",
  src: "/fonts/Vazirmatn-Regular.ttf",
});

const formatCurrency = (amount: number) =>
  `Afs ${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatDate = (dateStr: string) => {
  try {
    return format(new Date(dateStr), "MMM dd, yyyy");
  } catch {
    return dateStr;
  }
};

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: "Vazirmatn",
    color: "#1e293b",
  },
  companyName: {
    fontSize: 20,
    color: "#059669",
    marginBottom: 2,
  },
  docTitle: {
    fontSize: 13,
    color: "#334155",
    marginBottom: 4,
  },
  generatedDate: {
    fontSize: 8,
    color: "#64748b",
    marginBottom: 10,
  },
  divider: {
    height: 2,
    backgroundColor: "#059669",
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#059669",
    marginBottom: 6,
    textTransform: "uppercase",
  },
  infoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 14,
  },
  infoBlock: {
    width: "50%",
    marginBottom: 6,
  },
  infoLabel: {
    fontSize: 7,
    color: "#94a3b8",
    textTransform: "uppercase",
    marginBottom: 1,
  },
  infoValue: {
    fontSize: 9,
    color: "#1e293b",
  },
  amountRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
    backgroundColor: "#f0fdf4",
    padding: 10,
    borderRadius: 4,
  },
  amountLabel: {
    fontSize: 10,
    color: "#059669",
    fontWeight: "bold",
  },
  amountValue: {
    fontSize: 16,
    color: "#059669",
    fontWeight: "bold",
  },
  tagContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginBottom: 14,
  },
  tag: {
    fontSize: 7,
    color: "#475569",
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 2,
  },
  table: {
    marginBottom: 14,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#059669",
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    alignItems: "center",
    minHeight: 22,
  },
  tableHeaderCell: {
    paddingHorizontal: 4,
    paddingVertical: 4,
    color: "#ffffff",
    fontSize: 7,
    fontFamily: "Vazirmatn",
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 20,
    borderBottomWidth: 0.5,
    borderBottomColor: "#e2e8f0",
  },
  tableCell: {
    paddingHorizontal: 4,
    paddingVertical: 3,
    fontSize: 8,
    color: "#334155",
  },
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 24,
    backgroundColor: "#f8fafc",
  },
  totalCell: {
    paddingHorizontal: 4,
    paddingVertical: 4,
    fontSize: 8,
    fontWeight: "bold",
    color: "#059669",
  },
  textBlock: {
    fontSize: 9,
    color: "#475569",
    lineHeight: 1.5,
    marginBottom: 14,
  },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    fontSize: 7,
    color: "#94a3b8",
    textAlign: "center",
    borderTopWidth: 0.5,
    borderTopColor: "#e2e8f0",
    paddingTop: 8,
  },
});

const COL = {
  num: { flex: 0.5 },
  item: { flex: 4 },
  qty: { flex: 1 },
  unit: { flex: 1 },
  unitPrice: { flex: 2 },
  total: { flex: 2 },
};

interface ExpenseDetailPDFDocumentProps {
  expense: Expense;
  companyName?: string;
}

export default function ExpenseDetailPDFDocument({
  expense,
  companyName = "YakhshiLedger",
}: ExpenseDetailPDFDocumentProps) {
  // Parse description
  let items: ExpenseItem[] = [];
  let plainText: string | null = null;
  if (expense.description) {
    try {
      const parsed = JSON.parse(expense.description);
      if (Array.isArray(parsed)) {
        items = parsed;
      } else {
        plainText = expense.description;
      }
    } catch {
      plainText = expense.description;
    }
  }

  const grandTotal = items.reduce((s, i) => s + i.total, 0);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <Text style={styles.companyName}>{companyName}</Text>
        <Text style={styles.docTitle}>Expense Detail Report</Text>
        <Text style={styles.generatedDate}>
          Generated on {formatDate(new Date().toISOString())}
        </Text>
        <View style={styles.divider} />

        {/* Title & Amount */}
        <Text style={{ fontSize: 16, fontWeight: "bold", marginBottom: 4 }}>
          {expense.title}
        </Text>
        <View style={styles.amountRow}>
          <Text style={styles.amountLabel}>
            {CATEGORY_LABELS[expense.category] ?? expense.category}
          </Text>
          <Text style={styles.amountValue}>
            {formatCurrency(expense.amount)}
          </Text>
        </View>

        {/* Info Grid */}
        <View style={styles.infoGrid}>
          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>Date</Text>
            <Text style={styles.infoValue}>{formatDate(expense.expenseDate)}</Text>
          </View>
          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>Payment Method</Text>
            <Text style={styles.infoValue}>
              {PAYMENT_METHOD_LABELS[expense.paymentMethod] ?? expense.paymentMethod}
            </Text>
          </View>
          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>Paid To</Text>
            <Text style={styles.infoValue}>{expense.paidTo}</Text>
          </View>
          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>Paid By</Text>
            <Text style={styles.infoValue}>{expense.paidBy}</Text>
          </View>
        </View>

        {/* Tags */}
        {expense.tags && (
          <View style={styles.tagContainer}>
            {expense.tags.split(",").map((tag, i) => (
              <Text key={i} style={styles.tag}>
                {tag.trim()}
              </Text>
            ))}
          </View>
        )}

        {/* Expense Items Table */}
        {items.length > 0 && (
          <View style={styles.table}>
            <Text style={[styles.sectionTitle, { marginBottom: 4 }]}>
              Expense Items
            </Text>
            <View style={{ width: "100%" }}>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderCell, { flex: COL.num.flex }]}>#</Text>
                <Text style={[styles.tableHeaderCell, { flex: COL.item.flex }]}>Item</Text>
                <Text style={[styles.tableHeaderCell, { flex: COL.qty.flex, textAlign: "right" }]}>Qty</Text>
                <Text style={[styles.tableHeaderCell, { flex: COL.unit.flex }]}>Unit</Text>
                <Text style={[styles.tableHeaderCell, { flex: COL.unitPrice.flex, textAlign: "right" }]}>Unit Price</Text>
                <Text style={[styles.tableHeaderCell, { flex: COL.total.flex, textAlign: "right" }]}>Total</Text>
              </View>
              {items.map((item, i) => (
                <View key={item.id} style={styles.tableRow}>
                  <Text style={[styles.tableCell, { flex: COL.num.flex }]}>{i + 1}</Text>
                  <Text style={[styles.tableCell, { flex: COL.item.flex }]}>{item.itemName}</Text>
                  <Text style={[styles.tableCell, { flex: COL.qty.flex, textAlign: "right" }]}>{item.quantity}</Text>
                  <Text style={[styles.tableCell, { flex: COL.unit.flex }]}>{item.unit}</Text>
                  <Text style={[styles.tableCell, { flex: COL.unitPrice.flex, textAlign: "right" }]}>
                    {formatCurrency(item.unitPrice)}
                  </Text>
                  <Text style={[styles.tableCell, { flex: COL.total.flex, textAlign: "right" }]}>
                    {formatCurrency(item.total)}
                  </Text>
                </View>
              ))}
              <View style={styles.totalRow}>
                <Text
                  style={[
                    styles.totalCell,
                    { flex: COL.num.flex + COL.item.flex + COL.qty.flex + COL.unit.flex, textAlign: "right" },
                  ]}
                >
                  Grand Total
                </Text>
                <Text
                  style={[
                    styles.totalCell,
                    { flex: COL.unitPrice.flex + COL.total.flex, textAlign: "right" },
                  ]}
                >
                  {formatCurrency(grandTotal)}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Plain Text Description */}
        {plainText && (
          <View style={{ marginBottom: 14 }}>
            <Text style={styles.sectionTitle}>Description</Text>
            <Text style={styles.textBlock}>{plainText}</Text>
          </View>
        )}

        {/* Notes */}
        {expense.notes && (
          <View style={{ marginBottom: 14 }}>
            <Text style={styles.sectionTitle}>Notes</Text>
            <Text style={styles.textBlock}>{expense.notes}</Text>
          </View>
        )}

        {/* Footer */}
        <Text style={styles.footer}>
          {companyName} — Expense Detail Report — Generated on{" "}
          {format(new Date(), "MMM dd, yyyy")}
        </Text>
      </Page>
    </Document>
  );
}
