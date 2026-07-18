'use client';

import * as React from 'react';
import { useState, useCallback, useEffect, useMemo } from 'react';
import { pdf } from "@react-pdf/renderer";
import { useExpenseStore } from '@/hooks/use-expense-store';
import { usePermissions } from '@/hooks/use-permissions';
import { CATEGORY_LABELS, CATEGORY_COLORS, PAYMENT_METHOD_LABELS } from '@/types/expense';
import type { Category, Expense, LedgerEntry } from '@/types/expense';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LoadingSpinner } from '@/components/common/loading-spinner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/common/empty-state';

import ContractorPDFDocument from '@/components/pdf/contractor-pdf-document';
import MachineryPDFDocument from '@/components/pdf/machinery-pdf-document';
import { MachineryContractorSummaryPDFDocument } from '@/components/pdf/machinery-contractor-summary-pdf-document';
import { MachineryFuelPerMachineryPDFDocument } from '@/components/pdf/machinery-fuel-per-machinery-pdf-document';
import { MachineryWorkHoursPDFDocument } from '@/components/pdf/machinery-work-hours-pdf-document';
import { TimesheetFormDialog } from '@/components/machinery/timesheet-form-dialog';
import ContractorFinancialReportPDFDocument from '@/components/pdf/contractor-financial-report-pdf-document';
import { fuelApi } from '@/services/asset-api';
import {
  BarChart3,
  Download,
  FileText,
  FileSpreadsheet,
  Eye,
  Filter,
  Calendar,
  DollarSign,
  User,
  FileDown,
  Loader2,
  Search,
  ChevronLeft,
  ChevronRight,
  Clock,
  Fuel,
  Receipt,
  Check,
  ChevronsUpDown,
  Truck,
  ChevronDown,
  List,
  Users,
  X,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  Cell,
} from 'recharts';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { contractorsApi, timesheetsApi, fuelUsageApi, machineryApi } from '@/services/contractor-api';
import type { Contractor, Timesheet, FuelUsage, Machinery, ContractorType, FuelType, MachineryStatus } from '@/types/contractor';
import { CONTRACTOR_TYPE_LABELS, FUEL_TYPE_LABELS, MACHINERY_STATUS_LABELS } from '@/types/contractor';
import { settingsApi } from '@/services/settings-api';
import { employeesApi } from '@/services/employee-api';
import { cashAdvanceApi } from '@/services/api';
import type { Employee, Department } from '@/types/employee';
import { DEPARTMENT_LABELS, EMPLOYEE_STATUS_LABELS } from '@/types/employee';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import MachineryFullReportPDFDocument from '@/components/pdf/machinery-full-report-pdf-document';
import MachinerySummaryPDFDocument from '@/components/pdf/machinery-summary-pdf-document';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'AFN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function ReportsPage() {
  const { dashboardStats, fetchDashboard, expenses, fetchExpenses, selectedExpenseIds, isLoading } = useExpenseStore();
  const [hasFetched, setHasFetched] = useState(false);


  useEffect(() => {
    if (!hasFetched) {
      fetchDashboard();
      fetchExpenses();
      setHasFetched(true);
    }
  }, [fetchDashboard, fetchExpenses, hasFetched]);

  // Get selected expenses for PDF
  const selectedExpenses = useMemo(() => {
    if (selectedExpenseIds.size === 0) return expenses;
    return expenses.filter((e) => selectedExpenseIds.has(e.id));
  }, [expenses, selectedExpenseIds]);

  // ─── Contractor Report State ────────────────────────────────
  const [companyName, setCompanyName] = useState('YakhshiLedger');
  const [activeReportTab, setActiveReportTab] = useState('expenses');
  const [contractorList, setContractorList] = useState<Pick<Contractor, 'id' | 'contractorName' | 'contractorType' | 'status'>[]>([]);
  const [selectedContractorId, setSelectedContractorId] = useState('');
  const [selectedContractor, setSelectedContractor] = useState<Contractor | null>(null);
  const [contractorTimesheets, setContractorTimesheets] = useState<Timesheet[]>([]);
  const [contractorFuelUsages, setContractorFuelUsages] = useState<FuelUsage[]>([]);
  const [ctrDateFrom, setCtrDateFrom] = useState('');
  const [ctrDateTo, setCtrDateTo] = useState('');
  const [ctrIsLoadingProfile, setCtrIsLoadingProfile] = useState(false);
  const [ctrIsPdfGenerating, setCtrIsPdfGenerating] = useState(false);
  const [ctrPdfPreviewOpen, setCtrPdfPreviewOpen] = useState(false);
  const [ctrSelectOpen, setCtrSelectOpen] = useState(false);
  const [ctrAllFinancialPdfLoading, setCtrAllFinancialPdfLoading] = useState(false);

  // Section toggles for contractor report
  const [showTimesheets, setShowTimesheets] = useState(true);
  const [showFuelUsages, setShowFuelUsages] = useState(true);
  const [showExpenses, setShowExpenses] = useState(true);

  // Machinery report state
  const [machineryList, setMachineryList] = useState<Pick<Machinery, 'id' | 'machineryName' | 'plateNumber'>[]>([]);
  const [selectedMachineryId, setSelectedMachineryId] = useState('');
  const [selectedMachinery, setSelectedMachinery] = useState<Machinery | null>(null);
  const [machineryTimesheets, setMachineryTimesheets] = useState<Timesheet[]>([]);
  const [machineryFuelUsages, setMachineryFuelUsages] = useState<FuelUsage[]>([]);
  const [machineryIsLoading, setMachineryIsLoading] = useState(false);
  const [machineryPdfGenerating, setMachineryPdfGenerating] = useState(false);
  const [machineryPdfPreviewOpen, setMachineryPdfPreviewOpen] = useState(false);
  const [machinerySelectOpen, setMachinerySelectOpen] = useState(false);
  const [timesheetDialogOpen, setTimesheetDialogOpen] = useState(false);

  // ─── Machinery Report Tab State ────────────────────────────
  const [machineryReportList, setMachineryReportList] = useState<(Pick<Machinery, 'id' | 'machineryName' | 'machineryType' | 'plateNumber' | 'driverName' | 'status' | 'assignedContractorId' | 'model' | 'fuelType' | 'hourlyConsumptionRate' | 'hourlyRate' | 'dailyRate' | 'monthlyRate' | 'contractDaysPerMonth' | 'workHoursPerDay' | 'contractStartDate' | 'contractEndDate'> & { assignedContractor?: { contractorName: string; contractorType: string } | null })[]>([]);
  const [includeOutOfService, setIncludeOutOfService] = useState(true);
  const [machineryListExcelLoading, setMachineryListExcelLoading] = useState(false);
  const [machineryDropdownPdfLoading, setMachineryDropdownPdfLoading] = useState(false);
  const [machineryReportTimesheets, setMachineryReportTimesheets] = useState<Timesheet[]>([]);
  const [machineryReportFuelUsages, setMachineryReportFuelUsages] = useState<FuelUsage[]>([]);
  const [machineryReportPdfPreviewOpen, setMachineryReportPdfPreviewOpen] = useState(false);

  // ─── Employee Report State ────────────────────────────────
  const [employeeList, setEmployeeList] = useState<Pick<Employee, 'id' | 'fullName' | 'jobTitle' | 'department' | 'salary' | 'status' | 'hireDate'>[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [empDateFrom, setEmpDateFrom] = useState('');
  const [empDateTo, setEmpDateTo] = useState('');
  const [empIsLoadingProfile, setEmpIsLoadingProfile] = useState(false);
  const [empIsPdfGenerating, setEmpIsPdfGenerating] = useState(false);
  const [empPdfPreviewOpen, setEmpPdfPreviewOpen] = useState(false);
  const [empSelectOpen, setEmpSelectOpen] = useState(false);
  const [empShowPersonalInfo, setEmpShowPersonalInfo] = useState(true);
  const [empShowJobInfo, setEmpShowJobInfo] = useState(true);
  const [empShowSalarySummary, setEmpShowSalarySummary] = useState(true);
  const [empShowExpensesPaidTo, setEmpShowExpensesPaidTo] = useState(true);
  const [empShowExpensesPaidBy, setEmpShowExpensesPaidBy] = useState(true);
  const [empShowLedger, setEmpShowLedger] = useState(true);
  const [empListWithSalary, setEmpListWithSalary] = useState(true);
  const [empListIsPdfGenerating, setEmpListIsPdfGenerating] = useState(false);
  const [empListIsExcelGenerating, setEmpListIsExcelGenerating] = useState(false);
  const [empListActiveOnly, setEmpListActiveOnly] = useState(false);
  const [empListDateFrom, setEmpListDateFrom] = useState('');
  const [empListDateTo, setEmpListDateTo] = useState('');
  const [allEmployees, setAllEmployees] = useState<Pick<Employee, 'id' | 'fullName' | 'jobTitle' | 'department' | 'salary' | 'status' | 'hireDate'>[]>([]);

  // ─── Fuel Report State ────────────────────────────
  const [fuelDateFrom, setFuelDateFrom] = useState('');
  const [fuelDateTo, setFuelDateTo] = useState('');
  const [fuelExcelExporting, setFuelExcelExporting] = useState<'purchase' | 'issue' | 'usage' | null>(null);
  const [fuelPdfExporting, setFuelPdfExporting] = useState<'purchase' | 'issue' | 'usage' | null>(null);

  useEffect(() => {
    contractorsApi.getList().then((res) => {
      if (res.data) setContractorList(res.data);
    }).catch(() => {});
    employeesApi.getList('ACTIVE').then((res) => {
      if (res.data) setEmployeeList(res.data);
    }).catch(() => {});
    employeesApi.getList('ALL').then((res) => {
      if (res.data) setAllEmployees(res.data);
    }).catch(() => {});
    settingsApi.get().then((res) => {
      if (res.data?.companyName) setCompanyName(res.data.companyName);
    }).catch(() => {});
    machineryApi.getList().then((res) => {
      if (res.data) setMachineryReportList(res.data);
    }).catch(() => {});
  }, []);

  const handleContractorSelect = useCallback(async (contractorId: string) => {
    if (!contractorId) {
      setSelectedContractorId('');
      setSelectedContractor(null);
      setContractorTimesheets([]);
      setContractorFuelUsages([]);
      setMachineryList([]);
      setSelectedMachineryId('');
      setSelectedMachinery(null);
      setMachineryTimesheets([]);
      setMachineryFuelUsages([]);
      return;
    }
    setSelectedContractorId(contractorId);
    setCtrIsLoadingProfile(true);
    try {
      const [ctrRes, tsRes, fuRes, machRes] = await Promise.all([
        contractorsApi.getById(contractorId),
        timesheetsApi.getAll({ contractorId, pageSize: 500 }),
        fuelUsageApi.getAll({ contractorId, pageSize: 500 }),
        machineryApi.getAll({ assignedContractorId: contractorId, pageSize: 100 }),
      ]);
      if (ctrRes.data) setSelectedContractor(ctrRes.data);
      if (tsRes.data) setContractorTimesheets(tsRes.data.data);
      if (fuRes.data) setContractorFuelUsages(fuRes.data.data);
      if (machRes.data) setMachineryList(machRes.data.data ?? []);
    } catch {
      toast.error('Failed to load contractor data');
    } finally {
      setCtrIsLoadingProfile(false);
    }
  }, []);

  const handleEmployeeSelect = useCallback(async (employeeId: string) => {
    if (!employeeId) {
      setSelectedEmployeeId('');
      setSelectedEmployee(null);
      return;
    }
    setSelectedEmployeeId(employeeId);
    setEmpIsLoadingProfile(true);
    try {
      const empRes = await employeesApi.getById(employeeId);
      if (empRes.data) setSelectedEmployee(empRes.data);
    } catch {
      toast.error('Failed to load employee data');
    } finally {
      setEmpIsLoadingProfile(false);
    }
  }, []);

  const handleEmpDownloadPDF = useCallback(async () => {
    if (!selectedEmployee) return;
    setEmpIsPdfGenerating(true);
    try {
      const { default: EmployeePDFDocument } = await import('@/components/pdf/employee-pdf-document');
      const [walletRes] = await Promise.all([
        cashAdvanceApi.getEmployeeWallet(selectedEmployee.id),
      ]);
      const ledger = walletRes.data?.ledger ?? [];
      const balance = walletRes.data?.account?.currentBalance ?? 0;

      let paidBy = ((selectedEmployee.expensesPaidBy ?? []).filter((e): e is Expense => Boolean(e && e.id)));
      let paidTo = ((selectedEmployee.expensesPaidTo ?? []).filter((e): e is Expense => Boolean(e && e.id)));

      if (empDateFrom) {
        paidBy = paidBy.filter((e) => e.expenseDate >= empDateFrom);
        paidTo = paidTo.filter((e) => e.expenseDate >= empDateFrom);
      }
      if (empDateTo) {
        paidBy = paidBy.filter((e) => e.expenseDate <= empDateTo);
        paidTo = paidTo.filter((e) => e.expenseDate <= empDateTo);
      }

      const filteredLedger = ledger.filter((e): e is LedgerEntry => Boolean(e && e.id));
      const blob = await pdf(
        <EmployeePDFDocument
          employee={selectedEmployee}
          expensesPaidBy={paidBy}
          expensesPaidTo={paidTo}
          ledger={filteredLedger}
          walletBalance={balance}
          filters={{ dateFrom: empDateFrom || undefined, dateTo: empDateTo || undefined }}
          showPersonalInfo={empShowPersonalInfo}
          showJobInfo={empShowJobInfo}
          showSalarySummary={empShowSalarySummary}
          showExpensesPaidTo={empShowExpensesPaidTo}
          showExpensesPaidBy={empShowExpensesPaidBy}
          showLedger={empShowLedger}
        />
      ).toBlob();

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `employee-report-${selectedEmployee.fullName.replace(/\s+/g, '-').toLowerCase()}-${format(new Date(), 'yyyy-MM-dd')}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('Employee report downloaded');
    } catch (err) {
      console.error('PDF generation failed:', err);
      toast.error('Failed to generate employee report');
    } finally {
      setEmpIsPdfGenerating(false);
    }
  }, [selectedEmployee, empDateFrom, empDateTo, empShowPersonalInfo, empShowJobInfo, empShowSalarySummary, empShowExpensesPaidTo, empShowExpensesPaidBy, empShowLedger]);

  const handleEmpListDownloadPDF = useCallback(async () => {
    setEmpListIsPdfGenerating(true);
    try {
      const { default: EmployeeListPDFDocument } = await import('@/components/pdf/employee-list-pdf-document');
      let filtered = (Array.isArray(allEmployees) ? allEmployees : []).filter(
        (e): e is typeof allEmployees[number] => Boolean(e && e.id)
      );
      if (empListDateFrom) {
        filtered = filtered.filter((e) => (e.hireDate || '').split('T')[0] >= empListDateFrom);
      }
      if (empListDateTo) {
        filtered = filtered.filter((e) => (e.hireDate || '').split('T')[0] <= empListDateTo);
      }
      if (empListActiveOnly) {
        filtered = filtered.filter((e) => e.status === 'ACTIVE');
      }
      const blob = await pdf(
        <EmployeeListPDFDocument
          employees={filtered}
          showSalary={empListWithSalary}
          companyName={companyName}
          dateFrom={empListDateFrom || undefined}
          dateTo={empListDateTo || undefined}
        />
      ).toBlob();

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const label = empListWithSalary ? 'with-salary' : 'without-salary';
      link.download = `employee-list-${label}-${format(new Date(), 'yyyy-MM-dd')}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('Employee list report downloaded');
    } catch (err) {
      console.error('PDF generation failed:', err);
      toast.error('Failed to generate employee list report');
    } finally {
      setEmpListIsPdfGenerating(false);
    }
  }, [allEmployees, empListWithSalary, empListActiveOnly, companyName, empListDateFrom, empListDateTo]);

  const handleEmpListExportExcel = useCallback(() => {
    setEmpListIsExcelGenerating(true);
    try {
      let filtered = allEmployees;
      if (empListDateFrom) {
        filtered = filtered.filter((e) => (e.hireDate || '').split('T')[0] >= empListDateFrom);
      }
      if (empListDateTo) {
        filtered = filtered.filter((e) => (e.hireDate || '').split('T')[0] <= empListDateTo);
      }
      if (empListActiveOnly) {
        filtered = filtered.filter((e) => e.status === 'ACTIVE');
      }

      const rows = filtered.map((e, i) => {
        const deptLabel = DEPARTMENT_LABELS[e.department as Department] ?? e.department;
        const statusLabel = EMPLOYEE_STATUS_LABELS[e.status as keyof typeof EMPLOYEE_STATUS_LABELS] ?? e.status;
        const row: Record<string, string | number> = {
          '#': i + 1,
          'Full Name': e.fullName,
          'Department': deptLabel,
          'Job Title': e.jobTitle,
        };
        if (empListWithSalary) {
          row['Salary'] = e.salary;
        }
        row['Hire Date'] = e.hireDate ? format(new Date(e.hireDate), 'yyyy-MM-dd') : '—';
        row['Status'] = statusLabel;
        return row;
      });

      const ws = XLSX.utils.json_to_sheet(rows);

      const colWidths = Object.keys(rows[0] || {}).map((key) => ({
        wch: Math.max(
          key.length,
          ...rows.map((row) => String(row[key as keyof typeof row]).length).slice(0, 20),
        ) + 2,
      }));
      ws['!cols'] = colWidths;

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Employees');

      const totalSalary = filtered.reduce((s, e) => s + e.salary, 0);
      const activeCount = filtered.filter((e) => e.status === 'ACTIVE').length;
      const deptCount = new Set(filtered.map((e) => e.department)).size;

      const summaryData: { Metric: string; Value: string | number }[] = [
        { Metric: 'Total Employees', Value: filtered.length },
        { Metric: 'Active Employees', Value: activeCount },
        { Metric: 'Departments', Value: deptCount },
      ];
      if (empListWithSalary) {
        summaryData.push(
          { Metric: 'Total Salary', Value: totalSalary },
          { Metric: 'Average Salary', Value: filtered.length > 0 ? Math.round(totalSalary / filtered.length) : 0 },
        );
      }
      const ws2 = XLSX.utils.json_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, ws2, 'Summary');

      XLSX.writeFile(wb, `employee-list-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
      toast.success('Employee list exported to Excel');
    } catch (err) {
      console.error('Excel export failed:', err);
      toast.error('Failed to export employee list to Excel');
    } finally {
      setEmpListIsExcelGenerating(false);
    }
  }, [allEmployees, empListWithSalary, empListActiveOnly, empListDateFrom, empListDateTo]);

  const handleCtrDownloadPDF = useCallback(async () => {
    if (!selectedContractor) return;
    setCtrIsPdfGenerating(true);
    try {
      let filteredTs = contractorTimesheets;
      let filteredFu = contractorFuelUsages;
      if (ctrDateFrom) {
        filteredTs = filteredTs.filter((t) => t.date >= ctrDateFrom);
        filteredFu = filteredFu.filter((f) => f.date >= ctrDateFrom);
      }
      if (ctrDateTo) {
        filteredTs = filteredTs.filter((t) => t.date <= ctrDateTo);
        filteredFu = filteredFu.filter((f) => f.date <= ctrDateTo);
      }

      const blob = await pdf(
        <ContractorPDFDocument
          contractor={selectedContractor}
          timesheets={filteredTs}
          fuelUsages={filteredFu}
          filters={{ dateFrom: ctrDateFrom || undefined, dateTo: ctrDateTo || undefined }}
          companyName={companyName}
          showTimesheets={showTimesheets}
          showFuelUsages={showFuelUsages}
          showExpenses={showExpenses}
        />
      ).toBlob();

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `contractor-report-${selectedContractor.contractorName.replace(/\s+/g, '-').toLowerCase()}-${format(new Date(), 'yyyy-MM-dd')}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('Contractor report downloaded');
    } catch (err) {
      console.error('PDF generation failed:', err);
      toast.error('Failed to generate contractor report');
    } finally {
      setCtrIsPdfGenerating(false);
    }
  }, [selectedContractor, contractorTimesheets, contractorFuelUsages, ctrDateFrom, ctrDateTo, showTimesheets, showFuelUsages, showExpenses, companyName]);

  const handleAllContractorsFinancialReport = useCallback(async () => {
    setCtrAllFinancialPdfLoading(true);
    try {
      const res = await contractorsApi.getFinancialReport({
        dateFrom: ctrDateFrom || undefined,
        dateTo: ctrDateTo || undefined,
      });
      const reportData = res.data;
      if (!reportData || !Array.isArray(reportData) || reportData.length === 0) {
        toast.error('No data available for financial report');
        return;
      }
      const blob = await pdf(
        <ContractorFinancialReportPDFDocument
          data={reportData}
          companyName={companyName}
          dateFrom={ctrDateFrom || undefined}
          dateTo={ctrDateTo || undefined}
        />
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `all-contractors-financial-report-${format(new Date(), 'yyyy-MM-dd')}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('All Contractors Financial Report downloaded');
    } catch (err) {
      console.error('PDF generation failed:', err);
      toast.error('Failed to generate financial report');
    } finally {
      setCtrAllFinancialPdfLoading(false);
    }
  }, [ctrDateFrom, ctrDateTo, companyName]);

  const handleMachinerySelect = useCallback(async (machineryId: string) => {
    if (!machineryId || !selectedContractorId) {
      setSelectedMachineryId('');
      setSelectedMachinery(null);
      setMachineryTimesheets([]);
      setMachineryFuelUsages([]);
      return;
    }
    setSelectedMachineryId(machineryId);
    setMachineryIsLoading(true);
    try {
      const [machRes, tsRes, fuRes] = await Promise.all([
        machineryApi.getById(machineryId),
        timesheetsApi.getAll({ contractorId: selectedContractorId, machineryId, pageSize: 500 }),
        fuelUsageApi.getAll({ contractorId: selectedContractorId, machineryId, pageSize: 500 }),
      ]);
      if (machRes.data) setSelectedMachinery(machRes.data);
      if (tsRes.data) setMachineryTimesheets(tsRes.data.data);
      if (fuRes.data) setMachineryFuelUsages(fuRes.data.data);
    } catch {
      toast.error('Failed to load machinery data');
    } finally {
      setMachineryIsLoading(false);
    }
  }, [selectedContractorId]);

  const handleMachineryDownloadPDF = useCallback(async () => {
    if (!selectedMachinery || !selectedContractor) return;
    setMachineryPdfGenerating(true);
    try {
      let filteredTs = machineryTimesheets;
      let filteredFu = machineryFuelUsages;
      if (ctrDateFrom) {
        filteredTs = filteredTs.filter((t) => t.date >= ctrDateFrom);
        filteredFu = filteredFu.filter((f) => f.date >= ctrDateFrom);
      }
      if (ctrDateTo) {
        filteredTs = filteredTs.filter((t) => t.date <= ctrDateTo);
        filteredFu = filteredFu.filter((f) => f.date <= ctrDateTo);
      }

      const blob = await pdf(
        <MachineryPDFDocument
          machinery={selectedMachinery}
          contractor={selectedContractor}
          timesheets={filteredTs}
          fuelUsages={filteredFu}
          filters={{ dateFrom: ctrDateFrom || undefined, dateTo: ctrDateTo || undefined }}
          companyName={companyName}
        />
      ).toBlob();

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `machinery-report-${selectedMachinery.machineryName.replace(/\s+/g, '-').toLowerCase()}-${format(new Date(), 'yyyy-MM-dd')}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('Machinery report downloaded');
    } catch (err) {
      console.error('PDF generation failed:', err);
      toast.error('Failed to generate machinery report');
    } finally {
      setMachineryPdfGenerating(false);
    }
  }, [selectedMachinery, selectedContractor, machineryTimesheets, machineryFuelUsages, ctrDateFrom, ctrDateTo, companyName]);

  // ─── Machinery Report Tab Handlers ──────────────────────
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

  const handleMachineryReportGeneratePdf = useCallback(async (type: 'info' | 'timesheet' | 'fuel' | 'full') => {
    if (filteredMachineryList.length === 0) return;
    setMachineryDropdownPdfLoading(true);
    try {
      let timesheets: Timesheet[] = [];
      let fuelUsages: FuelUsage[] = [];

      if (type === 'timesheet' || type === 'full') {
        const results = await Promise.allSettled(
          filteredMachineryList.map((m) =>
            timesheetsApi.getAll({ machineryId: m.id, pageSize: 100 }).then((res) => res.data?.data ?? [])
          )
        );
        timesheets = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
        const failed = results.filter((r) => r.status === 'rejected').length;
        if (failed > 0) {
          toast.error(`Failed to load timesheets for ${failed} machinery item(s). Partial data will be used.`);
        }
      }

      if (type === 'fuel' || type === 'full') {
        const results = await Promise.allSettled(
          filteredMachineryList.map((m) =>
            fuelUsageApi.getAll({ machineryId: m.id, pageSize: 100 }).then((res) => res.data?.data ?? [])
          )
        );
        fuelUsages = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
        const failed = results.filter((r) => r.status === 'rejected').length;
        if (failed > 0) {
          toast.error(`Failed to load fuel data for ${failed} machinery item(s). Partial data will be used.`);
        }
      }

      const blob = await pdf(
        <MachineryFullReportPDFDocument
          machineryList={filteredMachineryList}
          timesheets={timesheets}
          fuelUsages={fuelUsages}
          reportType={type}
          companyName={companyName}
        />
      ).toBlob();

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const typeLabels: Record<string, string> = {
        info: 'machinery-info-list',
        timesheet: 'machinery-timesheet',
        fuel: 'machinery-fuel-metric',
        full: 'machinery-financial-summary',
      };
      link.download = `${typeLabels[type]}-${format(new Date(), 'yyyy-MM-dd')}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('Machinery report downloaded');
    } catch (err) {
      console.error('PDF generation failed:', err);
      toast.error('Failed to generate machinery report');
    } finally {
      setMachineryDropdownPdfLoading(false);
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
      const res = await contractorsApi.getFinancialReport({
        dateFrom: ctrDateFrom || undefined,
        dateTo: ctrDateTo || undefined,
      });
      const reportData = res.data;
      if (!reportData || !Array.isArray(reportData) || reportData.length === 0) {
        toast.error('No data available for machinery summary');
        return;
      }
      const blob = await pdf(
        <MachinerySummaryPDFDocument
          data={reportData}
          companyName={companyName}
          dateFrom={ctrDateFrom || undefined}
          dateTo={ctrDateTo || undefined}
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
  }, [filteredMachineryList, companyName, ctrDateFrom, ctrDateTo]);

  // ─── Fuel Report Handlers ────────────────────────
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
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `purchased-fuel-${format(new Date(), 'yyyy-MM-dd')}.pdf`;
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
      URL.revokeObjectURL(url);
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
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `issued-fuel-${format(new Date(), 'yyyy-MM-dd')}.pdf`;
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
      URL.revokeObjectURL(url);
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
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `fuel-usage-range-${format(new Date(), 'yyyy-MM-dd')}.pdf`;
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success(`Fuel usage PDF exported (${records.length} records)`);
    } catch { toast.error('Failed to export fuel usage PDF'); }
    finally { setFuelPdfExporting(null); }
  }, [fuelDateFrom, fuelDateTo, companyName]);

  // Export to CSV
  const exportCSV = React.useCallback(() => {
    const data = selectedExpenses.map((e, i) => ({
      '#': i + 1,
      Title: e.title,
      Category: CATEGORY_LABELS[e.category as Category] ?? e.category,
      Amount: e.amount,
      'Payment Method': PAYMENT_METHOD_LABELS[e.paymentMethod] ?? e.paymentMethod,
      'Paid To': e.paidTo,
      'Paid By': e.paidBy,
      Date: format(new Date(e.expenseDate), 'yyyy-MM-dd'),
      Description: e.description ?? '',
      Tags: e.tags ?? '',
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Expenses');

    // Auto-size columns
    const colWidths = Object.keys(data[0] || {}).map((key) => ({
      wch: Math.max(key.length, ...data.map((row) => String(row[key as keyof typeof row]).length).slice(0, 10)),
    }));
    ws['!cols'] = colWidths;

    XLSX.writeFile(wb, `expense-report-${format(new Date(), 'yyyy-MM-dd')}.csv`, { bookType: 'csv' });
  }, [selectedExpenses]);

  // Export to Excel
  const exportExcel = React.useCallback(() => {
    const data = selectedExpenses.map((e, i) => ({
      '#': i + 1,
      Title: e.title,
      Category: CATEGORY_LABELS[e.category as Category] ?? e.category,
      Amount: e.amount,
      'Payment Method': PAYMENT_METHOD_LABELS[e.paymentMethod] ?? e.paymentMethod,
      'Paid To': e.paidTo,
      'Paid By': e.paidBy,
      Date: format(new Date(e.expenseDate), 'yyyy-MM-dd'),
      Description: e.description ?? '',
      Tags: e.tags ?? '',
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Expenses');

    // Add summary sheet
    const summaryData = dashboardStats
      ? [
          { Metric: 'Total Expenses', Value: dashboardStats.totalExpenses },
          { Metric: 'Total Amount', Value: dashboardStats.totalAmount },
          { Metric: 'Average Amount', Value: dashboardStats.averageAmount },
          { Metric: 'This Month Count', Value: dashboardStats.expensesThisMonth },
          { Metric: 'This Month Amount', Value: dashboardStats.amountThisMonth },
        ]
      : [];
    const ws2 = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, ws2, 'Summary');

    XLSX.writeFile(wb, `expense-report-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  }, [selectedExpenses, dashboardStats]);

  if (isLoading && !dashboardStats) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <LoadingSpinner size="lg" text="Loading reports..." />
      </div>
    );
  }

  if (!dashboardStats) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <EmptyState
          icon={BarChart3}
          title="No report data"
          description="Start adding expenses to generate reports and analytics."
        />
      </div>
    );
  }

  const { expensesByCategory, monthlyTrend, totalAmount } = dashboardStats;

  // Prepare data for category bar chart
  const categoryChartData = expensesByCategory
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 8)
    .map((cat) => ({
      category: CATEGORY_LABELS[cat.category as Category] ?? cat.category,
      amount: cat.amount,
      count: cat.count,
      color: CATEGORY_COLORS[cat.category as Category] ?? '#78716c',
    }));

  const { canView, hasPermission } = usePermissions();

  if (!canView('reports')) return null;

  return (
    <div className="space-y-6">
      <Tabs value={activeReportTab} onValueChange={setActiveReportTab}>
        <TabsList>
          {canView('expenses') && (
            <TabsTrigger value="expenses" className="gap-1.5">
              <BarChart3 className="h-4 w-4" />
              Expense Reports
            </TabsTrigger>
          )}
          {canView('contractors') && (
            <TabsTrigger value="contractors" className="gap-1.5">
              <User className="h-4 w-4" />
              Contractor Reports
            </TabsTrigger>
          )}
          {canView('employees') && (
            <TabsTrigger value="employees" className="gap-1.5">
              <User className="h-4 w-4" />
              Employee Reports
            </TabsTrigger>
          )}
          {canView('machinery') && (
            <TabsTrigger value="machineryReport" className="gap-1.5">
              <Truck className="h-4 w-4" />
              Machinery Report
            </TabsTrigger>
          )}
          {canView('fuelUsage') && (
            <TabsTrigger value="fuelUsageReport" className="gap-1.5">
              <Fuel className="h-4 w-4" />
              Fuel Usage Reports
            </TabsTrigger>
          )}
        </TabsList>

        {canView('expenses') && (
        <TabsContent value="expenses" className="space-y-6 mt-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Expense Reports</h2>
          <p className="text-sm text-muted-foreground">
            Detailed expense analysis and export options
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {hasPermission('reports:generatePdf') && (
            <Button variant="outline" size="sm" onClick={exportCSV}>
              <FileText className="mr-1.5 h-3.5 w-3.5" />
              Export CSV
            </Button>
          )}
          {hasPermission('reports:generatePdf') && (
            <Button variant="outline" size="sm" onClick={exportExcel}>
              <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />
              Export Excel
            </Button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="transition-shadow hover:shadow-md">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Amount
            </CardTitle>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600/10">
              <DollarSign className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">
              {formatCurrency(dashboardStats.totalAmount)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {dashboardStats.totalExpenses} total expenses
            </p>
          </CardContent>
        </Card>

        <Card className="transition-shadow hover:shadow-md">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              This Month
            </CardTitle>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600/10">
              <Calendar className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">
              {formatCurrency(dashboardStats.amountThisMonth)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {dashboardStats.expensesThisMonth} expenses this month
            </p>
          </CardContent>
        </Card>

        <Card className="transition-shadow hover:shadow-md">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Average
            </CardTitle>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600/10">
              <BarChart3 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">
              {formatCurrency(dashboardStats.averageAmount)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Per expense average
            </p>
          </CardContent>
        </Card>

        <Card className="transition-shadow hover:shadow-md">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Selected for Export
            </CardTitle>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600/10">
              <Filter className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">
              {selectedExpenses.length}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {selectedExpenseIds.size === 0 ? 'All expenses' : `${selectedExpenseIds.size} selected`}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Monthly Trend Line Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              Monthly Expense Trend
            </CardTitle>
            <CardDescription>Amount and count over time</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlyTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#059669" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border/50" />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12 }}
                    tickFormatter={(value: number) =>
                      value >= 1000 ? `$${(value / 1000).toFixed(0)}k` : `$${value}`
                    }
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid hsl(var(--border))',
                      backgroundColor: 'hsl(var(--popover))',
                      color: 'hsl(var(--popover-foreground))',
                    }}
                    formatter={(value: number) => [formatCurrency(value), 'Amount']}
                  />
                  <Area
                    type="monotone"
                    dataKey="amount"
                    stroke="#059669"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorAmount)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Category Bar Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              Expenses by Category
            </CardTitle>
            <CardDescription>Top categories by amount</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={categoryChartData}
                  layout="vertical"
                  margin={{ top: 8, right: 8, left: 80, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-border/50" />
                  <XAxis
                    type="number"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12 }}
                    tickFormatter={(value: number) =>
                      value >= 1000 ? `$${(value / 1000).toFixed(0)}k` : `$${value}`
                    }
                  />
                  <YAxis
                    type="category"
                    dataKey="category"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11 }}
                    width={75}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid hsl(var(--border))',
                      backgroundColor: 'hsl(var(--popover))',
                      color: 'hsl(var(--popover-foreground))',
                    }}
                    formatter={(value: number) => [formatCurrency(value), 'Amount']}
                  />
                  <Bar dataKey="amount" radius={[0, 6, 6, 0]} maxBarSize={32}>
                    {categoryChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Category Breakdown Table */}
      <Card>
        <CardHeader>
          <CardTitle>Category Breakdown</CardTitle>
          <CardDescription>Detailed breakdown by expense category</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-3 text-left font-medium text-muted-foreground">Category</th>
                  <th className="py-3 text-right font-medium text-muted-foreground">Count</th>
                  <th className="py-3 text-right font-medium text-muted-foreground">Amount</th>
                  <th className="py-3 text-right font-medium text-muted-foreground">Average</th>
                  <th className="py-3 text-right font-medium text-muted-foreground">% of Total</th>
                </tr>
              </thead>
              <tbody>
                {expensesByCategory
                  .sort((a, b) => b.amount - a.amount)
                  .map((cat) => {
                    const catColor = CATEGORY_COLORS[cat.category as Category] ?? '#78716c';
                    const percentage = totalAmount > 0 ? (cat.amount / totalAmount) * 100 : 0;
                    const avg = cat.count > 0 ? cat.amount / cat.count : 0;
                    return (
                      <tr key={cat.category} className="border-b last:border-0 hover:bg-muted/50">
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <div
                              className="h-3 w-3 rounded-sm shrink-0"
                              style={{ backgroundColor: catColor }}
                            />
                            <span className="font-medium">
                              {CATEGORY_LABELS[cat.category as Category] ?? cat.category}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 text-right text-muted-foreground">{cat.count}</td>
                        <td className="py-3 text-right font-medium">{formatCurrency(cat.amount)}</td>
                        <td className="py-3 text-right text-muted-foreground">{formatCurrency(avg)}</td>
                        <td className="py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="h-2 w-16 rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${percentage}%`, backgroundColor: catColor }}
                              />
                            </div>
                            <span className="text-muted-foreground tabular-nums w-12 text-right">
                              {percentage.toFixed(1)}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <td className="pt-3">Total</td>
                  <td className="pt-3 text-right">{dashboardStats.totalExpenses}</td>
                  <td className="pt-3 text-right">{formatCurrency(totalAmount)}</td>
                  <td className="pt-3 text-right">{formatCurrency(dashboardStats.averageAmount)}</td>
                  <td className="pt-3 text-right">100%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

        </TabsContent>
        )}

        {canView('contractors') && (
        <TabsContent value="contractors" className="space-y-6 mt-6">
          {/* Header */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Contractor Reports</h2>
              <p className="text-sm text-muted-foreground">
                Generate comprehensive PDF reports for contractors
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1">
                <Input
                  type="date"
                  value={ctrDateFrom}
                  onChange={(e) => setCtrDateFrom(e.target.value)}
                  className="h-8 w-[130px] text-xs"
                />
                <span className="text-xs text-muted-foreground">to</span>
                <Input
                  type="date"
                  value={ctrDateTo}
                  onChange={(e) => setCtrDateTo(e.target.value)}
                  className="h-8 w-[130px] text-xs"
                />
              </div>
              {(ctrDateFrom || ctrDateTo) && (
                <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setCtrDateFrom(''); setCtrDateTo(''); }}>
                  Clear
                </Button>
              )}
              {hasPermission('reports:generatePdf') && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => setCtrPdfPreviewOpen(true)}
                  disabled={!selectedContractor}
                >
                  <Eye className="h-3.5 w-3.5 mr-1" />
                  Preview
                </Button>
              )}
              {hasPermission('reports:generatePdf') && (
                <Button
                  variant="default"
                  size="sm"
                  className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={handleCtrDownloadPDF}
                  disabled={!selectedContractor || ctrIsPdfGenerating}
                >
                  {ctrIsPdfGenerating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                  ) : (
                    <FileDown className="h-3.5 w-3.5 mr-1" />
                  )}
                  {ctrIsPdfGenerating ? 'Generating...' : 'Download PDF Report'}
                </Button>
              )}
              {hasPermission('reports:generatePdf') && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 border-emerald-600 text-emerald-600 hover:bg-emerald-50"
                  onClick={handleAllContractorsFinancialReport}
                  disabled={ctrAllFinancialPdfLoading}
                >
                  {ctrAllFinancialPdfLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                  ) : (
                    <FileDown className="h-3.5 w-3.5 mr-1" />
                  )}
                  {ctrAllFinancialPdfLoading ? 'Generating...' : 'All Contractors Financial Report'}
                </Button>
              )}
            </div>
          </div>

          {/* Contractor Selector */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <User className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm text-muted-foreground whitespace-nowrap">Select Contractor:</span>
                  <Popover open={ctrSelectOpen} onOpenChange={setCtrSelectOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={ctrSelectOpen}
                        className="w-full sm:w-[300px] h-9 justify-between"
                      >
                        {selectedContractorId
                          ? contractorList.find((c) => c.id === selectedContractorId)?.contractorName
                          : "Choose a contractor..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[400px] p-0">
                      <Command>
                        <CommandInput placeholder="Search contractor..." />
                        <CommandList>
                          <CommandEmpty>No contractor found.</CommandEmpty>
                          {contractorList.map((ctr) => (
                            <CommandItem
                              key={ctr.id}
                              value={ctr.id}
                              onSelect={(currentValue) => {
                                handleContractorSelect(currentValue === selectedContractorId ? '' : currentValue);
                                setCtrSelectOpen(false);
                              }}
                            >
                              <Check
                                className="mr-2 h-4 w-4"
                                style={{ opacity: selectedContractorId === ctr.id ? 1 : 0 }}
                              />
                              {ctr.contractorName}
                              <span className="ml-1 text-xs text-muted-foreground">
                                ({CONTRACTOR_TYPE_LABELS[ctr.contractorType as ContractorType] ?? ctr.contractorType})
                              </span>
                            </CommandItem>
                          ))}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                {ctrIsLoadingProfile && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Loading contractor data...
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Contractor Summary / Preview */}
          {selectedContractor && !ctrIsLoadingProfile && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-600/10">
                        <User className="h-5 w-5 text-emerald-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">Contractor</p>
                        <p className="text-sm font-bold truncate">{selectedContractor.contractorName}</p>
                        <p className="text-xs text-muted-foreground">{CONTRACTOR_TYPE_LABELS[selectedContractor.contractorType as ContractorType] ?? selectedContractor.contractorType}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-600/10">
                        <Clock className="h-5 w-5 text-emerald-600" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Timesheet Hours</p>
                        <p className="text-lg font-bold">{contractorTimesheets.reduce((s, t) => s + t.totalHours, 0).toFixed(1)} hrs</p>
                        <p className="text-xs text-muted-foreground">{contractorTimesheets.length} records</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-600/10">
                        <Fuel className="h-5 w-5 text-amber-600" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Fuel Cost</p>
                        <p className="text-lg font-bold">{formatCurrency(contractorFuelUsages.reduce((s, f) => s + f.totalCost, 0))}</p>
                        <p className="text-xs text-muted-foreground">{contractorFuelUsages.length} records</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-600/10">
                        <Receipt className="h-5 w-5 text-emerald-600" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Expenses Paid</p>
                        <p className="text-lg font-bold">{formatCurrency(selectedContractor.totalExpensesPaid ?? 0)}</p>
                        <p className="text-xs text-muted-foreground">{(selectedContractor.expensesPaidTo ?? []).length} records</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Section Selectors */}
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm font-medium mb-3">Include in Contractor Report PDF</p>
                  <div className="flex flex-wrap items-center gap-6">
                    <div className="flex items-center gap-2">
                      <Checkbox id="show-ts" checked={showTimesheets} onCheckedChange={(v) => setShowTimesheets(v === true)} />
                      <Label htmlFor="show-ts" className="text-sm cursor-pointer">Timesheet Records</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox id="show-fu" checked={showFuelUsages} onCheckedChange={(v) => setShowFuelUsages(v === true)} />
                      <Label htmlFor="show-fu" className="text-sm cursor-pointer">Fuel Usage Records</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox id="show-exp" checked={showExpenses} onCheckedChange={(v) => setShowExpenses(v === true)} />
                      <Label htmlFor="show-exp" className="text-sm cursor-pointer">Expense Records</Label>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Machinery Report Section */}
              <Card>
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-sm text-muted-foreground whitespace-nowrap">Machinery Report:</span>
                      <Popover open={machinerySelectOpen} onOpenChange={setMachinerySelectOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={machinerySelectOpen}
                            className="w-full sm:w-[300px] h-9 justify-between"
                          >
                            {selectedMachineryId
                              ? machineryList.find((m) => m.id === selectedMachineryId)?.machineryName
                              : "Choose a machinery..."}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[400px] p-0">
                          <Command>
                            <CommandInput placeholder="Search machinery..." />
                            <CommandList>
                              <CommandEmpty>No machinery found.</CommandEmpty>
                              {machineryList.map((m) => (
                                <CommandItem
                                  key={m.id}
                                  value={m.id}
                                  onSelect={(currentValue) => {
                                    handleMachinerySelect(currentValue === selectedMachineryId ? '' : currentValue);
                                    setMachinerySelectOpen(false);
                                  }}
                                >
                                  <Check
                                    className="mr-2 h-4 w-4"
                                    style={{ opacity: selectedMachineryId === m.id ? 1 : 0 }}
                                  />
                                  {m.machineryName}
                                  <span className="ml-1 text-xs text-muted-foreground">
                                    {m.plateNumber ? `(${m.plateNumber})` : ''}
                                  </span>
                                </CommandItem>
                              ))}
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </div>
                    {selectedMachineryId && (
                      <div className="flex items-center gap-2">
                        {hasPermission('reports:generatePdf') && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8"
                            onClick={() => setMachineryPdfPreviewOpen(true)}
                            disabled={!selectedMachinery || machineryIsLoading}
                          >
                            <Eye className="h-3.5 w-3.5 mr-1" />
                            Preview
                          </Button>
                        )}
                        {hasPermission('reports:generatePdf') && (
                          <Button
                            variant="default"
                            size="sm"
                            className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white"
                            onClick={handleMachineryDownloadPDF}
                            disabled={!selectedMachinery || machineryPdfGenerating || machineryIsLoading}
                          >
                            {machineryPdfGenerating ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                            ) : (
                              <FileDown className="h-3.5 w-3.5 mr-1" />
                            )}
                            {machineryPdfGenerating ? 'Generating...' : 'Machinery PDF'}
                          </Button>
                        )}
                        {hasPermission('reports:generatePdf') && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8"
                            onClick={() => setTimesheetDialogOpen(true)}
                            disabled={!selectedMachinery}
                          >
                            <FileText className="h-3.5 w-3.5 mr-1" />
                            Timesheet Form
                          </Button>
                        )}
                      </div>
                    )}
                    {machineryIsLoading && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Loading machinery data...
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {!selectedContractor && !ctrIsLoadingProfile && (
            <Card>
              <CardContent className="py-12">
                <div className="text-center">
                  <User className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">Select a contractor above to generate a report</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    The report will include contractor details, timesheets, fuel usage, expenses, and machinery information
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Contractor PDF Preview Modal */}
          <ContractorPdfPreviewModal
            open={ctrPdfPreviewOpen}
            onOpenChange={setCtrPdfPreviewOpen}
            contractor={selectedContractor}
            timesheets={contractorTimesheets}
            fuelUsages={contractorFuelUsages}
            dateFrom={ctrDateFrom}
            dateTo={ctrDateTo}
            companyName={companyName}
            showTimesheets={showTimesheets}
            showFuelUsages={showFuelUsages}
            showExpenses={showExpenses}
          />
          <MachineryPdfPreviewModal
            open={machineryPdfPreviewOpen}
            onOpenChange={setMachineryPdfPreviewOpen}
            machinery={selectedMachinery}
            contractor={selectedContractor}
            timesheets={machineryTimesheets}
            fuelUsages={machineryFuelUsages}
            dateFrom={ctrDateFrom}
            dateTo={ctrDateTo}
            companyName={companyName}
          />
          <TimesheetFormDialog
            open={timesheetDialogOpen}
            onOpenChange={setTimesheetDialogOpen}
            machinery={selectedMachinery}
            contractor={selectedContractor}
          />
        </TabsContent>
        )}

        {canView('machinery') && (
        <TabsContent value="machineryReport" className="space-y-6 mt-6">
          {/* Header */}
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
                    <DropdownMenuItem onClick={() => handleMachineryReportGeneratePdf('info')}>
                      <List className="mr-2 h-4 w-4" />
                      <span>Machinery Info List</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleMachineryReportGeneratePdf('timesheet')}>
                      <Clock className="mr-2 h-4 w-4" />
                      <span>Machinery Timesheet</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleMachineryReportGeneratePdf('fuel')}>
                      <Fuel className="mr-2 h-4 w-4" />
                      <span>Machinery Fuel Metric</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => handleMachineryReportGeneratePdf('full')}>
                      <BarChart3 className="mr-2 h-4 w-4" />
                      <span>Full Financial Summary</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
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
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>

          {/* Summary Cards */}
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

          {/* Machinery List Table */}
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
        </TabsContent>
        )}

        {canView('fuelUsage') && (
        <TabsContent value="fuelUsageReport" className="space-y-6 mt-6">
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
        </TabsContent>
        )}

        {canView('employees') && (
        <TabsContent value="employees" className="space-y-6 mt-6">
          {/* Header */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Employee Reports</h2>
              <p className="text-sm text-muted-foreground">
                Generate comprehensive PDF reports for employees
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1">
                <Input
                  type="date"
                  value={empDateFrom}
                  onChange={(e) => setEmpDateFrom(e.target.value)}
                  className="h-8 w-[130px] text-xs"
                />
                <span className="text-xs text-muted-foreground">to</span>
                <Input
                  type="date"
                  value={empDateTo}
                  onChange={(e) => setEmpDateTo(e.target.value)}
                  className="h-8 w-[130px] text-xs"
                />
              </div>
              {(empDateFrom || empDateTo) && (
                <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setEmpDateFrom(''); setEmpDateTo(''); }}>
                  Clear
                </Button>
              )}
              {hasPermission('reports:generatePdf') && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => setEmpPdfPreviewOpen(true)}
                  disabled={!selectedEmployee}
                >
                  <Eye className="h-3.5 w-3.5 mr-1" />
                  Preview
                </Button>
              )}
              {hasPermission('reports:generatePdf') && (
                <Button
                  variant="default"
                  size="sm"
                  className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={handleEmpDownloadPDF}
                  disabled={!selectedEmployee || empIsPdfGenerating}
                >
                  {empIsPdfGenerating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                  ) : (
                    <FileDown className="h-3.5 w-3.5 mr-1" />
                  )}
                  {empIsPdfGenerating ? 'Generating...' : 'Download PDF Report'}
                </Button>
              )}
            </div>
          </div>

          {/* Employee Selector */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <User className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm text-muted-foreground whitespace-nowrap">Select Employee:</span>
                  <Popover open={empSelectOpen} onOpenChange={setEmpSelectOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={empSelectOpen}
                        className="w-full sm:w-[300px] h-9 justify-between"
                      >
                        {selectedEmployeeId
                          ? employeeList.find((e) => e.id === selectedEmployeeId)?.fullName
                          : "Choose an employee..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[400px] p-0">
                      <Command>
                        <CommandInput placeholder="Search employee..." />
                        <CommandList>
                          <CommandEmpty>No employee found.</CommandEmpty>
                          {employeeList.map((emp) => (
                            <CommandItem
                              key={emp.id}
                              value={`${emp.fullName} ${emp.jobTitle} ${emp.department} ${emp.id}`}
                              onSelect={() => {
                                handleEmployeeSelect(emp.id === selectedEmployeeId ? '' : emp.id);
                                setEmpSelectOpen(false);
                              }}
                            >
                              <Check
                                className="mr-2 h-4 w-4"
                                style={{ opacity: selectedEmployeeId === emp.id ? 1 : 0 }}
                              />
                              {emp.fullName} — {emp.jobTitle} ({DEPARTMENT_LABELS[emp.department as Department] ?? emp.department})
                            </CommandItem>
                          ))}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                {empIsLoadingProfile && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Loading employee data...
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Employee Summary / Preview */}
          {selectedEmployee && !empIsLoadingProfile && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-600/10">
                      <User className="h-5 w-5 text-emerald-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">Employee</p>
                      <p className="text-sm font-bold truncate">{selectedEmployee.fullName}</p>
                      <p className="text-xs text-muted-foreground">{selectedEmployee.jobTitle}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-600/10">
                      <DollarSign className="h-5 w-5 text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Monthly Salary</p>
                      <p className="text-lg font-bold">{formatCurrency(selectedEmployee.salary)}</p>
                      <p className="text-xs text-muted-foreground">{selectedEmployee.department}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600/10">
                      <User className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Expenses Paid To</p>
                      <p className="text-lg font-bold">{formatCurrency(selectedEmployee.totalExpensesPaidTo ?? 0)}</p>
                      <p className="text-xs text-muted-foreground">{(selectedEmployee.expensesPaidTo ?? []).length} records</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-600/10">
                      <Receipt className="h-5 w-5 text-orange-600" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Expenses Paid By</p>
                      <p className="text-lg font-bold">{formatCurrency(selectedEmployee.totalExpensesPaidBy ?? 0)}</p>
                      <p className="text-xs text-muted-foreground">{(selectedEmployee.expensesPaidBy ?? []).length} records</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {!selectedEmployee && !empIsLoadingProfile && (
            <Card>
              <CardContent className="py-12">
                <div className="text-center">
                  <User className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">Select an employee above to generate a report</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    The report will include employee details, expenses, cash advance/wallet ledger, and financial summary
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Section Selectors */}
          {selectedEmployee && (
            <Card>
              <CardContent className="p-4">
                <p className="text-sm font-medium mb-3">Include in Employee Report PDF</p>
                <div className="flex flex-wrap items-center gap-6">
                  <div className="flex items-center gap-2">
                    <Checkbox id="emp-show-pi" checked={empShowPersonalInfo} onCheckedChange={(v) => setEmpShowPersonalInfo(v === true)} />
                    <Label htmlFor="emp-show-pi" className="text-sm cursor-pointer">Personal Information</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox id="emp-show-ji" checked={empShowJobInfo} onCheckedChange={(v) => setEmpShowJobInfo(v === true)} />
                    <Label htmlFor="emp-show-ji" className="text-sm cursor-pointer">Job Information</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox id="emp-show-ept" checked={empShowExpensesPaidTo} onCheckedChange={(v) => setEmpShowExpensesPaidTo(v === true)} />
                    <Label htmlFor="emp-show-ept" className="text-sm cursor-pointer">Expenses Paid To</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox id="emp-show-epb" checked={empShowExpensesPaidBy} onCheckedChange={(v) => setEmpShowExpensesPaidBy(v === true)} />
                    <Label htmlFor="emp-show-epb" className="text-sm cursor-pointer">Expenses Paid By</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox id="emp-show-lg" checked={empShowLedger} onCheckedChange={(v) => setEmpShowLedger(v === true)} />
                    <Label htmlFor="emp-show-lg" className="text-sm cursor-pointer">Cash Advance Ledger</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox id="emp-show-ss" checked={empShowSalarySummary} onCheckedChange={(v) => setEmpShowSalarySummary(v === true)} />
                    <Label htmlFor="emp-show-ss" className="text-sm cursor-pointer">Salary &amp; Financial Summary</Label>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Employee List Export */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col gap-3">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
                    <div>
                      <p className="text-sm font-medium">Employee List</p>
                      <p className="text-xs text-muted-foreground">
                        Export or download the employee list
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="emp-list-salary-filter"
                        checked={empListWithSalary}
                        onCheckedChange={(v) => setEmpListWithSalary(v === true)}
                      />
                      <Label htmlFor="emp-list-salary-filter" className="text-sm cursor-pointer">
                        Include salary column
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="emp-list-active-filter"
                        checked={empListActiveOnly}
                        onCheckedChange={(v) => setEmpListActiveOnly(v === true)}
                      />
                      <Label htmlFor="emp-list-active-filter" className="text-sm cursor-pointer">
                        Active employees only
                      </Label>
                    </div>
                    {hasPermission('reports:generatePdf') && (
                      <Button
                        variant="default"
                        size="sm"
                        className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={handleEmpListDownloadPDF}
                        disabled={empListIsPdfGenerating || allEmployees.length === 0}
                      >
                        {empListIsPdfGenerating ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                        ) : (
                          <FileDown className="h-3.5 w-3.5 mr-1" />
                        )}
                        {empListIsPdfGenerating ? 'Generating...' : 'Download PDF'}
                      </Button>
                    )}
                    {hasPermission('reports:generatePdf') && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={handleEmpListExportExcel}
                        disabled={empListIsExcelGenerating || allEmployees.length === 0}
                      >
                        {empListIsExcelGenerating ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                        ) : (
                          <FileSpreadsheet className="h-3.5 w-3.5 mr-1" />
                        )}
                        {empListIsExcelGenerating ? 'Exporting...' : 'Export Excel'}
                      </Button>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="date"
                    value={empListDateFrom}
                    onChange={(e) => setEmpListDateFrom(e.target.value)}
                    className="h-8 w-[150px] text-xs"
                  />
                  <span className="text-xs text-muted-foreground">to</span>
                  <Input
                    type="date"
                    value={empListDateTo}
                    onChange={(e) => setEmpListDateTo(e.target.value)}
                    className="h-8 w-[150px] text-xs"
                  />
                  {(empListDateFrom || empListDateTo) && (
                    <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setEmpListDateFrom(''); setEmpListDateTo(''); }}>
                      Clear
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Employee PDF Preview Modal */}
          <EmployeePdfPreviewModal
            open={empPdfPreviewOpen}
            onOpenChange={setEmpPdfPreviewOpen}
            employee={selectedEmployee}
            dateFrom={empDateFrom}
            dateTo={empDateTo}
            showPersonalInfo={empShowPersonalInfo}
            showJobInfo={empShowJobInfo}
            showSalarySummary={empShowSalarySummary}
            showExpensesPaidTo={empShowExpensesPaidTo}
            showExpensesPaidBy={empShowExpensesPaidBy}
            showLedger={empShowLedger}
          />
        </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function ContractorPdfPreviewModal({
  open,
  onOpenChange,
  contractor,
  timesheets,
  fuelUsages,
  dateFrom,
  dateTo,
  companyName,
  showTimesheets,
  showFuelUsages,
  showExpenses,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contractor: Contractor | null;
  timesheets: Timesheet[];
  fuelUsages: FuelUsage[];
  dateFrom?: string;
  dateTo?: string;
  companyName?: string;
  showTimesheets?: boolean;
  showFuelUsages?: boolean;
  showExpenses?: boolean;
}) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prevUrlRef = React.useRef<string | null>(null);

  useEffect(() => {
    if (!open) {
      if (prevUrlRef.current) {
        URL.revokeObjectURL(prevUrlRef.current);
        prevUrlRef.current = null;
      }
      setPdfUrl(null);
      setError(null);
      return;
    }

    if (!contractor) return;

    let cancelled = false;

    async function generatePdf() {
      setIsGenerating(true);
      setError(null);

      try {
        let filteredTs = timesheets;
        let filteredFu = fuelUsages;
        if (dateFrom) {
          filteredTs = filteredTs.filter((t) => t.date >= dateFrom);
          filteredFu = filteredFu.filter((f) => f.date >= dateFrom);
        }
        if (dateTo) {
          filteredTs = filteredTs.filter((t) => t.date <= dateTo);
          filteredFu = filteredFu.filter((f) => f.date <= dateTo);
        }

        const ctr = contractor!;
        const blob = await pdf(
          <ContractorPDFDocument
            contractor={ctr}
            timesheets={filteredTs}
            fuelUsages={filteredFu}
            filters={{ dateFrom: dateFrom || undefined, dateTo: dateTo || undefined }}
            companyName={companyName}
            showTimesheets={showTimesheets}
            showFuelUsages={showFuelUsages}
            showExpenses={showExpenses}
          />
        ).toBlob();

        if (cancelled) return;

        if (prevUrlRef.current) {
          URL.revokeObjectURL(prevUrlRef.current);
        }

        const url = URL.createObjectURL(blob);
        prevUrlRef.current = url;
        setPdfUrl(url);
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to generate PDF preview:', err);
        const message = err instanceof Error ? err.message : 'Please try again.';
        setError(`Failed to generate PDF: ${message}`);
      } finally {
        if (!cancelled) {
          setIsGenerating(false);
        }
      }
    }

    generatePdf();

    return () => {
      cancelled = true;
    };
  }, [open, contractor, timesheets, fuelUsages, dateFrom, dateTo, companyName, showTimesheets, showFuelUsages, showExpenses]);

  const handleDownload = useCallback(() => {
    if (!pdfUrl || !contractor) return;

    const link = document.createElement('a');
    link.href = pdfUrl;
    link.download = `contractor-report-${contractor.contractorName.replace(/\s+/g, '-').toLowerCase()}-${format(new Date(), 'yyyy-MM-dd')}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [pdfUrl, contractor]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="size-5 text-emerald-600" />
            PDF Preview
          </DialogTitle>
          <DialogDescription>
            Preview contractor report before downloading.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 border rounded-md overflow-hidden bg-muted/30">
          {isGenerating && (
            <div className="flex flex-col items-center justify-center h-80 gap-3">
              <Loader2 className="size-8 animate-spin text-emerald-600" />
              <p className="text-sm text-muted-foreground">Generating PDF preview...</p>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center h-80 gap-3">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {!isGenerating && !error && !contractor && (
            <div className="flex flex-col items-center justify-center h-80 gap-3">
              <FileText className="size-12 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No contractor selected.</p>
            </div>
          )}

          {!isGenerating && !error && pdfUrl && contractor && (
            <iframe
              src={pdfUrl}
              className="w-full h-[70vh] border-0"
              title="PDF Preview"
            />
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            onClick={handleDownload}
            disabled={!pdfUrl || isGenerating}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {isGenerating ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}
            Download PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MachineryPdfPreviewModal({
  open,
  onOpenChange,
  machinery,
  contractor,
  timesheets,
  fuelUsages,
  dateFrom,
  dateTo,
  companyName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  machinery: Machinery | null;
  contractor: Contractor | null;
  timesheets: Timesheet[];
  fuelUsages: FuelUsage[];
  dateFrom?: string;
  dateTo?: string;
  companyName?: string;
}) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prevUrlRef = React.useRef<string | null>(null);

  useEffect(() => {
    if (!open) {
      if (prevUrlRef.current) {
        URL.revokeObjectURL(prevUrlRef.current);
        prevUrlRef.current = null;
      }
      setPdfUrl(null);
      setError(null);
      return;
    }

    if (!machinery || !contractor) return;

    let cancelled = false;

    async function generatePdf() {
      setIsGenerating(true);
      setError(null);

      try {
        let filteredTs = timesheets;
        let filteredFu = fuelUsages;
        if (dateFrom) {
          filteredTs = filteredTs.filter((t) => t.date >= dateFrom);
          filteredFu = filteredFu.filter((f) => f.date >= dateFrom);
        }
        if (dateTo) {
          filteredTs = filteredTs.filter((t) => t.date <= dateTo);
          filteredFu = filteredFu.filter((f) => f.date <= dateTo);
        }

        const m = machinery!;
        const c = contractor!;
        const blob = await pdf(
          <MachineryPDFDocument
            machinery={m}
            contractor={c}
            timesheets={filteredTs}
            fuelUsages={filteredFu}
            filters={{ dateFrom: dateFrom || undefined, dateTo: dateTo || undefined }}
            companyName={companyName}
          />
        ).toBlob();

        if (cancelled) return;

        if (prevUrlRef.current) {
          URL.revokeObjectURL(prevUrlRef.current);
        }

        const url = URL.createObjectURL(blob);
        prevUrlRef.current = url;
        setPdfUrl(url);
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to generate PDF preview:', err);
        setError('Failed to generate PDF. Please try again.');
      } finally {
        if (!cancelled) {
          setIsGenerating(false);
        }
      }
    }

    generatePdf();

    return () => {
      cancelled = true;
    };
  }, [open, machinery, contractor, timesheets, fuelUsages, dateFrom, dateTo, companyName]);

  const handleDownload = useCallback(() => {
    if (!pdfUrl || !machinery) return;

    const link = document.createElement('a');
    link.href = pdfUrl;
    link.download = `machinery-report-${machinery.machineryName.replace(/\s+/g, '-').toLowerCase()}-${format(new Date(), 'yyyy-MM-dd')}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [pdfUrl, machinery]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="size-5 text-emerald-600" />
            Machinery PDF Preview
          </DialogTitle>
          <DialogDescription>
            Preview machinery report before downloading.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 border rounded-md overflow-hidden bg-muted/30">
          {isGenerating && (
            <div className="flex flex-col items-center justify-center h-80 gap-3">
              <Loader2 className="size-8 animate-spin text-emerald-600" />
              <p className="text-sm text-muted-foreground">Generating PDF preview...</p>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center h-80 gap-3">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {!isGenerating && !error && (!machinery || !contractor) && (
            <div className="flex flex-col items-center justify-center h-80 gap-3">
              <FileText className="size-12 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No machinery selected.</p>
            </div>
          )}

          {!isGenerating && !error && pdfUrl && machinery && contractor && (
            <iframe
              src={pdfUrl}
              className="w-full h-[70vh] border-0"
              title="Machinery PDF Preview"
            />
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            onClick={handleDownload}
            disabled={!pdfUrl || isGenerating}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {isGenerating ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}
            Download PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EmployeePdfPreviewModal({
  open,
  onOpenChange,
  employee,
  dateFrom,
  dateTo,
  showPersonalInfo = true,
  showJobInfo = true,
  showSalarySummary = true,
  showExpensesPaidTo = true,
  showExpensesPaidBy = true,
  showLedger = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: Employee | null;
  dateFrom?: string;
  dateTo?: string;
  showPersonalInfo?: boolean;
  showJobInfo?: boolean;
  showSalarySummary?: boolean;
  showExpensesPaidTo?: boolean;
  showExpensesPaidBy?: boolean;
  showLedger?: boolean;
}) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prevUrlRef = React.useRef<string | null>(null);

  useEffect(() => {
    if (!open) {
      if (prevUrlRef.current) {
        URL.revokeObjectURL(prevUrlRef.current);
        prevUrlRef.current = null;
      }
      setPdfUrl(null);
      setError(null);
      return;
    }

    if (!employee) return;

    let cancelled = false;

    async function generatePdf() {
      setIsGenerating(true);
      setError(null);

      const emp = employee!;

      try {
        const { default: EmployeePDFDocument } = await import('@/components/pdf/employee-pdf-document');
        const [walletRes] = await Promise.all([
          cashAdvanceApi.getEmployeeWallet(emp.id),
        ]);
        const ledger = walletRes.data?.ledger ?? [];
        const balance = walletRes.data?.account?.currentBalance ?? 0;

        let paidBy = ((emp.expensesPaidBy ?? []).filter((e): e is Expense => Boolean(e && e.id)));
        let paidTo = ((emp.expensesPaidTo ?? []).filter((e): e is Expense => Boolean(e && e.id)));

        if (dateFrom) {
          paidBy = paidBy.filter((e) => e.expenseDate >= dateFrom);
          paidTo = paidTo.filter((e) => e.expenseDate >= dateFrom);
        }
        if (dateTo) {
          paidBy = paidBy.filter((e) => e.expenseDate <= dateTo);
          paidTo = paidTo.filter((e) => e.expenseDate <= dateTo);
        }
        const filteredLedger = ledger.filter((e): e is LedgerEntry => Boolean(e && e.id));
        const blob = await pdf(
          <EmployeePDFDocument
            employee={emp}
            expensesPaidBy={paidBy}
            expensesPaidTo={paidTo}
            ledger={filteredLedger}
            walletBalance={balance}
            filters={{ dateFrom: dateFrom || undefined, dateTo: dateTo || undefined }}
            showPersonalInfo={showPersonalInfo}
            showJobInfo={showJobInfo}
            showSalarySummary={showSalarySummary}
            showExpensesPaidTo={showExpensesPaidTo}
            showExpensesPaidBy={showExpensesPaidBy}
            showLedger={showLedger}
          />
        ).toBlob();

        if (cancelled) return;

        if (prevUrlRef.current) {
          URL.revokeObjectURL(prevUrlRef.current);
        }

        const url = URL.createObjectURL(blob);
        prevUrlRef.current = url;
        setPdfUrl(url);
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to generate PDF preview:', err);
        setError('Failed to generate PDF. Please try again.');
      } finally {
        if (!cancelled) {
          setIsGenerating(false);
        }
      }
    }

    generatePdf();

    return () => {
      cancelled = true;
    };
  }, [open, employee, dateFrom, dateTo, showPersonalInfo, showJobInfo, showSalarySummary, showExpensesPaidTo, showExpensesPaidBy, showLedger]);

  const handleDownload = useCallback(() => {
    if (!pdfUrl || !employee) return;

    const link = document.createElement('a');
    link.href = pdfUrl;
    link.download = `employee-report-${employee.fullName.replace(/\s+/g, '-').toLowerCase()}-${format(new Date(), 'yyyy-MM-dd')}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [pdfUrl, employee]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="size-5 text-emerald-600" />
            PDF Preview
          </DialogTitle>
          <DialogDescription>
            Preview employee report before downloading.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 border rounded-md overflow-hidden bg-muted/30">
          {isGenerating && (
            <div className="flex flex-col items-center justify-center h-80 gap-3">
              <Loader2 className="size-8 animate-spin text-emerald-600" />
              <p className="text-sm text-muted-foreground">Generating PDF preview...</p>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center h-80 gap-3">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {!isGenerating && !error && !employee && (
            <div className="flex flex-col items-center justify-center h-80 gap-3">
              <FileText className="size-12 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No employee selected.</p>
            </div>
          )}

          {!isGenerating && !error && pdfUrl && employee && (
            <iframe
              src={pdfUrl}
              className="w-full h-[70vh] border-0"
              title="PDF Preview"
            />
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            onClick={handleDownload}
            disabled={!pdfUrl || isGenerating}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {isGenerating ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}
            Download PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
