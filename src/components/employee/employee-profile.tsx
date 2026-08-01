'use client';

import * as React from 'react';
import { useEmployeeStore } from '@/hooks/use-employee-store';
import { usePermissions } from '@/hooks/use-permissions';
import { cashAdvanceApi, expensesApi, attendanceApi } from '@/services/api';
import { employeesApi } from '@/services/employee-api';
import {
  DEPARTMENT_LABELS,
  EMPLOYMENT_TYPE_LABELS,
  EMPLOYEE_STATUS_LABELS,
  GENDER_LABELS,
  DEPARTMENT_COLORS,
  EMPLOYEE_STATUS_COLORS,
} from '@/types/employee';
import { CATEGORY_LABELS, CATEGORY_COLORS, CASH_TRANSACTION_TYPE_LABELS } from '@/types/expense';
import type { Department, EmployeeStatus, EmploymentType, Gender } from '@/types/employee';
import type { Category, Expense, LedgerEntry } from '@/types/expense';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { LoadingSpinner } from '@/components/common/loading-spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  ArrowLeft,
  User,
  Phone,
  Mail,
  MapPin,
  CreditCard,
  Briefcase,
  Building2,
  Calendar,
  DollarSign,
  Heart,
  Shield,
  FileText,
  Receipt,
  UserCheck,
  TrendingUp,
  TrendingDown,
  Clock,
  Calculator,
  ArrowUpRight,
  Download,
  Loader2,
  Upload,
  ImageIcon,
  X,
  Wallet,
} from 'lucide-react';
import { pdf } from "@react-pdf/renderer";
import { format } from 'date-fns';
import { toast } from 'sonner';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'AFN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function InfoItem({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium">{value || '—'}</p>
      </div>
    </div>
  );
}

