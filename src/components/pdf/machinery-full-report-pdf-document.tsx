import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import { format } from "date-fns";
import type { Machinery, Timesheet, FuelUsage } from "@/types/contractor";
import {
  FUEL_TYPE_LABELS,
  MACHINERY_STATUS_LABELS,
} from "@/types/contractor";
import type { FuelType, MachineryStatus } from "@/types/contractor";

Font.register({
  family: "Vazirmatn",
  src: "/fonts/Vazirmatn-Regular.ttf",
});

type ReportType = "info" | "timesheet" | "fuel" | "full";

interface MachineryFullReportPDFProps {
  machineryList: MachineryListItem[];
  timesheets?: Timesheet[];
  fuelUsages?: FuelUsage[];
  reportType: ReportType;
  companyName?: string;
  dateFrom?: string;
  dateTo?: string;
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
  str.length > maxLen ? str.slice(0, maxLen - 1) + "\u2026" : str;

const PADDING = 50;
const PAGE_WIDTH = 595;
const CONTENT_WIDTH = PAGE_WIDTH - PADDING * 2;
const ROW_HEIGHT = 20;
const FIRST_PAGE_ROWS = 18;
const CONT_PAGE_ROWS = 28;

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
  filterContainer: {
    backgroundColor: "#f0fdf4",
    borderLeftWidth: 3,
    borderLeftColor: "#059669",
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 10,
  },
  filterLabel: {
    fontSize: 7,
    color: "#059669",
    marginBottom: 2,
  },
  filterText: {
    fontSize: 7,
    color: "#475569",
  },
  sectionTitle: {
    fontSize: 11,
    color: "#059669",
    marginBottom: 6,
    marginTop: 4,
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
  },
  typeHeaderRow: {
    flexDirection: "row",
    backgroundColor: "#f0fdf4",
    borderBottomWidth: 0.5,
    borderBottomColor: "#e2e8f0",
    minHeight: 22,
    alignItems: "center",
  },
  typeHeaderCell: {
    paddingHorizontal: 3,
    paddingVertical: 4,
    fontSize: 8,
    color: "#059669",
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
    fontSize: 7,
    color: "#64748b",
  },
  summaryCardValue: {
    fontSize: 9,
    color: "#059669",
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
    fontSize: 9,
    color: "#475569",
  },
  summaryValue: {
    fontSize: 9,
    color: "#1e293b",
  },
  grandTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
    marginBottom: 14,
  },
  grandTotalLabel: {
    fontSize: 12,
    color: "#059669",
  },
  grandTotalValue: {
    fontSize: 12,
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
    fontSize: 8,
    color: "#64748b",
  },
  footerNote: {
    fontSize: 7,
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
    fontSize: 7,
    color: "#94a3b8",
  },
});

function FilterSummary({ dateFrom, dateTo }: { dateFrom?: string; dateTo?: string }) {
  if (!dateFrom && !dateTo) return null;
  const from = dateFrom ? formatDate(dateFrom) : "\u2026";
  const to = dateTo ? formatDate(dateTo) : "\u2026";
  return (
    <View style={styles.filterContainer}>
      <Text style={styles.filterLabel}>Date Range</Text>
      <Text style={styles.filterText}>{from} - {to}</Text>
    </View>
  );
}

type MachineryListItem = Pick<Machinery, "id" | "machineryName" | "machineryType" | "plateNumber" | "driverName" | "status">;

type TableRow =
  | { kind: "header"; machineryType: string; count: number }
  | { kind: "item"; data: MachineryListItem; globalIndex: number };

function buildGroupedList(list: MachineryListItem[]): TableRow[] {
  const typeCountMap = new Map<string, number>();
  for (const m of list) {
    const type = m.machineryType || "Unknown";
    typeCountMap.set(type, (typeCountMap.get(type) || 0) + 1);
  }
  const sortedTypes = [...typeCountMap.entries()].sort(([, a], [, b]) => b - a);

  const rows: TableRow[] = [];
  let idx = 0;
  for (const [type, count] of sortedTypes) {
    rows.push({ kind: "header", machineryType: type, count });
    const items = list.filter((m) => (m.machineryType || "Unknown") === type);
    for (const item of items) {
      idx++;
      rows.push({ kind: "item", data: item, globalIndex: idx });
    }
  }
  return rows;
}

