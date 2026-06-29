import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
  Image,
} from "@react-pdf/renderer";
import { format, addDays } from "date-fns";
import { formatShamsi, addShamsiDays, getShamsiMonthName, toShamsiYear, toShamsiMonth } from "@/lib/shamsi";
import type { Machinery, Contractor } from "@/types/contractor";

Font.register({
  family: "Vazirmatn",
  src: "/fonts/Vazirmatn-Regular.ttf",
});

export type TimesheetFormMode = "prefill" | "blank" | "hybrid";
export type TimesheetFormPeriod = "weekly" | "biweekly" | "monthly";
export type TimesheetFormMonthlyLayout = "single" | "multi";

interface MachineryTimesheetFormProps {
  machinery?: Machinery | null;
  contractor?: Contractor | null;
  companyName?: string;
  companyLogo?: string | null;
  companyAddress?: string | null;
  companyPhone?: string | null;
  companyEmail?: string | null;
  mode: TimesheetFormMode;
  period: TimesheetFormPeriod;
  monthlyLayout?: TimesheetFormMonthlyLayout;
  month?: string;
  autoFillDates?: boolean;
  startDate?: string;
  useShamsi?: boolean;
}

const PAGE_PADDING = 40;
const PAGE_WIDTH = 595;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_PADDING * 2;

const styles = StyleSheet.create({
  page: {
    padding: PAGE_PADDING,
    fontSize: 9,
    fontFamily: "Vazirmatn",
    color: "#1e293b",
  },
  letterheadContainer: {
    flexDirection: "row",
    marginBottom: 8,
    borderBottomWidth: 2,
    borderBottomColor: "#059669",
    paddingBottom: 6,
  },
  logoContainer: {
    width: 60,
    height: 60,
    marginRight: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  logo: {
    maxWidth: 60,
    maxHeight: 60,
    objectFit: "contain",
  },
  companyInfoContainer: {
    flex: 1,
    justifyContent: "center",
  },
  companyNameText: {
    fontSize: 16,
    color: "#059669",
    marginBottom: 1,
  },
  companyDetailText: {
    fontSize: 7,
    color: "#64748b",
    marginBottom: 1,
  },
  formTitle: {
    fontSize: 13,
    color: "#334155",
    textAlign: "center",
    marginBottom: 2,
  },
  formSubtitle: {
    fontSize: 8,
    color: "#64748b",
    textAlign: "center",
    marginBottom: 6,
  },
  headerSingleRow: {
    flexDirection: "row",
    marginBottom: 6,
    borderWidth: 0.5,
    borderColor: "#cbd5e1",
  },
  headerFieldBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 4,
    paddingVertical: 3,
    borderRightWidth: 0.5,
    borderRightColor: "#cbd5e1",
    minHeight: 20,
  },
  headerFieldBoxLast: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 4,
    paddingVertical: 3,
    minHeight: 20,
  },
  headerLabelSmall: {
    fontSize: 6,
    color: "#64748b",
    marginRight: 2,
    width: 44,
  },
  headerValueUnderline: {
    fontSize: 8,
    color: "#1e293b",
    borderBottomWidth: 1,
    borderBottomColor: "#94a3b8",
    flex: 1,
    paddingBottom: 1,
    minHeight: 12,
  },
  headerValueFilledSmall: {
    fontSize: 8,
    color: "#1e293b",
    flex: 1,
    paddingBottom: 1,
  },
  tableContainer: {
    width: CONTENT_WIDTH,
    marginTop: 2,
  },
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: "#059669",
    minHeight: 18,
    alignItems: "center",
  },
  tableHeaderCell: {
    paddingHorizontal: 1,
    paddingVertical: 2,
    color: "#ffffff",
    fontSize: 6,
    textAlign: "center",
    borderRightWidth: 0.5,
    borderRightColor: "#047857",
  },
  tableHeaderCellLast: {
    paddingHorizontal: 1,
    paddingVertical: 2,
    color: "#ffffff",
    fontSize: 6,
    textAlign: "center",
  },
  tableDataRow: {
    flexDirection: "row",
    minHeight: 22,
    borderBottomWidth: 0.5,
    borderBottomColor: "#94a3b8",
  },
  tableDataCell: {
    paddingHorizontal: 1,
    paddingVertical: 1,
    fontSize: 8,
    color: "#334155",
    textAlign: "center",
    minHeight: 20,
    justifyContent: "center",
    borderRightWidth: 0.5,
    borderRightColor: "#cbd5e1",
  },
  tableDataCellLast: {
    paddingHorizontal: 1,
    paddingVertical: 1,
    fontSize: 8,
    color: "#334155",
    textAlign: "center",
    minHeight: 20,
    justifyContent: "center",
  },
  totalRow: {
    flexDirection: "row",
    minHeight: 20,
    backgroundColor: "#f0fdf4",
    borderBottomWidth: 1,
    borderBottomColor: "#059669",
  },
  totalLabelCell: {
    paddingHorizontal: 1,
    fontSize: 8,
    color: "#059669",
    fontWeight: "bold",
    textAlign: "right",
    borderRightWidth: 0.5,
    borderRightColor: "#bbf7d0",
  },
  totalLabelCellEnd: {
    paddingHorizontal: 1,
    fontSize: 8,
    color: "#059669",
    fontWeight: "bold",
    textAlign: "right",
  },
  totalValueCell: {
    paddingHorizontal: 1,
    fontSize: 8,
    color: "#059669",
    fontWeight: "bold",
    textAlign: "center",
    borderBottomWidth: 0.5,
    borderBottomColor: "#94a3b8",
    borderRightWidth: 0.5,
    borderRightColor: "#bbf7d0",
  },
  totalValueCellLast: {
    paddingHorizontal: 1,
    fontSize: 8,
    color: "#059669",
    fontWeight: "bold",
    textAlign: "center",
    borderBottomWidth: 0.5,
    borderBottomColor: "#94a3b8",
  },
  footerContainer: {
    marginTop: 14,
  },
  signaturesContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  signatureField: {
    width: "45%",
  },
  signatureLabel: {
    fontSize: 7,
    color: "#64748b",
    marginBottom: 1,
  },
  signatureLine: {
    borderBottomWidth: 1,
    borderBottomColor: "#94a3b8",
    height: 20,
    marginBottom: 1,
  },
  remarksContainer: {
    marginTop: 6,
  },
  remarksLabel: {
    fontSize: 7,
    color: "#64748b",
    marginBottom: 2,
  },
  remarksLine: {
    borderBottomWidth: 0.5,
    borderBottomColor: "#cbd5e1",
    height: 14,
    marginBottom: 3,
  },
  pageNumberContainer: {
    position: "absolute",
    bottom: 18,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  pageNumberText: {
    fontSize: 7,
    color: "#94a3b8",
  },
  noLogoContainer: {
    width: 60,
    height: 60,
    marginRight: 10,
    backgroundColor: "#f1f5f9",
    borderRadius: 4,
    justifyContent: "center",
    alignItems: "center",
  },
  noLogoText: {
    fontSize: 7,
    color: "#94a3b8",
    textAlign: "center",
  },
});

