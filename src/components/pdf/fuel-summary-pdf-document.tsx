import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import { format } from "date-fns";
import { formatShamsi } from "@/lib/shamsi";
import type { FuelFinancialSummary, FuelMachineryCategorySummary } from "@/types/asset";

Font.register({
  family: "Vazirmatn",
  src: "/fonts/Vazirmatn-Regular.ttf",
});

interface FuelSummaryPDFDocumentProps {
  data: FuelFinancialSummary;
  generatedAt: Date;
  companyName?: string;
}

const formatCurrency = (amount: number) =>
  `${amount.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} افغانی`;

const styles = StyleSheet.create({
  pageLandscape: {
    padding: 40,
    fontSize: 9,
    fontFamily: "Vazirmatn",
    color: "#1e293b",
    direction: "rtl",
  },
  pagePortrait: {
    padding: 40,
    fontSize: 9,
    fontFamily: "Vazirmatn",
    color: "#1e293b",
    direction: "rtl",
  },
  companyName: {
    fontSize: 22,
    color: "#059669",
    marginBottom: 2,
    textAlign: "right",
  },
  reportTitle: {
    fontSize: 14,
    color: "#334155",
    marginBottom: 4,
    textAlign: "right",
  },
  generatedDate: {
    fontSize: 9,
    color: "#64748b",
    marginBottom: 10,
    textAlign: "right",
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
    textAlign: "right",
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
    textAlign: "right",
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#059669",
    textAlign: "right",
  },
  summarySubValue: {
    fontSize: 8,
    color: "#334155",
    marginTop: 2,
    textAlign: "right",
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
    textAlign: "right",
  },
  machinerySubtext: {
    fontSize: 8,
    color: "#64748b",
    marginBottom: 4,
    textAlign: "right",
  },
  machineryStats: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 6,
    justifyContent: "flex-end",
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
  catCellName: { width: "25%", padding: 4, textAlign: "right" },
  catCellCount: { width: "25%", padding: 4, textAlign: "center" },
  catCellQty: { width: "25%", padding: 4, textAlign: "right" },
  catCellCost: { width: "25%", padding: 4, textAlign: "right" },
  dailyColDate: { width: "15%", padding: 4, textAlign: "right" },
  dailyColShamsi: { width: "15%", padding: 4, textAlign: "right" },
  dailyColQty: { width: "13%", padding: 4, textAlign: "right" },
  dailyColCost: { width: "18%", padding: 4, textAlign: "right" },
  dailyColNotes: { width: "39%", padding: 4, textAlign: "right" },
});

