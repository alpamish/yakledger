'use client';

import { useState, useCallback, useEffect } from 'react';
import { pdf } from '@react-pdf/renderer';
import { employeesApi } from '@/services/employee-api';
import { cashAdvanceApi } from '@/services/api';
import type { Employee, Department } from '@/types/employee';
import { DEPARTMENT_LABELS } from '@/types/employee';
import type { Expense, LedgerEntry } from '@/types/expense';
import { downloadPdfBlob, filterExpensesByDate, filterLedgerByValidEntries } from '@/lib/pdf-utils';
import { formatCurrency } from '@/lib/utils';
import { fmtExportDate, fmtExportLabel } from '@/lib/format';
import { format } from 'date-fns';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import {
  User,
  DollarSign,
  Receipt,
  FileDown,
  Eye,
  Loader2,
  ChevronsUpDown,
  Check,
  BarChart3,
  FileSpreadsheet,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { EmployeePdfPreviewModal } from '@/components/reports/employee-pdf-preview-modal';
import {
  EMPLOYEE_STATUS_LABELS,
  EMPLOYMENT_TYPE_LABELS,
  GENDER_LABELS,
} from '@/types/employee';

interface EmployeeReportsTabProps {
  companyName: string;
  hasPermission: (action: string) => boolean;
}

export function EmployeeReportsTab({ companyName, hasPermission }: EmployeeReportsTabProps) {
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
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const [empSummaryPdfLoading, setEmpSummaryPdfLoading] = useState(false);

  useEffect(() => {
    employeesApi.getList('ACTIVE').then((res) => {
      if (res.data) setEmployeeList(res.data);
    }).catch(() => {});
    employeesApi.getList('ALL').then((res) => {
      if (res.data) setAllEmployees(res.data);
    }).catch(() => {});
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

      downloadPdfBlob(blob, `employee-report-${selectedEmployee.fullName.replace(/\s+/g, '-').toLowerCase()}-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
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

      downloadPdfBlob(blob, `employee-list-${empListWithSalary ? 'with-salary' : 'without-salary'}-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
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
        const row: Record<string, string | number> = {
          '#': i + 1,
          'Employee No': e.employeeNumber ?? '—',
          'Full Name': e.fullName,
          'Father Name': e.fatherName,
          'Grandfather Name': e.grandfatherName ?? '—',
          'Gender': fmtExportLabel(GENDER_LABELS, e.gender),
          'Date of Birth': fmtExportDate(e.dateOfBirth),
          'Nationality': e.nationality ?? '—',
          'Phone': e.phoneNumber,
          'Email': e.email ?? '—',
          'Address': e.address ?? '—',
          'National ID': e.nationalId ?? '—',
          'Emergency Contact': e.emergencyContactName ?? '—',
          'Emergency Phone': e.emergencyContactPhone ?? '—',
          'Job Title': e.jobTitle,
          'Department': fmtExportLabel(DEPARTMENT_LABELS, e.department),
          'Employment Type': fmtExportLabel(EMPLOYMENT_TYPE_LABELS, e.employmentType),
          'Work Location': e.workLocation ?? '—',
          'Category': e.employeeCategory ?? '—',
          'Supervisor': e.supervisor?.fullName ?? '—',
          'Work Hours/Day': e.workHoursPerDay,
          'Overtime Rate': e.overtimeRate,
          'Start Time': e.workStartTime ?? '—',
          'End Time': e.workEndTime ?? '—',
          'Break Minutes': e.breakMinutes ?? '—',
          'Hire Date': fmtExportDate(e.hireDate),
          'Contract Start': fmtExportDate(e.contractStartDate),
          'Contract End': fmtExportDate(e.contractEndDate),
          'Probation End': fmtExportDate(e.probationEndDate),
          'Termination Date': fmtExportDate(e.terminationDate),
          'Termination Reason': e.terminationReason ?? '—',
          'Quit Date': fmtExportDate(e.quitingDate),
          'Status': fmtExportLabel(EMPLOYEE_STATUS_LABELS, e.status),
          'Created At': fmtExportDate(e.createdAt),
          'Updated At': fmtExportDate(e.updatedAt),
        };
        if (empListWithSalary) {
          row['Salary'] = e.salary ?? 0;
          row['Base Salary (AFN, minor)'] = e.baseSalaryMinor ?? 0;
        }
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

      const totalSalary = filtered.reduce((s, e) => s + (e.salary ?? 0), 0);
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

  const handleEmpSummaryPdf = useCallback(async () => {
    setEmpSummaryPdfLoading(true);
    try {
      const res = await employeesApi.financialSummary([]);
      const reportData = res.data;
      if (!reportData || !reportData.employees || reportData.employees.length === 0) {
        toast.error('No employee data available for summary');
        return;
      }
      const { default: EmployeeSummaryPDFDocument } = await import('@/components/pdf/employee-summary-pdf-document');
      const blob = await pdf(
        <EmployeeSummaryPDFDocument
          data={reportData.employees}
          totals={reportData.totals}
          companyName={companyName}
          dateFrom={empListDateFrom || undefined}
          dateTo={empListDateTo || undefined}
        />
      ).toBlob();
      downloadPdfBlob(blob, `employee-summary-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
      toast.success('Employee Summary report downloaded');
    } catch (err) {
      console.error('PDF generation failed:', err);
      toast.error('Failed to generate Employee Summary report');
    } finally {
      setEmpSummaryPdfLoading(false);
    }
  }, [companyName, empListDateFrom, empListDateTo]);

  return (
    <div className="space-y-6">
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

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <BarChart3 className="h-5 w-5 text-emerald-600" />
              <div>
                <p className="text-sm font-medium">Employee Summary Report</p>
                <p className="text-xs text-muted-foreground">All employees financial overview — salary, payments, rewards, and net balance</p>
              </div>
            </div>
            {hasPermission('reports:generatePdf') && (
              <Button
                variant="default"
                size="sm"
                className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={handleEmpSummaryPdf}
                disabled={empSummaryPdfLoading}
              >
                {empSummaryPdfLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                ) : (
                  <FileDown className="h-3.5 w-3.5 mr-1" />
                )}
                {empSummaryPdfLoading ? 'Generating...' : 'Download PDF'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

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
    </div>
  );
}
