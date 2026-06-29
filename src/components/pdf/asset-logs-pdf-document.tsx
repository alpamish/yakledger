import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import { format } from "date-fns";
import type { AssetLog } from "@/types/asset";
import { LOG_STATUS_LABELS } from "@/types/asset";

Font.register({
  family: "Vazirmatn",
  src: "/fonts/Vazirmatn-Regular.ttf",
});

interface AssetLogsPDFDocumentProps {
  logs: AssetLog[];
  stats: {
    totalLogs: number;
    totalDistance: number;
    totalFuelConsumed: number;
    totalEngineHours: number;
  } | null;
  filters?: {
    assetId?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
  };
  generatedAt: Date;
}

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 9,
    fontFamily: "Vazirmatn",
    color: "#1e293b",
  },
  companyName: {
    fontSize: 22,
    color: "#059669",
    marginBottom: 2,
  },
  reportTitle: {
    fontSize: 14,
    color: "#334155",
    marginBottom: 4,
  },
  generatedDate: {
    fontSize: 9,
    color: "#64748b",
    marginBottom: 10,
  },
  headerDivider: {
    height: 1,
    backgroundColor: "#059669",
    marginBottom: 10,
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
    fontSize: 8,
    color: "#64748b",
    marginBottom: 2,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#059669",
  },
  filterRow: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 12,
    padding: 8,
    backgroundColor: "#f1f5f9",
    borderRadius: 3,
  },
  filterLabel: {
    fontSize: 8,
    color: "#64748b",
    fontWeight: "bold",
  },
  filterValue: {
    fontSize: 8,
    color: "#334155",
  },
  sectionTitle: {
    fontSize: 12,
    color: "#059669",
    marginBottom: 8,
    marginTop: 12,
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
    fontSize: 8,
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
  cellDate: { width: "14%", padding: 5 },
  cellAsset: { width: "18%", padding: 5 },
  cellOperator: { width: "15%", padding: 5 },
  cellDistance: { width: "10%", padding: 5, textAlign: "right" },
  cellFuel: { width: "9%", padding: 5, textAlign: "right" },
  cellSite: { width: "14%", padding: 5 },
  cellStatus: { width: "8%", padding: 5 },
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
  assetDetailPage: {
    padding: 40,
    fontSize: 9,
    fontFamily: "Vazirmatn",
    color: "#1e293b",
  },
  assetTitle: {
    fontSize: 14,
    color: "#059669",
    marginBottom: 10,
    fontWeight: "bold",
  },
  assetSubtitle: {
    fontSize: 10,
    color: "#64748b",
    marginBottom: 12,
  },
  assetLogTable: {
    width: "100%",
    borderStyle: "solid",
    borderWidth: 1,
    borderColor: "#d1d5db",
    marginTop: 4,
  },
  assetLogTableHeader: {
    flexDirection: "row",
    backgroundColor: "#059669",
    color: "white",
    fontSize: 8,
    fontWeight: "bold",
  },
  assetLogTableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  assetLogTableRowAlt: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    backgroundColor: "#f9fafb",
  },
  cellLogDate: { width: "11%", padding: 5 },
  cellLogTime: { width: "12%", padding: 5 },
  cellLogOperator: { width: "14%", padding: 5 },
  cellLogDistance: { width: "9%", padding: 5, textAlign: "right" },
  cellLogEngineHrs: { width: "9%", padding: 5, textAlign: "right" },
  cellLogFuel: { width: "8%", padding: 5, textAlign: "right" },
  cellLogWorkSite: { width: "12%", padding: 5 },
  cellLogProject: { width: "9%", padding: 5 },
  cellLogConditions: { width: "8%", padding: 5 },
  cellLogIssues: { width: "8%", padding: 5 },
  cellLogRemarks: { width: "10%", padding: 5 },
  cellLogStatus: { width: "8%", padding: 5 },
  logStatsContainer: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 12,
  },
  logStatItem: {
    flex: 1,
    padding: 8,
    borderWidth: 1,
    borderColor: "#059669",
    borderRadius: 3,
  },
  logStatLabel: {
    fontSize: 8,
    color: "#64748b",
    marginBottom: 2,
  },
  logStatValue: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#059669",
  },
});

const statusColorMap: Record<string, { bg: string; text: string }> = {
  PENDING: { bg: "#fef3c7", text: "#92400e" },
  APPROVED: { bg: "#d1fae5", text: "#065f46" },
  REJECTED: { bg: "#fee2e2", text: "#991b1b" },
};

