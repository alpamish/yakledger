import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import { format } from "date-fns";

Font.register({
  family: "Vazirmatn",
  src: "/fonts/Vazirmatn-Regular.ttf",
});

interface PayrollLine {
  id: string;
  currency?: string;
  baseSalaryMinor?: number;
  attendanceDays?: number;
  workDays?: number;
  overtimeHours?: number;
  overtimePayMinor?: number;
  allowancesMinor?: number;
  bonusesMinor?: number;
  deductionsMinor?: number;
  grossPayMinor?: number;
  expensesPaidMinor?: number;
  deductExpenses?: boolean;
  amountAlreadyReceivedMinor?: number;
  previousDebtMinor?: number;
  advancesDeductedMinor?: number;
  netPayableMinor?: number;
  remainingEmployeeDebtMinor?: number;
  paymentStatus?: string;
  paymentMethod?: string | null;
  netPayMinor?: number;
}

interface PayrollRecord {
  id: string;
  status?: string;
  periodStart: string | Date;
  periodEnd: string | Date;
  employee?: {
    id: string;
    fullName?: string;
    employeeNumber?: string | null;
    department?: string | null;
    jobTitle?: string | null;
  };
  wallet?: { id: string; name?: string; currency?: string } | null;
  approvedBy?: { id: string; name?: string } | null;
  lines: PayrollLine[];
}

interface PayrollPDFDocumentProps {
  rows: PayrollRecord[];
  status?: string;
  companyName?: string;
}

