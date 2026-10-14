// Shared layout primitives for the Phase 6 contractor finance reports.
// Mirrors the visual language of the existing contractor PDFs (emerald header
// rows, zebra striping, summary cards, absolute footer) so the statement and
// the five portfolio reports render consistently.
import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "@react-pdf/renderer";

/** AFN money, always server-rounded; PDFs never do arithmetic. */
export function formatMoney(amount: number): string {
  return `AFN ${Math.round(amount).toLocaleString("en-US")}`;
}

/** Signed statement amount: "+AFN 500" / "-AFN 250" / "AFN 0". */
export function formatSigned(amount: number): string {
  const rounded = Math.round(amount);
  if (rounded === 0) return "AFN 0";
  return `${rounded > 0 ? "+" : "-"}AFN ${Math.abs(rounded).toLocaleString("en-US")}`;
}

export function windowLabel(from?: string | null, to?: string | null): string {
  const f = from ? from.slice(0, 10) : "…";
  const t = to ? to.slice(0, 10) : "…";
  return `${f} → ${t}`;
}

export const reportStyles = StyleSheet.create({
  page: {
    padding: 35,
    fontSize: 8,
    color: "#1e293b",
  },
  title: {
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 2,
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
    marginBottom: 6,
  },
  divider: {
    height: 1,
    backgroundColor: "#374151",
    marginBottom: 8,
  },
  summaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
    marginBottom: 10,
  },
  summaryCard: {
    width: "31%",
    padding: 6,
    borderWidth: 1,
    borderColor: "#059669",
    borderRadius: 3,
  },
  summaryLabel: {
    fontSize: 6,
    color: "#059669",
    textTransform: "uppercase",
    marginBottom: 1,
  },
  summaryValue: {
    fontSize: 8,
    color: "#059669",
  },
  summaryValueDanger: {
    fontSize: 8,
    color: "#dc2626",
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#059669",
    marginBottom: 4,
    marginTop: 2,
  },
  tableContainer: {
    width: "100%",
    marginBottom: 8,
  },
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: "#059669",
    minHeight: 18,
    alignItems: "center",
  },
  tableHeaderCell: {
    paddingHorizontal: 2,
    paddingVertical: 3,
    color: "#ffffff",
    fontSize: 6,
  },
  tableDataRow: {
    flexDirection: "row",
    minHeight: 16,
    alignItems: "center",
    borderBottomWidth: 0.5,
    borderBottomColor: "#e2e8f0",
  },
  tableDataCell: {
    paddingHorizontal: 2,
    paddingVertical: 2,
    fontSize: 6.5,
    color: "#334155",
  },
  totalsRow: {
    flexDirection: "row",
    minHeight: 18,
    alignItems: "center",
    backgroundColor: "#ecfdf5",
    borderTopWidth: 1,
    borderTopColor: "#059669",
  },
  totalsCell: {
    paddingHorizontal: 2,
    paddingVertical: 3,
    fontSize: 6.5,
    fontWeight: "bold",
    color: "#065f46",
  },
  noData: {
    fontSize: 8,
    color: "#94a3b8",
    textAlign: "center",
    paddingVertical: 20,
  },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 35,
  },
  footerText: {
    fontSize: 6,
    color: "#94a3b8",
  },
});

export interface ReportColumn {
  label: string;
  width: string;
  align?: "left" | "right" | "center";
}

const alignStyle = (align?: "left" | "right" | "center") =>
  align === "right" ? { textAlign: "right" as const } : align === "center" ? { textAlign: "center" as const } : {};

/** Title block shared by every report document. */
export function ReportHeader({
  title,
  companyName,
  window: win,
  asOf,
}: {
  title: string;
  companyName?: string;
  window?: string;
  asOf?: string;
}) {
  return (
    <View>
      <Text style={reportStyles.title}>{title}</Text>
      <Text style={reportStyles.subtitle}>{companyName ?? "YakhshiLedger"}</Text>
      <Text style={reportStyles.filterInfo}>
        {win ? `Period: ${win}` : null}
        {win && asOf ? "   |   " : null}
        {asOf ? `As of: ${asOf}` : null}
      </Text>
      <View style={reportStyles.divider} />
    </View>
  );
}

export function SummaryCards({
  items,
}: {
  items: { label: string; value: string; danger?: boolean }[];
}) {
  return (
    <View style={reportStyles.summaryRow}>
      {items.map((it, i) => (
        <View key={i} style={reportStyles.summaryCard}>
          <Text style={reportStyles.summaryLabel}>{it.label}</Text>
          <Text style={it.danger ? reportStyles.summaryValueDanger : reportStyles.summaryValue}>
            {it.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

/**
 * Generic zebra table. `rows` are plain cell arrays (one per row), `totals`
 * is an optional bold bottom row of column-aligned aggregates.
 */
export function ReportTable({
  columns,
  rows,
  totals,
}: {
  columns: ReportColumn[];
  rows: ReactNode[][];
  totals?: ReactNode[];
}) {
  if (rows.length === 0) {
    return <Text style={reportStyles.noData}>No data for the selected period.</Text>;
  }
  return (
    <View style={reportStyles.tableContainer}>
      <View style={reportStyles.tableHeaderRow} fixed>
        {columns.map((c, i) => (
          <Text key={i} style={[reportStyles.tableHeaderCell, { width: c.width }, alignStyle(c.align)]}>
            {c.label}
          </Text>
        ))}
      </View>
      {rows.map((cells, ri) => (
        <View
          key={ri}
          style={[reportStyles.tableDataRow, { backgroundColor: ri % 2 === 0 ? "#f8fafc" : "#ffffff" }]}
        >
          {cells.map((cell, ci) => (
            <Text key={ci} style={[reportStyles.tableDataCell, { width: columns[ci]?.width }, alignStyle(columns[ci]?.align)]}>
              {cell}
            </Text>
          ))}
        </View>
      ))}
      {totals && (
        <View style={reportStyles.totalsRow}>
          {totals.map((cell, ci) => (
            <Text key={ci} style={[reportStyles.totalsCell, { width: columns[ci]?.width }, alignStyle(columns[ci]?.align)]}>
              {cell}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

export function ReportFooter({ companyName }: { companyName?: string }) {
  return (
    <View style={reportStyles.footer} fixed>
      <Text style={reportStyles.footerText}>{companyName ?? "YakhshiLedger"}</Text>
      <Text style={reportStyles.footerText} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
      <Text style={reportStyles.footerText}>
        Generated {new Date().toISOString().slice(0, 10)}
      </Text>
    </View>
  );
}