function AssetLogsPDFDocument({
  logs: rawLogs,
  stats,
  filters,
  generatedAt,
}: AssetLogsPDFDocumentProps) {
  const logs = (Array.isArray(rawLogs) ? rawLogs : []).filter(
    (l): l is AssetLog => Boolean(l && l.id)
  );
  const hasFilters = filters?.assetId || filters?.status || filters?.dateFrom || filters?.dateTo;

  // Group logs by asset
  const logsByAsset = new Map<string, { asset: AssetLog['asset']; logs: AssetLog[] }>();
  logs.forEach(log => {
    const assetId = log.asset?.id || 'unknown';
    if (!logsByAsset.has(assetId)) {
      logsByAsset.set(assetId, { asset: log.asset, logs: [] });
    }
    logsByAsset.get(assetId)!.logs.push(log);
  });

  // Sort logs by date (newest first) within each asset
  logsByAsset.forEach(assetData => {
    assetData.logs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  });

  return (
    <Document>
      {/* Page 1: Summary Page (Portrait) */}
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <Text style={styles.companyName}>YakhshiLedger</Text>
        <Text style={styles.reportTitle}>Asset Usage Logs Report</Text>
        <Text style={styles.generatedDate}>
          Generated: {format(generatedAt, "MMM dd, yyyy HH:mm")}
        </Text>
        <View style={styles.headerDivider} />

        {/* Summary Cards */}
        {stats && (
          <View style={styles.summaryRow}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Total Logs</Text>
              <Text style={styles.summaryValue}>{stats.totalLogs}</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Total Distance</Text>
              <Text style={styles.summaryValue}>
                {(stats.totalDistance / 1000).toFixed(1)}k km
              </Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Total Fuel</Text>
              <Text style={styles.summaryValue}>
                {stats.totalFuelConsumed.toFixed(0)} L
              </Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Total Engine Hours</Text>
              <Text style={styles.summaryValue}>
                {stats.totalEngineHours.toFixed(0)} h
              </Text>
            </View>
          </View>
        )}

        {/* Active Filters */}
        {hasFilters && (
          <View style={styles.filterRow}>
            {filters?.assetId && (
              <View>
                <Text style={styles.filterLabel}>Asset: </Text>
                <Text style={styles.filterValue}>{filters.assetId}</Text>
              </View>
            )}
            {filters?.status && (
              <View>
                <Text style={styles.filterLabel}>Status: </Text>
                <Text style={styles.filterValue}>
                  {LOG_STATUS_LABELS[filters.status as keyof typeof LOG_STATUS_LABELS] || filters.status}
                </Text>
              </View>
            )}
            {filters?.dateFrom && (
              <View>
                <Text style={styles.filterLabel}>From: </Text>
                <Text style={styles.filterValue}>{filters.dateFrom}</Text>
              </View>
            )}
            {filters?.dateTo && (
              <View>
                <Text style={styles.filterLabel}>To: </Text>
                <Text style={styles.filterValue}>{filters.dateTo}</Text>
              </View>
            )}
          </View>
        )}

        {/* Log Entries Table (Overview) */}
        <Text style={styles.sectionTitle}>
          Log Entries Overview ({logs.length})
        </Text>
        {logs.length === 0 ? (
          <Text style={styles.emptyText}>No usage logs to display.</Text>
        ) : (
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={styles.cellDate}>Date</Text>
              <Text style={styles.cellAsset}>Asset</Text>
              <Text style={styles.cellOperator}>Operator</Text>
              <Text style={styles.cellDistance}>Distance</Text>
              <Text style={styles.cellFuel}>Fuel</Text>
              <Text style={styles.cellSite}>Work Site</Text>
            </View>
            {logs.map((log, idx) => (
              <View key={log.id} style={idx % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
                <Text style={styles.cellDate}>
                  {format(new Date(log.date), "MMM dd, yyyy")}
                </Text>
                <Text style={styles.cellAsset}>
                  {log.asset?.name || "-"}
                  {log.asset?.plateNumber ? `\n${log.asset.plateNumber}` : ""}
                </Text>
                <Text style={styles.cellOperator}>
                  {log.operator?.fullName || "N/A"}
                </Text>
                <Text style={styles.cellDistance}>
                  {log.distanceTraveled != null ? `${log.distanceTraveled.toFixed(0)} km` : "-"}
                </Text>
                <Text style={styles.cellFuel}>
                  {log.fuelConsumed != null ? `${log.fuelConsumed.toFixed(0)} L` : "-"}
                </Text>
                <Text style={styles.cellSite}>
                  {log.workSite || "-"}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Footer */}
        <Text style={styles.footer}>
          YakhshiLedger — Usage Logs Report — Page 1 (Summary)
        </Text>
      </Page>

      {/* Asset Detail Pages (Landscape) */}
      {logs.length > 0 ? (
        [...logsByAsset.entries()].map(([assetId, { asset, logs: assetLogs }], index) => (
          <Page key={assetId} size="A4" orientation="landscape" style={styles.assetDetailPage}>
            <Text style={styles.companyName}>YakhshiLedger</Text>
            <Text style={styles.assetTitle}>
              Asset: {asset?.name || "Unknown Asset"}
              {asset?.plateNumber ? ` (${asset.plateNumber})` : ""}
            </Text>
            <Text style={styles.assetSubtitle}>
              Total Logs: {assetLogs.length} • Generated: {format(generatedAt, "MMM dd, yyyy HH:mm")}
            </Text>
            <View style={styles.headerDivider} />

            {/* Asset Log Statistics */}
            <View style={styles.logStatsContainer}>
              <View style={styles.logStatItem}>
                <Text style={styles.logStatLabel}>Total Distance</Text>
                <Text style={styles.logStatValue}>
                  {assetLogs.reduce((sum, log) => sum + (log.distanceTraveled || 0), 0).toFixed(1)} km
                </Text>
              </View>
              <View style={styles.logStatItem}>
                <Text style={styles.logStatLabel}>Total Fuel</Text>
                <Text style={styles.logStatValue}>
                  {assetLogs.reduce((sum, log) => sum + (log.fuelConsumed || 0), 0).toFixed(1)} L
                </Text>
              </View>
              <View style={styles.logStatItem}>
                <Text style={styles.logStatLabel}>Engine Hours</Text>
                <Text style={styles.logStatValue}>
                  {assetLogs.reduce((sum, log) => sum + (log.engineHoursUsed || 0), 0).toFixed(1)} h
                </Text>
              </View>
            </View>

            {/* Per-Log Table */}
            <View style={styles.assetLogTable}>
              <View style={styles.assetLogTableHeader}>
                <Text style={styles.cellLogDate}>Date</Text>
                <Text style={styles.cellLogTime}>Time</Text>
                <Text style={styles.cellLogOperator}>Operator</Text>
                <Text style={styles.cellLogDistance}>Distance</Text>
                <Text style={styles.cellLogEngineHrs}>Engine Hrs</Text>
                <Text style={styles.cellLogFuel}>Fuel</Text>
                <Text style={styles.cellLogWorkSite}>Work Site</Text>
                <Text style={styles.cellLogProject}>Project</Text>
                <Text style={styles.cellLogConditions}>Conditions</Text>
                <Text style={styles.cellLogIssues}>Issues</Text>
                <Text style={styles.cellLogRemarks}>Remarks</Text>
                <Text style={styles.cellLogStatus}>Status</Text>
              </View>
              {assetLogs.map((log, idx) => (
                <View key={log.id} style={idx % 2 === 0 ? styles.assetLogTableRow : styles.assetLogTableRowAlt}>
                  <Text style={styles.cellLogDate}>
                    {format(new Date(log.date), "MMM dd")}
                  </Text>
                  <Text style={styles.cellLogTime}>
                    {log.startTime || "-"}{log.endTime ? ` – ${log.endTime}` : ""}
                  </Text>
                  <Text style={styles.cellLogOperator}>
                    {log.operator?.fullName || "N/A"}
                  </Text>
                  <Text style={styles.cellLogDistance}>
                    {log.distanceTraveled != null ? `${log.distanceTraveled.toFixed(0)} km` : "-"}
                  </Text>
                  <Text style={styles.cellLogEngineHrs}>
                    {log.engineHoursUsed != null ? `${log.engineHoursUsed.toFixed(1)} h` : "-"}
                  </Text>
                  <Text style={styles.cellLogFuel}>
                    {log.fuelConsumed != null ? `${log.fuelConsumed.toFixed(1)} L` : "-"}
                  </Text>
                  <Text style={styles.cellLogWorkSite}>
                    {log.workSite || "-"}
                  </Text>
                  <Text style={styles.cellLogProject}>
                    {log.project || "-"}
                  </Text>
                  <Text style={styles.cellLogConditions}>
                    {log.conditions || "-"}
                  </Text>
                  <Text style={styles.cellLogIssues}>
                    {log.issues || "-"}
                  </Text>
                  <Text style={styles.cellLogRemarks}>
                    {log.remarks || "-"}
                  </Text>
                  <Text style={[styles.cellLogStatus, { color: statusColorMap[log.status]?.text || "#6b7280" }]}>
                    {LOG_STATUS_LABELS[log.status as keyof typeof LOG_STATUS_LABELS] || log.status}
                  </Text>
                </View>
              ))}
            </View>

            {/* Footer */}
            <Text style={styles.footer}>
              YakhshiLedger — Asset: {asset?.name || "Unknown"} — Page {index + 2}
            </Text>
          </Page>
        ))
      ) : null}
    </Document>
  );
}

export default AssetLogsPDFDocument;
