import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import { format } from "date-fns";
import type { FuelStock, FuelTransaction, FuelContainerStock } from "@/types/asset";
import { FUEL_TYPE_LABELS, FUEL_TYPE_COLORS } from "@/types/contractor";
import { FUEL_TRANSACTION_TYPE_LABELS } from "@/types/asset";

Font.register({
  family: "Vazirmatn",
  src: "/fonts/Vazirmatn-Regular.ttf",
});

interface FuelStockPDFDocumentProps {
  stock: FuelStock[];
  containerStock?: FuelContainerStock[];
  transactions: FuelTransaction[];
  generatedAt: Date;
}

const formatCurrency = (amount: number) =>
  `AFN ${amount.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const FIRST_PAGE_ROWS = 12;
const CONT_PAGE_ROWS = 22;

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
    marginTop: 12,
  },
  stockGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  stockCard: {
    width: "30%",
    padding: 10,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 3,
  },
  fuelTypeLabel: {
    fontSize: 10,
    fontWeight: "bold",
    marginBottom: 4,
    color: "#334155",
  },
  balanceValue: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#059669",
    marginBottom: 2,
  },
  balanceUnit: {
    fontSize: 9,
    color: "#64748b",
  },
  stockDetail: {
    fontSize: 8,
    color: "#64748b",
    marginTop: 4,
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
    fontSize: 8,
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
  cellDate: { width: "12%", padding: 5 },
  cellType: { width: "10%", padding: 5 },
  cellFuel: { width: "12%", padding: 5 },
  cellQty: { width: "10%", padding: 5, textAlign: "right" },
  cellAsset: { width: "18%", padding: 5 },
  cellSupplier: { width: "18%", padding: 5 },
  cellUnitPrice: { width: "10%", padding: 5, textAlign: "right" },
  cellCost: { width: "10%", padding: 5, textAlign: "right" },
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
    fontSize: 8,
    color: "#64748b",
    marginBottom: 2,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#059669",
  },
  warningBox: {
    padding: 8,
    backgroundColor: "#fef3c7",
    borderWidth: 1,
    borderColor: "#f59e0b",
    borderRadius: 3,
    marginBottom: 12,
  },
  warningText: {
    fontSize: 9,
    color: "#92400e",
  },
  emptyText: {
    fontSize: 9,
    color: "#94a3b8",
    textAlign: "center",
    padding: 20,
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
});

function SummaryPage({
  stock,
  containerStock,
  transactions,
  generatedAt,
}: {
  stock: FuelStock[];
  containerStock?: FuelContainerStock[];
  transactions: FuelTransaction[];
  generatedAt: Date;
}) {
  const totalPurchased = stock.reduce((s, i) => s + i.totalPurchased, 0);
  const totalIssued = stock.reduce((s, i) => s + i.totalIssued, 0);
  const totalBalance = stock.reduce((s, i) => s + i.balance, 0);
  const lowStockItems = stock.filter((s) => s.balance < 50);

  return (
    <Page size="A4" orientation="landscape" style={styles.page}>
      <Text style={styles.companyName}>YakhshiLedger</Text>
      <Text style={styles.reportTitle}>Fuel Stock Management Report</Text>
      <Text style={styles.generatedDate}>
        Generated: {format(generatedAt, "MMM dd, yyyy HH:mm")}
      </Text>
      <View style={styles.headerDivider} />

      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Total Fuel Types</Text>
          <Text style={styles.summaryValue}>{stock.length}</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Total Purchased</Text>
          <Text style={styles.summaryValue}>{totalPurchased.toFixed(1)} L</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Total Issued</Text>
          <Text style={styles.summaryValue}>{totalIssued.toFixed(1)} L</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Current Balance</Text>
          <Text style={styles.summaryValue}>{totalBalance.toFixed(1)} L</Text>
        </View>
      </View>

      {lowStockItems.length > 0 && (
        <View style={styles.warningBox}>
          <Text style={styles.warningText}>
            Low Stock Alert: {lowStockItems.map((s) =>
              FUEL_TYPE_LABELS[s.fuelType as keyof typeof FUEL_TYPE_LABELS] || s.fuelType
            ).join(", ")} {lowStockItems.length === 1 ? "is" : "are"} running low (below 50L).
          </Text>
        </View>
      )}

      {containerStock && containerStock.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Fuel Containers</Text>
          <View style={styles.stockGrid}>
            {containerStock.map((c) => (
              <View key={c.containerId} style={styles.stockCard}>
                <Text style={styles.fuelTypeLabel}>
                  {c.containerName}{c.isMainContainer ? ' (Main)' : ''}
                </Text>
                <Text style={{
                  ...styles.balanceValue,
                  color: c.usagePercent > 90 ? '#ef4444' : c.usagePercent < 20 ? '#f59e0b' : '#059669'
                }}>
                  {c.balance.toFixed(1)}
                  <Text style={styles.balanceUnit}> L</Text>
                </Text>
                <Text style={styles.stockDetail}>
                  {FUEL_TYPE_LABELS[c.fuelType as keyof typeof FUEL_TYPE_LABELS] || c.fuelType}
                  {c.fuelCapacity ? ` / Capacity: ${c.fuelCapacity}L` : ''}
                </Text>
                <Text style={styles.stockDetail}>
                  Usage: {c.usagePercent}%
                </Text>
                {c.fuelLocation && (
                  <Text style={styles.stockDetail}>Location: {c.fuelLocation}</Text>
                )}
              </View>
            ))}
          </View>
        </>
      )}

      <Text style={styles.sectionTitle}>Stock Summary by Fuel Type</Text>
      <View style={styles.stockGrid}>
        {stock.length === 0 ? (
          <Text style={styles.emptyText}>No fuel stock data available.</Text>
        ) : (
          stock.map((s) => (
            <View key={s.fuelType} style={styles.stockCard}>
              <Text style={styles.fuelTypeLabel}>
                {FUEL_TYPE_LABELS[s.fuelType as keyof typeof FUEL_TYPE_LABELS] || s.fuelType}
              </Text>
              <Text style={styles.balanceValue}>
                {s.balance.toFixed(1)}
                <Text style={styles.balanceUnit}> L</Text>
              </Text>
              <Text style={styles.stockDetail}>
                Purchased: {s.totalPurchased.toFixed(1)}L
              </Text>
              <Text style={styles.stockDetail}>
                Issued: {s.totalIssued.toFixed(1)}L
              </Text>
              <Text style={styles.stockDetail}>
                Usage: {s.totalPurchased > 0
                  ? ((s.totalIssued / s.totalPurchased) * 100).toFixed(0)
                  : 0}%
              </Text>
            </View>
          ))
        )}
      </View>

      <View style={styles.pageNumberContainer}>
        <Text style={styles.pageNumberText}>Page 1</Text>
      </View>
    </Page>
  );
}

function TransactionsPage({
  pageTransactions,
  pageNum,
}: {
  pageTransactions: FuelTransaction[];
  pageNum: number;
}) {
  return (
    <Page size="A4" orientation="landscape" style={styles.page}>
      <Text style={styles.companyName}>YakhshiLedger</Text>
      <Text style={styles.reportTitle}>Fuel Stock Report — Transaction History</Text>
      <View style={styles.headerDivider} />

      <Text style={styles.sectionTitle}>Transaction History (cont.)</Text>
      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <Text style={styles.cellDate}>Date</Text>
          <Text style={styles.cellType}>Type</Text>
          <Text style={styles.cellFuel}>Fuel Type</Text>
          <Text style={styles.cellQty}>Quantity</Text>
          <Text style={{...styles.cellAsset, width: '15%'}}>Container</Text>
          <Text style={{...styles.cellAsset, width: '15%'}}>Asset/Contractor</Text>
          <Text style={{...styles.cellSupplier, width: '12%'}}>Details</Text>
        </View>
        {pageTransactions.map((t, idx) => (
          <View key={t.id} style={idx % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
            <Text style={styles.cellDate}>
              {format(new Date(t.date), "MMM dd, yyyy")}
            </Text>
            <Text style={styles.cellType}>
              {FUEL_TRANSACTION_TYPE_LABELS[t.type]}
            </Text>
            <Text style={styles.cellFuel}>
              {FUEL_TYPE_LABELS[t.fuelType as keyof typeof FUEL_TYPE_LABELS] || t.fuelType}
            </Text>
            <Text style={styles.cellQty}>{t.quantity} L</Text>
            <Text style={{...styles.cellAsset, width: '15%'}}>
              {t.type === 'TRANSFER'
                ? `${t.container?.name || '-'} → ${t.destinationContainer?.name || '-'}`
                : t.container?.name || '-'}
            </Text>
            <Text style={{...styles.cellAsset, width: '15%'}}>
              {t.asset?.name || t.contractor?.contractorName || '-'}
            </Text>
            <Text style={{...styles.cellSupplier, width: '12%'}}>
              {t.supplier || t.issuedToName || t.machinery?.machineryName || '-'}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.pageNumberContainer}>
        <Text style={styles.pageNumberText}>Page {pageNum}</Text>
      </View>
    </Page>
  );
}

function FuelStockPDFDocument({
  stock,
  containerStock,
  transactions: rawTransactions,
  generatedAt,
}: FuelStockPDFDocumentProps) {
  const transactions = (Array.isArray(rawTransactions) ? rawTransactions : []).filter(
    (t): t is FuelTransaction => Boolean(t && t.id)
  );

  const txPages: FuelTransaction[][] = [];
  if (transactions.length > 0) {
    let remaining = [...transactions];
    txPages.push(remaining.slice(0, FIRST_PAGE_ROWS));
    remaining = remaining.slice(FIRST_PAGE_ROWS);
    while (remaining.length > 0) {
      txPages.push(remaining.slice(0, CONT_PAGE_ROWS));
      remaining = remaining.slice(CONT_PAGE_ROWS);
    }
  }

  let pageCounter = 1;

  return (
    <Document>
      <SummaryPage
        stock={stock}
        containerStock={containerStock}
        transactions={transactions}
        generatedAt={generatedAt}
      />
      {txPages.map((txPage, idx) => {
        pageCounter++;
        return (
          <TransactionsPage
            key={idx}
            pageTransactions={txPage}
            pageNum={pageCounter}
          />
        );
      })}
    </Document>
  );
}

export default FuelStockPDFDocument;
