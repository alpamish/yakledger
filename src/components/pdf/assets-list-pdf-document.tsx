import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import { format } from "date-fns";
import type { Asset } from "@/types/asset";
import { ASSET_CATEGORY_LABELS, ASSET_STATUS_LABELS } from "@/types/asset";

Font.register({
  family: "Vazirmatn",
  src: "/fonts/Vazirmatn-Regular.ttf",
});

interface AssetsListPDFDocumentProps {
  assets: Asset[];
  generatedAt: Date;
  companyName?: string;
}

const formatCurrency = (amount: number) =>
  `AFN ${amount.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const FIRST_PAGE_ROWS = 16;
const CONT_PAGE_ROWS = 24;

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
    fontSize: 8,
    color: "#64748b",
    marginBottom: 2,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#059669",
  },
  sectionTitle: {
    fontSize: 12,
    color: "#059669",
    marginBottom: 8,
    marginTop: 12,
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
    minHeight: 18,
    alignItems: "center",
  },
  tableRowAlt: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    backgroundColor: "#f9fafb",
    minHeight: 18,
    alignItems: "center",
  },
  cellNum: { width: "6%", padding: 4 },
  cellName: { width: "22%", padding: 4 },
  cellCategory: { width: "16%", padding: 4 },
  cellStatus: { width: "12%", padding: 4 },
  cellValue: { width: "16%", padding: 4, textAlign: "right" },
  cellSerial: { width: "16%", padding: 4 },
  cellAssigned: { width: "12%", padding: 4 },
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
});

function SummaryCards({ assets }: { assets: Asset[] }) {
  const totalValue = assets.reduce((s, a) => s + a.currentValue, 0);
  const activeCount = assets.filter((a) => a.status === "ACTIVE").length;
  const inUseCount = assets.filter((a) => a.status === "IN_USE").length;
  const underRepairCount = assets.filter((a) => a.status === "UNDER_REPAIR").length;

  return (
    <View style={styles.summaryRow}>
      <View style={styles.summaryCard}>
        <Text style={styles.summaryLabel}>Total Assets</Text>
        <Text style={styles.summaryValue}>{assets.length}</Text>
      </View>
      <View style={styles.summaryCard}>
        <Text style={styles.summaryLabel}>Active</Text>
        <Text style={styles.summaryValue}>{activeCount}</Text>
      </View>
      <View style={styles.summaryCard}>
        <Text style={styles.summaryLabel}>In Use</Text>
        <Text style={styles.summaryValue}>{inUseCount}</Text>
      </View>
      <View style={styles.summaryCard}>
        <Text style={styles.summaryLabel}>Total Value</Text>
        <Text style={styles.summaryValue}>{formatCurrency(totalValue)}</Text>
      </View>
    </View>
  );
}

function AssetTable({ assets }: { assets: Asset[] }) {
  if (assets.length === 0) {
    return <Text style={styles.emptyText}>No assets found.</Text>;
  }

  return (
    <View style={styles.table}>
      <View style={styles.tableHeader}>
        <Text style={styles.cellNum}>#</Text>
        <Text style={styles.cellName}>Name</Text>
        <Text style={styles.cellCategory}>Category</Text>
        <Text style={styles.cellStatus}>Status</Text>
        <Text style={styles.cellValue}>Value</Text>
        <Text style={styles.cellSerial}>Serial/Plate</Text>
        <Text style={styles.cellAssigned}>Assigned To</Text>
      </View>
      {assets.map((asset, idx) => (
        <View key={asset.id} style={idx % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
          <Text style={styles.cellNum}>{idx + 1}</Text>
          <Text style={styles.cellName}>{asset.name}</Text>
          <Text style={styles.cellCategory}>
            {ASSET_CATEGORY_LABELS[asset.category] || asset.category}
          </Text>
          <Text style={styles.cellStatus}>
            {ASSET_STATUS_LABELS[asset.status] || asset.status}
          </Text>
          <Text style={styles.cellValue}>
            {asset.currentValue ? formatCurrency(asset.currentValue) : "-"}
          </Text>
          <Text style={styles.cellSerial}>
            {asset.serialNumber || asset.plateNumber || "-"}
          </Text>
          <Text style={styles.cellAssigned}>
            {asset.assignedTo?.fullName || "-"}
          </Text>
        </View>
      ))}
    </View>
  );
}

function AssetsListPDFDocument({
  assets: rawAssets,
  generatedAt,
  companyName = "YakhshiLedger",
}: AssetsListPDFDocumentProps) {
  const assets = (Array.isArray(rawAssets) ? rawAssets : []).filter(
    (a): a is Asset => Boolean(a && a.id)
  );

  const pages: Asset[][] = [];
  if (assets.length === 0) {
    pages.push([]);
  } else {
    let remaining = [...assets];
    pages.push(remaining.slice(0, FIRST_PAGE_ROWS));
    remaining = remaining.slice(FIRST_PAGE_ROWS);
    while (remaining.length > 0) {
      pages.push(remaining.slice(0, CONT_PAGE_ROWS));
      remaining = remaining.slice(CONT_PAGE_ROWS);
    }
  }

  let pageNum = 0;

  return (
    <Document title="Assets List Report" author={companyName}>
      {pages.map((pageAssets, idx) => {
        pageNum++;
        const isFirstPage = idx === 0;

        return (
          <Page key={idx} size="A4" orientation="landscape" style={styles.page}>
            <Text style={styles.companyName}>{companyName}</Text>
            <Text style={styles.reportTitle}>Assets List Report</Text>
            <Text style={styles.generatedDate}>
              Generated: {format(generatedAt, "MMM dd, yyyy HH:mm")}
            </Text>
            <View style={styles.headerDivider} />

            {isFirstPage && <SummaryCards assets={assets} />}

            {isFirstPage && (
              <Text style={styles.sectionTitle}>
                Asset Details ({assets.length} total)
              </Text>
            )}

            <AssetTable assets={pageAssets} />

            <View style={styles.pageNumberContainer}>
              <Text style={styles.pageNumberText}>Page {pageNum}</Text>
            </View>
          </Page>
        );
      })}
    </Document>
  );
}

export default AssetsListPDFDocument;
