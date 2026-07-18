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
const ROW_HEIGHT = 16;
const MACHINERY_PER_PAGE = 4;

function farsiNum(n: number | string): string {
  const digits = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
  return String(n).replace(/\d/g, (d) => digits[+d]);
}

function formatCurrency(n: number): string {
  return `${farsiNum(
    Math.round(n).toLocaleString("en-US")
  )} AFN`;
}

function fmtNum(n: number): string {
  return farsiNum(
    Math.round(n).toLocaleString("en-US")
  );
}

interface MonthlyWorkRow {
  monthLabel: string;
  totalHours: number;
  totalWorkDays: number;
  pricePerHour: number;
  totalPrice: number;
}

interface PaymentRow {
  date: string;
  giver: string;
  receiver: string;
  description: string;
  amount: number;
}

interface MachineryReport {
  machineryId: string;
  machineryName: string;
  plateNumber: string | null;
  driverName: string | null;
  hourlyRate: number;
  workHoursPerDay: number;
  contractDaysPerMonth: number;
  contractorId: string;
  contractorName: string;
  monthlyWork: MonthlyWorkRow[];
  summary: {
    totalHours: number;
    totalMoney: number;
    totalWithdrawals: number;
    totalReceivable: number;
  };
  payments: PaymentRow[];
}

interface Props {
  data: MachineryReport[];
  companyName?: string;
  dateFrom?: string;
  dateTo?: string;
}

