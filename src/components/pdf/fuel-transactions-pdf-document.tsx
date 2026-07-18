import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';

Font.register({ family: "Vazirmatn", src: "/fonts/Vazirmatn-Regular.ttf" });
import { format } from 'date-fns';
import type { FuelTransaction } from '@/types/asset';
import { FUEL_TYPE_LABELS } from '@/types/contractor';

interface FuelTransactionsPDFDocumentProps {
  title: string;
  transactions: FuelTransaction[];
  reportType: 'purchase' | 'issue';
  dateFrom?: string;
  dateTo?: string;
  companyName?: string;
}

const formatCurrency = (amount: number) =>
  `AFN ${amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const COL = {
  date: '14%',
  fuel: '12%',
  qty: '10%',
  unitPrice: '12%',
  cost: '12%',
  extra1: '14%',
  extra2: '14%',
  notes: '12%',
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
  cellFuel: { width: COL.fuel, padding: 4 },
  cellQty: { width: COL.qty, padding: 4, textAlign: 'right' as const },
  cellUnitPrice: { width: COL.unitPrice, padding: 4, textAlign: 'right' as const },
  cellCost: { width: COL.cost, padding: 4, textAlign: 'right' as const },
  cellExtra1: { width: COL.extra1, padding: 4 },
  cellExtra2: { width: COL.extra2, padding: 4 },
  cellNotes: { width: COL.notes, padding: 4 },
  totalCell: { padding: 4, fontWeight: 'bold', color: '#059669' },
  emptyText: { textAlign: 'center' as const, padding: 20, color: '#94a3b8', fontSize: 10 },
  summaryRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  summaryCard: { flex: 1, padding: 8, borderWidth: 1, borderColor: '#059669', borderRadius: 3 },
  summaryLabel: { fontSize: 7, color: '#64748b', marginBottom: 2, textTransform: 'uppercase' as const },
  summaryValue: { fontSize: 12, fontWeight: 'bold', color: '#059669' },
});

function FuelTransactionsPDFDocument({
  title,
  transactions,
  reportType,
  dateFrom,
  dateTo,
  companyName = 'YakhshiLedger',
}: FuelTransactionsPDFDocumentProps) {
  const totalQty = transactions.reduce((s, t) => s + t.quantity, 0);
  const totalCost = transactions.reduce((s, t) => s + (t.totalCost || 0), 0);

  const dateLabel = dateFrom || dateTo
    ? `Date Range: ${dateFrom || '...'} to ${dateTo || '...'}`
    : 'All dates';

  const isPurchase = reportType === 'purchase';

  return (
    <Document title={title} author={companyName}>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <Text style={styles.companyName}>{companyName}</Text>
        <Text style={styles.reportTitle}>{title}</Text>
        <Text style={styles.filterInfo}>{dateLabel} | {transactions.length} records</Text>
        <View style={styles.headerDivider} />

        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Total Records</Text>
            <Text style={styles.summaryValue}>{transactions.length}</Text>
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

        {transactions.length === 0 ? (
          <Text style={styles.emptyText}>No {isPurchase ? 'purchase' : 'issue'} records found</Text>
        ) : (
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={styles.cellDate}>Date</Text>
              <Text style={styles.cellFuel}>Fuel Type</Text>
              <Text style={styles.cellQty}>Quantity</Text>
              <Text style={styles.cellUnitPrice}>Unit Price</Text>
              <Text style={styles.cellCost}>Total Cost</Text>
              <Text style={styles.cellExtra1}>{isPurchase ? 'Supplier' : 'Issued To'}</Text>
              <Text style={styles.cellExtra2}>{isPurchase ? 'Container' : 'Machinery'}</Text>
              <Text style={styles.cellNotes}>Notes</Text>
            </View>
            {transactions.map((t, idx) => (
              <View key={t.id} style={idx % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
                <Text style={styles.cellDate}>{format(new Date(t.date), 'MMM dd, yyyy')}</Text>
                <Text style={styles.cellFuel}>{FUEL_TYPE_LABELS[t.fuelType as keyof typeof FUEL_TYPE_LABELS] || t.fuelType}</Text>
                <Text style={styles.cellQty}>{t.quantity.toFixed(1)} L</Text>
                <Text style={styles.cellUnitPrice}>{t.unitPrice ? formatCurrency(t.unitPrice) : '—'}</Text>
                <Text style={styles.cellCost}>{t.totalCost ? formatCurrency(t.totalCost) : '—'}</Text>
                <Text style={styles.cellExtra1}>
                  {isPurchase ? (t.supplier || '—') : (t.issuedToName || '—')}
                </Text>
                <Text style={styles.cellExtra2}>
                  {isPurchase
                    ? (t.container?.name || '—')
                    : (t.machinery?.machineryName || t.contractor?.contractorName || '—')}
                </Text>
                <Text style={styles.cellNotes}>{t.notes || '—'}</Text>
              </View>
            ))}
            <View style={[styles.tableRow, { backgroundColor: '#f0fdf4' }]}>
              <Text style={[styles.totalCell, styles.cellDate]}>Total</Text>
              <Text style={[styles.totalCell, styles.cellFuel]} />
              <Text style={[styles.totalCell, styles.cellQty]}>{totalQty.toFixed(1)} L</Text>
              <Text style={[styles.totalCell, styles.cellUnitPrice]} />
              <Text style={[styles.totalCell, styles.cellCost]}>{formatCurrency(totalCost)}</Text>
              <Text style={[styles.totalCell, styles.cellExtra1]} />
              <Text style={[styles.totalCell, styles.cellExtra2]} />
              <Text style={[styles.totalCell, styles.cellNotes]} />
            </View>
          </View>
        )}
      </Page>
    </Document>
  );
}

export default FuelTransactionsPDFDocument;
