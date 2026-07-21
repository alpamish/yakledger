import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";

Font.register({
  family: "Vazirmatn",
  src: "/fonts/Vazirmatn-Regular.ttf",
});

const PADDING = 30;
const PAGE_WIDTH = 595;
const CONTENT_WIDTH = PAGE_WIDTH - PADDING * 2;
const ROW_HEIGHT = 17;

function farsiNum(n: number | string): string {
  const digits = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
  return String(n).replace(/\d/g, (d) => digits[+d]);
}

function formatCurrency(n: number): string {
  return `${
    Math.round(n).toLocaleString("en-US")
  } AFN`;
}

function fmtNum(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

interface SummaryItem {
  machineryName: string;
  driverName: string | null;
  plateNumber: string | null;
  hourlyRate: number;
  summary: {
    totalHours: number;
    totalMoney: number;
    totalWithdrawals: number;
    totalReceivable: number;
  };
}

interface Props {
  data: SummaryItem[];
  companyName?: string;
  dateFrom?: string;
  dateTo?: string;
}

const COL = {
  name: 110,
  driver: 75,
  plate: 60,
  hours: 55,
  rate: 60,
  money: 60,
  withdrawals: 60,
  receivable: 55,
};
const TOTAL_COL = Object.values(COL).reduce((s, v) => s + v, 0);

const styles = StyleSheet.create({
  page: {
    padding: PADDING,
    fontSize: 8,
    fontFamily: "Vazirmatn",
    color: "#1e293b",
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 1,
  },
  subtitle: {
    fontSize: 8,
    textAlign: "center",
    color: "#64748b",
    marginBottom: 4,
  },
  filterInfo: {
    fontSize: 7,
    textAlign: "center",
    color: "#64748b",
    marginBottom: 3,
  },
  divider: {
    height: 1,
    backgroundColor: "#374151",
    marginBottom: 6,
  },
  table: {
    width: TOTAL_COL,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#374151",
  },
  tableRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#374151",
    minHeight: ROW_HEIGHT,
    alignItems: "center",
  },
  tableHeaderRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#374151",
    minHeight: ROW_HEIGHT + 2,
    alignItems: "center",
    backgroundColor: "#374151",
  },
  cell: {
    paddingHorizontal: 2,
    paddingVertical: 1,
    fontSize: 6.5,
    textAlign: "center",
    color: "#1e293b",
    fontFamily: "Vazirmatn",
  },
  headerCell: {
    paddingHorizontal: 2,
    paddingVertical: 1,
    fontSize: 6.5,
    textAlign: "center",
    fontWeight: "bold",
    color: "#ffffff",
    fontFamily: "Vazirmatn",
  },
  totalRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#374151",
    minHeight: ROW_HEIGHT + 3,
    alignItems: "center",
    backgroundColor: "#f3f4f6",
  },
  totalCell: {
    paddingHorizontal: 2,
    paddingVertical: 1,
    fontSize: 7,
    textAlign: "center",
    fontWeight: "bold",
    color: "#1e293b",
    fontFamily: "Vazirmatn",
  },
  pageNumber: {
    position: "absolute",
    bottom: 15,
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: 7,
    color: "#94a3b8",
    fontFamily: "Vazirmatn",
  },
  emptyState: {
    textAlign: "center",
    fontSize: 10,
    color: "#94a3b8",
    marginTop: 40,
    fontFamily: "Vazirmatn",
  },
});

function colStyle(width: number) {
  return { width };
}

