import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import { format } from "date-fns";
import type { MachineryFuelPerMachinery } from "@/types/contractor";

Font.register({
  family: "Vazirmatn",
  src: "/fonts/Vazirmatn-Regular.ttf",
});

interface MachineryFuelPerMachineryPDFProps {
  data: MachineryFuelPerMachinery[];
  companyName?: string;
}

const formatCurrency = (amount: number) => {
  const num = Number(amount) || 0;
  return `AFN ${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatNumber = (n: number, decimals = 1) => {
  const num = Number(n) || 0;
  return num.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
};

const PADDING = 50;
const PAGE_WIDTH = 595;
const CONTENT_WIDTH = PAGE_WIDTH - PADDING * 2;
const ROW_HEIGHT = 20;
const FIRST_PAGE_ROWS = 22;
const CONT_PAGE_ROWS = 30;

const COL = { num: 24, name: 86, driver: 68, contractor: 80, fuelQty: 54, fuelCost: 72, hours: 54, efficiency: 57 };

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
  tableHeaderCellRight: {
    paddingHorizontal: 3,
    paddingVertical: 4,
    color: "#ffffff",
    fontSize: 7,
    textAlign: "right",
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
  tableDataCellRight: {
    paddingHorizontal: 3,
    paddingVertical: 2,
    fontSize: 7,
    color: "#334155",
    textAlign: "right",
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
  totalCellRight: {
    paddingHorizontal: 3,
    paddingVertical: 2,
    fontSize: 7,
    color: "#059669",
    textAlign: "right",
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

function MachineryFuelPerMachineryPDFDocument({
  data: rawData,
  companyName = "YakhshiLedger",
}: MachineryFuelPerMachineryPDFProps) {
  const data = (Array.isArray(rawData) ? rawData : []).filter(
    (d): d is MachineryFuelPerMachinery => Boolean(d && typeof d === "object" && d.machineryId)
  );

  const totalFuelQty = data.reduce((s, d) => s + (Number(d.totalFuelQuantity) || 0), 0);
  const totalFuelCost = data.reduce((s, d) => s + (Number(d.totalFuelCost) || 0), 0);
  const totalHours = data.reduce((s, d) => s + (Number(d.totalHours) || 0), 0);
  const avgEfficiency = totalHours > 0 ? totalFuelQty / totalHours : 0;

  const ROWS_PER_PAGE = FIRST_PAGE_ROWS;

  const pages: MachineryFuelPerMachinery[][] = [];
  if (data.length === 0) {
    pages.push([]);
  } else {
    for (let i = 0; i < data.length; i += ROWS_PER_PAGE) {
      pages.push(data.slice(i, i + ROWS_PER_PAGE));
    }
  }

  return (
    <Document title="Fuel Usage per Machinery Report" author={companyName} creator={companyName}>
      {pages.map((pageData, idx) => (
        <Page key={`fm-${idx}`} size="A4" style={styles.page}>
          {idx === 0 && (
            <View>
              <Text style={styles.companyName}>{companyName}</Text>
              <Text style={styles.reportTitle}>Fuel Usage per Machinery Report</Text>
              <Text style={styles.generatedDate}>Generated on: {format(new Date(), "MMMM d, yyyy")}</Text>
              <View style={styles.divider} />
            </View>
          )}

          {pageData.length > 0 ? (
            <View style={styles.tableContainer}>
              <View style={styles.tableHeaderRow}>
                <Text style={[styles.tableHeaderCell, { width: COL.num }]}>#</Text>
                <Text style={[styles.tableHeaderCellLeft, { width: COL.name }]}>Machinery Name</Text>
                <Text style={[styles.tableHeaderCellLeft, { width: COL.driver }]}>Driver</Text>
                <Text style={[styles.tableHeaderCellLeft, { width: COL.contractor }]}>Contractor</Text>
                <Text style={[styles.tableHeaderCellRight, { width: COL.fuelQty }]}>Fuel (L)</Text>
                <Text style={[styles.tableHeaderCellRight, { width: COL.fuelCost }]}>Cost (AFN)</Text>
                <Text style={[styles.tableHeaderCellRight, { width: COL.hours }]}>Hours</Text>
                <Text style={[styles.tableHeaderCellRight, { width: COL.efficiency }]}>L/hr</Text>
              </View>

              {pageData.map((d, i) => (
                <View
                  key={d.machineryId}
                  style={[styles.tableDataRow, { backgroundColor: i % 2 === 0 ? "#f8fafc" : "#ffffff" }]}
                >
                  <Text style={[styles.tableDataCell, { width: COL.num }]}>{(idx * ROWS_PER_PAGE) + i + 1}</Text>
                  <Text style={[styles.tableDataCellLeft, { width: COL.name }]}>{String(d.machineryName ?? "")}</Text>
                  <Text style={[styles.tableDataCellLeft, { width: COL.driver }]}>{d.driverName || "-"}</Text>
                  <Text style={[styles.tableDataCellLeft, { width: COL.contractor }]}>{d.contractorName || "-"}</Text>
                  <Text style={[styles.tableDataCellRight, { width: COL.fuelQty }]}>{formatNumber(Number(d.totalFuelQuantity) || 0, 0)}</Text>
                  <Text style={[styles.tableDataCellRight, { width: COL.fuelCost }]}>{formatCurrency(Number(d.totalFuelCost) || 0)}</Text>
                  <Text style={[styles.tableDataCellRight, { width: COL.hours }]}>{formatNumber(Number(d.totalHours) || 0)}</Text>
                  <Text style={[styles.tableDataCellRight, { width: COL.efficiency }]}>{formatNumber(Number(d.litersPerHour) || 0, 2)}</Text>
                </View>
              ))}

              {idx === pages.length - 1 && (
                <View style={styles.totalRow}>
                  <Text style={[styles.totalCell, { width: COL.num }]}></Text>
                  <Text style={[styles.totalCellLeft, { width: COL.name + COL.driver + COL.contractor }]}>Total</Text>
                  <Text style={[styles.totalCellRight, { width: COL.fuelQty }]}>{formatNumber(totalFuelQty, 0)}</Text>
                  <Text style={[styles.totalCellRight, { width: COL.fuelCost }]}>{formatCurrency(totalFuelCost)}</Text>
                  <Text style={[styles.totalCellRight, { width: COL.hours }]}>{formatNumber(totalHours)}</Text>
                  <Text style={[styles.totalCellRight, { width: COL.efficiency }]}>{formatNumber(avgEfficiency, 2)}</Text>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.noDataContainer}>
              <Text style={styles.noDataText}>No fuel usage data available</Text>
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

export { MachineryFuelPerMachineryPDFDocument };