function MachineryInfoSection({
  groupedRows,
  companyName,
  dateFrom,
  dateTo,
}: {
  groupedRows: TableRow[];
  companyName: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  const items = groupedRows.filter((r): r is { kind: "item"; data: MachineryListItem; globalIndex: number } => r.kind === "item");
  const machineryList = items.map((r) => r.data);
  const totalOperational = machineryList.filter((m) => m.status === "OPERATIONAL").length;
  const totalMaintenance = machineryList.filter((m) => m.status === "UNDER_MAINTENANCE").length;
  const totalOutOfService = machineryList.filter((m) => m.status === "OUT_OF_SERVICE").length;

  const COL = { num: 24, name: 102, type: 72, plate: 68, driver: 80, status: 64 };
  const ROWS_PER_PAGE = FIRST_PAGE_ROWS;

  const pages: TableRow[][] = [];
  if (groupedRows.length === 0) {
    pages.push([]);
  } else {
    for (let i = 0; i < groupedRows.length; i += ROWS_PER_PAGE) {
      pages.push(groupedRows.slice(i, i + ROWS_PER_PAGE));
    }
  }

  return pages.map((pageData, idx) => {
    const isFirst = idx === 0;
    return (
      <Page key={`mi-${idx}`} size="A4" style={styles.page}>
        {isFirst && (
          <View style={{ marginBottom: 6 }}>
            <Text style={styles.companyName}>{companyName}</Text>
            <Text style={styles.reportTitle}>Machinery List Report</Text>
            <Text style={styles.generatedDate}>Generated on: {format(new Date(), "MMMM d, yyyy")}</Text>
            <View style={styles.divider} />
            {(dateFrom || dateTo) && <FilterSummary dateFrom={dateFrom} dateTo={dateTo} />}
            <View style={styles.summaryCards}>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryCardLabel}>Total Machinery</Text>
                <Text style={styles.summaryCardValue}>{machineryList.length}</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryCardLabel}>Operational</Text>
                <Text style={styles.summaryCardValue}>{totalOperational}</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryCardLabel}>Under Maintenance</Text>
                <Text style={styles.summaryCardValue}>{totalMaintenance}</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryCardLabel}>Out of Service</Text>
                <Text style={styles.summaryCardValue}>{totalOutOfService}</Text>
              </View>
            </View>
          </View>
        )}

        {pageData.length > 0 ? (
          <View style={[styles.tableContainer, { width: CONTENT_WIDTH }]}>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.tableHeaderCell, { width: COL.num }]}>#</Text>
              <Text style={[styles.tableHeaderCell, { width: COL.name }]}>Machinery Name</Text>
              <Text style={[styles.tableHeaderCell, { width: COL.type }]}>Type</Text>
              <Text style={[styles.tableHeaderCell, { width: COL.plate }]}>Plate Number</Text>
              <Text style={[styles.tableHeaderCell, { width: COL.driver }]}>Driver</Text>
              <Text style={[styles.tableHeaderCell, { width: COL.status }]}>Status</Text>
            </View>
            {pageData.filter(Boolean).map((row, ri) => {
              if (row.kind === "header") {
                return (
                  <View key={`hdr-${row.machineryType}`} style={styles.typeHeaderRow}>
                    <Text style={[styles.typeHeaderCell, { width: CONTENT_WIDTH }]}>
                      {row.machineryType} ({row.count})
                    </Text>
                  </View>
                );
              }
              const m = row.data;
              const statusLabel = MACHINERY_STATUS_LABELS[m.status as MachineryStatus] ?? m.status;
              return (
                <View key={m.id} style={[styles.tableDataRow, { backgroundColor: row.globalIndex % 2 === 0 ? "#f8fafc" : "#ffffff" }]}>
                  <Text style={[styles.tableDataCell, { width: COL.num }]}>{row.globalIndex}</Text>
                  <Text style={[styles.tableDataCell, { width: COL.name }]}>{truncate(m.machineryName, 18)}</Text>
                  <Text style={[styles.tableDataCell, { width: COL.type }]}>{truncate(m.machineryType, 14)}</Text>
                  <Text style={[styles.tableDataCell, { width: COL.plate }]}>{m.plateNumber || "-"}</Text>
                  <Text style={[styles.tableDataCell, { width: COL.driver }]}>{m.driverName || "-"}</Text>
                  <Text style={[styles.tableDataCell, { width: COL.status }]}>{statusLabel}</Text>
                </View>
              );
            })}
          </View>
        ) : (
          <View style={styles.noDataContainer}>
            <Text style={styles.noDataText}>No machinery found</Text>
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

function MachineryTimesheetSection({
  timesheets,
  companyName,
}: {
  timesheets: Timesheet[];
  companyName: string;
}) {
  const totalHours = timesheets.reduce((s, t) => s + t.totalHours, 0);
  const totalOT = timesheets.reduce((s, t) => s + t.overtimeHours, 0);

  const COL = { num: 24, date: 72, operator: 62, site: 65, morning: 42, afternoon: 42, hours: 40, ot: 34, machinery: 84 };
  const TOTAL = Object.values(COL).reduce((s, v) => s + v, 0);

  const pages: Timesheet[][] = [];
  if (timesheets.length === 0) {
    pages.push([]);
  } else {
    let remaining = [...timesheets];
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
      <Page key={`mts-${idx}`} size="A4" style={styles.page}>
        {isFirst && (
          <View style={{ marginBottom: 6 }}>
            <Text style={styles.companyName}>{companyName}</Text>
            <Text style={styles.reportTitle}>All Machinery Timesheet Records</Text>
            <View style={styles.divider} />
            <View style={styles.summaryCards}>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryCardLabel}>Total Hours</Text>
                <Text style={styles.summaryCardValue}>{totalHours.toFixed(2)} hrs</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryCardLabel}>Overtime</Text>
                <Text style={styles.summaryCardValue}>{totalOT.toFixed(2)} hrs</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryCardLabel}>Total Records</Text>
                <Text style={styles.summaryCardValue}>{timesheets.length}</Text>
              </View>
            </View>
          </View>
        )}

        {pageData.length > 0 ? (
          <View style={[styles.tableContainer, { width: CONTENT_WIDTH }]}>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.tableHeaderCell, { width: COL.num }]}>#</Text>
              <Text style={[styles.tableHeaderCell, { width: COL.date }]}>Date</Text>
              <Text style={[styles.tableHeaderCell, { width: COL.operator }]}>Operator</Text>
              <Text style={[styles.tableHeaderCell, { width: COL.site }]}>Work Site</Text>
              <Text style={[styles.tableHeaderCell, { width: COL.morning }]}>Morning</Text>
              <Text style={[styles.tableHeaderCell, { width: COL.afternoon }]}>Afternoon</Text>
              <Text style={[styles.tableHeaderCell, { width: COL.hours, textAlign: "right" }]}>Hours</Text>
              <Text style={[styles.tableHeaderCell, { width: COL.ot, textAlign: "right" }]}>OT</Text>
              <Text style={[styles.tableHeaderCell, { width: COL.machinery }]}>Machinery</Text>
            </View>
            {pageData.filter(Boolean).map((ts) => {
              globalIndex++;
              return (
                <View key={ts.id} style={[styles.tableDataRow, { backgroundColor: globalIndex % 2 === 0 ? "#f8fafc" : "#ffffff" }]}>
                  <Text style={[styles.tableDataCell, { width: COL.num }]}>{globalIndex}</Text>
                  <Text style={[styles.tableDataCell, { width: COL.date }]}>{formatDate(ts.date)}</Text>
                  <Text style={[styles.tableDataCell, { width: COL.operator }]}>{ts.operatorName ?? "-"}</Text>
                  <Text style={[styles.tableDataCell, { width: COL.site }]}>{truncate(ts.workSite ?? "-", 10)}</Text>
                  <Text style={[styles.tableDataCell, { width: COL.morning }]}>{ts.startTime && ts.lunchStart ? `${ts.startTime}\u2013${ts.lunchStart}` : ts.startTime ?? "-"}</Text>
                  <Text style={[styles.tableDataCell, { width: COL.afternoon }]}>{ts.lunchEnd && ts.endTime ? `${ts.lunchEnd}\u2013${ts.endTime}` : ts.lunchEnd ?? ts.endTime ?? "-"}</Text>
                  <Text style={[styles.tableDataCell, { width: COL.hours, textAlign: "right" }]}>{ts.totalHours.toFixed(1)}</Text>
                  <Text style={[styles.tableDataCell, { width: COL.ot, textAlign: "right" }]}>{ts.overtimeHours.toFixed(1)}</Text>
                  <Text style={[styles.tableDataCell, { width: COL.machinery }]}>{ts.machinery?.machineryName ?? "-"}</Text>
                </View>
              );
            })}
          </View>
        ) : (
          <View style={styles.noDataContainer}>
            <Text style={styles.noDataText}>No timesheet records found</Text>
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

function MachineryFuelSection({ fuelUsages, companyName }: { fuelUsages: FuelUsage[]; companyName: string }) {
  const totalQty = fuelUsages.reduce((s, f) => s + f.quantity, 0);
  const totalCost = fuelUsages.reduce((s, f) => s + f.totalCost, 0);

  const COL = { num: 24, date: 70, fuelType: 64, qty: 48, unitPrice: 56, totalCost: 62, station: 64, machinery: 76 };
  const TOTAL = Object.values(COL).reduce((s, v) => s + v, 0);

  const pages: FuelUsage[][] = [];
  if (fuelUsages.length === 0) {
    pages.push([]);
  } else {
    let remaining = [...fuelUsages];
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
      <Page key={`mfu-${idx}`} size="A4" style={styles.page}>
        {isFirst && (
          <View style={{ marginBottom: 6 }}>
            <Text style={styles.companyName}>{companyName}</Text>
            <Text style={styles.reportTitle}>All Machinery Fuel Usage Records</Text>
            <View style={styles.divider} />
            <View style={styles.summaryCards}>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryCardLabel}>Total Quantity</Text>
                <Text style={styles.summaryCardValue}>{totalQty.toFixed(2)} L</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryCardLabel}>Total Cost</Text>
                <Text style={styles.summaryCardValue}>{formatCurrency(totalCost)}</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryCardLabel}>Records</Text>
                <Text style={styles.summaryCardValue}>{fuelUsages.length}</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryCardLabel}>Avg. Price/L</Text>
                <Text style={styles.summaryCardValue}>
                  {totalQty > 0 ? formatCurrency(totalCost / totalQty) : formatCurrency(0)}
                </Text>
              </View>
            </View>
          </View>
        )}

        {pageData.length > 0 ? (
          <View style={[styles.tableContainer, { width: CONTENT_WIDTH }]}>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.tableHeaderCell, { width: COL.num }]}>#</Text>
              <Text style={[styles.tableHeaderCell, { width: COL.date }]}>Date</Text>
              <Text style={[styles.tableHeaderCell, { width: COL.fuelType }]}>Fuel Type</Text>
              <Text style={[styles.tableHeaderCell, { width: COL.qty, textAlign: "right" }]}>Qty (L)</Text>
              <Text style={[styles.tableHeaderCell, { width: COL.unitPrice, textAlign: "right" }]}>Unit Price</Text>
              <Text style={[styles.tableHeaderCell, { width: COL.totalCost, textAlign: "right" }]}>Total</Text>
              <Text style={[styles.tableHeaderCell, { width: COL.station }]}>Station</Text>
              <Text style={[styles.tableHeaderCell, { width: COL.machinery }]}>Machinery</Text>
            </View>
            {pageData.filter(Boolean).map((fu) => {
              globalIndex++;
              return (
                <View key={fu.id} style={[styles.tableDataRow, { backgroundColor: globalIndex % 2 === 0 ? "#f8fafc" : "#ffffff" }]}>
                  <Text style={[styles.tableDataCell, { width: COL.num }]}>{globalIndex}</Text>
                  <Text style={[styles.tableDataCell, { width: COL.date }]}>{formatDate(fu.date)}</Text>
                  <Text style={[styles.tableDataCell, { width: COL.fuelType }]}>{FUEL_TYPE_LABELS[fu.fuelType as FuelType] ?? fu.fuelType}</Text>
                  <Text style={[styles.tableDataCell, { width: COL.qty, textAlign: "right" }]}>{fu.quantity.toFixed(2)}</Text>
                  <Text style={[styles.tableDataCell, { width: COL.unitPrice, textAlign: "right" }]}>{formatCurrency(fu.unitPrice)}</Text>
                  <Text style={[styles.tableDataCell, { width: COL.totalCost, textAlign: "right" }]}>{formatCurrency(fu.totalCost)}</Text>
                  <Text style={[styles.tableDataCell, { width: COL.station }]}>{fu.fuelStation ?? "-"}</Text>
                  <Text style={[styles.tableDataCell, { width: COL.machinery }]}>{fu.machinery?.machineryName ?? "-"}</Text>
                </View>
              );
            })}
          </View>
        ) : (
          <View style={styles.noDataContainer}>
            <Text style={styles.noDataText}>No fuel usage records found</Text>
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

function MachineryFinancialSummaryPage({
  machineryList,
  timesheets,
  fuelUsages,
  companyName,
}: {
  machineryList: MachineryListItem[];
  timesheets: Timesheet[];
  fuelUsages: FuelUsage[];
  companyName: string;
}) {
  const totalHours = timesheets.reduce((s, t) => s + t.totalHours, 0);
  const totalQty = fuelUsages.reduce((s, f) => s + f.quantity, 0);
  const totalFuelCost = fuelUsages.reduce((s, f) => s + f.totalCost, 0);
  const totalOperational = machineryList.filter((m) => m.status === "OPERATIONAL").length;

  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.companyName}>{companyName}</Text>
      <Text style={styles.reportTitle}>Financial Summary — All Machinery</Text>
      <View style={styles.divider} />

      <View style={styles.summaryCards}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryCardLabel}>Total Machinery</Text>
          <Text style={styles.summaryCardValue}>{machineryList.length}</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryCardLabel}>Operational</Text>
          <Text style={styles.summaryCardValue}>{totalOperational}</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryCardLabel}>Timesheet Hours</Text>
          <Text style={styles.summaryCardValue}>{totalHours.toFixed(2)} hrs</Text>
        </View>
      </View>

      <View style={[styles.summaryCards, { marginTop: 8 }]}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryCardLabel}>Fuel Quantity</Text>
          <Text style={styles.summaryCardValue}>{totalQty.toFixed(2)} L</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryCardLabel}>Fuel Cost</Text>
          <Text style={styles.summaryCardValue}>{formatCurrency(totalFuelCost)}</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryCardLabel}>Timesheet Records</Text>
          <Text style={styles.summaryCardValue}>{timesheets.length}</Text>
        </View>
      </View>

      <View style={styles.footerDivider} />

      <View style={styles.summaryRow}>
        <Text style={styles.summaryLabel}>Total Machinery Count:</Text>
        <Text style={styles.summaryValue}>{machineryList.length}</Text>
      </View>
      <View style={styles.summaryRow}>
        <Text style={styles.summaryLabel}>Total Timesheet Hours:</Text>
        <Text style={styles.summaryValue}>{totalHours.toFixed(2)} hrs</Text>
      </View>
      <View style={styles.summaryRow}>
        <Text style={styles.summaryLabel}>Total Fuel Quantity:</Text>
        <Text style={styles.summaryValue}>{totalQty.toFixed(2)} L</Text>
      </View>
      <View style={styles.summaryRow}>
        <Text style={styles.summaryLabel}>Total Fuel Cost:</Text>
        <Text style={styles.summaryValue}>{formatCurrency(totalFuelCost)}</Text>
      </View>

      <View style={styles.grandTotalRow}>
        <Text style={styles.grandTotalLabel}>Total Fuel Cost:</Text>
        <Text style={styles.grandTotalValue}>{formatCurrency(totalFuelCost)}</Text>
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

