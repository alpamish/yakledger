import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import { format } from "date-fns";
import type { Employee, Department } from "@/types/employee";
import {
  DEPARTMENT_LABELS,
  EMPLOYEE_STATUS_LABELS,
} from "@/types/employee";

Font.register({
  family: "Vazirmatn",
  src: "/fonts/Vazirmatn-Regular.ttf",
});

interface EmployeeListPDFDocumentProps {
  employees: Pick<Employee, 'id' | 'fullName' | 'jobTitle' | 'department' | 'salary' | 'status' | 'hireDate'>[];
  showSalary: boolean;
  companyName?: string;
  dateFrom?: string;
  dateTo?: string;
}

const formatCurrency = (amount: number) =>
  `AFN ${amount.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const formatDate = (dateStr: string) => {
  try {
    return format(new Date(dateStr), "MMM dd, yyyy");
  } catch {
    return dateStr;
  }
};

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "#059669",
  INACTIVE: "#dc2626",
  ON_LEAVE: "#d97706",
  TERMINATED: "#6b7280",
};

const DEPT_COLORS: Record<string, string> = {
  ADMINISTRATION: "#3b82f6",
  FINANCE: "#10b981",
  OPERATIONS: "#f59e0b",
  ENGINEERING: "#8b5cf6",
  LOGISTICS: "#ef4444",
  SECURITY: "#6366f1",
  MACHINERY_TEAM: "#f97316",
  LABOR: "#14b8a6",
};

const ROWS_PER_PAGE = 28;
const HEADER_ROWS_ESTIMATE = 5;
const GROUP_HEADER_COST = 3;

const styles = StyleSheet.create({
  page: {
    paddingTop: 30,
    paddingBottom: 50,
    paddingHorizontal: 35,
    fontSize: 8,
    fontFamily: "Vazirmatn",
    color: "#1e293b",
  },
  headerBlock: {
    marginBottom: 6,
    borderBottomWidth: 2,
    borderBottomColor: "#059669",
    paddingBottom: 8,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  companyName: {
    fontSize: 20,
    color: "#059669",
  },
  reportTitle: {
    fontSize: 11,
    color: "#475569",
    marginTop: 1,
  },
  headerRight: {
    alignItems: "flex-end",
  },
  generatedDate: {
    fontSize: 7,
    color: "#94a3b8",
  },
  filterLabel: {
    fontSize: 7,
    color: "#94a3b8",
    marginTop: 1,
  },

  statsRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 12,
    marginTop: 4,
  },
  statCard: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  statCardGreen: {
    borderLeftWidth: 3,
    borderLeftColor: "#059669",
  },
  statCardBlue: {
    borderLeftWidth: 3,
    borderLeftColor: "#3b82f6",
  },
  statCardRed: {
    borderLeftWidth: 3,
    borderLeftColor: "#ef4444",
  },
  statLabel: {
    fontSize: 6,
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  statValue: {
    fontSize: 11,
    color: "#1e293b",
    marginTop: 1,
  },

  deptHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 2,
  },
  deptDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  deptName: {
    fontSize: 9,
    fontWeight: "bold",
    color: "#1e293b",
    flex: 1,
  },
  deptCount: {
    fontSize: 7,
    color: "#64748b",
  },

  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#cbd5e1",
    paddingVertical: 3,
    marginBottom: 1,
  },
  tableHeaderCell: {
    fontSize: 6.5,
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.3,
    paddingHorizontal: 3,
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 3.5,
    borderBottomWidth: 0.5,
    borderBottomColor: "#f1f5f9",
  },
  tableCell: {
    fontSize: 7.5,
    color: "#334155",
    paddingHorizontal: 3,
  },
  nameCell: {
    fontSize: 7.5,
    color: "#1e293b",
    paddingHorizontal: 3,
  },
  statusBadge: {
    fontSize: 6,
    fontWeight: "bold",
    paddingHorizontal: 4,
    paddingVertical: 1.5,
    textAlign: "center",
  },
  zeroSalary: {
    fontSize: 7.5,
    color: "#94a3b8",
    paddingHorizontal: 3,
  },

  footer: {
    position: "absolute",
    bottom: 18,
    left: 35,
    right: 35,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 0.5,
    borderTopColor: "#e2e8f0",
    paddingTop: 4,
  },
  footerText: {
    fontSize: 6.5,
    color: "#94a3b8",
  },

  noData: {
    fontSize: 10,
    color: "#94a3b8",
    textAlign: "center",
    paddingVertical: 60,
  },

});

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? "#78716c";
  return (
    <Text
      style={[
        styles.statusBadge,
        { backgroundColor: `${color}18`, color },
      ]}
    >
      {EMPLOYEE_STATUS_LABELS[status as keyof typeof EMPLOYEE_STATUS_LABELS] ?? status}
    </Text>
  );
}

function EmployeeListPDFDocument({
  employees: rawEmployees,
  showSalary,
  companyName = "YakhshiLedger",
  dateFrom,
  dateTo,
}: EmployeeListPDFDocumentProps) {
  const employees = (Array.isArray(rawEmployees) ? rawEmployees : []).filter(
    (e): e is EmployeeListPDFDocumentProps['employees'][number] => Boolean(e && e.id)
  );
  const generatedDate = format(new Date(), "MMMM d, yyyy, HH:mm");
  const title = showSalary
    ? "Employee Roster — Salary Included"
    : "Employee Roster";

  const activeCount = employees.filter((e) => e.status === "ACTIVE").length;

  const deptOrder = [
    "ADMINISTRATION",
    "FINANCE",
    "OPERATIONS",
    "ENGINEERING",
    "LOGISTICS",
    "SECURITY",
    "MACHINERY_TEAM",
    "LABOR",
    "KITCHEN",
  ] as const;

  const grouped = deptOrder
    .map((dept) => ({
      department: dept,
      employees: employees.filter((e) => e.department === dept),
    }))
    .filter((g) => g.employees.length > 0);

  const buildPages = () => {
    interface Slice {
      department: string;
      employees: typeof employees;
      startIdx: number;
    }

    const slices: Slice[] = [];
    let globalIdx = 0;

    for (const group of grouped) {
      const { department, employees: emps } = group;
      for (let i = 0; i < emps.length; i++) {
        slices.push({
          department,
          employees: [emps[i]],
          startIdx: globalIdx++,
        });
      }
    }

    const col = showSalary
      ? { idx: "5%", name: "25%", job: "20%", salary: "15%", date: "17%", status: "18%" }
      : { idx: "5%", name: "30%", job: "25%", salary: "0%", date: "20%", status: "20%" };

    const renderSlice = (slice: Slice) => {
      const emp = slice.employees[0];
      return (
        <View key={`${slice.department}-${emp.id}`} style={[styles.tableRow, { backgroundColor: slice.startIdx % 2 === 0 ? "#f8fafc" : "#ffffff" }]}>
          <Text style={[styles.tableCell, { width: col.idx, color: "#94a3b8" }]}>
            {slice.startIdx + 1}
          </Text>
          <Text style={[styles.nameCell, { width: col.name }]}>{emp.fullName}</Text>
          <Text style={[styles.tableCell, { width: col.job }]}>{emp.jobTitle}</Text>
          {showSalary ? (
            emp.salary > 0 ? (
              <Text style={[styles.tableCell, { width: col.salary, textAlign: "right" }]}>
                {formatCurrency(emp.salary)}
              </Text>
            ) : (
              <Text style={[styles.zeroSalary, { width: col.salary, textAlign: "right" }]}>—</Text>
            )
          ) : null}
          <Text style={[styles.tableCell, { width: col.date }]}>
            {emp.hireDate ? formatDate(emp.hireDate) : "—"}
          </Text>
          <View style={[styles.tableCell, { width: col.status, flexDirection: "row", alignItems: "center" }]}>
            <StatusBadge status={emp.status} />
          </View>
        </View>
      );
    };

    const renderPageContent = (pageSlices: Slice[], firstDept: string) => {
      const result: React.ReactElement[] = [];
      let lastDept = firstDept;

      for (const slice of pageSlices) {
        if (slice.department !== lastDept) {
          const deptColor = DEPT_COLORS[slice.department] ?? "#78716c";
          const deptLabel = DEPARTMENT_LABELS[slice.department as Department] ?? slice.department;
          const deptEmps = grouped.find((g) => g.department === slice.department)!.employees;
          const deptSalary = deptEmps.reduce((s, e) => s + e.salary, 0);

          result.push(
            <View key={`hdr-${slice.department}`} style={[styles.deptHeader, { backgroundColor: `${deptColor}0d`, marginTop: result.length > 0 ? 6 : 0 }]} wrap={false}>
              <View style={[styles.deptDot, { backgroundColor: deptColor }]} />
              <Text style={styles.deptName}>{deptLabel}</Text>
              <Text style={styles.deptCount}>
                {deptEmps.length} employee{deptEmps.length !== 1 ? "s" : ""}
                {showSalary ? ` — ${formatCurrency(deptSalary)}` : ""}
              </Text>
            </View>,
          );

          result.push(
            <View key={`tblhdr-${slice.department}`} style={styles.tableHeader}>
              <Text style={[styles.tableHeaderCell, { width: col.idx }]}>#</Text>
              <Text style={[styles.tableHeaderCell, { width: col.name }]}>Name</Text>
              <Text style={[styles.tableHeaderCell, { width: col.job }]}>Job Title</Text>
              {showSalary && (
                <Text style={[styles.tableHeaderCell, { width: col.salary, textAlign: "right" }]}>Salary</Text>
              )}
              <Text style={[styles.tableHeaderCell, { width: col.date }]}>Hire Date</Text>
              <Text style={[styles.tableHeaderCell, { width: col.status }]}>Status</Text>
            </View>,
          );

          lastDept = slice.department;
        }

        result.push(renderSlice(slice));
      }

      return { elements: result, lastDept };
    };

    // --- Two-pass pagination ---

    // First pass: determine page boundaries
    const pageBoundaries: { count: number; firstDept: string; lastDept: string }[] = [];
    let remainingSlices = [...slices];
    let globalLastDept = "";

    while (remainingSlices.length > 0) {
      const isFirstPage = pageBoundaries.length === 0;
      const maxCost = isFirstPage ? ROWS_PER_PAGE - HEADER_ROWS_ESTIMATE : ROWS_PER_PAGE;

      let consumed = 0;
      let used = 0;
      let pageLastDept = globalLastDept;

      for (const slice of remainingSlices) {
        const isNewDept = slice.department !== pageLastDept;
        const cost = isNewDept ? GROUP_HEADER_COST : 1;

        if (used + cost > maxCost) break;

        used += cost;
        consumed++;
        pageLastDept = slice.department;
      }

      if (consumed === 0) {
        consumed = Math.min(1, remainingSlices.length);
        pageLastDept = remainingSlices[0].department;
      }

      const firstDept = globalLastDept;
      pageBoundaries.push({ count: consumed, firstDept, lastDept: pageLastDept });
      globalLastDept = pageLastDept;
      remainingSlices = remainingSlices.slice(consumed);
    }

    const totalPages = pageBoundaries.length;

    // Second pass: render with known total pages
    remainingSlices = [...slices];

    return pageBoundaries.map((boundary, idx) => {
      const pageSlices = remainingSlices.slice(0, boundary.count);
      remainingSlices = remainingSlices.slice(boundary.count);
      const { elements } = renderPageContent(pageSlices, boundary.firstDept);

      return (
        <Page key={`page-${idx}`} size="A4" style={styles.page}>
            {idx === 0 ? (
              <View>
                <View style={styles.headerBlock}>
                  <View style={styles.headerRow}>
                    <View>
                      <Text style={styles.companyName}>{companyName}</Text>
                      <Text style={styles.reportTitle}>{title}</Text>
                    </View>
                    <View style={styles.headerRight}>
                      <Text style={styles.generatedDate}>Generated: {generatedDate}</Text>
                      {dateFrom || dateTo ? (
                        <Text style={styles.filterLabel}>
                          Filter: {dateFrom || "∞"} — {dateTo || "∞"}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                </View>

                <View style={styles.statsRow}>
                  <View style={[styles.statCard, styles.statCardGreen]}>
                    <Text style={styles.statLabel}>Total</Text>
                    <Text style={styles.statValue}>{employees.length}</Text>
                  </View>
                  <View style={[styles.statCard, styles.statCardGreen]}>
                    <Text style={styles.statLabel}>Active</Text>
                    <Text style={styles.statValue}>{activeCount}</Text>
                  </View>
                  <View style={[styles.statCard, styles.statCardBlue]}>
                    <Text style={styles.statLabel}>Departments</Text>
                    <Text style={styles.statValue}>{grouped.length}</Text>
                  </View>

                </View>
              </View>
            ) : null}

          {elements}

          <View style={styles.footer}>
            <Text style={styles.footerText}>{companyName}</Text>
            <Text style={styles.footerText}>Page {idx + 1} of {totalPages}</Text>
            <Text style={styles.footerText}>{generatedDate}</Text>
          </View>
        </Page>
      );
    });
  };

  return (
    <Document title={title} author={companyName} creator={companyName}>
      {employees.length === 0 ? (
        <Page size="A4" style={styles.page}>
          <View style={styles.headerBlock}>
            <Text style={styles.companyName}>{companyName}</Text>
            <Text style={styles.reportTitle}>{title}</Text>
          </View>
          <Text style={styles.noData}>No employees found</Text>
        </Page>
      ) : (
        buildPages().filter(Boolean)
      )}
    </Document>
  );
}

export default EmployeeListPDFDocument;
export { EmployeeListPDFDocument };