const COLUMNS = {
  num: 18,
  date: 70,
  workSite: 68,
  startTime: 40,
  lunchStart: 40,
  lunchEnd: 40,
  endTime: 40,
  totalHours: 36,
  overtime: 32,
  notes: 71,
};

const MONTH_NAMES = [
  "", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function getMonthName(monthStr?: string, useShamsi?: boolean): string {
  if (!monthStr) return "_______________";
  const parts = monthStr.split("-");
  if (parts.length !== 2) return monthStr;
  if (useShamsi) {
    const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, 1);
    return `${getShamsiMonthName(toShamsiMonth(date))} ${toShamsiYear(date)}`;
  }
  const year = parts[0];
  const monthNum = parseInt(parts[1], 10);
  return `${MONTH_NAMES[monthNum] ?? ""} ${year}`;
}

function TimesheetTable({
  rowCount,
  autoFillDates,
  startDate,
  useShamsi,
}: {
  rowCount: number;
  autoFillDates?: boolean;
  startDate?: string;
  useShamsi?: boolean;
}) {
  const rows = Array.from({ length: rowCount }, (_, i) => i);

  const colKeys = Object.keys(COLUMNS) as (keyof typeof COLUMNS)[];
  const lastKey = colKeys[colKeys.length - 1];

  return (
    <View style={styles.tableContainer}>
      <View style={styles.tableHeaderRow}>
        {colKeys.map((key, ci) => {
          const isLast = ci === colKeys.length - 1;
          const labels: Record<string, string> = {
            num: "#", date: "Date", workSite: "Work Site",
            startTime: "Start", lunchStart: "Lunch Out", lunchEnd: "Lunch In",
            endTime: "End", totalHours: "Hours", overtime: "OT", notes: "Notes",
          };
          return (
            <Text
              key={key}
              style={[
                isLast ? styles.tableHeaderCellLast : styles.tableHeaderCell,
                { width: COLUMNS[key] },
              ]}
            >
              {labels[key]}
            </Text>
          );
        })}
      </View>
      {rows.map((i) => {
        const dateStr = autoFillDates && startDate
          ? useShamsi
            ? formatShamsi(addShamsiDays(new Date(startDate), i), "d MMM yyyy")
            : format(addDays(new Date(startDate), i), "MMM d, yyyy")
          : "";
        return (
          <View key={i} style={styles.tableDataRow}>
            {colKeys.map((key, ci) => {
              const isLast = ci === colKeys.length - 1;
              const val = key === "num" ? String(i + 1) : key === "date" ? dateStr : "";
              return (
                <Text
                  key={key}
                  style={[
                    isLast ? styles.tableDataCellLast : styles.tableDataCell,
                    { width: COLUMNS[key] },
                  ]}
                >
                  {val}
                </Text>
              );
            })}
          </View>
        );
      })}
      <View style={styles.totalRow}>
        {colKeys.map((key, ci) => {
          const isLast = ci === colKeys.length - 1;
          const isLabelArea = ci <= 2;
          if (isLabelArea) {
            return (
              <Text
                key={key}
                style={[
                  isLast && ci === 2 ? styles.totalLabelCellEnd : styles.totalLabelCell,
                  { width: COLUMNS[key] },
                ]}
              >
                {ci === 2 ? "Total:" : ""}
              </Text>
            );
          }
          const isHours = key === "totalHours";
          const isOT = key === "overtime";
          if (isHours || isOT) {
            return (
              <Text
                key={key}
                style={[
                  isLast ? styles.totalValueCellLast : styles.totalValueCell,
                  { width: COLUMNS[key] },
                ]}
              >
              </Text>
            );
          }
          return (
            <Text
              key={key}
              style={[
                isLast ? styles.tableDataCellLast : styles.tableDataCell,
                { width: COLUMNS[key] },
              ]}
            >
            </Text>
          );
        })}
      </View>
    </View>
  );
}

