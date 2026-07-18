import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { MonthlyAnalysisResponse, MonthlyFuelData, FuelAnomaly } from '@/types/contractor';

const styles = StyleSheet.create({
  page: {
    padding: 32,
    fontSize: 10,
    fontFamily: 'Helvetica',
  },
  header: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#059669',
    marginBottom: 4,
    borderBottom: '2px solid #059669',
    paddingBottom: 8,
  },
  subtitle: {
    fontSize: 10,
    color: '#64748b',
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    padding: 10,
    borderRadius: 4,
  },
  summaryLabel: {
    fontSize: 8,
    color: '#64748b',
    textTransform: 'uppercase',
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1e293b',
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#1e293b',
    marginTop: 16,
    marginBottom: 8,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderBottom: '2px solid #e2e8f0',
    paddingVertical: 6,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottom: '1px solid #e2e8f0',
    paddingVertical: 5,
  },
  colMachinery: { width: '22%', paddingHorizontal: 4 },
  colMonth: { width: '14%', paddingHorizontal: 4 },
  colLiters: { width: '16%', textAlign: 'right', paddingHorizontal: 4 },
  colCost: { width: '16%', textAlign: 'right', paddingHorizontal: 4 },
  colLpH: { width: '16%', textAlign: 'right', paddingHorizontal: 4 },
  colDev: { width: '16%', textAlign: 'right', paddingHorizontal: 4 },
  headerText: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#64748b',
    textTransform: 'uppercase',
  },
  cellText: {
    fontSize: 9,
    color: '#333',
  },
  critical: { color: '#dc2626' },
  warning: { color: '#d97706' },
  normal: { color: '#059669' },
  anomalyBox: {
    padding: 8,
    marginBottom: 6,
    borderRadius: 4,
    borderLeft: '3px solid',
  },
  anomalyCritical: {
    backgroundColor: '#fef2f2',
    borderLeftColor: '#dc2626',
  },
  anomalyWarning: {
    backgroundColor: '#fffbeb',
    borderLeftColor: '#d97706',
  },
  anomalySeverity: {
    fontSize: 7,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  anomalyMessage: {
    fontSize: 9,
    marginTop: 2,
  },
  anomalyMeta: {
    fontSize: 8,
    color: '#64748b',
    marginTop: 2,
  },
  footer: {
    marginTop: 32,
    fontSize: 8,
    color: '#94a3b8',
    borderTop: '1px solid #e2e8f0',
    paddingTop: 8,
    textAlign: 'center',
  },
});

interface FuelAnalysisPdfDocumentProps {
  data: MonthlyAnalysisResponse[];
  year: number;
  fuelType?: string;
}

export function FuelAnalysisPdfDocument({ data, year, fuelType }: FuelAnalysisPdfDocumentProps) {
  const allMonthly: { data: MonthlyFuelData; machineryName: string }[] = [];
  for (const d of data) {
    for (const m of d.monthlyData) {
      if (m.totalLiters > 0) {
        allMonthly.push({
          data: m,
          machineryName: (d.machinery as { machineryName: string }).machineryName,
        });
      }
    }
  }

  const allAnomalies: FuelAnomaly[] = data.flatMap((d) => d.anomalies);

  const totalLiters = allMonthly.reduce((s, e) => s + e.data.totalLiters, 0);
  const totalCost = allMonthly.reduce((s, e) => s + e.data.totalCost, 0);
  const totalHours = allMonthly.reduce((s, e) => s + e.data.totalHours, 0);
  const avgLpH = totalHours > 0 ? (totalLiters / totalHours) : 0;

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <Text style={styles.header}>Fuel Usage Analysis Report</Text>
        <Text style={styles.subtitle}>
          Year: {year}{fuelType ? ` | Fuel Type: ${fuelType}` : ''} | Generated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
        </Text>

        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Total Machinery</Text>
            <Text style={styles.summaryValue}>{data.length}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Total Fuel Consumed</Text>
            <Text style={styles.summaryValue}>{totalLiters.toFixed(1)} L</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Total Cost</Text>
            <Text style={styles.summaryValue}>AFN {totalCost.toFixed(0)}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Avg L/hr</Text>
            <Text style={styles.summaryValue}>{avgLpH.toFixed(1)}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Monthly Consumption Summary</Text>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.colMachinery, styles.headerText]}>Machinery</Text>
            <Text style={[styles.colMonth, styles.headerText]}>Month</Text>
            <Text style={[styles.colLiters, styles.headerText]}>Liters</Text>
            <Text style={[styles.colCost, styles.headerText]}>Cost</Text>
            <Text style={[styles.colLpH, styles.headerText]}>L/hr</Text>
            <Text style={[styles.colDev, styles.headerText]}>vs Exp</Text>
          </View>
          {allMonthly.map((entry, idx) => {
            const d = entry.data;
            const devStyle =
              Math.abs(d.deviationPercent) >= 15
                ? styles.critical
                : Math.abs(d.deviationPercent) >= 5
                  ? styles.warning
                  : styles.normal;
            return (
              <View style={styles.tableRow} key={idx}>
                <Text style={[styles.colMachinery, styles.cellText]}>{entry.machineryName}</Text>
                <Text style={[styles.colMonth, styles.cellText]}>{d.monthLabel}</Text>
                <Text style={[styles.colLiters, styles.cellText]}>{d.totalLiters.toFixed(1)}</Text>
                <Text style={[styles.colCost, styles.cellText]}>{d.totalCost.toFixed(0)}</Text>
                <Text style={[styles.colLpH, styles.cellText]}>{d.litersPerHour.toFixed(1)}</Text>
                <Text style={[styles.colDev, styles.cellText, devStyle]}>
                  {d.deviationPercent > 0 ? '+' : ''}{d.deviationPercent.toFixed(1)}%
                </Text>
              </View>
            );
          })}
        </View>

        {allAnomalies.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Anomaly Alerts ({allAnomalies.length} detected)</Text>
            {allAnomalies.map((a, idx) => (
              <View
                key={idx}
                style={[
                  styles.anomalyBox,
                  a.severity === 'critical' ? styles.anomalyCritical : styles.anomalyWarning,
                ]}
                wrap={false}
              >
                <Text style={[styles.anomalySeverity, a.severity === 'critical' ? styles.critical : styles.warning]}>
                  {a.severity} | {a.type.replace(/_/g, ' ')}
                </Text>
                <Text style={styles.anomalyMessage}>{a.message}</Text>
                <Text style={styles.anomalyMeta}>
                  Actual: {a.actualValue.toFixed(1)} L/hr | Expected: {a.expectedValue.toFixed(1)} L/hr | Deviation: {Math.abs(a.deviationPercent).toFixed(1)}%
                </Text>
              </View>
            ))}
          </>
        )}

        <Text style={styles.footer}>YakhshiLedger — Fuel Usage Analysis Report</Text>
      </Page>
    </Document>
  );
}