const styles = StyleSheet.create({
  page: {
    padding: PADDING,
    fontSize: 8,
    fontFamily: "Vazirmatn",
    color: "#1e293b",
  },
  title: {
    fontSize: 22,
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
  machineHeader: {
    backgroundColor: "#f8f9fa",
    borderWidth: 1,
    borderColor: "#374151",
    padding: 4,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  machineHeaderText: {
    fontSize: 7,
    color: "#1e293b",
    fontFamily: "Vazirmatn",
  },
  table: {
    width: "100%",
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
  col1: { width: "22%" },
  col2: { width: "18%" },
  col3: { width: "20%" },
  col4: { width: "20%" },
  col5: { width: "20%" },
  pcol1: { width: "18%" },
  pcol2: { width: "27%" },
  pcol3: { width: "20%" },
  pcol4: { width: "20%" },
  pcol5: { width: "15%" },
  summaryRow: {
    flexDirection: "row",
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#374151",
    minHeight: ROW_HEIGHT + 4,
    alignItems: "center",
    backgroundColor: "#f3f4f6",
  },
  scell: {
    width: "25%",
    paddingHorizontal: 2,
    paddingVertical: 2,
    fontSize: 7,
    textAlign: "center",
    fontWeight: "bold",
    color: "#1e293b",
    fontFamily: "Vazirmatn",
  },
  paymentsTitle: {
    fontSize: 9,
    fontWeight: "bold",
    textAlign: "center",
    marginTop: 5,
    marginBottom: 0,
    fontFamily: "Vazirmatn",
  },
  paymentTotalRow: {
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#374151",
    minHeight: ROW_HEIGHT + 3,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f3f4f6",
  },
  paymentTotalText: {
    fontSize: 7.5,
    fontWeight: "bold",
    textAlign: "center",
    color: "#1e293b",
    fontFamily: "Vazirmatn",
  },
  machineryBlock: {
    marginBottom: 7,
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

function MonthlyWorkTable({ rows }: { rows: MonthlyWorkRow[] }) {
  return (
    <View style={styles.table}>
      <View style={[styles.tableHeaderRow, { backgroundColor: "#374151" }]}>
        <Text style={[styles.headerCell, styles.col1]}>Total Price</Text>
        <Text style={[styles.headerCell, styles.col2]}>Hourly Rate</Text>
        <Text style={[styles.headerCell, styles.col3]}>Work Days</Text>
        <Text style={[styles.headerCell, styles.col4]}>Total Hours</Text>
        <Text style={[styles.headerCell, styles.col5]}>Month</Text>
      </View>
      {rows.length === 0 ? (
        <View style={styles.tableRow}>
          <Text style={[styles.cell, { width: "100%", textAlign: "center" }]}>—</Text>
        </View>
      ) : (
        rows.map((row, i) => (
          <View
            key={i}
            style={[
              styles.tableRow,
              { backgroundColor: i % 2 === 0 ? "#ffffff" : "#f9fafb" },
            ]}
          >
            <Text style={[styles.cell, styles.col1]}>{formatCurrency(row.totalPrice)}</Text>
            <Text style={[styles.cell, styles.col2]}>{formatCurrency(row.pricePerHour)}</Text>
            <Text style={[styles.cell, styles.col3]}>{farsiNum(row.totalWorkDays)}</Text>
            <Text style={[styles.cell, styles.col4]}>{farsiNum(row.totalHours.toFixed(1))}</Text>
            <Text style={[styles.cell, styles.col5]}>{row.monthLabel}</Text>
          </View>
        ))
      )}
    </View>
  );
}

function PaymentsTable({ rows }: { rows: PaymentRow[] }) {
  return (
    <View style={styles.table}>
      <View style={[styles.tableHeaderRow, { backgroundColor: "#374151" }]}>
        <Text style={[styles.headerCell, styles.pcol1]}>Amount</Text>
        <Text style={[styles.headerCell, styles.pcol2]}>Notes</Text>
        <Text style={[styles.headerCell, styles.pcol3]}>Receiver</Text>
        <Text style={[styles.headerCell, styles.pcol4]}>Payer</Text>
        <Text style={[styles.headerCell, styles.pcol5]}>Date</Text>
      </View>
      {rows.length === 0 ? (
        <View style={styles.tableRow}>
          <Text style={[styles.cell, { width: "100%", textAlign: "center" }]}>—</Text>
        </View>
      ) : (
        rows.map((row, i) => (
          <View
            key={i}
            style={[
              styles.tableRow,
              { backgroundColor: i % 2 === 0 ? "#ffffff" : "#f9fafb" },
            ]}
          >
            <Text style={[styles.cell, styles.pcol1]}>{formatCurrency(row.amount)}</Text>
            <Text style={[styles.cell, styles.pcol2]}>{row.description || "—"}</Text>
            <Text style={[styles.cell, styles.pcol3]}>{row.receiver}</Text>
            <Text style={[styles.cell, styles.pcol4]}>{row.giver}</Text>
            <Text style={[styles.cell, styles.pcol5]}>{row.date}</Text>
          </View>
        ))
      )}
    </View>
  );
}

function MachineryBlock({ item }: { item: MachineryReport }) {
  const totalPayment = item.payments.reduce((s, p) => s + p.amount, 0);
  const plateDisplay = item.plateNumber ? ` - ${item.plateNumber}` : "";

  return (
    <View style={styles.machineryBlock} wrap={false}>
      <View style={styles.machineHeader}>
        <Text style={styles.machineHeaderText}>
          Driver: {item.driverName || "—"}
        </Text>
        <Text style={styles.machineHeaderText}>
          Contractor: {item.contractorName}
        </Text>
        <Text style={styles.machineHeaderText}>
          Machinery: {item.machineryName}{plateDisplay}
        </Text>
      </View>

      <MonthlyWorkTable rows={item.monthlyWork} />

      <View style={styles.summaryRow}>
        <Text style={styles.scell}>
          {formatCurrency(item.summary.totalReceivable)}
          {`\n`}Receivable
        </Text>
        <Text style={styles.scell}>
          {formatCurrency(item.summary.totalWithdrawals)}
          {`\n`}Withdrawn
        </Text>
        <Text style={styles.scell}>
          {formatCurrency(item.summary.totalMoney)}
          {`\n`}Total
        </Text>
        <Text style={styles.scell}>
          {farsiNum(item.summary.totalHours.toFixed(1))}
          {`\n`}Hours
        </Text>
      </View>

      {item.payments.length > 0 && (
        <View>
          <Text style={styles.paymentsTitle}>Payments</Text>
          <PaymentsTable rows={item.payments} />
          <View style={styles.paymentTotalRow}>
            <Text style={styles.paymentTotalText}>
              Total Received: {formatCurrency(totalPayment)}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

function CoverPage({
  companyName,
  dateFrom,
  dateTo,
  totalItems,
}: {
  companyName: string;
  dateFrom?: string;
  dateTo?: string;
  totalItems: number;
}) {
  const genDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.title}>Contractors Financial Report</Text>
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

      <Text style={{ textAlign: "center", fontSize: 10, marginTop: 30, color: "#64748b", fontFamily: "Vazirmatn" }}>
        Total Machinery Items: {farsiNum(totalItems)}
      </Text>

      <Text
        style={styles.pageNumber}
        render={({ pageNumber, totalPages }) =>
          `Page ${farsiNum(pageNumber)} of ${farsiNum(totalPages)}`
        }
        fixed
      />
    </Page>
  );
}

function MachineryChunkPage({
  chunk,
  companyName,
  offset,
  totalPages,
}: {
  chunk: MachineryReport[];
  companyName: string;
  offset: number;
  totalPages: number;
}) {
  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.title}>Contractors Financial Report</Text>
      <Text style={styles.subtitle}>{companyName}</Text>
      <View style={styles.divider} />

      {chunk.map((item) => (
        <MachineryBlock key={item.machineryId} item={item} />
      ))}

      <Text
        style={styles.pageNumber}
        render={({ pageNumber, totalPages: tp }) =>
          `Page ${farsiNum(pageNumber)} of ${farsiNum(tp)}`
        }
        fixed
      />
    </Page>
  );
}

export default function ContractorFinancialReportPDFDocument({
  data,
  companyName = "YakhshiLedger",
  dateFrom,
  dateTo,
}: Props) {
  if (data.length === 0) {
    const genDate = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    return (
      <Document title="Contractors Financial Report" author={companyName}>
        <Page size="A4" style={styles.page}>
          <Text style={styles.title}>Contractors Financial Report</Text>
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
          <Text style={styles.emptyState}>No machinery data found</Text>
          <Text
            style={styles.pageNumber}
            render={({ pageNumber, totalPages }) =>
              `Page ${farsiNum(pageNumber)} of ${farsiNum(totalPages)}`
            }
            fixed
          />
        </Page>
      </Document>
    );
  }

  const chunks: MachineryReport[][] = [];
  for (let i = 0; i < data.length; i += MACHINERY_PER_PAGE) {
    chunks.push(data.slice(i, i + MACHINERY_PER_PAGE));
  }

  return (
    <Document title="Contractors Financial Report" author={companyName}>
      <CoverPage companyName={companyName} dateFrom={dateFrom} dateTo={dateTo} totalItems={data.length} />
      {chunks.map((chunk, idx) => (
        <MachineryChunkPage
          key={idx}
          chunk={chunk}
          companyName={companyName}
          offset={idx}
          totalPages={chunks.length}
        />
      ))}
    </Document>
  );
}