function MachineryCategoryTable({ categories }: { categories: FuelMachineryCategorySummary[] }) {
  if (categories.length === 0) {
    return <Text style={styles.emptyText}>هیچ ماشین آلاتی ثبت نشده است</Text>;
  }

  return (
    <View style={styles.table}>
      <View style={styles.tableHeader}>
        <Text style={styles.catCellName}>نوع ماشین آلات</Text>
        <Text style={styles.catCellCount}>تعداد</Text>
        <Text style={styles.catCellQty}>مقدار (L)</Text>
        <Text style={styles.catCellCost}>هزینه کل</Text>
      </View>
      {categories.map((cat, idx) => (
        <View key={cat.machineryType} style={idx % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
          <Text style={styles.catCellName}>{cat.machineryType}</Text>
          <Text style={styles.catCellCount}>{cat.machineryCount}</Text>
          <Text style={styles.catCellQty}>{cat.totalQty.toFixed(1)} L</Text>
          <Text style={styles.catCellCost}>{formatCurrency(cat.totalCost)}</Text>
        </View>
      ))}
      {categories.length > 0 && (
        <View style={[styles.tableRow, { backgroundColor: "#f0fdf4" }]}>
          <Text style={[styles.catCellName, { fontWeight: "bold", color: "#059669" }]}>مجموع</Text>
          <Text style={[styles.catCellCount, { fontWeight: "bold", color: "#059669" }]}>
            {categories.reduce((s, c) => s + c.machineryCount, 0)}
          </Text>
          <Text style={[styles.catCellQty, { fontWeight: "bold", color: "#059669" }]}>
            {categories.reduce((s, c) => s + c.totalQty, 0).toFixed(1)} L
          </Text>
          <Text style={[styles.catCellCost, { fontWeight: "bold", color: "#059669" }]}>
            {formatCurrency(categories.reduce((s, c) => s + c.totalCost, 0))}
          </Text>
        </View>
      )}
    </View>
  );
}

function DailyFuelUsageTable({ data }: { data: FuelFinancialSummary }) {
  if (!data.allTransactions || data.allTransactions.length === 0) {
    return <Text style={styles.emptyText}>هیچ مصرفی ثبت نشده است</Text>;
  }

  const issues = data.allTransactions.filter((t) => t.type === "ISSUE");
  if (issues.length === 0) {
    return <Text style={styles.emptyText}>هیچ مصرفی ثبت نشده است</Text>;
  }

  const dailyMap: Record<string, { qty: number; cost: number; notes: Set<string> }> = {};
  for (const issue of issues) {
    const dateKey = format(new Date(issue.date), "yyyy-MM-dd");
    if (!dailyMap[dateKey]) dailyMap[dateKey] = { qty: 0, cost: 0, notes: new Set() };
    dailyMap[dateKey].qty += issue.quantity;
    dailyMap[dateKey].cost += issue.totalCost || issue.quantity * data.avgUnitPrice;
    if (issue.notes) dailyMap[dateKey].notes.add(issue.notes);
  }

  const dailyEntries = Object.entries(dailyMap)
    .map(([dateKey, v]) => ({
      dateKey,
      qty: v.qty,
      cost: v.cost,
      notes: Array.from(v.notes).join(" | "),
    }))
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey));

  const totalQty = dailyEntries.reduce((s, d) => s + d.qty, 0);
  const totalCost = dailyEntries.reduce((s, d) => s + d.cost, 0);

  return (
    <View style={styles.table}>
      <View style={styles.tableHeader}>
        <Text style={styles.dailyColDate}>تاریخ میلادی</Text>
        <Text style={styles.dailyColShamsi}>تاریخ شمسی</Text>
        <Text style={styles.dailyColQty}>مقدار (L)</Text>
        <Text style={styles.dailyColCost}>هزینه</Text>
        <Text style={styles.dailyColNotes}>ملاحظات</Text>
      </View>
      {dailyEntries.map((entry, idx) => (
        <View key={entry.dateKey} style={idx % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
          <Text style={styles.dailyColDate}>{entry.dateKey}</Text>
          <Text style={styles.dailyColShamsi}>
            {formatShamsi(new Date(entry.dateKey), "yyyy/MM/dd")}
          </Text>
          <Text style={styles.dailyColQty}>{entry.qty.toFixed(1)} L</Text>
          <Text style={styles.dailyColCost}>{formatCurrency(entry.cost)}</Text>
          <Text style={styles.dailyColNotes}>{entry.notes || "—"}</Text>
        </View>
      ))}
      <View style={[styles.tableRow, { backgroundColor: "#f0fdf4" }]}>
        <Text style={[styles.dailyColDate, { fontWeight: "bold", color: "#059669" }]}>مجموع</Text>
        <Text style={[styles.dailyColShamsi, { fontWeight: "bold", color: "#059669" }]} />
        <Text style={[styles.dailyColQty, { fontWeight: "bold", color: "#059669" }]}>
          {totalQty.toFixed(1)} L
        </Text>
        <Text style={[styles.dailyColCost, { fontWeight: "bold", color: "#059669" }]}>
          {formatCurrency(totalCost)}
        </Text>
        <Text style={[styles.dailyColNotes, { fontWeight: "bold", color: "#059669" }]} />
      </View>
    </View>
  );
}