export function EmployeeProfile() {
  const selectedEmployee = useEmployeeStore((s) => s.selectedEmployee);
  const isLoading = useEmployeeStore((s) => s.isLoading);
  const clearSelectedEmployee = useEmployeeStore((s) => s.clearSelectedEmployee);
  const openForm = useEmployeeStore((s) => s.openForm);
  const updateEmployee = useEmployeeStore((s) => s.updateEmployee);
  const { canEdit, hasPermission } = usePermissions();

  const [showExpensesDialog, setShowExpensesDialog] = React.useState(false);
  const [expenseType, setExpenseType] = React.useState<'salary' | 'rewards' | 'spent'>('salary');
  const [expenseCategoryFilter, setExpenseCategoryFilter] = React.useState<string[]>([]);
  const [isGeneratingPdf, setIsGeneratingPdf] = React.useState(false);
  const [isUploadingIdImage, setIsUploadingIdImage] = React.useState(false);
  const [isUploadingIdImageBack, setIsUploadingIdImageBack] = React.useState(false);
  const [showIdImageDialog, setShowIdImageDialog] = React.useState(false);
  const [idImageSide, setIdImageSide] = React.useState<'front' | 'back'>('front');

  const [walletBalance, setWalletBalance] = React.useState<number | null>(null);
  const [walletLoading, setWalletLoading] = React.useState(false);
  const [ledger, setLedger] = React.useState<LedgerEntry[]>([]);
  const [walletPage, setWalletPage] = React.useState(1);
  const [walletPageSize] = React.useState(10);
  const [walletTotal, setWalletTotal] = React.useState(0);
  const [walletDateFrom, setWalletDateFrom] = React.useState('');
  const [walletDateTo, setWalletDateTo] = React.useState('');

  const [expenseList, setExpenseList] = React.useState<Expense[]>([]);
  const [expenseLoading, setExpenseLoading] = React.useState(false);
  const [expensePage, setExpensePage] = React.useState(1);
  const [expensePageSize] = React.useState(10);
  const [expenseTotal, setExpenseTotal] = React.useState(0);

  const [showPdfDialog, setShowPdfDialog] = React.useState(false);
  const [pdfDateFrom, setPdfDateFrom] = React.useState('');
  const [pdfDateTo, setPdfDateTo] = React.useState('');
  const [isPdfGenerating, setIsPdfGenerating] = React.useState(false);

  const [attendanceSummary, setAttendanceSummary] = React.useState<{
    presentDays: number;
    halfDays: number;
    absentDays: number;
    leaveDays: number;
    holidayDays: number;
    totalDays: number;
    effectiveDays: number;
    totalOvertimeHours: number;
  } | null>(null);
  const [attendanceSummaryLoading, setAttendanceSummaryLoading] = React.useState(false);

  const handleIdImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, side: 'front' | 'back') => {
    const file = e.target.files?.[0];
    if (!file || !emp.id) return;

    if (side === 'front') {
      setIsUploadingIdImage(true);
    } else {
      setIsUploadingIdImageBack(true);
    }
    
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      const formData = new FormData();
      formData.append(side, file);
      formData.append('employeeId', emp.id);

      const response = await fetch('/api/employees/upload', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      const result = await response.json();
      console.log('Upload response:', result);
      
      if (result.success && result.data?.[side]) {
        const imagePath = side === 'front' ? result.data.front : result.data.back;
        console.log('Updating employee with:', side === 'front' ? 'idImageFront' : 'idImageBack', imagePath);
        try {
          if (side === 'front') {
            await updateEmployee(emp.id, { idImageFront: imagePath });
            toast.success('Front ID image uploaded successfully');
          } else {
            await updateEmployee(emp.id, { idImageBack: imagePath });
            toast.success('Back ID image uploaded successfully');
          }
        } catch (updateError) {
          console.error('Update employee error:', updateError);
          toast.error('Failed to save image path to employee');
        }
      } else {
        toast.error(result.error || 'Failed to upload image');
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload image');
    } finally {
      if (side === 'front') {
        setIsUploadingIdImage(false);
      } else {
        setIsUploadingIdImageBack(false);
      }
      setShowIdImageDialog(false);
    }
  };

  if (isLoading && !selectedEmployee) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <LoadingSpinner size="lg" text="Loading employee profile..." />
      </div>
    );
  }

  if (!selectedEmployee) {
    return null;
  }

  const emp = selectedEmployee;
  const initials = emp.fullName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

  const deptColor = DEPARTMENT_COLORS[emp.department as Department] ?? '#78716c';
  const statusColor = EMPLOYEE_STATUS_COLORS[emp.status as EmployeeStatus] ?? '#78716c';

  React.useEffect(() => {
    if (emp.id) {
      cashAdvanceApi.getEmployeeWallet(emp.id)
        .then((res) => {
          if (res.success && res.data?.account) {
            setWalletBalance(res.data.account.currentBalance);
          }
        })
        .catch(() => setWalletBalance(0));
    }
  }, [emp.id]);

  React.useEffect(() => {
    if (emp.id) {
      setWalletLoading(true);
      cashAdvanceApi.getEmployeeWallet(emp.id, {
        page: walletPage,
        pageSize: walletPageSize,
        dateFrom: walletDateFrom || undefined,
        dateTo: walletDateTo || undefined,
      })
        .then((res) => {
          if (res.success) {
            setLedger(res.data?.ledger ?? []);
            setWalletTotal(res.data?.total ?? 0);
          }
        })
        .catch(() => setLedger([]))
        .finally(() => setWalletLoading(false));
    }
  }, [emp.id, walletPage, walletPageSize, walletDateFrom, walletDateTo]);

  // Fetch attendance summary for salary calculation
  React.useEffect(() => {
    if (emp.id) {
      setAttendanceSummaryLoading(true);
      const hireDate = format(new Date(emp.hireDate), 'yyyy-MM-dd');
      const today = format(new Date(), 'yyyy-MM-dd');
      attendanceApi.getSummary({
        employeeId: emp.id,
        dateFrom: hireDate,
        dateTo: today,
      })
        .then((res) => {
          if (res.success && res.data) {
            setAttendanceSummary(res.data);
          }
        })
        .catch(() => setAttendanceSummary(null))
        .finally(() => setAttendanceSummaryLoading(false));
    }
  }, [emp.id, emp.hireDate]);

  React.useEffect(() => {
    if (showExpensesDialog && emp.id) {
      setExpenseLoading(true);
      const today = format(new Date(), 'yyyy-MM-dd');
      const filters: Record<string, unknown> = {
        page: expensePage,
        pageSize: expensePageSize,
        dateFrom: today,
        dateTo: today,
      };
      if (expenseType === 'spent') {
        filters.paidById = emp.id;
      } else {
        filters.paidToId = emp.id;
        if (expenseCategoryFilter.length > 0) {
          filters.categories = expenseCategoryFilter;
        }
      }
      expensesApi.getAll(filters as any)
        .then((res) => {
          if (res.success) {
            setExpenseList(res.data?.data ?? []);
            setExpenseTotal(res.data?.total ?? 0);
          }
        })
        .catch(() => setExpenseList([]))
        .finally(() => setExpenseLoading(false));
    }
  }, [showExpensesDialog, emp.id, expenseType, expenseCategoryFilter, expensePage, expensePageSize]);

  const handleDownloadPDF = React.useCallback(async () => {
    setIsPdfGenerating(true);
    try {
      const [walletRes, empRes] = await Promise.all([
        cashAdvanceApi.getEmployeeWallet(emp.id),
        employeesApi.getById(emp.id),
      ]);

      const balance = walletRes.data?.account?.currentBalance ?? 0;
      const fullEmployee = empRes.data ?? emp;

      let paidBy = ((fullEmployee.expensesPaidBy ?? []).filter(Boolean)) as Expense[];
      let paidTo = ((fullEmployee.expensesPaidTo ?? []).filter(Boolean)) as Expense[];

      if (pdfDateFrom) {
        paidBy = paidBy.filter((e) => e.expenseDate >= pdfDateFrom);
        paidTo = paidTo.filter((e) => e.expenseDate >= pdfDateFrom);
      }
      if (pdfDateTo) {
        paidBy = paidBy.filter((e) => e.expenseDate <= pdfDateTo);
        paidTo = paidTo.filter((e) => e.expenseDate <= pdfDateTo);
      }

      const { default: EmployeePDFDocument } = await import('@/components/pdf/employee-pdf-document');

      const blob = await pdf(
        <EmployeePDFDocument
          employee={fullEmployee}
          expensesPaidBy={paidBy}
          expensesPaidTo={paidTo}
          walletBalance={balance}
          filters={{ dateFrom: pdfDateFrom || undefined, dateTo: pdfDateTo || undefined }}
        />
      ).toBlob();

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `employee-financial-${emp.fullName.replace(/\s+/g, '-').toLowerCase()}-${format(new Date(), 'yyyy-MM-dd')}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('Employee financial summary PDF downloaded successfully');
    } catch (err) {
      console.error('Failed to generate PDF:', err);
      toast.error('Failed to generate employee financial summary PDF');
    } finally {
      setIsPdfGenerating(false);
      setShowPdfDialog(false);
    }
  }, [emp, pdfDateFrom, pdfDateTo]);

  const dailySalary = emp.salary / 30;
  const effectiveDays = attendanceSummary?.effectiveDays ?? null;
  const hasAttendance =
    attendanceSummary !== null && (attendanceSummary.totalDays > 0);
  // If attendance records exist, use effective days. Otherwise fallback to hireDate arithmetic.
  const hireDateObj = new Date(emp.hireDate);
  const currentDate = new Date();
  const isActiveEmployee = emp.status === 'ACTIVE';
  const endDate = isActiveEmployee 
    ? currentDate 
    : (emp.quitingDate ? new Date(emp.quitingDate) : currentDate);
  const fallbackDays = Math.max(0, Math.floor((endDate.getTime() - hireDateObj.getTime()) / (1000 * 60 * 60 * 24)));
  const daysWorked = hasAttendance ? effectiveDays! : fallbackDays;
  const workHoursPerDay = emp.workHoursPerDay ?? 9;
  const overtimeRate = emp.overtimeRate ?? 1.25;
  const totalOvertimeHours = attendanceSummary?.totalOvertimeHours ?? 0;
  const hourlySalary = workHoursPerDay > 0 ? dailySalary / workHoursPerDay : dailySalary / 9;
  const overtimePay = totalOvertimeHours * hourlySalary * overtimeRate;
  const earnedSalary = dailySalary * daysWorked + overtimePay;
  const totalSalaryPaid = emp.totalSalaryPaid ?? 0;
  const totalRewards = emp.totalRewards ?? 0;
  const totalTake = emp.totalExpensesPaidTo ?? 0;
  const totalSpent = emp.totalExpensesPaidBy ?? 0;
  const totalAdvanceReceived = ledger
    .filter((e) => e.type === 'ADVANCE')
    .reduce((sum, e) => sum + e.amount, 0);
  const netBalance = totalTake + totalAdvanceReceived - totalSpent;
  const isOwingBalance = netBalance > 0;
  const remainingToBePaid = earnedSalary - totalSalaryPaid - (walletBalance ?? 0);
  const isRemainingPositive = remainingToBePaid >= 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={clearSelectedEmployee}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h2 className="text-2xl font-bold tracking-tight">Employee Profile</h2>
          <p className="text-muted-foreground">Detailed employee information</p>
        </div>
        {canEdit('employees') && (
          <Button onClick={() => openForm(emp)} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            Edit Employee
          </Button>
        )}
        {hasPermission('reports:generatePdf') && (
          <Button
            variant="outline"
            onClick={() => setShowPdfDialog(true)}
            className="gap-1.5"
          >
            <Download className="h-4 w-4" />
            Download PDF Report
          </Button>
        )}
      </div>

      {/* Profile Header Card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="relative h-20 w-20 shrink-0">
              {emp.idImageFront ? (
                <img 
                  src={emp.idImageFront} 
                  alt="ID Image" 
                  className="h-20 w-20 rounded-full object-cover border-2 border-emerald-500"
                />
              ) : (
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-emerald-600/10 text-emerald-700 dark:text-emerald-400 text-2xl font-bold">
                  {initials}
                </div>
              )}
            </div>
            <div className="text-center sm:text-left flex-1">
              <h3 className="text-xl font-bold">{emp.fullName}</h3>
              <p className="text-muted-foreground">{emp.jobTitle}</p>
              <div className="mt-2 flex flex-wrap items-center justify-center sm:justify-start gap-2">
                <Badge variant="outline" className="border-0" style={{ backgroundColor: `${deptColor}18`, color: deptColor }}>
                  {DEPARTMENT_LABELS[emp.department as Department] ?? emp.department}
                </Badge>
                <Badge variant="outline" className="border-0" style={{ backgroundColor: `${statusColor}18`, color: statusColor }}>
                  {EMPLOYEE_STATUS_LABELS[emp.status as EmployeeStatus] ?? emp.status}
                </Badge>
                <Badge variant="outline" className="border-0">
                  {EMPLOYMENT_TYPE_LABELS[emp.employmentType as EmploymentType] ?? emp.employmentType}
                </Badge>
              </div>
            </div>
            <div className="text-center sm:text-right">
              <p className="text-sm text-muted-foreground">Base Salary</p>
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                {formatCurrency(emp.salary)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-emerald-200 dark:border-emerald-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Calculator className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            Financial Summary
          </CardTitle>
          <CardDescription>Salary calculation and balance overview</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground mb-1">Monthly Salary</p>
              <p className="text-lg font-semibold font-mono">{formatCurrency(emp.salary)}</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground mb-1">Daily Salary</p>
              <p className="text-lg font-semibold font-mono">{formatCurrency(dailySalary)}</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground mb-1">
                {hasAttendance ? 'Effective Days' : 'Days Since Hire'}
              </p>
              <p className="text-lg font-semibold font-mono flex items-center gap-1">
                <Clock className="h-4 w-4 text-muted-foreground" />
                {attendanceSummaryLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>{Math.round(daysWorked * 10) / 10} days</>
                )}
              </p>
              {hasAttendance && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  {attendanceSummary.presentDays}P / {attendanceSummary.halfDays}H / {attendanceSummary.absentDays}A / {attendanceSummary.leaveDays}L
                </p>
              )}
            </div>
            <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
              <p className="text-xs text-emerald-700 dark:text-emerald-400 mb-1">Earned Salary</p>
              <p className="text-lg font-bold font-mono text-emerald-700 dark:text-emerald-400">
                {formatCurrency(earnedSalary)}
              </p>
            </div>
          </div>
          <Separator className="my-4" />
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div 
              className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => { setExpenseType('salary'); setExpenseCategoryFilter(['SALARY']); setExpensePage(1); setShowExpensesDialog(true); }}
            >
              <div className="flex items-center gap-2 mb-1">
                <UserCheck className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <p className="text-xs text-blue-700 dark:text-blue-400">Total Salary Paid</p>
              </div>
              <p className="text-lg font-bold font-mono text-blue-700 dark:text-blue-400">
                {formatCurrency(totalSalaryPaid)}
              </p>
              <div className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 mt-1">
                <span>View details</span>
                <ArrowUpRight className="h-3 w-3" />
              </div>
            </div>
            <div 
              className="p-3 rounded-lg bg-pink-50 dark:bg-pink-950/30 border border-pink-200 dark:border-pink-800 cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => { setExpenseType('rewards'); setExpenseCategoryFilter(['REWARD', 'BONUS']); setExpensePage(1); setShowExpensesDialog(true); }}
            >
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="h-4 w-4 text-pink-600 dark:text-pink-400" />
                <p className="text-xs text-pink-700 dark:text-pink-400">Total Rewards</p>
              </div>
              <p className="text-lg font-bold font-mono text-pink-700 dark:text-pink-400">
                {formatCurrency(totalRewards)}
              </p>
              <div className="flex items-center gap-1 text-xs text-pink-600 dark:text-pink-400 mt-1">
                <span>View details</span>
                <ArrowUpRight className="h-3 w-3" />
              </div>
            </div>
            <div className="p-3 rounded-lg bg-teal-50 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                <p className="text-xs text-teal-700 dark:text-teal-400">Overtime</p>
              </div>
              <p className="text-lg font-bold font-mono text-teal-700 dark:text-teal-400">
                {attendanceSummaryLoading ? '—' : formatCurrency(overtimePay)}
              </p>
              <p className="text-[10px] text-teal-600 dark:text-teal-400 mt-1">
                {attendanceSummaryLoading ? '' : `${totalOvertimeHours.toFixed(1)} hrs`}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800">
              <div className="flex items-center gap-2 mb-1">
                <Wallet className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                <p className="text-xs text-indigo-700 dark:text-indigo-400">Total Advance Received</p>
              </div>
              <p className="text-lg font-bold font-mono text-indigo-700 dark:text-indigo-400">
                {walletLoading ? '—' : formatCurrency(totalAdvanceReceived)}
              </p>
            </div>
            <div 
              className="p-3 rounded-lg bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => { setExpenseType('spent'); setExpensePage(1); setShowExpensesDialog(true); }}
            >
              <div className="flex items-center gap-2 mb-1">
                <Receipt className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                <p className="text-xs text-orange-700 dark:text-orange-400">Total Spent</p>
              </div>
              <p className="text-lg font-bold font-mono text-orange-700 dark:text-orange-400">
                {formatCurrency(totalSpent)}
              </p>
              <div className="flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400 mt-1">
                <span>View details</span>
                <ArrowUpRight className="h-3 w-3" />
              </div>
            </div>
            <div className={`p-3 rounded-lg border ${
              isOwingBalance 
                ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800' 
                : 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800'
            }`}>
              <div className="flex items-center gap-2 mb-1">
                {isOwingBalance ? (
                  <>
                    <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />
                    <p className="text-xs text-red-700 dark:text-red-400">Net Balance</p>
                  </>
                ) : (
                  <>
                    <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    <p className="text-xs text-emerald-700 dark:text-emerald-400">Net Balance</p>
                  </>
                )}
              </div>
              <p className={`text-lg font-bold font-mono ${
                isOwingBalance 
                  ? 'text-red-700 dark:text-red-400' 
                  : 'text-emerald-700 dark:text-emerald-400'
              }`}>
                {formatCurrency(Math.abs(netBalance))}
                <span className="text-xs ml-1">{isOwingBalance ? '(Owes)' : '(Owed)'}</span>
              </p>
            </div>
          </div>
          <Separator className="my-4" />
          <div className="p-3 rounded-lg bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800">
              <div className="flex items-center gap-2 mb-1">
                {walletLoading ? (
                  <Loader2 className="h-4 w-4 text-violet-600 dark:text-violet-400 animate-spin" />
                ) : (
                  <Wallet className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                )}
                <p className="text-xs text-violet-700 dark:text-violet-400">Advance Balance</p>
              </div>
              <p className="text-lg font-bold font-mono text-violet-700 dark:text-violet-400">
                {walletBalance !== null ? formatCurrency(walletBalance) : '—'}
              </p>
              <div className="flex items-center gap-1 text-xs text-violet-600 dark:text-violet-400 mt-1">
                <span>{walletBalance !== null ? (walletBalance >= 0 ? 'Owing' : 'Overdrawn') : 'No account'}</span>
              </div>
            </div>
          <Separator className="my-4" />
          <div className={`p-4 rounded-lg border ${
            isRemainingPositive 
              ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800' 
              : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calculator className={`h-5 w-5 ${isRemainingPositive ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`} />
                <span className={`text-sm font-medium ${isRemainingPositive ? 'text-amber-700 dark:text-amber-400' : 'text-red-700 dark:text-red-400'}`}>
                  Remaining to be Paid
                </span>
                <span className="text-xs text-muted-foreground">
                  (Earned Salary - Salary Paid - Wallet)
                </span>
              </div>
              <p className={`text-xl font-bold font-mono ${
                isRemainingPositive 
                  ? 'text-amber-700 dark:text-amber-400' 
                  : 'text-red-700 dark:text-red-400'
              }`}>
                {formatCurrency(Math.abs(remainingToBePaid))}
                <span className="text-xs ml-1">
                   {isRemainingPositive ? '(Company owes employee)' : '(Employee owes company)'}
                </span>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ID Image Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ImageIcon className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            Employee ID Documents
          </CardTitle>
          <CardDescription>Upload front and back of employee ID</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Front Image */}
            <div className="flex flex-col items-center gap-3">
              <p className="text-sm font-medium">Front Side</p>
              {emp.idImageFront ? (
                <div className="relative w-full">
                  <img 
                    src={emp.idImageFront} 
                    alt="ID Front" 
                    className="w-full h-48 rounded-lg border object-contain bg-muted"
                  />
                  {canEdit('employees') && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2 w-full"
                      onClick={() => { setIdImageSide('front'); setShowIdImageDialog(true); }}
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Update Front
                    </Button>
                  )}
                </div>
              ) : (
                <label
                  htmlFor="id-image-front-upload"
                  className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                >
                  {isUploadingIdImage ? (
                    <>
                      <Loader2 className="h-8 w-8 text-emerald-600 animate-spin mb-2" />
                      <span className="text-sm text-muted-foreground">Uploading...</span>
                    </>
                  ) : (
                    <>
                      <ImageIcon className="h-8 w-8 text-muted-foreground mb-2" />
                      <span className="text-sm text-muted-foreground">Click to upload</span>
                      <span className="text-xs text-muted-foreground mt-1">JPEG, PNG</span>
                    </>
                  )}
                </label>
              )}
            </div>

            {/* Back Image */}
            <div className="flex flex-col items-center gap-3">
              <p className="text-sm font-medium">Back Side</p>
              {emp.idImageBack ? (
                <div className="relative w-full">
                  <img 
                    src={emp.idImageBack} 
                    alt="ID Back" 
                    className="w-full h-48 rounded-lg border object-contain bg-muted"
                  />
                  {canEdit('employees') && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2 w-full"
                      onClick={() => { setIdImageSide('back'); setShowIdImageDialog(true); }}
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Update Back
                    </Button>
                  )}
                </div>
              ) : (
                <label
                  htmlFor="id-image-back-upload"
                  className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                >
                  {isUploadingIdImageBack ? (
                    <>
                      <Loader2 className="h-8 w-8 text-emerald-600 animate-spin mb-2" />
                      <span className="text-sm text-muted-foreground">Uploading...</span>
                    </>
                  ) : (
                    <>
                      <ImageIcon className="h-8 w-8 text-muted-foreground mb-2" />
                      <span className="text-sm text-muted-foreground">Click to upload</span>
                      <span className="text-xs text-muted-foreground mt-1">JPEG, PNG</span>
                    </>
                  )}
                </label>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Hidden file inputs for ID image upload */}
      <input
        type="file"
        accept="image/jpeg,image/png"
        className="hidden"
        id="id-image-front-upload"
        onChange={(e) => handleIdImageUpload(e, 'front')}
        disabled={isUploadingIdImage}
      />
      <input
        type="file"
        accept="image/jpeg,image/png"
        className="hidden"
        id="id-image-back-upload"
        onChange={(e) => handleIdImageUpload(e, 'back')}
        disabled={isUploadingIdImageBack}
      />

      {/* ID Image Upload Dialog */}
      <Dialog open={showIdImageDialog} onOpenChange={setShowIdImageDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Upload ID Image - {idImageSide === 'front' ? 'Front' : 'Back'}</DialogTitle>
            <DialogDescription>
              Upload a JPEG or PNG image of the employee's ID {idImageSide} side (max 10MB)
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center py-6">
            <label
              htmlFor={`id-image-${idImageSide}-upload`}
              className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
            >
              {(idImageSide === 'front' ? isUploadingIdImage : isUploadingIdImageBack) ? (
                <>
                  <Loader2 className="h-8 w-8 text-emerald-600 animate-spin mb-2" />
                  <span className="text-sm text-muted-foreground">Uploading...</span>
                </>
              ) : (
                <>
                  <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                  <span className="text-sm text-muted-foreground">Click to select image</span>
                  <span className="text-xs text-muted-foreground mt-1">JPEG, PNG (max 10MB)</span>
                </>
              )}
            </label>
          </div>
        </DialogContent>
      </Dialog>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Personal Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              Personal Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <InfoItem icon={User} label="Full Name" value={emp.fullName} />
            <InfoItem icon={User} label="Father Name" value={emp.fatherName} />
            <InfoItem icon={Shield} label="Gender" value={GENDER_LABELS[emp.gender as Gender] ?? emp.gender} />
            <InfoItem icon={Calendar} label="Date of Birth" value={emp.dateOfBirth ? format(new Date(emp.dateOfBirth), 'MMM dd, yyyy') : null} />
            <InfoItem icon={CreditCard} label="National ID / Tazkira" value={emp.nationalId} />
            <Separator className="my-2" />
            <InfoItem icon={Phone} label="Phone Number" value={emp.phoneNumber} />
            <InfoItem icon={Mail} label="Email" value={emp.email} />
            <InfoItem icon={MapPin} label="Address" value={emp.address} />
          </CardContent>
        </Card>

        {/* Job Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Briefcase className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              Job Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <InfoItem icon={Briefcase} label="Job Title" value={emp.jobTitle} />
            <InfoItem icon={Building2} label="Department" value={DEPARTMENT_LABELS[emp.department as Department] ?? emp.department} />
            <InfoItem icon={FileText} label="Employment Type" value={EMPLOYMENT_TYPE_LABELS[emp.employmentType as EmploymentType] ?? emp.employmentType} />
            <InfoItem icon={Calendar} label="Hire Date" value={emp.hireDate ? format(new Date(emp.hireDate), 'MMM dd, yyyy') : null} />
            <Separator className="my-2" />
            <InfoItem icon={DollarSign} label="Base Salary" value={formatCurrency(emp.salary)} />
            <InfoItem icon={Heart} label="Emergency Contact" value={emp.emergencyContactName} />
            <InfoItem icon={Phone} label="Emergency Phone" value={emp.emergencyContactPhone} />
          </CardContent>
        </Card>
      </div>

      {/* Expense Summary */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Expenses Paid By This Employee */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Receipt className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              Expenses Paid By
            </CardTitle>
            <CardDescription>
              {emp._count?.expensesPaidBy ?? 0} expense(s) · Total: {formatCurrency(emp.totalExpensesPaidBy ?? 0)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {emp.expensesPaidBy && emp.expensesPaidBy.length > 0 ? (
              <div className="space-y-2 max-h-64 overflow-y-auto scrollbar-thin">
                {emp.expensesPaidBy.map((exp) => (
                  <div key={exp.id} className="flex items-center justify-between rounded-lg border p-2.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{exp.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant="outline" className="border-0 text-[10px] px-1.5 py-0" style={{ backgroundColor: `${CATEGORY_COLORS[exp.category as Category] ?? CATEGORY_COLORS[exp.category as keyof typeof CATEGORY_COLORS] ?? '#78716c'}18`, color: CATEGORY_COLORS[exp.category as Category] ?? CATEGORY_COLORS[exp.category as keyof typeof CATEGORY_COLORS] ?? '#78716c' }}>
                          {CATEGORY_LABELS[exp.category as Category] ?? CATEGORY_LABELS[exp.category as keyof typeof CATEGORY_LABELS] ?? exp.category}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{format(new Date(exp.expenseDate), 'MMM dd, yyyy')}</span>
                      </div>
                    </div>
                    <span className="font-mono tabular-nums text-sm ml-2">{formatCurrency(exp.amount)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">No expenses recorded</p>
            )}
          </CardContent>
        </Card>

        {/* Expenses Paid To This Employee */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UserCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              Expenses Paid To
            </CardTitle>
            <CardDescription>
              {emp._count?.expensesPaidTo ?? 0} expense(s) · Total: {formatCurrency(emp.totalExpensesPaidTo ?? 0)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {emp.expensesPaidTo && emp.expensesPaidTo.length > 0 ? (
              <div className="space-y-2 max-h-64 overflow-y-auto scrollbar-thin">
                {emp.expensesPaidTo.map((exp) => (
                  <div key={exp.id} className="flex items-center justify-between rounded-lg border p-2.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{exp.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant="outline" className="border-0 text-[10px] px-1.5 py-0" style={{ backgroundColor: `${CATEGORY_COLORS[exp.category as Category] ?? CATEGORY_COLORS[exp.category as keyof typeof CATEGORY_COLORS] ?? '#78716c'}18`, color: CATEGORY_COLORS[exp.category as Category] ?? CATEGORY_COLORS[exp.category as keyof typeof CATEGORY_COLORS] ?? '#78716c' }}>
                          {CATEGORY_LABELS[exp.category as Category] ?? CATEGORY_LABELS[exp.category as keyof typeof CATEGORY_LABELS] ?? exp.category}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{format(new Date(exp.expenseDate), 'MMM dd, yyyy')}</span>
                      </div>
                    </div>
                    <span className="font-mono tabular-nums text-sm ml-2">{formatCurrency(exp.amount)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">No expenses recorded</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Wallet History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            Wallet History
          </CardTitle>
          <CardDescription>Cash advance, return, adjustment and expense ledger</CardDescription>
          <div className="flex items-center gap-2 pt-2">
            <Input
              type="date"
              value={walletDateFrom}
              onChange={(e) => { setWalletDateFrom(e.target.value); setWalletPage(1); }}
              className="h-8 w-40 text-xs"
              placeholder="From"
            />
            <span className="text-xs text-muted-foreground">to</span>
            <Input
              type="date"
              value={walletDateTo}
              onChange={(e) => { setWalletDateTo(e.target.value); setWalletPage(1); }}
              className="h-8 w-40 text-xs"
              placeholder="To"
            />
            {(walletDateFrom || walletDateTo) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={() => { setWalletDateFrom(''); setWalletDateTo(''); setWalletPage(1); }}
              >
                Clear
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {walletLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : ledger.length > 0 ? (
            <div className="space-y-1">
              {ledger.map((entry) => {
                const typeColor =
                  entry.type === 'ADVANCE' ? '#7c3aed' :
                  entry.type === 'RETURN' ? '#059669' :
                  entry.type === 'ADJUSTMENT' ? '#6366f1' :
                  '#ea580c';
                const typeLabel = CASH_TRANSACTION_TYPE_LABELS[entry.type as keyof typeof CASH_TRANSACTION_TYPE_LABELS] ?? entry.type;
                return (
                  <div key={entry.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-xs text-muted-foreground w-20 shrink-0">
                        {entry.date ? format(new Date(entry.date), 'MMM dd') : '—'}
                      </span>
                      <Badge variant="outline" className="border-0 text-xs shrink-0" style={{ backgroundColor: `${typeColor}18`, color: typeColor }}>
                        {typeLabel}
                      </Badge>
                      <span className="text-sm truncate">{entry.description}</span>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <span className={`font-mono text-sm font-medium ${
                        entry.amount >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                      }`}>
                        {entry.amount >= 0 ? '+' : ''}{formatCurrency(entry.amount)}
                      </span>
                      <span className="font-mono text-xs text-muted-foreground w-20 text-right">
                        {formatCurrency(entry.runningBalance)}
                      </span>
                    </div>
                  </div>
                );
              })}
              <div className="flex items-center justify-between pt-3 text-xs text-muted-foreground">
                <span>
                  Page {walletPage} of {Math.max(1, Math.ceil(walletTotal / walletPageSize))}
                  {' '}({walletTotal} results)
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    disabled={walletPage <= 1}
                    onClick={() => setWalletPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    disabled={walletPage >= Math.ceil(walletTotal / walletPageSize)}
                    onClick={() => setWalletPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 py-4 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>Hired on {emp.hireDate ? format(new Date(emp.hireDate), 'MMMM dd, yyyy') : 'N/A'}</span>
              <Badge variant="outline" className="border-0 text-xs" style={{ backgroundColor: `${statusColor}18`, color: statusColor }}>
                {EMPLOYEE_STATUS_LABELS[emp.status as EmployeeStatus] ?? emp.status}
              </Badge>
              <span className="text-xs text-muted-foreground ml-auto">
                {walletDateFrom || walletDateTo ? 'No transactions match filter' : 'No wallet transactions yet'}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Expenses Dialog */}
      <Dialog open={showExpensesDialog} onOpenChange={(open) => { setShowExpensesDialog(open); if (!open) setExpensePage(1); }}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {expenseType === 'salary' ? 'Salary Payments' : expenseType === 'rewards' ? 'Rewards & Bonuses' : 'Expenses Paid By'}
            </DialogTitle>
            <DialogDescription>
              {emp.fullName} &mdash; {expenseType === 'salary' ? 'salary payments' : expenseType === 'rewards' ? 'rewards and bonuses' : 'expenses paid by employee'} for today ({format(new Date(), 'MMM dd, yyyy')})
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto space-y-2 pr-2">
            {expenseLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : expenseList.length > 0 ? (
              expenseList.map((exp) => (
                <div key={exp.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{exp.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="border-0 text-[10px] px-1.5 py-0" style={{ backgroundColor: `${CATEGORY_COLORS[exp.category as Category] ?? CATEGORY_COLORS[exp.category as keyof typeof CATEGORY_COLORS] ?? '#78716c'}18`, color: CATEGORY_COLORS[exp.category as Category] ?? CATEGORY_COLORS[exp.category as keyof typeof CATEGORY_COLORS] ?? '#78716c' }}>
                        {CATEGORY_LABELS[exp.category as Category] ?? CATEGORY_LABELS[exp.category as keyof typeof CATEGORY_LABELS] ?? exp.category}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{format(new Date(exp.expenseDate), 'MMM dd, yyyy')}</span>
                    </div>
                  </div>
                  <span className="font-mono tabular-nums text-sm ml-3 font-semibold">{formatCurrency(exp.amount)}</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground py-8 text-center">No expenses recorded for today</p>
            )}
          </div>

          <div className="flex items-center justify-between pt-4 border-t">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>
                Page {expensePage} of {Math.max(1, Math.ceil(expenseTotal / expensePageSize))}
                {' '}({expenseTotal} results)
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={expensePage <= 1}
                  onClick={() => setExpensePage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={expensePage >= Math.ceil(expenseTotal / expensePageSize)}
                  onClick={() => setExpensePage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
            {hasPermission('reports:generatePdf') && (
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  setIsGeneratingPdf(true);
                  try {
                    const EmployeeExpensePDFDocument = await getEmployeeExpensePDFDocument();
                    const blob = await pdf(
                      <EmployeeExpensePDFDocument 
                        expenses={expenseList} 
                        employeeName={emp.fullName}
                        type={expenseType}
                      />
                    ).toBlob();

                    const url = URL.createObjectURL(blob);
                    const link = document.createElement("a");
                    link.href = url;
                    link.download = `${expenseType === 'taken' ? 'paid-to' : 'paid-by'}-${emp.fullName.replace(/\s+/g, '-').toLowerCase()}-${format(new Date(), 'yyyy-MM-dd')}.pdf`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    URL.revokeObjectURL(url);
                  } catch (error) {
                    console.error("Failed to generate PDF:", error);
                  } finally {
                    setIsGeneratingPdf(false);
                  }
                }}
                disabled={isGeneratingPdf || expenseList.length === 0}
              >
                {isGeneratingPdf ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                Generate PDF
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* PDF Download Dialog */}
      <Dialog open={showPdfDialog} onOpenChange={setShowPdfDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="h-5 w-5 text-emerald-600" />
              Download Employee Report
            </DialogTitle>
            <DialogDescription>
              Select a date range to filter expenses, or leave empty to include all records.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">From Date</label>
                <Input
                  type="date"
                  value={pdfDateFrom}
                  onChange={(e) => setPdfDateFrom(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">To Date</label>
                <Input
                  type="date"
                  value={pdfDateTo}
                  onChange={(e) => setPdfDateTo(e.target.value)}
                  className="h-9"
                />
              </div>
            </div>
            {(pdfDateFrom || pdfDateTo) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => { setPdfDateFrom(''); setPdfDateTo(''); }}
              >
                Clear dates
              </Button>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowPdfDialog(false)}>
              Cancel
            </Button>
            {hasPermission('reports:generatePdf') && (
              <Button
                onClick={handleDownloadPDF}
                disabled={isPdfGenerating}
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
              >
                {isPdfGenerating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                {isPdfGenerating ? 'Generating...' : 'Generate PDF'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── PDF Document ─────────────────────────────────────────────────
async function getEmployeeExpensePDFDocument() {
  const { default: EmployeeExpensePDFDocument } = await import('@/components/pdf/employee-expense-pdf-document');
  return EmployeeExpensePDFDocument;
}