export default function MachinerySummaryPDFDocument({
  data,
  companyName = "YakLedger",
  dateFrom,
  dateTo,
}: Props) {
  const genDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const grandTotalHours = data.reduce((s, d) => s + d.summary.totalHours, 0);
  const grandTotalMoney = data.reduce((s, d) => s + d.summary.totalMoney, 0);
  const grandTotalWithdrawals = data.reduce((s, d) => s + d.summary.totalWithdrawals, 0);
  const grandTotalReceivable = data.reduce((s, d) => s + d.summary.totalReceivable, 0);

  return (
    <Document
      title="Machinery Summary Report"
      author={companyName}
      creator={companyName}
    >
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Machinery Summary</Text>
        <Text style={styles.subtitle}>
          {companyName} | Generated: {genDate}
        </Text>
        {(dateFrom || dateTo) && (
          <Text style={styles.filterInfo}>
            {dateFrom && `From: ${dateFrom}`}
            {dateFrom && dateTo ? " | " : ""}
            {dateTo && `To: ${dateTo}`}
          </Text>
        )}
        <View style={styles.divider} />

        {data.length === 0 ? (
          <Text style={styles.emptyState}>No machinery data found</Text>
        ) : (
          <View style={styles.table}>
            {/* Header Row */}
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.headerCell, colStyle(COL.receivable)]}>Receivable</Text>
              <Text style={[styles.headerCell, colStyle(COL.withdrawals)]}>Withdrawn</Text>
              <Text style={[styles.headerCell, colStyle(COL.money)]}>Total</Text>
              <Text style={[styles.headerCell, colStyle(COL.rate)]}>Rate</Text>
              <Text style={[styles.headerCell, colStyle(COL.hours)]}>Hours</Text>
              <Text style={[styles.headerCell, colStyle(COL.plate)]}>Plate #</Text>
              <Text style={[styles.headerCell, colStyle(COL.driver)]}>Driver</Text>
              <Text style={[styles.headerCell, colStyle(COL.name)]}>Machinery</Text>
            </View>

            {/* Data Rows */}
            {data.map((item, i) => (
              <View
                key={item.machineryId ?? i}
                style={[
                  styles.tableRow,
                  { backgroundColor: i % 2 === 0 ? "#ffffff" : "#f9fafb" },
                ]}
              >
                <Text style={[styles.cell, colStyle(COL.receivable)]}>{formatCurrency(item.summary.totalReceivable)}</Text>
                <Text style={[styles.cell, colStyle(COL.withdrawals)]}>{formatCurrency(item.summary.totalWithdrawals)}</Text>
                <Text style={[styles.cell, colStyle(COL.money)]}>{formatCurrency(item.summary.totalMoney)}</Text>
                <Text style={[styles.cell, colStyle(COL.rate)]}>{formatCurrency(item.hourlyRate)}</Text>
                <Text style={[styles.cell, colStyle(COL.hours)]}>{item.summary.totalHours.toFixed(1)}</Text>
                <Text style={[styles.cell, colStyle(COL.plate)]}>{item.plateNumber || "—"}</Text>
                <Text style={[styles.cell, colStyle(COL.driver)]}>{item.driverName || "—"}</Text>
                <Text style={[styles.cell, colStyle(COL.name)]}>{item.machineryName}</Text>
              </View>
            ))}

            {/* Grand Total Row */}
            <View style={styles.totalRow}>
              <Text style={[styles.totalCell, colStyle(COL.receivable)]}>{formatCurrency(grandTotalReceivable)}</Text>
              <Text style={[styles.totalCell, colStyle(COL.withdrawals)]}>{formatCurrency(grandTotalWithdrawals)}</Text>
              <Text style={[styles.totalCell, colStyle(COL.money)]}>{formatCurrency(grandTotalMoney)}</Text>
              <Text style={[styles.totalCell, colStyle(COL.rate)]}>—</Text>
              <Text style={[styles.totalCell, colStyle(COL.hours)]}>{grandTotalHours.toFixed(1)}</Text>
              <Text style={[styles.totalCell, colStyle(COL.plate)]}>—</Text>
              <Text style={[styles.totalCell, colStyle(COL.driver)]}>—</Text>
              <Text style={[styles.totalCell, colStyle(COL.name)]}>Grand Total</Text>
            </View>
          </View>
        )}

        <Text
          style={styles.pageNumber}
          render={({ pageNumber, totalPages }) =>
            `Page ${pageNumber} of ${totalPages}`
          }
          fixed
        />
      </Page>
    </Document>
  );
}
