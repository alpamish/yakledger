'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { pdf } from '@react-pdf/renderer';
import { contractorsApi, machineryApi } from '@/services/contractor-api';
import type { Machinery, MachineryStatus, FuelType, ContractorType } from '@/types/contractor';
import { MACHINERY_STATUS_LABELS, FUEL_TYPE_LABELS, CONTRACTOR_TYPE_LABELS } from '@/types/contractor';
import { formatCurrency } from '@/lib/utils';
import { fmtExportDate, fmtExportLabel } from '@/lib/format';
import { format } from 'date-fns';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import {
  Truck,
  Check,
  Clock,
  Fuel,
  BarChart3,
  Users,
  FileDown,
  FileSpreadsheet,
  Loader2,
  ChevronDown,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { MachineryContractorSummaryPDFDocument } from '@/components/pdf/machinery-contractor-summary-pdf-document';
import { MachineryFuelPerMachineryPDFDocument } from '@/components/pdf/machinery-fuel-per-machinery-pdf-document';
import { MachineryWorkHoursPDFDocument } from '@/components/pdf/machinery-work-hours-pdf-document';
import MachinerySummaryPDFDocument from '@/components/pdf/machinery-summary-pdf-document';

interface MachineryReportsTabProps {
  companyName: string;
  hasPermission: (action: string) => boolean;
}

export default function MachineryReportsTab({
  companyName,
  hasPermission,
}: MachineryReportsTabProps) {
  const [machineryReportList, setMachineryReportList] = useState<(Pick<Machinery, 'id' | 'machineryName' | 'machineryType' | 'plateNumber' | 'driverName' | 'status' | 'assignedContractorId' | 'model' | 'fuelType' | 'hourlyConsumptionRate' | 'hourlyRate' | 'dailyRate' | 'monthlyRate' | 'contractDaysPerMonth' | 'workHoursPerDay' | 'contractStartDate' | 'contractEndDate'> & { assignedContractor?: { contractorName: string; contractorType: string; fatherName: string; nationalId: string | null; phoneNumber: string; address: string | null } | null })[]>([]);
  const [includeOutOfService, setIncludeOutOfService] = useState(true);
  const [machineryListExcelLoading, setMachineryListExcelLoading] = useState(false);
  const [machineryContractorExcelLoading, setMachineryContractorExcelLoading] = useState(false);
  const [machineryDropdownPdfLoading, setMachineryDropdownPdfLoading] = useState(false);
  const [machinerySummaryExcelLoading, setMachinerySummaryExcelLoading] = useState(false);

  useEffect(() => {
    machineryApi.getList().then((res) => {
      if (res.data) setMachineryReportList(res.data);
    }).catch(() => {});
  }, []);

  const filteredMachineryList = useMemo(() => {
    if (includeOutOfService) return machineryReportList;
    return machineryReportList.filter((m) => m.status !== 'OUT_OF_SERVICE');
  }, [machineryReportList, includeOutOfService]);

  const machineryReportSummary = useMemo(() => {
    const total = filteredMachineryList.length;
    const operational = filteredMachineryList.filter((m) => m.status === 'OPERATIONAL').length;
    const maintenance = filteredMachineryList.filter((m) => m.status === 'UNDER_MAINTENANCE').length;
    const outOfService = filteredMachineryList.filter((m) => m.status === 'OUT_OF_SERVICE').length;
    return { total, operational, maintenance, outOfService };
  }, [filteredMachineryList]);

  const handleMachineryReportExportExcel = useCallback(() => {
    if (filteredMachineryList.length === 0) return;
    setMachineryListExcelLoading(true);
    try {
      const rows = filteredMachineryList.map((m, i) => {
        const statusLabel = MACHINERY_STATUS_LABELS[m.status as MachineryStatus] ?? m.status;
        const fuelTypeLabel = FUEL_TYPE_LABELS[m.fuelType as FuelType] ?? m.fuelType;
        const contractorTypeLabel = m.assignedContractor?.contractorType
          ? (CONTRACTOR_TYPE_LABELS[m.assignedContractor.contractorType as ContractorType] ?? m.assignedContractor.contractorType)
          : '—';
        return {
          '#': i + 1,
          'Machinery Name': m.machineryName,
          'Type': m.machineryType,
          'Model': m.model || '—',
          'Plate Number': m.plateNumber || '—',
          'Driver Name': m.driverName || '—',
          'Fuel Type': fuelTypeLabel,
          'Hourly Rate': m.hourlyRate,
          'Daily Rate': m.dailyRate,
          'Monthly Rate': m.monthlyRate,
          'Hourly Consumption Rate': m.hourlyConsumptionRate,
          'Contract Days/Month': m.contractDaysPerMonth,
          'Work Hours/Day': m.workHoursPerDay,
          'Contract Start': m.contractStartDate || '—',
          'Contract End': m.contractEndDate || '—',
          'Contractor': m.assignedContractor?.contractorName || '—',
          'Contractor Type': contractorTypeLabel,
          'Status': statusLabel,
        };
      });

      const ws = XLSX.utils.json_to_sheet(rows);
      const colWidths = Object.keys(rows[0] || {}).map((key) => ({
        wch: Math.max(key.length, ...rows.map((row) => String(row[key as keyof typeof row]).length).slice(0, 20)) + 2,
      }));
      ws['!cols'] = colWidths;

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Machinery List');

      const summaryData: { Metric: string; Value: string | number }[] = [
        { Metric: 'Total Machinery', Value: machineryReportSummary.total },
        { Metric: 'Operational', Value: machineryReportSummary.operational },
        { Metric: 'Under Maintenance', Value: machineryReportSummary.maintenance },
        { Metric: 'Out of Service', Value: machineryReportSummary.outOfService },
      ];
      const ws2 = XLSX.utils.json_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, ws2, 'Summary');

      XLSX.writeFile(wb, `machinery-list-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
      toast.success('Machinery list exported to Excel');
    } catch (err) {
      console.error('Excel export failed:', err);
      toast.error('Failed to export machinery list');
    } finally {
      setMachineryListExcelLoading(false);
    }
  }, [filteredMachineryList, machineryReportSummary, companyName]);

  const handleMachineryContractorExportExcel = useCallback(() => {
    if (filteredMachineryList.length === 0) return;
    setMachineryContractorExcelLoading(true);
    try {
      const sorted = [...filteredMachineryList].sort((a, b) => {
        const nameA = a.assignedContractor?.contractorName || '';
        const nameB = b.assignedContractor?.contractorName || '';
        return nameA.localeCompare(nameB);
      });

      const rows = sorted.map((m, i) => {
        const statusLabel = MACHINERY_STATUS_LABELS[m.status as MachineryStatus] ?? m.status;
        const fuelTypeLabel = FUEL_TYPE_LABELS[m.fuelType as FuelType] ?? m.fuelType;
        const contractorTypeLabel = m.assignedContractor?.contractorType
          ? (CONTRACTOR_TYPE_LABELS[m.assignedContractor.contractorType as ContractorType] ?? m.assignedContractor.contractorType)
          : '—';
        return {
          'Contractor Name': m.assignedContractor?.contractorName || '—',
          'Father Name': m.assignedContractor?.fatherName || '—',
          'National Id': m.assignedContractor?.nationalId || '—',
          'Phone Number': m.assignedContractor?.phoneNumber || '—',
          'Address': m.assignedContractor?.address || '—',
          'Contractor Type': contractorTypeLabel,
          '#': i + 1,
          'Machinery Name': m.machineryName,
          'Type': m.machineryType,
          'Model': m.model || '—',
          'Plate Number': m.plateNumber || '—',
          'Driver Name': m.driverName || '—',
          'Fuel Type': fuelTypeLabel,
          'Hourly Rate': m.hourlyRate,
          'Daily Rate': m.dailyRate,
          'Monthly Rate': m.monthlyRate,
          'Hourly Consumption Rate': m.hourlyConsumptionRate,
          'Contract Days/Month': m.contractDaysPerMonth,
          'Work Hours/Day': m.workHoursPerDay,
          'Contract Start Date': m.contractStartDate || '—',
          'Contract End Date': m.contractEndDate || '—',
          'Status': statusLabel,
        };
      });

      const ws = XLSX.utils.json_to_sheet(rows);
      const colWidths = Object.keys(rows[0] || {}).map((key) => ({
        wch: Math.max(key.length, ...rows.map((row) => String(row[key as keyof typeof row]).length).slice(0, 20)) + 2,
      }));
      ws['!cols'] = colWidths;

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Contractors & Machinery');

      XLSX.writeFile(wb, `contractors-with-machinery-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
      toast.success('Contractors & Machinery exported to Excel');
    } catch (err) {
      console.error('Excel export failed:', err);
      toast.error('Failed to export contractors & machinery');
    } finally {
      setMachineryContractorExcelLoading(false);
    }
  }, [filteredMachineryList, companyName]);

  const handleMachineryContractorSummaryPdf = useCallback(async () => {
    if (filteredMachineryList.length === 0) return;
    setMachineryDropdownPdfLoading(true);
    try {
      const res = await machineryApi.getContractorSummary({ pageSize: 1000 });
      if (!res.data?.data) {
        toast.error('No contractor summary data available');
        return;
      }
      const blob = await pdf(
        <MachineryContractorSummaryPDFDocument
          data={res.data.data}
          companyName={companyName}
        />
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `machinery-by-contractor-${format(new Date(), 'yyyy-MM-dd')}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('Machinery by Contractor report downloaded');
    } catch (err) {
      console.error('PDF generation failed:', err);
      toast.error('Failed to generate Machinery by Contractor report');
    } finally {
      setMachineryDropdownPdfLoading(false);
    }
  }, [filteredMachineryList, companyName]);

  const handleFuelPerMachineryPdf = useCallback(async () => {
    if (filteredMachineryList.length === 0) return;
    setMachineryDropdownPdfLoading(true);
    try {
      const res = await machineryApi.getFuelSummary({ pageSize: 1000 });
      const items = res.data?.data;
      if (!items || !Array.isArray(items)) {
        toast.error('No fuel usage summary data available');
        return;
      }
      const blob = await pdf(
        <MachineryFuelPerMachineryPDFDocument
          data={items}
          companyName={companyName}
        />
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `machinery-fuel-per-machinery-${format(new Date(), 'yyyy-MM-dd')}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('Fuel Usage per Machinery report downloaded');
    } catch (err) {
      console.error('PDF generation failed:', err);
      toast.error('Failed to generate Fuel Usage per Machinery report');
    } finally {
      setMachineryDropdownPdfLoading(false);
    }
  }, [filteredMachineryList, companyName]);

  const handleWorkHoursPerMachineryPdf = useCallback(async () => {
    if (filteredMachineryList.length === 0) return;
    setMachineryDropdownPdfLoading(true);
    try {
      const res = await machineryApi.getWorkHoursSummary({ pageSize: 1000 });
      const items = res.data?.data;
      if (!items || !Array.isArray(items)) {
        toast.error('No work hours summary data available');
        return;
      }
      const blob = await pdf(
        <MachineryWorkHoursPDFDocument
          data={items}
          companyName={companyName}
        />
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `machinery-work-hours-${format(new Date(), 'yyyy-MM-dd')}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('Work Hours per Machinery report downloaded');
    } catch (err) {
      console.error('PDF generation failed:', err);
      toast.error('Failed to generate Work Hours per Machinery report');
    } finally {
      setMachineryDropdownPdfLoading(false);
    }
  }, [filteredMachineryList, companyName]);

  const handleMachinerySummaryPdf = useCallback(async () => {
    if (filteredMachineryList.length === 0) return;
    setMachineryDropdownPdfLoading(true);
    try {
      const res = await contractorsApi.getFinancialReport({});
      const reportData = res.data;
      if (!reportData || !Array.isArray(reportData) || reportData.length === 0) {
        toast.error('No data available for machinery summary');
        return;
      }
      const blob = await pdf(
        <MachinerySummaryPDFDocument
          data={reportData}
          companyName={companyName}
        />
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `machinery-summary-${format(new Date(), 'yyyy-MM-dd')}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('Machinery Summary report downloaded');
    } catch (err) {
      console.error('PDF generation failed:', err);
      toast.error('Failed to generate Machinery Summary report');
    } finally {
      setMachineryDropdownPdfLoading(false);
    }
  }, [filteredMachineryList, companyName]);

  const handleMachinerySummaryExcel = useCallback(async () => {
    if (filteredMachineryList.length === 0) return;
    setMachinerySummaryExcelLoading(true);
    try {
      const res = await contractorsApi.getFinancialReport({});
      const reportData = res.data as Array<{
        machineryName: string;
        driverName: string | null;
        plateNumber: string | null;
        hourlyRate: number;
        contractorName: string;
        summary: { totalHours: number; totalMoney: number; totalWithdrawals: number; totalReceivable: number };
        monthlyWork: Array<{ monthLabel: string; totalHours: number; totalWorkDays: number | null; pricePerHour: number; totalPrice: number }>;
      }> | undefined;
      if (!reportData || !Array.isArray(reportData) || reportData.length === 0) {
        toast.error('No data available for machinery summary');
        return;
      }

      const wb = XLSX.utils.book_new();

      const summaryRows = reportData.map((item) => ({
        'Machinery Name': item.machineryName,
        'Driver': item.driverName ?? '—',
        'Plate Number': item.plateNumber ?? '—',
        'Hourly Rate': item.hourlyRate,
        'Contractor': item.contractorName ?? '—',
        'Total Hours': item.summary.totalHours,
        'Total Money (AFN)': item.summary.totalMoney,
        'Total Withdrawals (AFN)': item.summary.totalWithdrawals,
        'Total Receivable (AFN)': item.summary.totalReceivable,
      }));
      const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
      const summaryColWidths = Object.keys(summaryRows[0] || {}).map((key) => ({
        wch: Math.max(key.length, ...summaryRows.map((row) => String(row[key as keyof typeof row]).length).slice(0, 20)) + 2,
      }));
      wsSummary['!cols'] = summaryColWidths;
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

      const monthlyRows: Array<{
        'Machinery Name': string;
        Month: string;
        Hours: number;
        'Work Days': string;
        'Price/Hour': number;
        'Total Price (AFN)': number;
      }> = [];
      for (const item of reportData) {
        for (const m of item.monthlyWork) {
          monthlyRows.push({
            'Machinery Name': item.machineryName,
            Month: m.monthLabel,
            Hours: m.totalHours,
            'Work Days': m.totalWorkDays != null ? String(m.totalWorkDays) : '—',
            'Price/Hour': m.pricePerHour,
            'Total Price (AFN)': m.totalPrice,
          });
        }
      }
      if (monthlyRows.length > 0) {
        const wsMonthly = XLSX.utils.json_to_sheet(monthlyRows);
        const monthlyColWidths = Object.keys(monthlyRows[0] || {}).map((key) => ({
          wch: Math.max(key.length, ...monthlyRows.map((row) => String(row[key as keyof typeof row]).length).slice(0, 20)) + 2,
        }));
        wsMonthly['!cols'] = monthlyColWidths;
        XLSX.utils.book_append_sheet(wb, wsMonthly, 'Monthly Breakdown');
      }

      XLSX.writeFile(wb, `machinery-summary-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
      toast.success('Machinery Summary report exported to Excel');
    } catch (err) {
      console.error('Excel export failed:', err);
      toast.error('Failed to export Machinery Summary report');
    } finally {
      setMachinerySummaryExcelLoading(false);
    }
  }, [filteredMachineryList, companyName]);

  return (
    <div className="space-y-6 mt-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Machinery Reports</h2>
          <p className="text-sm text-muted-foreground">
            Generate and export comprehensive machinery reports
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <Checkbox
              id="include-out-of-service"
              checked={includeOutOfService}
              onCheckedChange={(v) => setIncludeOutOfService(v === true)}
            />
            <Label htmlFor="include-out-of-service" className="text-sm cursor-pointer whitespace-nowrap">
              Include Out of Service
            </Label>
          </div>
          {hasPermission('reports:generatePdf') && (
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={handleMachineryReportExportExcel}
              disabled={filteredMachineryList.length === 0 || machineryListExcelLoading}
            >
              {machineryListExcelLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
              ) : (
                <FileSpreadsheet className="h-3.5 w-3.5 mr-1" />
              )}
              {machineryListExcelLoading ? 'Exporting...' : 'Export Excel'}
            </Button>
          )}
          {hasPermission('reports:generatePdf') && (
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={handleMachineryContractorExportExcel}
              disabled={filteredMachineryList.length === 0 || machineryContractorExcelLoading}
            >
              {machineryContractorExcelLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
              ) : (
                <FileSpreadsheet className="h-3.5 w-3.5 mr-1" />
              )}
              {machineryContractorExcelLoading ? 'Exporting...' : 'Export Contractors'}
            </Button>
          )}
          {hasPermission('reports:generatePdf') && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="default"
                  size="sm"
                  className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white"
                  disabled={filteredMachineryList.length === 0 || machineryDropdownPdfLoading}
                >
                  {machineryDropdownPdfLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                  ) : (
                    <FileDown className="h-3.5 w-3.5 mr-1" />
                  )}
                  {machineryDropdownPdfLoading ? 'Generating...' : 'Generate Report'}
                  <ChevronDown className="ml-1 h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={handleMachineryContractorSummaryPdf}>
                  <Users className="mr-2 h-4 w-4" />
                  <span>Machinery by Contractor</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleFuelPerMachineryPdf}>
                  <Fuel className="mr-2 h-4 w-4" />
                  <span>Fuel Usage per Machinery</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleWorkHoursPerMachineryPdf}>
                  <Clock className="mr-2 h-4 w-4" />
                  <span>Work Hours per Machinery</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleMachinerySummaryPdf}>
                  <BarChart3 className="mr-2 h-4 w-4" />
                  <span>Machinery Summary Report</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleMachinerySummaryExcel}>
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                  <span>Machinery Summary (Excel)</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="transition-shadow hover:shadow-md">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-600/10">
                <Truck className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Machinery</p>
                <p className="text-lg font-bold">{machineryReportSummary.total}</p>
                <p className="text-xs text-muted-foreground">All equipment</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="transition-shadow hover:shadow-md">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-600/10">
                <Check className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Operational</p>
                <p className="text-lg font-bold">{machineryReportSummary.operational}</p>
                <p className="text-xs text-muted-foreground">Ready for use</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="transition-shadow hover:shadow-md">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-600/10">
                <Clock className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Under Maintenance</p>
                <p className="text-lg font-bold">{machineryReportSummary.maintenance}</p>
                <p className="text-xs text-muted-foreground">Being serviced</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="transition-shadow hover:shadow-md">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-600/10">
                <Truck className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Out of Service</p>
                <p className="text-lg font-bold">{machineryReportSummary.outOfService}</p>
                <p className="text-xs text-muted-foreground">Not available</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-emerald-600" />
            Machinery List
          </CardTitle>
          <CardDescription>
            {filteredMachineryList.length} machinery item{filteredMachineryList.length !== 1 ? 's' : ''} found
            {!includeOutOfService && ` (excluding out of service)`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredMachineryList.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="py-3 text-left font-medium text-muted-foreground w-10">#</th>
                    <th className="py-3 text-left font-medium text-muted-foreground">Machinery Name</th>
                    <th className="py-3 text-left font-medium text-muted-foreground">Type</th>
                    <th className="py-3 text-left font-medium text-muted-foreground">Plate Number</th>
                    <th className="py-3 text-left font-medium text-muted-foreground">Driver Name</th>
                    <th className="py-3 text-left font-medium text-muted-foreground">Contractor</th>
                    <th className="py-3 text-left font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMachineryList.map((m, i) => {
                    const statusLabel = MACHINERY_STATUS_LABELS[m.status as MachineryStatus] ?? m.status;
                    return (
                      <tr key={m.id} className="border-b last:border-0 hover:bg-muted/50">
                        <td className="py-3 text-muted-foreground">{i + 1}</td>
                        <td className="py-3 font-medium">{m.machineryName}</td>
                        <td className="py-3 text-muted-foreground">{m.machineryType}</td>
                        <td className="py-3 text-muted-foreground">{m.plateNumber || '\u2014'}</td>
                        <td className="py-3 text-muted-foreground">{m.driverName || '\u2014'}</td>
                        <td className="py-3 text-muted-foreground">{m.assignedContractor?.contractorName || '\u2014'}</td>
                        <td className="py-3">
                          <Badge variant="outline" className={
                            m.status === 'OPERATIONAL'
                              ? 'border-emerald-300 text-emerald-700 bg-emerald-50 dark:bg-emerald-950 dark:text-emerald-300'
                              : m.status === 'UNDER_MAINTENANCE'
                              ? 'border-amber-300 text-amber-700 bg-amber-50 dark:bg-amber-950 dark:text-amber-300'
                              : 'border-red-300 text-red-700 bg-red-50 dark:bg-red-950 dark:text-red-300'
                          }>
                            {statusLabel}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-12 text-center">
              <Truck className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No machinery found</p>
              <p className="text-xs text-muted-foreground mt-1">
                {!includeOutOfService
                  ? 'Try enabling "Include Out of Service" to see all machinery'
                  : 'Add machinery from the Machinery section to get started'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