function FormPage({
  pageNumber,
  totalPages,
  rowCount,
  showLetterhead,
  companyName,
  companyLogo,
  companyAddress,
  companyPhone,
  companyEmail,
  machinery,
  contractor,
  mode,
  month,
  autoFillDates,
  startDate,
  useShamsi,
}: {
  pageNumber: number;
  totalPages: number;
  rowCount: number;
  showLetterhead: boolean;
  companyName: string;
  companyLogo?: string | null;
  companyAddress?: string | null;
  companyPhone?: string | null;
  companyEmail?: string | null;
  machinery?: Machinery | null;
  contractor?: Contractor | null;
  mode: TimesheetFormMode;
  month?: string;
  autoFillDates?: boolean;
  startDate?: string;
  useShamsi?: boolean;
}) {
  const isPrefill = mode === "prefill";
  const isHybrid = mode === "hybrid";

  return (
    <Page size="A4" style={styles.page}>
      {showLetterhead && (
        <View style={styles.letterheadContainer}>
          <View style={styles.logoContainer}>
            {companyLogo ? (
              <Image style={styles.logo} src={companyLogo} />
            ) : (
              <View style={styles.noLogoContainer}>
                <Text style={styles.noLogoText}>Logo</Text>
              </View>
            )}
          </View>
          <View style={styles.companyInfoContainer}>
            <Text style={styles.companyNameText}>{companyName || "Company Name"}</Text>
            {companyAddress && <Text style={styles.companyDetailText}>{companyAddress}</Text>}
            {(companyPhone || companyEmail) && (
              <Text style={styles.companyDetailText}>
                {[companyPhone, companyEmail].filter(Boolean).join("  |  ")}
              </Text>
            )}
          </View>
        </View>
      )}

      {!showLetterhead && (
        <View style={{ marginBottom: 8 }}>
          <Text style={{ fontSize: 14, color: "#059669", textAlign: "center" }}>
            {companyName || "Company Name"}
          </Text>
        </View>
      )}

      <Text style={styles.formTitle}>{useShamsi ? "تایم شیت ماشینری" : "Machinery Timesheet"}</Text>
      <Text style={styles.formSubtitle}>{getMonthName(month, useShamsi)}</Text>

      <View style={styles.headerSingleRow}>
        <View style={styles.headerFieldBox}>
          <Text style={styles.headerLabelSmall}>Contractor</Text>
          {isPrefill && contractor?.contractorName ? (
            <Text style={styles.headerValueFilledSmall}>{contractor.contractorName}</Text>
          ) : (
            <Text style={styles.headerValueUnderline}> </Text>
          )}
        </View>
        <View style={styles.headerFieldBox}>
          <Text style={styles.headerLabelSmall}>Machinery</Text>
          {isPrefill && machinery?.machineryName ? (
            <Text style={styles.headerValueFilledSmall}>{machinery.machineryName}</Text>
          ) : (
            <Text style={styles.headerValueUnderline}> </Text>
          )}
        </View>
        <View style={styles.headerFieldBox}>
          <Text style={styles.headerLabelSmall}>Driver</Text>
          {(isPrefill || isHybrid) && machinery?.driverName ? (
            <Text style={styles.headerValueFilledSmall}>{machinery.driverName}</Text>
          ) : (
            <Text style={styles.headerValueUnderline}> </Text>
          )}
        </View>
        <View style={styles.headerFieldBoxLast}>
          <Text style={styles.headerLabelSmall}>Plate #</Text>
          {(isPrefill || isHybrid) && machinery?.plateNumber ? (
            <Text style={styles.headerValueFilledSmall}>{machinery.plateNumber}</Text>
          ) : (
            <Text style={styles.headerValueUnderline}> </Text>
          )}
        </View>
      </View>

      <TimesheetTable
        rowCount={rowCount}
        autoFillDates={autoFillDates}
        startDate={startDate}
        useShamsi={useShamsi}
      />

      <View style={styles.footerContainer}>
        <View style={styles.signaturesContainer}>
          <View style={styles.signatureField}>
            <Text style={styles.signatureLabel}>Operator Signature</Text>
            <View style={styles.signatureLine} />
            <Text style={{ fontSize: 6, color: "#94a3b8" }}>Date: _______________</Text>
          </View>
          <View style={styles.signatureField}>
            <Text style={styles.signatureLabel}>Approved By</Text>
            <View style={styles.signatureLine} />
            <Text style={{ fontSize: 6, color: "#94a3b8" }}>Date: _______________</Text>
          </View>
        </View>
        <View style={styles.remarksContainer}>
          <Text style={styles.remarksLabel}>Remarks / Notes:</Text>
          <View style={styles.remarksLine} />
          <View style={styles.remarksLine} />
        </View>
      </View>

      <View style={styles.pageNumberContainer}>
        <Text style={styles.pageNumberText}>
          Page {pageNumber} of {totalPages}
        </Text>
      </View>
    </Page>
  );
}