const formatCurrency = (amountMinor: number, currency = "AFN") =>
  `${currency} ${((amountMinor ?? 0) / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatDate = (d: string | Date) => {
  try {
    return format(new Date(d), "MMM dd, yyyy");
  } catch {
    return String(d ?? "");
  }
};

const truncate = (str: string, maxLen: number) =>
  str.length > maxLen ? str.slice(0, maxLen - 1) + "…" : str;

const paymentLabel = (line: PayrollLine) =>
  line.paymentStatus === "PAID"
    ? `Paid${line.paymentMethod ? ` (${line.paymentMethod})` : ""}`
    : line.paymentStatus || "Unpaid";

// ─── Column widths (landscape, total ≈ 742) ────────────────────
const COL = {
  num: 22,
  employeeNo: 60,
  employee: 120,
  position: 80,
  period: 100,
  status: 48,
  salary: 68,
  workDays: 40,
  overtime: 55,
  netPayable: 68,
  payment: 60,
  department: 61,
} as const;

const TABLE_WIDTH = Object.values(COL).reduce((s, v) => s + v, 0); // ~624

const ROW_HEIGHT = 22;
const FIRST_PAGE_ROWS = 14;
const CONT_PAGE_ROWS = 19;

// ─── Styles ────────────────────────────────────────────────────
const styles = StyleSheet.create({
  page: {
    padding: 50,
    fontSize: 8,
    fontFamily: "Vazirmatn",
    color: "#1e293b",
  },
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
  },
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
    paddingHorizontal: 3,
    paddingVertical: 5,
    color: "#ffffff",
    fontFamily: "Vazirmatn",
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
    paddingVertical: 3,
    fontSize: 7,
    color: "#334155",
  },
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
  totalRow: {
    flexDirection: "row",
    minHeight: ROW_HEIGHT,
    alignItems: "center",
    backgroundColor: "#f0fdf4",
    borderBottomWidth: 1,
    borderBottomColor: "#059669",
  },
  totalCell: {
    paddingHorizontal: 3,
    paddingVertical: 4,
    fontSize: 7,
    fontFamily: "Vazirmatn",
    color: "#059669",
  },
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

interface FlatRow {
  payroll: PayrollRecord;
  line: PayrollLine;
  index: number;
}

function TableHeader() {
  return (
    <View style={styles.tableHeaderRow} fixed>
      <Text style={[styles.tableHeaderCell, { width: COL.num }]}>#</Text>
      <Text style={[styles.tableHeaderCell, { width: COL.employeeNo }]}>Emp No</Text>
      <Text style={[styles.tableHeaderCell, { width: COL.employee }]}>Employee</Text>
      <Text style={[styles.tableHeaderCell, { width: COL.position }]}>Position</Text>
      <Text style={[styles.tableHeaderCell, { width: COL.period }]}>Period</Text>
      <Text style={[styles.tableHeaderCell, { width: COL.status }]}>Status</Text>
      <Text style={[styles.tableHeaderCell, { width: COL.salary, textAlign: "right" }]}>Salary</Text>
      <Text style={[styles.tableHeaderCell, { width: COL.workDays, textAlign: "right" }]}>Work Days</Text>
      <Text style={[styles.tableHeaderCell, { width: COL.overtime, textAlign: "right" }]}>OverTime</Text>
      <Text style={[styles.tableHeaderCell, { width: COL.netPayable, textAlign: "right" }]}>Net Payable</Text>
      <Text style={[styles.tableHeaderCell, { width: COL.payment }]}>Payment</Text>
      <Text style={[styles.tableHeaderCell, { width: COL.department }]}>Dept</Text>
    </View>
  );
}

function DataRow({ row, isEven }: { row: FlatRow; isEven: boolean }) {
  const { payroll, line } = row;
  const currency = line.currency || payroll.wallet?.currency || "AFN";
  const bgColor = isEven ? "#f8fafc" : "#ffffff";
  return (
    <View style={[styles.tableDataRow, { backgroundColor: bgColor }]}>
      <Text style={[styles.tableDataCell, { width: COL.num }]}>{row.index}</Text>
      <Text style={[styles.tableDataCell, { width: COL.employeeNo }]}>
        {payroll.employee?.employeeNumber ?? "—"}
      </Text>
      <Text style={[styles.tableDataCell, { width: COL.employee }]}>
        {truncate(payroll.employee?.fullName ?? "—", 18)}
      </Text>
      <Text style={[styles.tableDataCell, { width: COL.position }]}>
        {truncate(payroll.employee?.jobTitle ?? "—", 11)}
      </Text>
      <Text style={[styles.tableDataCell, { width: COL.period }]}>
        {formatDate(payroll.periodStart)}
      </Text>
      <Text style={[styles.tableDataCell, { width: COL.status }]}>{payroll.status ?? "—"}</Text>
      <Text style={[styles.tableDataCell, { width: COL.salary, textAlign: "right", fontFamily: "Helvetica-Bold" }]}>
        {formatCurrency(line.grossPayMinor ?? 0, currency)}
      </Text>
      <Text style={[styles.tableDataCell, { width: COL.workDays, textAlign: "right" }]}>
        {line.workDays ?? 0}
      </Text>
      <Text style={[styles.tableDataCell, { width: COL.overtime, textAlign: "right" }]}>
        {line.overtimeHours ?? 0}
      </Text>
      <Text style={[styles.tableDataCell, { width: COL.netPayable, textAlign: "right", fontFamily: "Helvetica-Bold" }]}>
        {formatCurrency(line.netPayableMinor ?? 0, currency)}
      </Text>
      <Text style={[styles.tableDataCell, { width: COL.payment }]}>
        {truncate(paymentLabel(line), 10)}
      </Text>
      <Text style={[styles.tableDataCell, { width: COL.department }]}>
        {truncate(payroll.employee?.department ?? "—", 9)}
      </Text>
    </View>
  );
}

interface Totals {
  salary: number;
  workDays: number;
  overtime: number;
  netPayable: number;
}

function TotalsRow({ totals, currency }: { totals: Totals; currency: string }) {
  return (
    <View style={styles.totalRow}>
      <Text style={[styles.totalCell, { width: COL.num }]} />
      <Text style={[styles.totalCell, { width: COL.employeeNo }]} />
      <Text style={[styles.totalCell, { width: COL.employee }]}>Totals</Text>
      <Text style={[styles.totalCell, { width: COL.position }]} />
      <Text style={[styles.totalCell, { width: COL.period }]} />
      <Text style={[styles.totalCell, { width: COL.status }]} />
      <Text style={[styles.totalCell, { width: COL.salary, textAlign: "right" }]}>
        {formatCurrency(totals.salary, currency)}
      </Text>
      <Text style={[styles.totalCell, { width: COL.workDays, textAlign: "right" }]}>
        {totals.workDays}
      </Text>
      <Text style={[styles.totalCell, { width: COL.overtime, textAlign: "right" }]}>
        {totals.overtime}
      </Text>
      <Text style={[styles.totalCell, { width: COL.netPayable, textAlign: "right" }]}>
        {formatCurrency(totals.netPayable, currency)}
      </Text>
      <Text style={[styles.totalCell, { width: COL.payment }]} />
      <Text style={[styles.totalCell, { width: COL.department }]} />
    </View>
  );
}

function ReportFooter({ count, totals, companyName, currency }: {
  count: number;
  totals: Totals;
  companyName: string;
  currency: string;
}) {
  return (
    <View>
      <View style={styles.footerDivider} />
      <View style={styles.summaryRow}>
        <Text style={styles.summaryLabel}>Payroll Records:</Text>
        <Text style={styles.summaryValue}>{count}</Text>
      </View>
      <View style={styles.grandTotalRow}>
        <Text style={styles.grandTotalLabel}>Total Salary:</Text>
        <Text style={styles.grandTotalValue}>{formatCurrency(totals.salary, currency)}</Text>
      </View>
      <View style={styles.grandTotalRow}>
        <Text style={styles.grandTotalLabel}>Total Net Payable:</Text>
        <Text style={styles.grandTotalValue}>{formatCurrency(totals.netPayable, currency)}</Text>
      </View>
      <View style={styles.signaturesContainer}>
        <Text style={styles.signatureLine}>Prepared By: _______________</Text>
        <Text style={styles.signatureLine}>Approved By: _______________</Text>
      </View>
      <Text style={styles.footerNote}>This report was generated by {companyName}</Text>
    </View>
  );
}

function PayrollSummaryPDFDocument({ rows, status, companyName = "YakhshiLedger" }: PayrollPDFDocumentProps) {
  const validRows = (Array.isArray(rows) ? rows : []).filter(
    (r): r is PayrollRecord => Boolean(r && r.id && Array.isArray(r.lines))
  );

  const flat: FlatRow[] = [];
  for (const payroll of validRows) {
    for (const line of payroll.lines) {
      flat.push({ payroll, line, index: 0 });
    }
  }

  flat.sort((a, b) => {
    const deptA = a.payroll.employee?.department ?? "";
    const deptB = b.payroll.employee?.department ?? "";
    if (deptA !== deptB) return deptA.localeCompare(deptB);
    return (b.line.grossPayMinor ?? 0) - (a.line.grossPayMinor ?? 0);
  });

  flat.forEach((row, i) => { row.index = i + 1; });

  const currency = validRows[0]?.wallet?.currency || validRows[0]?.lines?.[0]?.currency || "AFN";

  const totals: Totals = flat.reduce(
    (acc, f) => ({
      salary: acc.salary + (f.line.grossPayMinor ?? 0),
      workDays: acc.workDays + (f.line.workDays ?? 0),
      overtime: acc.overtime + (f.line.overtimeHours ?? 0),
      netPayable: acc.netPayable + (f.line.netPayableMinor ?? 0),
    }),
    { salary: 0, workDays: 0, overtime: 0, netPayable: 0 }
  );

  const generatedDate = format(new Date(), "MMMM d, yyyy");

  const pages: FlatRow[][] = [];
  if (flat.length === 0) {
    pages.push([]);
  } else {
    let remaining = [...flat];
    pages.push(remaining.slice(0, FIRST_PAGE_ROWS));
    remaining = remaining.slice(FIRST_PAGE_ROWS);
    while (remaining.length > 0) {
      pages.push(remaining.slice(0, CONT_PAGE_ROWS));
      remaining = remaining.slice(CONT_PAGE_ROWS);
    }
  }

  return (
    <Document
      title="Payroll Summary Report"
      author={companyName}
      creator={companyName}
    >
      {pages.map((pageRows, pageIdx) => {
        const isFirstPage = pageIdx === 0;
        const isLastPage = pageIdx === pages.length - 1;
        return (
          <Page key={pageIdx} size={{ width: 842, height: 595 }} style={styles.page}>
            {isFirstPage && (
              <View style={{ marginBottom: 10 }}>
                <Text style={styles.companyName}>{companyName}</Text>
                <Text style={styles.reportTitle}>Payroll Summary Report</Text>
                <Text style={styles.generatedDate}>Generated on: {generatedDate}</Text>
                <View style={styles.divider} />
                {status && (
                  <View style={styles.filterContainer}>
                    <Text style={styles.filterLabel}>Status Filter</Text>
                    <Text style={styles.filterText}>{status}</Text>
                  </View>
                )}
              </View>
            )}

            {pageRows.length > 0 ? (
              <View style={styles.tableContainer}>
                <TableHeader />
                {pageRows.map((r) => (
                  <DataRow key={`${r.payroll.id}-${r.line.id}`} row={r} isEven={r.index % 2 === 0} />
                ))}
                {isLastPage && <TotalsRow totals={totals} currency={currency} />}
              </View>
            ) : (
              <View style={styles.noDataContainer}>
                <Text style={styles.noDataText}>No payroll records found</Text>
                <Text style={styles.noDataSubText}>
                  Adjust the status filter or generate a payroll to export.
                </Text>
              </View>
            )}

            {isLastPage && (
              <ReportFooter
                count={validRows.length}
                totals={totals}
                companyName={companyName}
                currency={currency}
              />
            )}

            <View style={styles.pageNumberContainer} fixed>
              <Text style={styles.pageNumberText}>Page</Text>
            </View>
          </Page>
        );
      })}
    </Document>
  );
}

export default PayrollSummaryPDFDocument;
