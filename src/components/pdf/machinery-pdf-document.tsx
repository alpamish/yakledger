import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import { format } from "date-fns";
import type { Contractor, Machinery, Timesheet, FuelUsage } from "@/types/contractor";
import {
  FUEL_TYPES,
  FUEL_TYPE_LABELS,
  MACHINERY_STATUS_LABELS,
} from "@/types/contractor";
import type { FuelType, MachineryStatus } from "@/types/contractor";

Font.register({
  family: "Vazirmatn",
  src: "/fonts/Vazirmatn-Regular.ttf",
});

export interface MachineryPDFFilters {
  dateFrom?: string;
  dateTo?: string;
}

interface MachineryPDFDocumentProps {
  machinery: Machinery;
  contractor: Contractor;
  timesheets: Timesheet[];
  fuelUsages: FuelUsage[];
  filters?: MachineryPDFFilters;
  companyName?: string;
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

  infoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 8,
  },
  infoCol: {
    width: "50%",
    marginBottom: 3,
  },
  infoLabel: {
    fontSize: 7,
    color: "#64748b",
  },
  infoValue: {
    fontSize: 8,
    color: "#1e293b",
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
  const from = dateFrom ? formatDate(dateFrom) : "…";
  const to = dateTo ? formatDate(dateTo) : "…";
  return (
    <View style={styles.filterContainer}>
      <Text style={styles.filterLabel}>Date Range</Text>
      <Text style={styles.filterText}>{from} — {to}</Text>
    </View>
  );
}

function InfoField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <View style={styles.infoCol}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value || "—"}</Text>
    </View>
  );
}