function FirstPage({
  companyName,
  generatedAt,
  data,
}: {
  companyName: string;
  generatedAt: Date;
  data: FuelFinancialSummary;
}) {
  return (
    <Page size="A4" orientation="landscape" style={styles.pageLandscape}>
      <Text style={styles.companyName}>{companyName}</Text>
      <Text style={styles.reportTitle}>گزارش خلاصه موجودی سوخت</Text>
      <Text style={styles.generatedDate}>
        تاریخ تهیه: {format(generatedAt, "MMM dd, yyyy HH:mm")}
      </Text>
      <View style={styles.headerDivider} />

      <Text style={styles.sectionTitle}>خلاصه مالی</Text>
      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>مجموع خریداری شده</Text>
          <Text style={styles.summaryValue}>{data.totalPurchasedQty.toFixed(1)} L</Text>
          <Text style={styles.summarySubValue}>{formatCurrency(data.totalPurchasedCost)}</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>مجموع تحویل داده شده</Text>
          <Text style={styles.summaryValue}>{data.totalIssuedQty.toFixed(1)} L</Text>
          <Text style={styles.summarySubValue}>{formatCurrency(data.totalIssuedCost)}</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>باقی مانده</Text>
          <Text style={styles.summaryValue}>{data.remainingQty.toFixed(1)} L</Text>
          <Text style={styles.summarySubValue}>{formatCurrency(data.remainingValue)}</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>قیمت متوسط فی لتر</Text>
          <Text style={styles.summaryValue}>{formatCurrency(data.avgUnitPrice)}</Text>
          <Text style={styles.summarySubValue}>فی لتر</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>مصرف سوخت بر اساس نوع ماشین آلات</Text>
      <MachineryCategoryTable categories={data.byMachineryCategory} />

      <Text style={styles.sectionTitle}>مصرف روزانه سوخت</Text>
      <DailyFuelUsageTable data={data} />

      <Text style={styles.footer}>
        {companyName} — گزارش خلاصه سوخت — صفحه 1
      </Text>
    </Page>
  );
}

function MachineryPages({
  companyName,
  data,
}: {
  companyName: string;
  data: FuelFinancialSummary;
}) {
  const machineryList = [...(data.byMachinery || [])].sort((a, b) =>
    a.machineryName.localeCompare(b.machineryName)
  );

  if (machineryList.length === 0) {
    return null;
  }

  const itemsPerPage = 12;
  const chunks: typeof machineryList[] = [];
  for (let i = 0; i < machineryList.length; i += itemsPerPage) {
    chunks.push(machineryList.slice(i, i + itemsPerPage));
  }

  return (
    <>
      {chunks.map((chunk, pageIdx) => (
        <Page key={pageIdx} size="A4" style={styles.pagePortrait}>
          <Text style={styles.companyName}>{companyName}</Text>
          <Text style={styles.reportTitle}>مصرف سوخت بر اساس ماشین آلات</Text>
          <View style={styles.headerDivider} />

          {chunk.map((m) => (
            <View key={m.machineryId} style={styles.machinerySection}>
              <Text style={styles.machineryHeader}>
                {m.machineryName}
                {m.plateNumber ? ` (${m.plateNumber})` : ""}
              </Text>
              <Text style={styles.machinerySubtext}>
                پیمانکار: {m.contractorName} | نوع: {m.machineryType}
              </Text>
              <View style={styles.machineryStats}>
                <Text style={styles.machineryStat}>
                  مقدار کل: <Text style={{ fontWeight: "bold" }}>{m.totalQty.toFixed(1)} L</Text>
                </Text>
                <Text style={styles.machineryStat}>
                  هزینه کل: <Text style={{ fontWeight: "bold" }}>{formatCurrency(m.totalCost)}</Text>
                </Text>
                <Text style={styles.machineryStat}>
                  تعداد: <Text style={{ fontWeight: "bold" }}>{m.issues.length}</Text>
                </Text>
              </View>
            </View>
          ))}

          <Text style={styles.footer}>
            {companyName} — گزارش خلاصه سوخت — صفحه {pageIdx + 2}
          </Text>
        </Page>
      ))}
    </>
  );
}

function FuelSummaryPDFDocument({
  data,
  generatedAt,
  companyName = "YakhshiLedger",
}: FuelSummaryPDFDocumentProps) {
  return (
    <Document title="گزارش خلاصه سوخت" author={companyName}>
      <FirstPage companyName={companyName} generatedAt={generatedAt} data={data} />
      <MachineryPages companyName={companyName} data={data} />
    </Document>
  );
}

export default FuelSummaryPDFDocument;
