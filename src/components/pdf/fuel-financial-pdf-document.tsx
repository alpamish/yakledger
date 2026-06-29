import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import { format } from "date-fns";
import type { FuelFinancialSummary, FuelTransaction } from "@/types/asset";
import { FUEL_TYPE_LABELS } from "@/types/contractor";
import { FUEL_TRANSACTION_TYPE_LABELS } from "@/types/asset";

Font.register({
  family: "Vazirmatn",
  src: "/fonts/Vazirmatn-Regular.ttf",
});

interface FuelFinancialPDFDocumentProps {
  data: FuelFinancialSummary;
  generatedAt: Date;
}

const formatCurrency = (amount: number) =>
  `AFN ${amount.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const COL = {
  date: "14%",
  type: "10%",
  fuel: "12%",
  qty: "10%",
  unitPrice: "12%",
  cost: "12%",
  container: "14%",
  details: "16%",
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
  sectionTitle: {
    fontSize: 12,
    color: "#059669",
    marginBottom: 8,
    marginTop: 16,
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
    color: "#64748b",
    marginBottom: 2,
    textTransform: "uppercase",
  },
  summaryValue: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#059669",
  },
  summarySubValue: {
    fontSize: 8,
    color: "#334155",
    marginTop: 2,
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
  cellDate: { width: COL.date, padding: 4 },
  cellType: { width: COL.type, padding: 4 },
  cellFuel: { width: COL.fuel, padding: 4 },
  cellQty: { width: COL.qty, padding: 4, textAlign: "right" as const },
  cellUnitPrice: { width: COL.unitPrice, padding: 4, textAlign: "right" as const },
  cellCost: { width: COL.cost, padding: 4, textAlign: "right" as const },
  cellContainer: { width: COL.container, padding: 4 },
  cellDetails: { width: COL.details, padding: 4 },
  machinerySection: {
    marginTop: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 3,
  },
  machineryHeader: {
    fontSize: 9,
    fontWeight: "bold",
    color: "#059669",
    marginBottom: 4,
  },
  machinerySubtext: {
    fontSize: 8,
    color: "#64748b",
    marginBottom: 4,
  },
  machineryStats: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 6,
  },
  machineryStat: {
    fontSize: 8,
    color: "#334155",
  },
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
  emptyText: {
    fontSize: 9,
    color: "#94a3b8",
    textAlign: "center",
    padding: 20,
  },
  subTable: {
    width: "100%",
    borderStyle: "solid",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    marginTop: 4,
  },
  subTableHeader: {
    flexDirection: "row",
    backgroundColor: "#e2e8f0",
    color: "#334155",
    fontSize: 7,
    fontWeight: "bold",
  },
});

function PurchaseHistoryTable({ purchases = [] }: { purchases?: FuelTransaction[] }) {
  return (
    <View style={styles.table}>
      <View style={styles.tableHeader}>
        <Text style={styles.cellDate}>Date</Text>
        <Text style={styles.cellFuel}>Fuel Type</Text>
        <Text style={styles.cellQty}>Quantity</Text>
        <Text style={styles.cellUnitPrice}>Unit Price</Text>
        <Text style={styles.cellCost}>Total Cost</Text>
        <Text style={styles.cellContainer}>Supplier</Text>
        <Text style={styles.cellDetails}>Container</Text>
      </View>
      {purchases.length === 0 ? (
        <Text style={styles.emptyText}>No purchase records</Text>
      ) : (
        purchases.map((t, idx) => (
          <View key={t.id} style={idx % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
            <Text style={styles.cellDate}>{format(new Date(t.date), "MMM dd, yyyy")}</Text>
            <Text style={styles.cellFuel}>{FUEL_TYPE_LABELS[t.fuelType as keyof typeof FUEL_TYPE_LABELS] || t.fuelType}</Text>
            <Text style={styles.cellQty}>{t.quantity} L</Text>
            <Text style={styles.cellUnitPrice}>{t.unitPrice ? formatCurrency(t.unitPrice) : "-"}</Text>
            <Text style={styles.cellCost}>{t.totalCost ? formatCurrency(t.totalCost) : "-"}</Text>
            <Text style={styles.cellContainer}>{t.supplier || "-"}</Text>
            <Text style={styles.cellDetails}>{t.container?.name || "-"}</Text>
          </View>
        ))
      )}
      {purchases.length > 0 && (
        <View style={[styles.tableRow, { backgroundColor: "#f0fdf4" }]}>
          <Text style={[styles.cellDate, { fontWeight: "bold", color: "#059669" }]}>Total</Text>
          <Text style={[styles.cellFuel, { fontWeight: "bold", color: "#059669" }]} />
          <Text style={[styles.cellQty, { fontWeight: "bold", color: "#059669" }]}>
            {purchases.reduce((s, t) => s + t.quantity, 0).toFixed(1)} L
          </Text>
          <Text style={[styles.cellUnitPrice, { fontWeight: "bold", color: "#059669" }]} />
          <Text style={[styles.cellCost, { fontWeight: "bold", color: "#059669" }]}>
            {formatCurrency(purchases.reduce((s, t) => s + (t.totalCost || 0), 0))}
          </Text>
          <Text style={[styles.cellContainer, { fontWeight: "bold", color: "#059669" }]} />
          <Text style={[styles.cellDetails, { fontWeight: "bold", color: "#059669" }]} />
        </View>
      )}
    </View>
  );
}

function MachineryDeliveryBreakdown({ data }: { data: FuelFinancialSummary }) {
  const machineryList = data.byMachinery || [];
  if (machineryList.length === 0) {
    return <Text style={styles.emptyText}>No machinery deliveries recorded</Text>;
  }

  return (
    <>
      {machineryList.map((m) => (
        <View key={m.machineryId} style={styles.machinerySection}>
          <Text style={styles.machineryHeader}>{m.machineryName}</Text>
          <Text style={styles.machinerySubtext}>
            Contractor: {m.contractorName}{m.plateNumber ? ` | Plate: ${m.plateNumber}` : ""}
          </Text>
          <View style={styles.machineryStats}>
            <Text style={styles.machineryStat}>
              Total Received: <Text style={{ fontWeight: "bold" }}>{m.totalQty.toFixed(1)} L</Text>
            </Text>
            <Text style={styles.machineryStat}>
              Total Cost: <Text style={{ fontWeight: "bold" }}>{formatCurrency(m.totalCost)}</Text>
            </Text>
            <Text style={styles.machineryStat}>
              Deliveries: <Text style={{ fontWeight: "bold" }}>{m.issues.length}</Text>
            </Text>
          </View>

          <View style={styles.subTable}>
            <View style={styles.subTableHeader}>
              <Text style={{ width: "20%", padding: 3, fontSize: 7 }}>Date</Text>
              <Text style={{ width: "15%", padding: 3, fontSize: 7 }}>Fuel Type</Text>
              <Text style={{ width: "15%", padding: 3, fontSize: 7, textAlign: "right" }}>Quantity</Text>
              <Text style={{ width: "20%", padding: 3, fontSize: 7, textAlign: "right" }}>Unit Price</Text>
              <Text style={{ width: "15%", padding: 3, fontSize: 7, textAlign: "right" }}>Total Cost</Text>
              <Text style={{ width: "15%", padding: 3, fontSize: 7 }}>Container</Text>
            </View>
            {m.issues.map((issue, idx) => (
              <View key={issue.id} style={idx % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
                <Text style={{ width: "20%", padding: 3, fontSize: 7 }}>
                  {format(new Date(issue.date), "MMM dd, yyyy")}
                </Text>
                <Text style={{ width: "15%", padding: 3, fontSize: 7 }}>
                  {FUEL_TYPE_LABELS[issue.fuelType as keyof typeof FUEL_TYPE_LABELS] || issue.fuelType}
                </Text>
                <Text style={{ width: "15%", padding: 3, fontSize: 7, textAlign: "right" }}>{issue.quantity} L</Text>
                <Text style={{ width: "20%", padding: 3, fontSize: 7, textAlign: "right" }}>
                  {issue.unitPrice ? formatCurrency(issue.unitPrice) : formatCurrency(data.avgUnitPrice)}
                </Text>
                <Text style={{ width: "15%", padding: 3, fontSize: 7, textAlign: "right" }}>
                  {issue.totalCost ? formatCurrency(issue.totalCost) : formatCurrency(issue.quantity * data.avgUnitPrice)}
                </Text>
                <Text style={{ width: "15%", padding: 3, fontSize: 7 }}>{issue.container?.name || "-"}</Text>
              </View>
            ))}
          </View>
        </View>
      ))}
    </>
  );
}

function AllTransactionsTable({ transactions = [] }: { transactions?: FuelTransaction[] }) {
  if (transactions.length === 0) {
    return <Text style={styles.emptyText}>No transactions recorded</Text>;
  }

  return (
    <View style={styles.table}>
      <View style={styles.tableHeader}>
        <Text style={styles.cellDate}>Date</Text>
        <Text style={styles.cellType}>Type</Text>
        <Text style={styles.cellFuel}>Fuel Type</Text>
        <Text style={styles.cellQty}>Quantity</Text>
        <Text style={styles.cellUnitPrice}>Unit Price</Text>
        <Text style={styles.cellCost}>Total Cost</Text>
        <Text style={styles.cellContainer}>Container</Text>
        <Text style={styles.cellDetails}>Details</Text>
      </View>
      {transactions.map((t, idx) => (
        <View key={t.id} style={idx % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
          <Text style={styles.cellDate}>{format(new Date(t.date), "MMM dd, yyyy")}</Text>
          <Text style={styles.cellType}>{FUEL_TRANSACTION_TYPE_LABELS[t.type]}</Text>
          <Text style={styles.cellFuel}>{FUEL_TYPE_LABELS[t.fuelType as keyof typeof FUEL_TYPE_LABELS] || t.fuelType}</Text>
          <Text style={styles.cellQty}>{t.quantity} L</Text>
          <Text style={styles.cellUnitPrice}>{t.unitPrice ? formatCurrency(t.unitPrice) : "-"}</Text>
          <Text style={styles.cellCost}>{t.totalCost ? formatCurrency(t.totalCost) : "-"}</Text>
          <Text style={styles.cellContainer}>
            {t.type === "TRANSFER"
              ? `${t.container?.name || "-"} \u2192 ${t.destinationContainer?.name || "-"}`
              : t.container?.name || "-"}
          </Text>
          <Text style={styles.cellDetails}>
            {t.asset?.name || t.contractor?.contractorName || t.supplier || t.issuedToName || t.machinery?.machineryName || "-"}
          </Text>
        </View>
      ))}
    </View>
  );
}

function FuelFinancialPDFDocument({
  data,
  generatedAt,
}: FuelFinancialPDFDocumentProps) {
  return (
    <Document title="Fuel Financial Report" author="YakhshiLedger">
      <Page size="A4" orientation="landscape" style={styles.page}>
        <Text style={styles.companyName}>YakhshiLedger</Text>
        <Text style={styles.reportTitle}>Fuel Financial Report</Text>
        <Text style={styles.generatedDate}>
          Generated: {format(generatedAt, "MMM dd, yyyy HH:mm")}
        </Text>
        <View style={styles.headerDivider} />

        {/* Financial Summary Cards */}
        <Text style={styles.sectionTitle}>Financial Summary</Text>
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Total Purchased</Text>
            <Text style={styles.summaryValue}>{data.totalPurchasedQty.toFixed(1)} L</Text>
            <Text style={styles.summarySubValue}>{formatCurrency(data.totalPurchasedCost)}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Total Issued / Delivered</Text>
            <Text style={styles.summaryValue}>{data.totalIssuedQty.toFixed(1)} L</Text>
            <Text style={styles.summarySubValue}>{formatCurrency(data.totalIssuedCost)}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Remaining Balance</Text>
            <Text style={styles.summaryValue}>{data.remainingQty.toFixed(1)} L</Text>
            <Text style={styles.summarySubValue}>{formatCurrency(data.remainingValue)}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Avg Unit Price</Text>
            <Text style={styles.summaryValue}>{formatCurrency(data.avgUnitPrice)}</Text>
            <Text style={styles.summarySubValue}>per liter</Text>
          </View>
        </View>

        {/* Purchase History */}
        <Text style={styles.sectionTitle}>Purchase History</Text>
        <PurchaseHistoryTable purchases={data.purchaseTransactions} />

        {/* Machinery Delivery Breakdown */}
        <Text style={styles.sectionTitle}>Delivery Breakdown by Machinery</Text>
        <MachineryDeliveryBreakdown data={data} />

        {/* Transaction History */}
        <Text style={styles.sectionTitle}>Full Transaction History</Text>
        <AllTransactionsTable transactions={data.allTransactions} />

        <Text style={styles.footer}>
          YakhshiLedger — Fuel Financial Report — Page 1
        </Text>
      </Page>
    </Document>
  );
}

export default FuelFinancialPDFDocument;