function MachineryTypeSummaryPage({
  machineryList,
  companyName,
}: {
  machineryList: MachineryListItem[];
  companyName: string;
}) {
  const sortedByName = [...machineryList]
    .filter(m => m.machineryName)
    .sort((a, b) => (a.machineryName || "").localeCompare(b.machineryName || ""));

  const COL = { num: 40, name: 300 };
  const CONTENT_WIDTH = Object.values(COL).reduce((s, v) => s + v, 0);

  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.companyName}>{companyName}</Text>
      <Text style={styles.reportTitle}>Machinery Summary</Text>
      <Text style={styles.generatedDate}>Generated on: {format(new Date(), "MMMM d, yyyy")}</Text>
      <View style={styles.divider} />

      {sortedByName.length > 0 ? (
        <View style={[styles.tableContainer, { width: CONTENT_WIDTH }]}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.tableHeaderCell, { width: COL.num }]}>#</Text>
            <Text style={[styles.tableHeaderCell, { width: COL.name }]}>Machinery Name</Text>
          </View>
          {sortedByName.map((m, i) => (
            <View key={m.id} style={[styles.tableDataRow, { backgroundColor: i % 2 === 0 ? "#f8fafc" : "#ffffff" }]}>
              <Text style={[styles.tableDataCell, { width: COL.num }]}>{i + 1}</Text>
              <Text style={[styles.tableDataCell, { width: COL.name }]}>{m.machineryName}</Text>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.noDataContainer}>
          <Text style={styles.noDataText}>No machinery data available</Text>
        </View>
      )}

      <View style={styles.pageNumberContainer}
        render={({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) => (
          <Text style={styles.pageNumberText}>Page {pageNumber} of {totalPages}</Text>
        )}
      />
    </Page>
  );
}

