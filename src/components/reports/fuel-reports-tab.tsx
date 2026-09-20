'use client';

import { useState, useCallback } from 'react';
import { pdf } from '@react-pdf/renderer';
import { fuelApi } from '@/services/asset-api';
import { fuelUsageApi } from '@/services/contractor-api';
import { downloadPdfBlob } from '@/lib/pdf-utils';
import { format } from 'date-fns';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { Fuel, FileSpreadsheet, FileDown, Loader2, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface FuelReportsTabProps {
  companyName: string;
  hasPermission: (action: string) => boolean;
}

export default function FuelReportsTab({ companyName, hasPermission }: FuelReportsTabProps) {
  const [fuelDateFrom, setFuelDateFrom] = useState('');
  const [fuelDateTo, setFuelDateTo] = useState('');
  const [fuelExcelExporting, setFuelExcelExporting] = useState<'purchase' | 'issue' | 'usage' | null>(null);
  const [fuelPdfExporting, setFuelPdfExporting] = useState<'purchase' | 'issue' | 'usage' | null>(null);

  const handleExportPurchasedFuelExcel = useCallback(async () => {
    setFuelExcelExporting('purchase');
    try {
      const res = await fuelApi.getAll({ type: 'PURCHASE', dateFrom: fuelDateFrom || undefined, dateTo: fuelDateTo || undefined, pageSize: 100000 });
      const transactions = res.data?.data ?? [];
      const rows = transactions.map((t) => ({
        Date: t.date?.split('T')[0] ?? '',
        'Fuel Type': t.fuelType,
        Quantity: t.quantity,
        'Unit Price': t.unitPrice ?? '',
        'Total Cost': t.totalCost ?? '',
        Supplier: t.supplier ?? '',
        Container: t.container?.name ?? '',
        Notes: t.notes ?? '',
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Purchased Fuel');
      XLSX.writeFile(wb, `purchased-fuel-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
      toast.success(`Purchased fuel report exported (${transactions.length} records)`);
    } catch { toast.error('Failed to export purchased fuel report'); }
    finally { setFuelExcelExporting(null); }
  }, [fuelDateFrom, fuelDateTo]);

  const handleExportIssuedFuelExcel = useCallback(async () => {
    setFuelExcelExporting('issue');
    try {
      const res = await fuelApi.getAll({ type: 'ISSUE', dateFrom: fuelDateFrom || undefined, dateTo: fuelDateTo || undefined, pageSize: 100000 });
      const transactions = res.data?.data ?? [];
      const rows = transactions.map((t) => ({
        Date: t.date?.split('T')[0] ?? '',
        'Fuel Type': t.fuelType,
        Quantity: t.quantity,
        'Unit Price': t.unitPrice ?? '',
        'Total Cost': t.totalCost ?? '',
        'Issued To': t.issuedToName ?? '',
        Machinery: t.machinery?.machineryName ?? '',
        Contractor: t.contractor?.contractorName ?? '',
        Container: t.container?.name ?? '',
        Notes: t.notes ?? '',
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Issued Fuel');
      XLSX.writeFile(wb, `issued-fuel-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
      toast.success(`Issued fuel report exported (${transactions.length} records)`);
    } catch { toast.error('Failed to export issued fuel report'); }
    finally { setFuelExcelExporting(null); }
  }, [fuelDateFrom, fuelDateTo]);

  const handleExportFuelUsageExcel = useCallback(async () => {
    setFuelExcelExporting('usage');
    try {
      const res = await fuelUsageApi.getAll({ dateFrom: fuelDateFrom || undefined, dateTo: fuelDateTo || undefined, pageSize: 100000 });
      const records = res.data?.data ?? [];
      const rows = records.map((r) => ({
        Date: r.date?.split('T')[0] ?? '',
        Contractor: r.contractor?.contractorName ?? '',
        Machinery: r.machinery?.machineryName ?? '',
        'Plate Number': r.machinery?.plateNumber ?? '',
        'Fuel Type': r.fuelType,
        Quantity: r.quantity,
        'Unit Price': r.unitPrice,
        'Total Cost': r.totalCost,
        'Fuel Station': r.fuelStation ?? '',
        Notes: r.notes ?? '',
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Fuel Usage');
      XLSX.writeFile(wb, `fuel-usage-range-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
      toast.success(`Fuel usage report exported (${records.length} records)`);
    } catch { toast.error('Failed to export fuel usage report'); }
    finally { setFuelExcelExporting(null); }
  }, [fuelDateFrom, fuelDateTo]);

  const handleExportPurchasedFuelPdf = useCallback(async () => {
    setFuelPdfExporting('purchase');
    try {
      const { default: FuelTransactionsPDF } = await import('@/components/pdf/fuel-transactions-pdf-document');
      const res = await fuelApi.getAll({ type: 'PURCHASE', dateFrom: fuelDateFrom || undefined, dateTo: fuelDateTo || undefined, pageSize: 100000 });
      const transactions = res.data?.data ?? [];
      if (transactions.length === 0) { toast.error('No purchase records to export'); return; }
      const blob = await pdf(
        <FuelTransactionsPDF
          title="Purchased Fuel Report"
          transactions={transactions}
          reportType="purchase"
          dateFrom={fuelDateFrom || undefined}
          dateTo={fuelDateTo || undefined}
          companyName={companyName}
        />
      ).toBlob();
      downloadPdfBlob(blob, `purchased-fuel-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
      toast.success(`Purchased fuel PDF exported (${transactions.length} records)`);
    } catch { toast.error('Failed to export purchased fuel PDF'); }
    finally { setFuelPdfExporting(null); }
  }, [fuelDateFrom, fuelDateTo, companyName]);

  const handleExportIssuedFuelPdf = useCallback(async () => {
    setFuelPdfExporting('issue');
    try {
      const { default: FuelTransactionsPDF } = await import('@/components/pdf/fuel-transactions-pdf-document');
      const res = await fuelApi.getAll({ type: 'ISSUE', dateFrom: fuelDateFrom || undefined, dateTo: fuelDateTo || undefined, pageSize: 100000 });
      const transactions = res.data?.data ?? [];
      if (transactions.length === 0) { toast.error('No issue records to export'); return; }
      const blob = await pdf(
        <FuelTransactionsPDF
          title="Issued Fuel Report"
          transactions={transactions}
          reportType="issue"
          dateFrom={fuelDateFrom || undefined}
          dateTo={fuelDateTo || undefined}
          companyName={companyName}
        />
      ).toBlob();
      downloadPdfBlob(blob, `issued-fuel-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
      toast.success(`Issued fuel PDF exported (${transactions.length} records)`);
    } catch { toast.error('Failed to export issued fuel PDF'); }
    finally { setFuelPdfExporting(null); }
  }, [fuelDateFrom, fuelDateTo, companyName]);

  const handleExportFuelUsagePdf = useCallback(async () => {
    setFuelPdfExporting('usage');
    try {
      const { default: FuelUsageListPDF } = await import('@/components/pdf/fuel-usage-list-pdf-document');
      const res = await fuelUsageApi.getAll({ dateFrom: fuelDateFrom || undefined, dateTo: fuelDateTo || undefined, pageSize: 100000 });
      const records = res.data?.data ?? [];
      if (records.length === 0) { toast.error('No fuel usage records to export'); return; }
      const blob = await pdf(
        <FuelUsageListPDF
          title="Fuel Usage Range Report"
          records={records}
          dateFrom={fuelDateFrom || undefined}
          dateTo={fuelDateTo || undefined}
          companyName={companyName}
        />
      ).toBlob();
      downloadPdfBlob(blob, `fuel-usage-range-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
      toast.success(`Fuel usage PDF exported (${records.length} records)`);
    } catch { toast.error('Failed to export fuel usage PDF'); }
    finally { setFuelPdfExporting(null); }
  }, [fuelDateFrom, fuelDateTo, companyName]);

  return (
    <div className="space-y-6 mt-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Fuel Usage Reports</h2>
          <p className="text-sm text-muted-foreground">
            Export fuel data by date range
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3">
              <div>
                <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">Date From</Label>
                <Input
                  type="date"
                  value={fuelDateFrom}
                  onChange={(e) => setFuelDateFrom(e.target.value)}
                  className="h-10 w-[150px]"
                />
              </div>
              <span className="text-xs text-muted-foreground pb-2">to</span>
              <div>
                <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">Date To</Label>
                <Input
                  type="date"
                  value={fuelDateTo}
                  onChange={(e) => setFuelDateTo(e.target.value)}
                  className="h-10 w-[150px]"
                />
              </div>
              {(fuelDateFrom || fuelDateTo) && (
                <Button variant="ghost" size="sm" className="h-10" onClick={() => { setFuelDateFrom(''); setFuelDateTo(''); }}>
                  <X className="h-4 w-4 mr-1" />
                  Clear
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="border-emerald-200 dark:border-emerald-900">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Fuel className="h-5 w-5 text-emerald-600" />
                    <span className="text-sm font-medium">Purchased Fuel</span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">All purchase transactions</p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1 h-9 gap-1.5" onClick={handleExportPurchasedFuelExcel} disabled={fuelExcelExporting === 'purchase'}>
                      {fuelExcelExporting === 'purchase' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                      Excel
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1 h-9 gap-1.5" onClick={handleExportPurchasedFuelPdf} disabled={fuelPdfExporting === 'purchase'}>
                      {fuelPdfExporting === 'purchase' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                      PDF
                    </Button>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-blue-200 dark:border-blue-900">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Fuel className="h-5 w-5 text-blue-600" />
                    <span className="text-sm font-medium">Issued Fuel</span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">All issue transactions</p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1 h-9 gap-1.5" onClick={handleExportIssuedFuelExcel} disabled={fuelExcelExporting === 'issue'}>
                      {fuelExcelExporting === 'issue' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                      Excel
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1 h-9 gap-1.5" onClick={handleExportIssuedFuelPdf} disabled={fuelPdfExporting === 'issue'}>
                      {fuelPdfExporting === 'issue' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                      PDF
                    </Button>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-violet-200 dark:border-violet-900">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Fuel className="h-5 w-5 text-violet-600" />
                    <span className="text-sm font-medium">Fuel Usage Range</span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">Contractor fuel consumption records</p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1 h-9 gap-1.5" onClick={handleExportFuelUsageExcel} disabled={fuelExcelExporting === 'usage'}>
                      {fuelExcelExporting === 'usage' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                      Excel
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1 h-9 gap-1.5" onClick={handleExportFuelUsagePdf} disabled={fuelPdfExporting === 'usage'}>
                      {fuelPdfExporting === 'usage' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                      PDF
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
