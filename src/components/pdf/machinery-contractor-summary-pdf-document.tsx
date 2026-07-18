import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import { format } from "date-fns";
import type { MachineryByContractor } from "@/types/contractor";

Font.register({
  family: "Vazirmatn",
  src: "/fonts/Vazirmatn-Regular.ttf",
});

interface MachineryContractorSummaryPDFProps {
  data: MachineryByContractor[];
  companyName?: string;
}

const formatCurrency = (amount: number) =>
  `AFN ${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatNumber = (n: number, decimals = 1) =>
  n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

const PADDING = 50;
const PAGE_WIDTH = 595;
const CONTENT_WIDTH = PAGE_WIDTH - PADDING * 2;
const ROW_HEIGHT = 20;
const FIRST_PAGE_ROWS = 22;
const CONT_PAGE_ROWS = 30;

const COL = { num: 24, contractor: 140, count: 80, hours: 80, fuelQty: 71, fuelCost: 100 };

const styles = StyleSheet.create({
  page: {
    padding: PADDING,
    fontSize: 8,
    fontFamily: "Vazirmatn",
    color: "#1e293b",
  },
  companyName: {
    fontSize: 20,
    color: "#059669",
    marginBottom: 2,
  },
  reportTitle: {
    fontSize: 13,
    color: "#334155",
    marginBottom: 3,
  },
  generatedDate: {
    fontSize: 8,
    color: "#64748b",
    marginBottom: 8,
  },
  divider: {
    height: 2,
    backgroundColor: "#059669",
    marginBottom: 10,
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
    fontSize: 7,
    textAlign: "center",
  },
  tableHeaderCellLeft: {
    paddingHorizontal: 3,
    paddingVertical: 4,
    color: "#ffffff",
    fontSize: 7,
    textAlign: "left",
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
    fontSize: 7,
    color: "#334155",
    textAlign: "center",
  },
  tableDataCellLeft: {
    paddingHorizontal: 3,
    paddingVertical: 2,
    fontSize: 7,
    color: "#334155",
    textAlign: "left",
  },
  totalRow: {
    flexDirection: "row",
    backgroundColor: "#f0fdf4",
    minHeight: 22,
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#059669",
  },
  totalCell: {
    paddingHorizontal: 3,
    paddingVertical: 2,
    fontSize: 7,
    color: "#059669",
    textAlign: "center",
  },
  totalCellLeft: {
    paddingHorizontal: 3,
    paddingVertical: 2,
    fontSize: 7,
    color: "#059669",
    textAlign: "left",
  },
  noDataContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
  },
  noDataText: {
    fontSize: 10,
    color: "#94a3b8",
  },
  pageNumberContainer: {
    position: "absolute",
    bottom: 25,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  pageNumberText: {
    fontSize: 7,
    color: "#94a3b8",
  },
});

function MachineryContractorSummaryPDFDocument({
  data: rawData,
  companyName = "YakhshiLedger",
}: MachineryContractorSummaryPDFProps) {
  const data = (Array.isArray(rawData) ? rawData : []).filter(
    (d): d is MachineryByContractor => Boolean(d && d.contractorId)
  );

  const totalMachinery = data.reduce((s, d) => s + d.machineryCount, 0);
  const totalHours = data.reduce((s, d) => s + d.totalHours, 0);
  const totalFuelQty = data.reduce((s, d) => s + d.totalFuelQuantity, 0);
  const totalFuelCost = data.reduce((s, d) => s + d.totalFuelCost, 0);

  const ROWS_PER_PAGE = FIRST_PAGE_ROWS;

  const pages: MachineryByContractor[][] = [];
  if (data.length === 0) {
    pages.push([]);
  } else {
    for (let i = 0; i < data.length; i += ROWS_PER_PAGE) {
      pages.push(data.slice(i, i + ROWS_PER_PAGE));
    }
  }

  return (
    <Document title="Machinery by Contractor Report" author={companyName} creator={companyName}>
      {pages.map((pageData, idx) => (
        <Page key={`mc-${idx}`} size="A4" style={styles.page}>
          {idx === 0 && (
            <View>
              <Text style={styles.companyName}>{companyName}</Text>
              <Text style={styles.reportTitle}>Machinery by Contractor Report</Text>
              <Text style={styles.generatedDate}>Generated on: {format(new Date(), "MMMM d, yyyy")}</Text>
              <View style={styles.divider} />
            </View>
          )}

          {pageData.length > 0 ? (
            <View style={styles.tableContainer}>
              <View style={styles.tableHeaderRow}>
                <Text style={[styles.tableHeaderCell, { width: COL.num }]}>#</Text>
                <Text style={[styles.tableHeaderCellLeft, { width: COL.contractor }]}>Contractor</Text>
                <Text style={[styles.tableHeaderCell, { width: COL.count }]}>Machinery Count</Text>
                <Text style={[styles.tableHeaderCell, { width: COL.hours }]}>Work Hours</Text>
                <Text style={[styles.tableHeaderCell, { width: COL.fuelQty }]}>Fuel (L)</Text>
                <Text style={[styles.tableHeaderCell, { width: COL.fuelCost }]}>Fuel Cost</Text>
              </View>

              {pageData.map((d, i) => (
                <View
                  key={d.contractorId}
                  style={[styles.tableDataRow, { backgroundColor: i % 2 === 0 ? "#f8fafc" : "#ffffff" }]}
                >
                  <Text style={[styles.tableDataCell, { width: COL.num }]}>{(idx * ROWS_PER_PAGE) + i + 1}</Text>
                  <Text style={[styles.tableDataCellLeft, { width: COL.contractor }]}>{d.contractorName}</Text>
                  <Text style={[styles.tableDataCell, { width: COL.count }]}>{d.machineryCount}</Text>
                  <Text style={[styles.tableDataCell, { width: COL.hours }]}>{formatNumber(d.totalHours)}</Text>
                  <Text style={[styles.tableDataCell, { width: COL.fuelQty }]}>{formatNumber(d.totalFuelQuantity, 0)}</Text>
                  <Text style={[styles.tableDataCell, { width: COL.fuelCost }]}>{formatCurrency(d.totalFuelCost)}</Text>
                </View>
              ))}

              {idx === pages.length - 1 && (
                <View style={styles.totalRow}>
                  <Text style={[styles.totalCell, { width: COL.num }]}></Text>
                  <Text style={[styles.totalCellLeft, { width: COL.contractor }]}>Total</Text>
                  <Text style={[styles.totalCell, { width: COL.count }]}>{totalMachinery}</Text>
                  <Text style={[styles.totalCell, { width: COL.hours }]}>{formatNumber(totalHours)}</Text>
                  <Text style={[styles.totalCell, { width: COL.fuelQty }]}>{formatNumber(totalFuelQty, 0)}</Text>
                  <Text style={[styles.totalCell, { width: COL.fuelCost }]}>{formatCurrency(totalFuelCost)}</Text>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.noDataContainer}>
              <Text style={styles.noDataText}>No contractor data available</Text>
            </View>
          )}

          <View style={styles.pageNumberContainer}
            render={({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) => (
              <Text style={styles.pageNumberText}>Page {pageNumber} of {totalPages}</Text>
            )}
          />
        </Page>
      ))}
    </Document>
  );
}

export { MachineryContractorSummaryPDFDocument };