function MachineryTimesheetForm({
  machinery,
  contractor,
  companyName = "YakhshiLedger",
  companyLogo,
  companyAddress,
  companyPhone,
  companyEmail,
  mode,
  period,
  monthlyLayout = "single",
  month,
  autoFillDates = false,
  startDate,
  useShamsi = false,
}: MachineryTimesheetFormProps) {
  const showLetterhead = true;

  const rowCounts: Record<string, number> = {
    weekly: 8,
    biweekly: 14,
    monthly: monthlyLayout === "single" ? 31 : 12,
  };

  let pages: { rows: number }[] = [];
  if (period === "monthly" && monthlyLayout === "multi") {
    const totalDays = 31;
    for (let i = 0; i < totalDays; i += 12) {
      pages.push({ rows: Math.min(12, totalDays - i) });
    }
  } else {
    pages = [{ rows: rowCounts[period] ?? 8 }];
  }

  return (
    <Document
      title={`Machinery Timesheet - ${machinery?.machineryName ?? month ?? ""}`}
      author={companyName}
      creator={companyName}
    >
      {pages.map((p, idx) => (
        <FormPage
          key={idx}
          pageNumber={idx + 1}
          totalPages={pages.length}
          rowCount={p.rows}
          showLetterhead={showLetterhead}
          companyName={companyName}
          companyLogo={companyLogo}
          companyAddress={companyAddress}
          companyPhone={companyPhone}
          companyEmail={companyEmail}
          machinery={machinery}
          contractor={contractor}
          mode={mode}
          month={month}
          autoFillDates={autoFillDates}
          startDate={autoFillDates && startDate ? startDate : undefined}
          useShamsi={useShamsi}
        />
      ))}
    </Document>
  );
}

export default MachineryTimesheetForm;
