import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import { format } from "date-fns";
import type { MachineryWorkHours } from "@/types/contractor";

Font.register({
  family: "Vazirmatn",
  src: "/fonts/Vazirmatn-Regular.ttf",
});

interface MachineryWorkHoursPDFProps {
  data: MachineryWorkHours[];
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
const PAGE_WIDTH = 842;
const CONTENT_WIDTH = PAGE_WIDTH - PADDING * 2;
const ROW_HEIGHT = 20;
const FIRST_PAGE_ROWS = 14;
const CONT_PAGE_ROWS = 20;

const COL = { num: 24, name: 120, driver: 70, contractor: 86, rateName: 60, hours: 60, hourlyRate: 60, dailyRate: 60, monthlyRate: 60, efficiency: 60, totalCost: 72 };

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

function MachineryWorkHoursPDFDocument({
  data: rawData,
  companyName = "YakhshiLedger",
}: MachineryWorkHoursPDFProps) {
  const data = (Array.isArray(rawData) ? rawData : []).filter(
    (d): d is MachineryWorkHours => Boolean(d && typeof d === "object" && d.machineryId)
  );

  const totalHours = data.reduce((s, d) => s + (Number(d.totalHours) || 0), 0);
  const totalCost = data.reduce((s, d) => s + (Number(d.totalCost) || 0), 0);
  const totalWorkHoursPerDay = data.reduce((s, d) => s + (Number(d.workHoursPerDay) || 0), 0);
  const avgWorkHoursPerDay = data.length > 0 ? totalWorkHoursPerDay / data.length : 0;
  const totalDays = avgWorkHoursPerDay > 0 ? totalHours / avgWorkHoursPerDay : 0;

  const ROWS_PER_PAGE = FIRST_PAGE_ROWS;

  const pages: MachineryWorkHours[][] = [];
  if (data.length === 0) {
    pages.push([]);
  } else {
    for (let i = 0; i < data.length; i += ROWS_PER_PAGE) {
      pages.push(data.slice(i, i + ROWS_PER_PAGE));
    }
  }

  return (
    <Document title="Work Hours per Machinery Report" author={companyName} creator={companyName}>
      {pages.map((pageData, idx) => (
        <Page key={`wh-${idx}`} size="A4" orientation="landscape" style={styles.page}>
          {idx === 0 && (
            <View>
              <Text style={styles.companyName}>{companyName}</Text>
              <Text style={styles.reportTitle}>Work Hours per Machinery Report</Text>
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
                <Text style={[styles.tableHeaderCellLeft, { width: COL.rateName }]}>Rate Tier</Text>
                <Text style={[styles.tableHeaderCellRight, { width: COL.hours }]}>Total Hours</Text>
                <Text style={[styles.tableHeaderCellRight, { width: COL.hourlyRate }]}>Hourly Rate</Text>
                <Text style={[styles.tableHeaderCellRight, { width: COL.dailyRate }]}>Daily Rate</Text>
                <Text style={[styles.tableHeaderCellRight, { width: COL.monthlyRate }]}>Monthly Rate</Text>
                <Text style={[styles.tableHeaderCellRight, { width: COL.efficiency }]}>Efficiency</Text>
                <Text style={[styles.tableHeaderCellRight, { width: COL.totalCost }]}>Total Cost</Text>
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
                  <Text style={[styles.tableDataCellLeft, { width: COL.rateName }]}>{d.rateName || "-"}</Text>
                  <Text style={[styles.tableDataCellRight, { width: COL.hours }]}>{formatNumber(Number(d.totalHours) || 0)}</Text>
                  <Text style={[styles.tableDataCellRight, { width: COL.hourlyRate }]}>{formatCurrency(Number(d.hourlyRate) || 0)}</Text>
                  <Text style={[styles.tableDataCellRight, { width: COL.dailyRate }]}>{formatCurrency(Number(d.dailyRate) || 0)}</Text>
                  <Text style={[styles.tableDataCellRight, { width: COL.monthlyRate }]}>{formatCurrency(Number(d.monthlyRate) || 0)}</Text>
                  <Text style={[styles.tableDataCellRight, { width: COL.efficiency }]}>{formatNumber(Number(d.efficiency) || 0, 1)} days</Text>
                  <Text style={[styles.tableDataCellRight, { width: COL.totalCost }]}>{formatCurrency(Number(d.totalCost) || 0)}</Text>
                </View>
              ))}

              {idx === pages.length - 1 && (
                <View style={styles.totalRow}>
                  <Text style={[styles.totalCell, { width: COL.num }]}></Text>
                  <Text style={[styles.totalCellLeft, { width: COL.name + COL.driver + COL.contractor + COL.rateName }]}>Total</Text>
                  <Text style={[styles.totalCellRight, { width: COL.hours }]}>{formatNumber(totalHours)}</Text>
                  <Text style={[styles.totalCellRight, { width: COL.hourlyRate + COL.dailyRate + COL.monthlyRate }]}></Text>
                  <Text style={[styles.totalCellRight, { width: COL.efficiency }]}>{formatNumber(totalDays, 1)} days</Text>
                  <Text style={[styles.totalCellRight, { width: COL.totalCost }]}>{formatCurrency(totalCost)}</Text>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.noDataContainer}>
              <Text style={styles.noDataText}>No work hours data available</Text>
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

export { MachineryWorkHoursPDFDocument };