function MachineryCoverPage({
  machinery: m,
  contractor: c,
  dateFrom,
  dateTo,
  companyName,
}: {
  machinery: Machinery;
  contractor: Contractor;
  dateFrom?: string;
  dateTo?: string;
  companyName: string;
}) {
  return (
    <View>
      <Text style={styles.companyName}>{companyName}</Text>
      <Text style={styles.reportTitle}>Machinery Report</Text>
      <Text style={styles.generatedDate}>Generated on: {format(new Date(), "MMMM d, yyyy")}</Text>
      <View style={styles.divider} />
      {(dateFrom || dateTo) && <FilterSummary dateFrom={dateFrom} dateTo={dateTo} />}

      <Text style={styles.sectionTitle}>Machinery Information</Text>
      <View style={styles.infoGrid}>
        <InfoField label="Machinery Name" value={m.machineryName} />
        <InfoField label="Machinery Type" value={m.machineryType} />
        <InfoField label="Plate Number" value={m.plateNumber} />
        <InfoField label="Model" value={m.model} />
        <InfoField label="Driver Name" value={m.driverName} />
        <InfoField label="Fuel Type" value={FUEL_TYPE_LABELS[m.fuelType as FuelType] ?? m.fuelType} />
        <InfoField label="Hourly Consumption" value={m.hourlyConsumptionRate ? `${m.hourlyConsumptionRate.toFixed(2)} L/hr` : null} />
        <InfoField label="Status" value={MACHINERY_STATUS_LABELS[m.status as MachineryStatus] ?? m.status} />
      </View>

      <View style={styles.divider} />

      <Text style={styles.sectionTitle}>Assigned Contractor</Text>
      <View style={styles.infoGrid}>
        <InfoField label="Contractor Name" value={c.contractorName} />
        <InfoField label="Phone Number" value={c.phoneNumber} />
        <InfoField label="Hourly Rate" value={m.hourlyRate ? formatCurrency(m.hourlyRate) : null} />
        <InfoField label="Daily Rate" value={m.dailyRate ? formatCurrency(m.dailyRate) : null} />
      </View>
    </View>
  );
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

  const COL = { num: 28, date: 78, operator: 65, site: 71, morning: 45, afternoon: 45, hours: 42, ot: 35, machinery: 86 };
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
            <Text style={styles.reportTitle}>Timesheet Records</Text>
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
                  <Text style={[styles.tableDataCell, { width: COL.operator }]}>{ts.operatorName ?? "—"}</Text>
                  <Text style={[styles.tableDataCell, { width: COL.site }]}>{truncate(ts.workSite ?? "—", 10)}</Text>
                  <Text style={[styles.tableDataCell, { width: COL.morning }]}>{ts.startTime && ts.lunchStart ? `${ts.startTime}–${ts.lunchStart}` : ts.startTime ?? "—"}</Text>
                  <Text style={[styles.tableDataCell, { width: COL.afternoon }]}>{ts.lunchEnd && ts.endTime ? `${ts.lunchEnd}–${ts.endTime}` : ts.lunchEnd ?? ts.endTime ?? "—"}</Text>
                  <Text style={[styles.tableDataCell, { width: COL.hours, textAlign: "right" }]}>{ts.totalHours.toFixed(1)}</Text>
                  <Text style={[styles.tableDataCell, { width: COL.ot, textAlign: "right" }]}>{ts.overtimeHours.toFixed(1)}</Text>
                  <Text style={[styles.tableDataCell, { width: COL.machinery }]}>{ts.machinery?.machineryName ?? "—"}</Text>
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

  const COL = { num: 27, date: 75, fuelType: 68, qty: 52, unitPrice: 61, totalCost: 68, station: 68, machinery: 76 };
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
            <Text style={styles.reportTitle}>Fuel Usage Records</Text>
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
                  <Text style={[styles.tableDataCell, { width: COL.station }]}>{fu.fuelStation ?? "—"}</Text>
                  <Text style={[styles.tableDataCell, { width: COL.machinery }]}>{fu.machinery?.machineryName ?? "—"}</Text>
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

function MachinerySummaryPage({
  machinery: m,
  timesheets,
  fuelUsages,
  companyName,
}: {
  machinery: Machinery;
  timesheets: Timesheet[];
  fuelUsages: FuelUsage[];
  companyName: string;
}) {
  const totalHours = timesheets.reduce((s, t) => s + t.totalHours, 0);
  const totalQty = fuelUsages.reduce((s, f) => s + f.quantity, 0);
  const totalFuelCost = fuelUsages.reduce((s, f) => s + f.totalCost, 0);

  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.companyName}>{companyName}</Text>
      <Text style={styles.reportTitle}>Financial Summary — {m.machineryName}</Text>
      <View style={styles.divider} />

      <View style={[styles.summaryCards, { marginTop: 8 }]}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryCardLabel}>Timesheet Hours</Text>
          <Text style={styles.summaryCardValue}>{totalHours.toFixed(2)} hrs</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryCardLabel}>Fuel Quantity</Text>
          <Text style={styles.summaryCardValue}>{totalQty.toFixed(2)} L</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryCardLabel}>Fuel Cost</Text>
          <Text style={styles.summaryCardValue}>{formatCurrency(totalFuelCost)}</Text>
        </View>
      </View>

      <View style={styles.footerDivider} />

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

function MachineryPDFDocument({
  machinery,
  contractor,
  timesheets: rawTimesheets,
  fuelUsages: rawFuelUsages,
  filters,
  companyName = "YakhshiLedger",
}: MachineryPDFDocumentProps) {
  const dateFrom = filters?.dateFrom;
  const dateTo = filters?.dateTo;
  const timesheets = (Array.isArray(rawTimesheets) ? rawTimesheets : []).filter(
    (t): t is Timesheet => Boolean(t && t.id)
  );
  const fuelUsages = (Array.isArray(rawFuelUsages) ? rawFuelUsages : []).filter(
    (f): f is FuelUsage => Boolean(f && f.id)
  );

  return (
    <Document
      title={`Machinery Report - ${machinery.machineryName}`}
      author={companyName}
      creator={companyName}
    >
      <Page size="A4" style={styles.page}>
        <MachineryCoverPage machinery={machinery} contractor={contractor} dateFrom={dateFrom} dateTo={dateTo} companyName={companyName} />
        <View style={styles.pageNumberContainer}
          render={({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) => (
            <Text style={styles.pageNumberText}>Page {pageNumber} of {totalPages}</Text>
          )}
        />
      </Page>

      {MachineryTimesheetSection({ timesheets, companyName })}

      {MachineryFuelSection({ fuelUsages, companyName })}

      <MachinerySummaryPage machinery={machinery} timesheets={timesheets} fuelUsages={fuelUsages} companyName={companyName} />
    </Document>
  );
}

export default MachineryPDFDocument;