function MachineryFullReportPDFDocument({
  machineryList: rawMachineryList,
  timesheets: rawTimesheets,
  fuelUsages: rawFuelUsages,
  reportType,
  companyName = "YakhshiLedger",
  dateFrom,
  dateTo,
}: MachineryFullReportPDFProps) {
  const machineryList = (Array.isArray(rawMachineryList) ? rawMachineryList : []).filter(
    (m): m is MachineryListItem => Boolean(m && m.id)
  );
  const timesheets = (Array.isArray(rawTimesheets) ? rawTimesheets : []).filter(
    (t): t is Timesheet => Boolean(t && t.id)
  );
  const fuelUsages = (Array.isArray(rawFuelUsages) ? rawFuelUsages : []).filter(
    (f): f is FuelUsage => Boolean(f && f.id)
  );

  const groupedRows = buildGroupedList(machineryList);

  const sections: React.ReactNode[] = [];

  if (reportType === "info" || reportType === "full") {
    sections.push(...MachineryInfoSection({ groupedRows, companyName, dateFrom, dateTo }));
  }

  if (reportType === "timesheet" || reportType === "full") {
    sections.push(...MachineryTimesheetSection({ timesheets, companyName }));
  }

  if (reportType === "fuel" || reportType === "full") {
    sections.push(...MachineryFuelSection({ fuelUsages, companyName }));
  }

  if (reportType === "info" || reportType === "full") {
    sections.push(
      <MachineryTypeSummaryPage
        key="type-summary"
        machineryList={machineryList}
        companyName={companyName}
      />
    );
  }

  if (reportType === "full") {
    sections.push(
      <MachineryFinancialSummaryPage
        key="financial-summary"
        machineryList={machineryList}
        timesheets={timesheets}
        fuelUsages={fuelUsages}
        companyName={companyName}
      />
    );
  }

  const titleMap: Record<ReportType, string> = {
    info: "Machinery List Report",
    timesheet: "Machinery Timesheet Report",
    fuel: "Machinery Fuel Metric Report",
    full: "Full Machinery Financial Summary",
  };

  return (
    <Document
      title={titleMap[reportType]}
      author={companyName}
      creator={companyName}
    >
      {sections}
    </Document>
  );
}

export default MachineryFullReportPDFDocument;
