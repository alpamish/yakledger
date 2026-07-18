import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';

Font.register({ family: "Vazirmatn", src: "/fonts/Vazirmatn-Regular.ttf" });
import { format } from 'date-fns';
import type { FuelUsage } from '@/types/contractor';
import { FUEL_TYPE_LABELS } from '@/types/contractor';

interface FuelUsageListPDFDocumentProps {
  title: string;
  records: FuelUsage[];
  dateFrom?: string;
  dateTo?: string;
  companyName?: string;
}

const formatCurrency = (amount: number) =>
  `AFN ${amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const COL = {
  date: '14%',
  contractor: '16%',
  machinery: '16%',
  plate: '10%',
  fuel: '10%',
  qty: '10%',
  cost: '12%',
  station: '12%',
} as const;

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 9, fontFamily: 'Vazirmatn', color: '#1e293b' },
  companyName: { fontSize: 22, color: '#059669', marginBottom: 2 },
  reportTitle: { fontSize: 14, color: '#334155', marginBottom: 4 },
  filterInfo: { fontSize: 9, color: '#64748b', marginBottom: 10 },
  headerDivider: { height: 1, backgroundColor: '#059669', marginBottom: 10 },
  table: { width: '100%', borderWidth: 1, borderColor: '#d1d5db' },
  tableHeader: { flexDirection: 'row', backgroundColor: '#059669', color: 'white', fontSize: 8, fontWeight: 'bold' },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  tableRowAlt: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e5e7eb', backgroundColor: '#f9fafb' },
  cellDate: { width: COL.date, padding: 4 },
  cellContractor: { width: COL.contractor, padding: 4 },
  cellMachinery: { width: COL.machinery, padding: 4 },
  cellPlate: { width: COL.plate, padding: 4 },
  cellFuel: { width: COL.fuel, padding: 4 },
  cellQty: { width: COL.qty, padding: 4, textAlign: 'right' as const },
  cellCost: { width: COL.cost, padding: 4, textAlign: 'right' as const },
  cellStation: { width: COL.station, padding: 4 },
  totalCell: { padding: 4, fontWeight: 'bold', color: '#059669' },
  emptyText: { textAlign: 'center' as const, padding: 20, color: '#94a3b8', fontSize: 10 },
  summaryRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  summaryCard: { flex: 1, padding: 8, borderWidth: 1, borderColor: '#059669', borderRadius: 3 },
  summaryLabel: { fontSize: 7, color: '#64748b', marginBottom: 2, textTransform: 'uppercase' as const },
  summaryValue: { fontSize: 12, fontWeight: 'bold', color: '#059669' },
});

function FuelUsageListPDFDocument({
  title = 'Fuel Usage Range Report',
  records,
  dateFrom,
  dateTo,
  companyName = 'YakhshiLedger',
}: FuelUsageListPDFDocumentProps) {
  const totalQty = records.reduce((s, r) => s + r.quantity, 0);
  const totalCost = records.reduce((s, r) => s + r.totalCost, 0);

  const dateLabel = dateFrom || dateTo
    ? `Date Range: ${dateFrom || '...'} to ${dateTo || '...'}`
    : 'All dates';

  return (
    <Document title="Fuel Usage Report" author={companyName}>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <Text style={styles.companyName}>{companyName}</Text>
        <Text style={styles.reportTitle}>{title}</Text>
        <Text style={styles.filterInfo}>{dateLabel} | {records.length} records</Text>
        <View style={styles.headerDivider} />

        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Total Records</Text>
            <Text style={styles.summaryValue}>{records.length}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Total Quantity</Text>
            <Text style={styles.summaryValue}>{totalQty.toFixed(1)} L</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Total Cost</Text>
            <Text style={styles.summaryValue}>{formatCurrency(totalCost)}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Avg Unit Price</Text>
            <Text style={styles.summaryValue}>
              {totalQty > 0 ? formatCurrency(totalCost / totalQty) : '—'}
            </Text>
          </View>
        </View>

        {records.length === 0 ? (
          <Text style={styles.emptyText}>No fuel usage records found</Text>
        ) : (
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={styles.cellDate}>Date</Text>
              <Text style={styles.cellContractor}>Contractor</Text>
              <Text style={styles.cellMachinery}>Machinery</Text>
              <Text style={styles.cellPlate}>Plate #</Text>
              <Text style={styles.cellFuel}>Fuel Type</Text>
              <Text style={styles.cellQty}>Quantity</Text>
              <Text style={styles.cellCost}>Total Cost</Text>
              <Text style={styles.cellStation}>Fuel Station</Text>
            </View>
            {records.map((r, idx) => (
              <View key={r.id} style={idx % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
                <Text style={styles.cellDate}>{format(new Date(r.date), 'MMM dd, yyyy')}</Text>
                <Text style={styles.cellContractor}>{r.contractor?.contractorName || '—'}</Text>
                <Text style={styles.cellMachinery}>{r.machinery?.machineryName || '—'}</Text>
                <Text style={styles.cellPlate}>{r.machinery?.plateNumber || '—'}</Text>
                <Text style={styles.cellFuel}>{FUEL_TYPE_LABELS[r.fuelType as keyof typeof FUEL_TYPE_LABELS] || r.fuelType}</Text>
                <Text style={styles.cellQty}>{r.quantity.toFixed(1)} L</Text>
                <Text style={styles.cellCost}>{formatCurrency(r.totalCost)}</Text>
                <Text style={styles.cellStation}>{r.fuelStation || '—'}</Text>
              </View>
            ))}
            <View style={[styles.tableRow, { backgroundColor: '#f0fdf4' }]}>
              <Text style={[styles.totalCell, { width: COL.date + COL.contractor + COL.machinery + COL.plate + COL.fuel, padding: 4 }]}>Total</Text>
              <Text style={[styles.totalCell, styles.cellQty]}>{totalQty.toFixed(1)} L</Text>
              <Text style={[styles.totalCell, styles.cellCost]}>{formatCurrency(totalCost)}</Text>
              <Text style={[styles.totalCell, { width: COL.station, padding: 4 }]} />
            </View>
          </View>
        )}
      </Page>
    </Document>
  );
}

export default FuelUsageListPDFDocument;
