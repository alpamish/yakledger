'use client';

import * as React from 'react';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { pdf } from "@react-pdf/renderer";
import ContractorPDFDocument from "@/components/pdf/contractor-pdf-document";
import ContractorFinancialSummaryPDFDocument from "@/components/pdf/contractor-financial-summary-pdf-document";
import ContractorFinancialSummaryFarsiPDFDocument from "@/components/pdf/contractor-financial-summary-farsi-pdf-document";
import { useContractorStore } from '@/hooks/use-contractor-store';
import { usePermissions } from '@/hooks/use-permissions';
import {
  CONTRACTOR_TYPE_LABELS,
  CONTRACTOR_STATUS_LABELS,
  FUEL_TYPE_LABELS,
  MACHINERY_STATUS_LABELS,
  CONTRACTOR_TYPE_COLORS,
  CONTRACTOR_STATUS_COLORS,
  FUEL_TYPE_COLORS,
  MACHINERY_STATUS_COLORS,
} from '@/types/contractor';
import type { ContractorType, ContractorStatus, FuelType, MachineryStatus, Machinery } from '@/types/contractor';
import { CATEGORY_LABELS as EXP_CATEGORY_LABELS, CATEGORY_COLORS as EXP_CATEGORY_COLORS } from '@/types/expense';
import type { Category } from '@/types/expense';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MachineryDetailModal } from '@/components/machinery/machinery-detail-modal';
import { ContractorContractsTab } from '@/components/contractor/contractor-contracts-tab';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { LoadingSpinner } from '@/components/common/loading-spinner';
import {
  ArrowLeft,
  User,
  Phone,
  Mail,
  MapPin,
  CreditCard,
  Calendar,
  DollarSign,
  Briefcase,
  FileText,
  Receipt,
  Clock,
  Fuel,
  Truck,
  Search,
  Building2,
  Timer,
  Gauge,
  Download,
  Loader2,
  Calculator,
  TrendingUp,
  TrendingDown,
  Upload,
  ImageIcon,
  X,
  RotateCw,
  RotateCcw,
  Eye,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { rotateCanvas } from '@/lib/image-utils';
import { findRateTier, resolveHourlyRate, resolveTimesheetHourlyRate, computeTimesheetRevenue } from '@/lib/contractor-rate';

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

function StatusBadge({ value, colorMap, labelMap }: { value: string; colorMap: Record<string, string>; labelMap: Record<string, string> }) {
  const color = colorMap[value] ?? '#78716c';
  const label = labelMap[value] ?? value;
  return (
    <Badge variant="outline" className="border-0" style={{ backgroundColor: `${color}18`, color }}>
      {label}
    </Badge>
  );
}

export function ContractorProfile({ contractorId }: { contractorId?: string }) {
  const selectedContractor = useContractorStore((s) => s.selectedContractor);
  const isLoading = useContractorStore((s) => s.isLoading);
  const timesheets = useContractorStore((s) => s.timesheets);
  const fuelUsages = useContractorStore((s) => s.fuelUsages);
  const fetchContractorProfile = useContractorStore((s) => s.fetchContractorProfile);
  const clearSelectedContractor = useContractorStore((s) => s.clearSelectedContractor);
  const openForm = useContractorStore((s) => s.openForm);
  const updateContractor = useContractorStore((s) => s.updateContractor);
  const { canEdit, hasPermission, canView } = usePermissions();

  // Search states for tab filtering
  const [expenseSearch, setExpenseSearch] = useState('');
  const [timesheetSearch, setTimesheetSearch] = useState('');
  const [fuelSearch, setFuelSearch] = useState('');

  // Pagination state for expenses tab
  const [expensePage, setExpensePage] = useState(1);
  const EXPENSE_PAGE_SIZE = 20;

  // Machinery detail modal state
  const [detailMachinery, setDetailMachinery] = useState<Machinery | null>(null);

  // PDF report state
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [isPdfGenerating, setIsPdfGenerating] = useState(false);
  const [isFinPdfGenerating, setIsFinPdfGenerating] = useState(false);
  const [isFarsiPdfGenerating, setIsFarsiPdfGenerating] = useState(false);

  // Financial summary filter state
  const [finDateFrom, setFinDateFrom] = useState('');
  const [finDateTo, setFinDateTo] = useState('');

  // ID image upload state
  const [isUploadingIdImage, setIsUploadingIdImage] = useState(false);
  const [isUploadingIdImageBack, setIsUploadingIdImageBack] = useState(false);
  const [showIdImageDialog, setShowIdImageDialog] = useState(false);
  const [idImageSide, setIdImageSide] = useState<'front' | 'back'>('front');
  const [pendingIdImageFile, setPendingIdImageFile] = useState<File | null>(null);
  const [previewRotation, setPreviewRotation] = useState(0);
  const [idImageToRemove, setIdImageToRemove] = useState<'front' | 'back' | null>(null);
  const [showImagePreview, setShowImagePreview] = useState(false);
  const [previewImageSrc, setPreviewImageSrc] = useState<string>('');
  const [previewImageAlt, setPreviewImageAlt] = useState<string>('');

  const handleDownloadPDF = useCallback(async () => {
    if (!selectedContractor?.id) return;
    setIsPdfGenerating(true);
    try {
      let filteredTimesheets = timesheets;
      let filteredFuelUsages = fuelUsages;
      if (dateFrom) {
        filteredTimesheets = filteredTimesheets.filter((ts) => ts.date >= dateFrom);
        filteredFuelUsages = filteredFuelUsages.filter((fu) => fu.date >= dateFrom);
      }
      if (dateTo) {
        filteredTimesheets = filteredTimesheets.filter((ts) => ts.date <= dateTo);
        filteredFuelUsages = filteredFuelUsages.filter((fu) => fu.date <= dateTo);
      }

      const blob = await pdf(
        <ContractorPDFDocument
          contractor={selectedContractor}
          timesheets={filteredTimesheets}
          fuelUsages={filteredFuelUsages}
          filters={{ dateFrom: dateFrom || undefined, dateTo: dateTo || undefined }}
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
      toast.success('Contractor report PDF downloaded successfully');
    } catch (err) {
      console.error('Failed to generate PDF:', err);
      toast.error('Failed to generate contractor report PDF');
    } finally {
      setIsPdfGenerating(false);
    }
  }, [selectedContractor, timesheets, fuelUsages, dateFrom, dateTo]);

  useEffect(() => {
    const targetId = contractorId ?? selectedContractor?.id;
    if (targetId) {
      fetchContractorProfile(targetId);
    }
  }, [contractorId, selectedContractor?.id, fetchContractorProfile]);

  if (isLoading && !selectedContractor) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <LoadingSpinner size="lg" text="Loading contractor profile..." />
      </div>
    );
  }

  if (!selectedContractor) {
    return null;
  }

  const c = selectedContractor;
  const initials = c.contractorName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

  const typeColor = CONTRACTOR_TYPE_COLORS[c.contractorType as ContractorType] ?? '#78716c';
  const statusColor = CONTRACTOR_STATUS_COLORS[c.status as ContractorStatus] ?? '#78716c';

  // Filtered data for search
  const filteredExpenses = (c.expensesPaidTo ?? []).filter((exp) => {
    if (!expenseSearch) return true;
    const q = expenseSearch.toLowerCase();
    return (
      exp.title.toLowerCase().includes(q) ||
      (EXP_CATEGORY_LABELS[exp.category as Category] ?? exp.category).toLowerCase().includes(q)
    );
  });

  // Pagination for expenses
  const expenseTotalPages = Math.ceil(filteredExpenses.length / EXPENSE_PAGE_SIZE);
  const paginatedExpenses = filteredExpenses.slice(
    (expensePage - 1) * EXPENSE_PAGE_SIZE,
    expensePage * EXPENSE_PAGE_SIZE
  );

  const filteredTimesheets = timesheets.filter((ts) => {
    if (!timesheetSearch) return true;
    const q = timesheetSearch.toLowerCase();
    return (
      (ts.operatorName ?? '').toLowerCase().includes(q) ||
      (ts.workSite ?? '').toLowerCase().includes(q)
    );
  });

  const filteredFuelUsages = fuelUsages.filter((fu) => {
    if (!fuelSearch) return true;
    const q = fuelSearch.toLowerCase();
    return (
      (FUEL_TYPE_LABELS[fu.fuelType as FuelType] ?? fu.fuelType).toLowerCase().includes(q) ||
      (fu.fuelStation ?? '').toLowerCase().includes(q)
    );
  });

  // Computed summaries
  const totalTimesheetHours = timesheets.reduce((sum, ts) => sum + ts.totalHours, 0);
  const totalOvertimeHours = timesheets.reduce((sum, ts) => sum + ts.overtimeHours, 0);
  const totalFuelCost = fuelUsages.reduce((sum, fu) => sum + fu.totalCost, 0);
  const totalFuelQuantity = fuelUsages.reduce((sum, fu) => sum + fu.quantity, 0);

  // Financial summary computed data
  const machineryList = c.machinery ?? [];
  const allMachineryRates = c.machineryRates ?? [];
  const finFilteredTimesheets = timesheets.filter((ts) => {
    if (finDateFrom && ts.date < finDateFrom) return false;
    if (finDateTo && ts.date > finDateTo) return false;
    return true;
  });
  const finFilteredFuel = fuelUsages.filter((fu) => {
    if (finDateFrom && fu.date < finDateFrom) return false;
    if (finDateTo && fu.date > finDateTo) return false;
    return true;
  });

  const finTotalHours = finFilteredTimesheets.reduce((sum, ts) => sum + ts.totalHours, 0);
  const finTotalOvertime = finFilteredTimesheets.reduce((sum, ts) => sum + ts.overtimeHours, 0);
  const finTotalFuelCost = finFilteredFuel.reduce((sum, fu) => sum + fu.totalCost, 0);
  const finTotalFuelQty = finFilteredFuel.reduce((sum, fu) => sum + fu.quantity, 0);
  const finTotalExpenses = c.totalExpensesPaid ?? 0;

  // Filter expenses by financial tab's date range
  const finExpensesList = (c.expensesPaidTo ?? []).filter((exp) => {
    if (finDateFrom && exp.expenseDate < finDateFrom) return false;
    if (finDateTo && exp.expenseDate > finDateTo) return false;
    return true;
  });
  const finFilteredExpensesTotal = finExpensesList.reduce((sum, exp) => sum + exp.amount, 0);

  // Override finTotalExpenses for financial tab calculations
  const finTabTotalExpenses = finDateFrom || finDateTo ? finFilteredExpensesTotal : finTotalExpenses;
  const finTabExpenseList = finDateFrom || finDateTo ? finExpensesList : (c.expensesPaidTo ?? []);

  const timesheetRevenue = finFilteredTimesheets.reduce((sum, ts) => {
    if (!ts.machineryId) return sum;
    const machine = machineryList.find((m) => m.id === ts.machineryId);
    const hourlyRate = resolveTimesheetHourlyRate(ts, allMachineryRates, machine);
    return sum + computeTimesheetRevenue(ts.totalHours, hourlyRate);
  }, 0);

  const totalCosts = finTotalFuelCost + finTabTotalExpenses;
  const netFinancial = timesheetRevenue - totalCosts;
  const isProfitable = netFinancial >= 0;
  const netWithoutFuel = timesheetRevenue - finTabTotalExpenses;
  const isNetWithoutFuelPositive = netWithoutFuel >= 0;
  const workDays = finFilteredTimesheets.length;

  const getMachineryName = useCallback((machineryId?: string | null) => {
    if (!machineryId) return 'Unknown';
    return machineryList.find((m) => m.id === machineryId)?.machineryName ?? 'Unknown';
  }, [machineryList]);

  // Build rate tier rows for PDF overview
  const rateTierRows = useMemo(() => {
    const rows: Array<{
      machineryName: string;
      machineryType: string;
      driverName: string;
      plateNumber: string;
      rateName: string;
      hourlyRate: number;
      dailyRate: number;
      monthlyRate: number;
      isDefault: boolean;
    }> = [];
    for (const machine of machineryList) {
      const machineRates = allMachineryRates.filter((r) => r.machineryId === machine.id);
      if (machineRates.length > 0) {
        for (const r of machineRates) {
          rows.push({
            machineryName: machine.machineryName,
            machineryType: machine.machineryType,
            driverName: machine.driverName ?? '',
            plateNumber: machine.plateNumber ?? '',
            rateName: r.rateName,
            hourlyRate: r.hourlyRate,
            dailyRate: r.dailyRate,
            monthlyRate: r.monthlyRate,
            isDefault: r.isDefault,
          });
        }
      } else {
        rows.push({
          machineryName: machine.machineryName,
          machineryType: machine.machineryType,
          driverName: machine.driverName ?? '',
          plateNumber: machine.plateNumber ?? '',
          rateName: 'Base Rate',
          hourlyRate: machine.hourlyRate,
          dailyRate: machine.dailyRate,
          monthlyRate: machine.monthlyRate,
          isDefault: true,
        });
      }
    }
    return rows;
  }, [machineryList, allMachineryRates]);

  // Group timesheets by month + plateNumber + machineryType + rate tier
  const monthlyRateData = useMemo<Map<string, Map<string, { hours: number; revenue: number; machineryName: string; plateNumber: string; machineryType: string; rateLabel: string; hourlyRate: number; defaultRate: number }>>>(() => {
    const monthMap = new Map<string, Map<string, { hours: number; revenue: number; machineryName: string; plateNumber: string; machineryType: string; rateLabel: string; hourlyRate: number; defaultRate: number }>>();
    for (const ts of finFilteredTimesheets) {
      const month = ts.date.substring(0, 7);
      if (!monthMap.has(month)) monthMap.set(month, new Map());
      const rateMap = monthMap.get(month)!;

      const machineryName = ts.machinery?.machineryName ?? machineryList.find((m) => m.id === ts.machineryId)?.machineryName ?? 'Unknown';
      const plateNumber = ts.machinery?.plateNumber ?? machineryList.find((m) => m.id === ts.machineryId)?.plateNumber ?? 'N/A';
      const machineryType = ts.machinery?.machineryType ?? machineryList.find((m) => m.id === ts.machineryId)?.machineryType ?? 'Unknown';

      const machine = machineryList.find((m) => m.id === ts.machineryId);
      const machDefaultRate = allMachineryRates.find((r) => r.machineryId === ts.machineryId && r.isDefault);
      const defaultRateVal = machDefaultRate
        ? resolveHourlyRate({ rateTier: machDefaultRate, machinery: machine })
        : 0;
      // Linked rate tier, else the machinery's default tier, else the
      // machinery's own rates (shared resolver — no hard-coded hours).
      const rateTier = findRateTier(ts, allMachineryRates);
      const hourlyRate = resolveHourlyRate({ rateTier, machinery: machine });
      let rateLabel: string;
      if (rateTier) {
        rateLabel = rateTier.rateName;
      } else {
        rateLabel = machineryName === 'Unknown' ? 'Unknown' : `Default (${machineryName})`;
      }

      const key = `${plateNumber}||${machineryType}||${rateLabel}`;
      if (!rateMap.has(key)) {
        rateMap.set(key, { hours: 0, revenue: 0, machineryName, plateNumber, machineryType, rateLabel, hourlyRate, defaultRate: defaultRateVal });
      }
      const entry = rateMap.get(key)!;
      entry.hours += ts.totalHours;
      entry.revenue += computeTimesheetRevenue(ts.totalHours, hourlyRate);
    }
    return monthMap;
  }, [finFilteredTimesheets, allMachineryRates, machineryList]);

  // Aggregated monthly totals (for UI summary)
  const monthlyData = useMemo(() => finFilteredTimesheets.reduce<Record<string, { hours: number; revenue: number; count: number }>>((acc, ts) => {
    const month = ts.date.substring(0, 7);
    if (!acc[month]) acc[month] = { hours: 0, revenue: 0, count: 0 };
    acc[month].hours += ts.totalHours;
    acc[month].count += 1;
    if (ts.machineryId) {
      const machine = machineryList.find((m) => m.id === ts.machineryId);
      const hourlyRate = resolveTimesheetHourlyRate(ts, allMachineryRates, machine);
      acc[month].revenue += computeTimesheetRevenue(ts.totalHours, hourlyRate);
    }
    return acc;
  }, {}), [finFilteredTimesheets, machineryList, allMachineryRates]);

  const monthlyRateEntries = useMemo<Array<{ month: string; machineryName: string; plateNumber: string; machineryType: string; rateLabel: string; hours: number; revenue: number; hourlyRate: number; defaultRate: number; isTotal?: boolean }>>(() => {
    const entries: Array<{ month: string; machineryName: string; plateNumber: string; machineryType: string; rateLabel: string; hours: number; revenue: number; hourlyRate: number; defaultRate: number; isTotal?: boolean }> = [];
    const sortedMonths = Array.from(monthlyRateData.keys()).sort();
    for (const month of sortedMonths) {
      const rateMap = monthlyRateData.get(month) as Map<string, { hours: number; revenue: number; machineryName: string; plateNumber: string; machineryType: string; rateLabel: string; hourlyRate: number; defaultRate: number }> | undefined;
      if (!rateMap) continue;
      const sortedKeys = Array.from(rateMap.keys()).sort();
      for (const key of sortedKeys) {
        const d = rateMap.get(key)!;
        entries.push({ month, machineryName: d.machineryName, plateNumber: d.plateNumber, machineryType: d.machineryType, rateLabel: d.rateLabel, hours: d.hours, revenue: d.revenue, hourlyRate: d.hourlyRate, defaultRate: d.defaultRate });
      }
      const total = sortedKeys.reduce((acc, key) => {
        const d = rateMap.get(key)!;
        return { hours: acc.hours + d.hours, revenue: acc.revenue + d.revenue };
      }, { hours: 0, revenue: 0 });
      entries.push({ month, machineryName: '', plateNumber: '', machineryType: '', rateLabel: 'TOTAL', hours: total.hours, revenue: total.revenue, hourlyRate: 0, defaultRate: 0, isTotal: true });
    }
    return entries;
  }, [monthlyRateData]);

  // Daily hours for last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recentDailyHours = finFilteredTimesheets
    .filter((ts) => new Date(ts.date) >= thirtyDaysAgo)
    .reduce<Record<string, number>>((acc, ts) => {
      acc[ts.date] = (acc[ts.date] || 0) + ts.totalHours;
      return acc;
    }, {});

  const dailyEntries = Object.entries(recentDailyHours)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-30);

  const handleDownloadFinancialPDF = useCallback(async () => {
    if (!selectedContractor?.id) return;
    setIsFinPdfGenerating(true);
    try {
      const blob = await pdf(
        <ContractorFinancialSummaryPDFDocument
          contractorName={selectedContractor.contractorName}
          dateFrom={finDateFrom || undefined}
          dateTo={finDateTo || undefined}
          totalHours={finTotalHours}
          totalOvertime={finTotalOvertime}
          timesheetRevenue={timesheetRevenue}
          totalExpenses={finTabTotalExpenses}
          totalFuelCost={finTotalFuelCost}
          totalFuelQty={finTotalFuelQty}
          netFinancial={netFinancial}
          netWithoutFuel={netWithoutFuel}
          rateTierRows={rateTierRows}
          monthlyEntries={monthlyRateEntries}
          expenses={finTabExpenseList}
        />
      ).toBlob();

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `financial-summary-${selectedContractor.contractorName.replace(/\s+/g, '-').toLowerCase()}-${format(new Date(), 'yyyy-MM-dd')}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('Financial summary PDF downloaded successfully');
    } catch (err) {
      console.error('Failed to generate financial summary PDF:', err);
      toast.error('Failed to generate financial summary PDF');
    } finally {
      setIsFinPdfGenerating(false);
    }
  }, [selectedContractor, finDateFrom, finDateTo, finTotalHours, finTotalOvertime, timesheetRevenue, finTabTotalExpenses, finTabExpenseList, finTotalFuelCost, finTotalFuelQty, netFinancial, netWithoutFuel, rateTierRows, monthlyRateEntries, dailyEntries]);

  const handleDownloadFinancialFarsiPDF = useCallback(async () => {
    if (!selectedContractor?.id) return;
    setIsFarsiPdfGenerating(true);
    try {
      const blob = await pdf(
        <ContractorFinancialSummaryFarsiPDFDocument
          contractorName={selectedContractor.contractorName}
          dateFrom={finDateFrom || undefined}
          dateTo={finDateTo || undefined}
          totalHours={finTotalHours}
          totalOvertime={finTotalOvertime}
          timesheetRevenue={timesheetRevenue}
          totalExpenses={finTabTotalExpenses}
          totalFuelCost={finTotalFuelCost}
          totalFuelQty={finTotalFuelQty}
          netFinancial={netFinancial}
          netWithoutFuel={netWithoutFuel}
          rateTierRows={rateTierRows}
          monthlyEntries={monthlyRateEntries}
          expenses={finTabExpenseList}
        />
      ).toBlob();

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `financial-summary-fa-${selectedContractor.contractorName.replace(/\s+/g, '-').toLowerCase()}-${format(new Date(), 'yyyy-MM-dd')}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('Financial summary Farsi PDF downloaded successfully');
    } catch (err) {
      console.error('Failed to generate financial summary Farsi PDF:', err);
      toast.error('Failed to generate financial summary Farsi PDF');
    } finally {
      setIsFarsiPdfGenerating(false);
    }
   }, [selectedContractor, finDateFrom, finDateTo, finTotalHours, finTotalOvertime, timesheetRevenue, finTabTotalExpenses, finTabExpenseList, finTotalFuelCost, finTotalFuelQty, netFinancial, netWithoutFuel, rateTierRows, monthlyRateEntries]);

  const handleIdImageSelect = (e: React.ChangeEvent<HTMLInputElement>, side: 'front' | 'back') => {
    const file = e.target.files?.[0];
    if (!file || !c.id) return;

    setPendingIdImageFile(file);
    setIdImageSide(side);
    setPreviewRotation(0);
    setShowIdImageDialog(true);
  };

  const rotatePreview = (direction: 'left' | 'right') => {
    setPreviewRotation((prev) => {
      const delta = direction === 'left' ? -90 : 90;
      return (prev + delta + 360) % 360;
    });
  };

  const uploadPendingIdImage = async () => {
    if (!pendingIdImageFile || !c.id) return;

    const side = idImageSide;
    const fileToUpload = await rotateCanvas(pendingIdImageFile, previewRotation);

    if (side === 'front') {
      setIsUploadingIdImage(true);
    } else {
      setIsUploadingIdImageBack(true);
    }

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      const formData = new FormData();
      formData.append(side, fileToUpload);
      formData.append('contractorId', c.id);

      const response = await fetch('/api/contractors/upload', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      const result = await response.json();
      console.log('Upload response:', result);

      if (result.success && result.data?.[side]) {
        const imagePath = side === 'front' ? result.data.front : result.data.back;
        console.log('Updating contractor with:', side === 'front' ? 'idImageFront' : 'idImageBack', imagePath);
        try {
          if (side === 'front') {
            await updateContractor(c.id, { idImageFront: imagePath });
            toast.success('Front ID image uploaded successfully');
          } else {
            await updateContractor(c.id, { idImageBack: imagePath });
            toast.success('Back ID image uploaded successfully');
          }
        } catch (updateError) {
          console.error('Update contractor error:', updateError);
          toast.error('Failed to save image path to contractor');
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
      setPendingIdImageFile(null);
      setPreviewRotation(0);
    }
  };

  const handleRemoveIdImage = async (side: 'front' | 'back') => {
    if (!c.id) return;
    setIdImageToRemove(side);
    try {
      const updates = side === 'front'
        ? { idImageFront: null }
        : { idImageBack: null };
      await updateContractor(c.id, updates);
      toast.success(`${side === 'front' ? 'Front' : 'Back'} ID image removed`);
    } catch (error) {
      console.error('Remove error:', error);
      toast.error('Failed to remove image');
    } finally {
      setIdImageToRemove(null);
    }
  };

  const openImagePreview = (src: string, alt: string) => {
    setPreviewImageSrc(src);
    setPreviewImageAlt(alt);
    setShowImagePreview(true);
  };

  const downloadPreviewImage = () => {
    const link = document.createElement('a');
    link.href = previewImageSrc;
    link.download = previewImageAlt.toLowerCase().replace(/\s+/g, '-') + '.jpg';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={clearSelectedContractor}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h2 className="text-2xl font-bold tracking-tight">Contractor Profile</h2>
            <p className="text-muted-foreground">Detailed contractor information</p>
          </div>
          {canEdit('contractors') && (
            <Button onClick={() => openForm(c)} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              Edit Contractor
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2 pl-14">
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-8 w-[140px] text-xs"
            placeholder="From date"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-8 w-[140px] text-xs"
            placeholder="To date"
          />
          {(dateFrom || dateTo) && (
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setDateFrom(''); setDateTo(''); }}>
              Clear
            </Button>
          )}
          <div className="ml-auto flex items-center gap-2">
            {hasPermission('reports:generatePdf') && (
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={handleDownloadPDF}
                disabled={isPdfGenerating}
              >
                {isPdfGenerating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                ) : (
                  <Download className="h-3.5 w-3.5 mr-1" />
                )}
                {isPdfGenerating ? 'Generating...' : 'Download PDF Report'}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Profile Header Card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-emerald-600/10 text-emerald-700 dark:text-emerald-400 text-2xl font-bold">
              {initials}
            </div>
            <div className="text-center sm:text-left flex-1">
              <h3 className="text-xl font-bold">
                {c.contractorName}
                {c.contractorNumber && (
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    {c.contractorNumber}
                  </span>
                )}
              </h3>
              {c.companyName && <p className="text-muted-foreground">{c.companyName}</p>}
              <div className="mt-2 flex flex-wrap items-center justify-center sm:justify-start gap-2">
                <StatusBadge value={c.contractorType} colorMap={CONTRACTOR_TYPE_COLORS} labelMap={CONTRACTOR_TYPE_LABELS} />
                <StatusBadge value={c.status} colorMap={CONTRACTOR_STATUS_COLORS} labelMap={CONTRACTOR_STATUS_LABELS} />
              </div>
            </div>
            <div className="text-center sm:text-right">
              <p className="text-sm text-muted-foreground">Total Machinery</p>
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                {c.machinery?.length ?? 0}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview" className="gap-1.5">
            <User className="h-4 w-4" /> Overview
          </TabsTrigger>
          <TabsTrigger value="expenses" className="gap-1.5">
            <Receipt className="h-4 w-4" /> Expenses
          </TabsTrigger>
          <TabsTrigger value="timesheets" className="gap-1.5">
            <Clock className="h-4 w-4" /> Timesheets
          </TabsTrigger>
          <TabsTrigger value="fuel" className="gap-1.5">
            <Fuel className="h-4 w-4" /> Fuel Usage
          </TabsTrigger>
          <TabsTrigger value="machinery" className="gap-1.5">
            <Truck className="h-4 w-4" /> Machinery
          </TabsTrigger>
          <TabsTrigger value="contracts" className="gap-1.5">
            <FileText className="h-4 w-4" /> Contracts
          </TabsTrigger>
          <TabsTrigger value="financial" className="gap-1.5">
            <Calculator className="h-4 w-4" /> Financial Summary
          </TabsTrigger>
        </TabsList>

        {/* ─── Overview Tab ────────────────────────────────────── */}
        <TabsContent value="overview">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Basic Info Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <User className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  Basic Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <InfoItem icon={User} label="Contractor Name" value={c.contractorName} />
                <InfoItem icon={FileText} label="Contract ID" value={c.contractorNumber} />
                <InfoItem icon={User} label="Father Name" value={c.fatherName} />
                <InfoItem icon={Building2} label="Company Name" value={c.companyName} />
                <InfoItem icon={CreditCard} label="National ID" value={c.nationalId} />
                <Separator className="my-2" />
                <InfoItem icon={Briefcase} label="Contractor Type" value={CONTRACTOR_TYPE_LABELS[c.contractorType as ContractorType] ?? c.contractorType} />
              </CardContent>
            </Card>

            {/* Contact Info Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Phone className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  Contact Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <InfoItem icon={Phone} label="Phone Number" value={c.phoneNumber} />
                <InfoItem icon={Phone} label="Alternative Phone" value={c.alternativePhone} />
                <InfoItem icon={Mail} label="Email" value={c.email} />
                <InfoItem icon={MapPin} label="Address" value={c.address} />
              </CardContent>
            </Card>

            {/* Assigned Machinery Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Truck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  Assigned Machinery
                </CardTitle>
                <CardDescription>
                  {c.machinery?.length ?? 0} machine(s) assigned
                </CardDescription>
              </CardHeader>
              <CardContent>
                {c.machinery && c.machinery.length > 0 ? (
                  <div className="space-y-2 max-h-64 overflow-y-auto scrollbar-thin">
                    {c.machinery.map((m) => {
                      const mStatusColor = MACHINERY_STATUS_COLORS[m.status as MachineryStatus] ?? '#78716c';
                      return (
                        <div key={m.id} className="flex items-center justify-between rounded-lg border p-2.5 text-sm">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium truncate">{m.machineryName}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs text-muted-foreground">{m.machineryType}</span>
                              {m.plateNumber && <span className="text-xs text-muted-foreground">· {m.plateNumber}</span>}
                            </div>
                          </div>
                          <Badge variant="outline" className="border-0 text-[10px] px-1.5 py-0 ml-2" style={{ backgroundColor: `${mStatusColor}18`, color: mStatusColor }}>
                            {MACHINERY_STATUS_LABELS[m.status as MachineryStatus] ?? m.status}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-4 text-center">No machinery assigned</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Notes Card */}
          {c.notes && (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  Notes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{c.notes}</p>
              </CardContent>
            </Card>
          )}

          {/* ID Document Card */}
          {canEdit('contractors') && (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ImageIcon className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  Contractor ID Documents
                </CardTitle>
                <CardDescription>Upload front and back of contractor ID</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Front Image */}
                  <div className="flex flex-col items-center gap-3">
                    <p className="text-sm font-medium">Front Side</p>
                    {c.idImageFront ? (
                      <div className="relative w-full">
                        <img
                          src={c.idImageFront}
                          alt="ID Front"
                          className="w-full h-48 rounded-lg border object-contain bg-muted cursor-pointer hover:opacity-90 transition-opacity"
                          onClick={(e) => { e.stopPropagation(); openImagePreview(c.idImageFront!, 'Front ID'); }}
                          title="Click to preview full image"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-2 w-full"
                          onClick={() => { setIdImageSide('front'); setShowIdImageDialog(true); }}
                        >
                          <Upload className="h-4 w-4 mr-2" />
                          Update Front
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-2 w-full"
                          onClick={() => handleRemoveIdImage('front')}
                          disabled={idImageToRemove === 'front'}
                        >
                          {idImageToRemove === 'front' ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <X className="h-4 w-4 mr-2" />
                          )}
                          Remove Front
                        </Button>
                      </div>
                    ) : (
                      <label
                        htmlFor="contractor-id-image-front-upload"
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
                    {c.idImageBack ? (
                      <div className="relative w-full">
                        <img
                          src={c.idImageBack}
                          alt="ID Back"
                          className="w-full h-48 rounded-lg border object-contain bg-muted cursor-pointer hover:opacity-90 transition-opacity"
                          onClick={(e) => { e.stopPropagation(); openImagePreview(c.idImageBack!, 'Back ID'); }}
                          title="Click to preview full image"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-2 w-full"
                          onClick={() => { setIdImageSide('back'); setShowIdImageDialog(true); }}
                        >
                          <Upload className="h-4 w-4 mr-2" />
                          Update Back
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-2 w-full"
                          onClick={() => handleRemoveIdImage('back')}
                          disabled={idImageToRemove === 'back'}
                        >
                          {idImageToRemove === 'back' ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <X className="h-4 w-4 mr-2" />
                          )}
                          Remove Back
                        </Button>
                      </div>
                    ) : (
                      <label
                        htmlFor="contractor-id-image-back-upload"
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
          )}

          {/* Hidden file inputs for ID image upload */}
          <input
            key={pendingIdImageFile ? 'front-has-file' : 'front-no-file'}
            type="file"
            accept="image/jpeg,image/png"
            className="hidden"
            id="contractor-id-image-front-upload"
            onChange={(e) => handleIdImageSelect(e, 'front')}
          />
          <input
            key={pendingIdImageFile ? 'back-has-file' : 'back-no-file'}
            type="file"
            accept="image/jpeg,image/png"
            className="hidden"
            id="contractor-id-image-back-upload"
            onChange={(e) => handleIdImageSelect(e, 'back')}
          />

          {/* ID Image Upload Dialog */}
          <Dialog open={showIdImageDialog} onOpenChange={(open) => {
            setShowIdImageDialog(open);
            if (!open) {
              setPendingIdImageFile(null);
              setPreviewRotation(0);
            }
          }}>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Upload ID Image - {idImageSide === 'front' ? 'Front' : 'Back'}</DialogTitle>
                <DialogDescription>
                  Upload a JPEG or PNG image of the contractor's ID {idImageSide} side (max 10MB). Adjust rotation if needed.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                {!pendingIdImageFile ? (
                  <label
                    htmlFor={`contractor-id-image-${idImageSide}-upload`}
                    className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                  >
                    <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                    <span className="text-sm text-muted-foreground">Click to select image</span>
                    <span className="text-xs text-muted-foreground mt-1">JPEG, PNG (max 10MB)</span>
                  </label>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <div className="relative w-full h-48 rounded-lg border bg-muted overflow-hidden flex items-center justify-center">
                      <img
                        src={URL.createObjectURL(pendingIdImageFile)}
                        alt="Preview"
                        className="max-w-full max-h-full object-contain transition-transform duration-200"
                        style={{ transform: `rotate(${previewRotation}deg)` }}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => rotatePreview('left')}
                        disabled={(idImageSide === 'front' ? isUploadingIdImage : isUploadingIdImageBack)}
                      >
                        <RotateCcw className="h-4 w-4 mr-1" />
                        Rotate Left
                      </Button>
                      <span className="text-xs text-muted-foreground w-12 text-center">{previewRotation}°</span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => rotatePreview('right')}
                        disabled={(idImageSide === 'front' ? isUploadingIdImage : isUploadingIdImageBack)}
                      >
                        <RotateCw className="h-4 w-4 mr-1" />
                        Rotate Right
                      </Button>
                    </div>
                    <label
                      htmlFor={`contractor-id-image-${idImageSide}-upload`}
                      className="text-xs text-emerald-600 cursor-pointer hover:underline"
                    >
                      Choose a different image
                    </label>
                  </div>
                )}
              </div>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => { setShowIdImageDialog(false); setPendingIdImageFile(null); setPreviewRotation(0); }}>
                  Cancel
                </Button>
                <Button
                  onClick={uploadPendingIdImage}
                  disabled={!pendingIdImageFile || (idImageSide === 'front' ? isUploadingIdImage : isUploadingIdImageBack)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                >
                  {(idImageSide === 'front' ? isUploadingIdImage : isUploadingIdImageBack) ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  Upload Image
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Full Image Preview Dialog */}
          <Dialog open={showImagePreview} onOpenChange={setShowImagePreview}>
            <DialogContent className="max-w-[90vw] max-h-[90vh] p-0 border-none bg-transparent shadow-none">
              <DialogTitle className="sr-only">{previewImageAlt} Preview</DialogTitle>
              <div className="relative flex items-center justify-center w-full h-full">
                <img
                  src={previewImageSrc}
                  alt={previewImageAlt}
                  className="max-w-full max-h-[80vh] rounded-lg border object-contain"
                />
              </div>
              <DialogFooter className="absolute bottom-0 left-0 right-0 flex justify-end gap-2 p-4 bg-background/95 backdrop-blur">
                <Button variant="outline" size="sm" onClick={() => setShowImagePreview(false)}>
                  <X className="h-4 w-4 mr-2" />
                  Close
                </Button>
                <Button size="sm" onClick={downloadPreviewImage} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* ─── Expenses Tab ────────────────────────────────────── */}
        <TabsContent value="expenses">
          {/* Summary Card */}
          <div className="grid gap-4 sm:grid-cols-3 mb-6">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-600/10">
                    <DollarSign className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total Expenses Paid</p>
                    <p className="text-lg font-bold">{formatCurrency(c.totalExpensesPaid ?? 0)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-600/10">
                    <Receipt className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Expense Count</p>
                    <p className="text-lg font-bold">{c.expensesPaidTo?.length ?? 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-600/10">
                    <Calendar className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Monthly Average</p>
                    <p className="text-lg font-bold">
                      {formatCurrency(
                        (c.monthlyExpenses ?? []).length > 0
                          ? (c.monthlyExpenses ?? []).reduce((s, m) => s + m.amount, 0) / (c.monthlyExpenses ?? []).length
                          : 0
                      )}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Monthly breakdown */}
          {c.monthlyExpenses && c.monthlyExpenses.length > 0 && (
            <Card className="mb-6">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Calendar className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  Monthly Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-3">
                  {c.monthlyExpenses.map((m) => (
                    <div key={m.month} className="rounded-lg border px-3 py-2 text-center">
                      <p className="text-xs text-muted-foreground">{m.month}</p>
                      <p className="text-sm font-semibold">{formatCurrency(m.amount)}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search expenses..."
              value={expenseSearch}
              onChange={(e) => { setExpenseSearch(e.target.value); setExpensePage(1); }}
              className="pl-9"
            />
          </div>

          {/* Expenses Table */}
          <Card>
            <CardContent className="p-0">
              {filteredExpenses.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Title</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Payment Method</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedExpenses.map((exp) => {
                        const catColor = EXP_CATEGORY_COLORS[exp.category as Category] ?? '#78716c';
                        return (
                          <TableRow key={exp.id}>
                            <TableCell className="font-medium max-w-[200px] truncate">{exp.title}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="border-0 text-[10px] px-1.5 py-0" style={{ backgroundColor: `${catColor}18`, color: catColor }}>
                                {EXP_CATEGORY_LABELS[exp.category as Category] ?? exp.category}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-mono tabular-nums">{formatCurrency(exp.amount)}</TableCell>
                            <TableCell className="text-muted-foreground">{format(new Date(exp.expenseDate), 'MMM dd, yyyy')}</TableCell>
                            <TableCell className="text-muted-foreground">{exp.paymentMethod ?? '—'}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="py-12 text-center">
                  <Receipt className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">
                    {expenseSearch ? 'No expenses match your search' : 'No expenses recorded for this contractor'}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pagination */}
          {filteredExpenses.length > EXPENSE_PAGE_SIZE && (
            <div className="flex items-center justify-between mt-4">
              <div className="text-sm text-muted-foreground">
                Showing {(expensePage - 1) * EXPENSE_PAGE_SIZE + 1} to{' '}
                {Math.min(expensePage * EXPENSE_PAGE_SIZE, filteredExpenses.length)} of{' '}
                {filteredExpenses.length} expenses
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setExpensePage(p => p - 1)}
                  disabled={expensePage <= 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setExpensePage(p => p + 1)}
                  disabled={expensePage >= expenseTotalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ─── Timesheets Tab ──────────────────────────────────── */}
        <TabsContent value="timesheets">
          {/* Summary Card */}
          <div className="grid gap-4 sm:grid-cols-2 mb-6">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-600/10">
                    <Timer className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total Hours</p>
                    <p className="text-lg font-bold">{totalTimesheetHours.toFixed(2)} hrs</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-600/10">
                    <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Overtime Hours</p>
                    <p className="text-lg font-bold">{totalOvertimeHours.toFixed(2)} hrs</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search timesheets..."
              value={timesheetSearch}
              onChange={(e) => setTimesheetSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Timesheets Table */}
          <Card>
            <CardContent className="p-0">
              {filteredTimesheets.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Operator</TableHead>
                        <TableHead>Work Site</TableHead>
                        <TableHead>Morning</TableHead>
                        <TableHead>Afternoon</TableHead>
                        <TableHead className="text-right">Hours</TableHead>
                        <TableHead className="text-right">OT</TableHead>
                        <TableHead>Machinery</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredTimesheets.map((ts) => (
                        <TableRow key={ts.id}>
                          <TableCell className="text-muted-foreground">{format(new Date(ts.date), 'MMM dd, yyyy')}</TableCell>
                          <TableCell className="font-medium">{ts.operatorName ?? '—'}</TableCell>
                          <TableCell className="max-w-[120px] truncate">{ts.workSite ?? '—'}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {ts.startTime && ts.lunchStart ? `${ts.startTime}–${ts.lunchStart}` : ts.startTime ?? '—'}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {ts.lunchEnd && ts.endTime ? `${ts.lunchEnd}–${ts.endTime}` : ts.lunchEnd ?? ts.endTime ?? '—'}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums">{ts.totalHours.toFixed(2)}</TableCell>
                          <TableCell className="text-right font-mono tabular-nums">{ts.overtimeHours.toFixed(2)}</TableCell>
                          <TableCell className="max-w-[150px] truncate">
                            {ts.machinery ? (
                              <span className="text-sm">
                                {ts.machinery.machineryName}
                                <span className="text-xs text-muted-foreground ml-1">({ts.machinery.plateNumber ?? '—'})</span>
                              </span>
                            ) : '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="py-12 text-center">
                  <Clock className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">
                    {timesheetSearch ? 'No timesheets match your search' : 'No timesheets recorded for this contractor'}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Fuel Usage Tab ──────────────────────────────────── */}
        <TabsContent value="fuel">
          {/* Summary Card */}
          <div className="grid gap-4 sm:grid-cols-2 mb-6">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-600/10">
                    <DollarSign className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total Fuel Cost</p>
                    <p className="text-lg font-bold">{formatCurrency(totalFuelCost)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-600/10">
                    <Fuel className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total Quantity</p>
                    <p className="text-lg font-bold">{totalFuelQuantity.toFixed(2)} L</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search fuel usages..."
              value={fuelSearch}
              onChange={(e) => setFuelSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Fuel Usage Table */}
          <Card>
            <CardContent className="p-0">
              {filteredFuelUsages.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Fuel Type</TableHead>
                        <TableHead className="text-right">Quantity</TableHead>
                        <TableHead className="text-right">Unit Price</TableHead>
                        <TableHead className="text-right">Total Cost</TableHead>
                        <TableHead>Fuel Station</TableHead>
                        <TableHead>Machinery</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredFuelUsages.map((fu) => {
                        const fColor = FUEL_TYPE_COLORS[fu.fuelType as FuelType] ?? '#78716c';
                        return (
                          <TableRow key={fu.id}>
                            <TableCell className="text-muted-foreground">{format(new Date(fu.date), 'MMM dd, yyyy')}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="border-0 text-[10px] px-1.5 py-0" style={{ backgroundColor: `${fColor}18`, color: fColor }}>
                                {FUEL_TYPE_LABELS[fu.fuelType as FuelType] ?? fu.fuelType}
                              </Badge>
                              {fu.billable && (
                                <Badge variant="outline" className="ml-1 border-0 text-[10px] px-1.5 py-0 bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400">
                                  Billable
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-mono tabular-nums">{fu.quantity.toFixed(2)}</TableCell>
                            <TableCell className="text-right font-mono tabular-nums">{formatCurrency(fu.unitPrice)}</TableCell>
                            <TableCell className="text-right font-mono tabular-nums font-medium">{formatCurrency(fu.totalCost)}</TableCell>
                            <TableCell className="max-w-[120px] truncate">{fu.fuelStation ?? '—'}</TableCell>
                            <TableCell className="max-w-[150px] truncate">
                              {fu.machinery ? (
                                <span className="text-sm">
                                  {fu.machinery.machineryName}
                                  <span className="text-xs text-muted-foreground ml-1">({fu.machinery.plateNumber ?? '—'})</span>
                                </span>
                              ) : '—'}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="py-12 text-center">
                  <Fuel className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">
                    {fuelSearch ? 'No fuel records match your search' : 'No fuel usage records for this contractor'}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Machinery Usage Tab ─────────────────────────────── */}
        <TabsContent value="machinery">
          {c.machinery && c.machinery.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {c.machinery.map((m) => {
                const mStatusColor = MACHINERY_STATUS_COLORS[m.status as MachineryStatus] ?? '#78716c';
                const fColor = FUEL_TYPE_COLORS[m.fuelType as FuelType] ?? '#78716c';
                return (
                  <Card key={m.id}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-base">{m.machineryName}</CardTitle>
                          <CardDescription className="mt-0.5">{m.machineryType}</CardDescription>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {canView('machinery') && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              title="View details"
                              onClick={() => setDetailMachinery(m)}
                            >
                              <Eye className="h-4 w-4" />
                              <span className="sr-only">View details</span>
                            </Button>
                          )}
                          <Badge variant="outline" className="border-0 shrink-0" style={{ backgroundColor: `${mStatusColor}18`, color: mStatusColor }}>
                            {MACHINERY_STATUS_LABELS[m.status as MachineryStatus] ?? m.status}
                          </Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground">Plate Number</p>
                          <p className="font-medium">{m.plateNumber ?? '—'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Model</p>
                          <p className="font-medium">{m.model ?? '—'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Fuel Type</p>
                          <Badge variant="outline" className="border-0 text-[10px] px-1.5 py-0 mt-0.5" style={{ backgroundColor: `${fColor}18`, color: fColor }}>
                            {FUEL_TYPE_LABELS[m.fuelType as FuelType] ?? m.fuelType}
                          </Badge>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Consumption Rate</p>
                          <p className="font-medium flex items-center gap-1">
                            <Gauge className="h-3 w-3 text-muted-foreground" />
                            {m.hourlyConsumptionRate.toFixed(2)} L/hr
                          </p>
                        </div>
                      </div>
                      <Separator />
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground">Hourly Rate</p>
                          <p className="font-medium">{formatCurrency(m.hourlyRate)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Daily Rate</p>
                          <p className="font-medium">{formatCurrency(m.dailyRate)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Monthly Rate</p>
                          <p className="font-medium">{formatCurrency(m.monthlyRate)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Contract Days/Month</p>
                          <p className="font-medium">{m.contractDaysPerMonth} days</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Contract Start</p>
                          <p className="font-medium">{m.contractStartDate ? format(new Date(m.contractStartDate), 'MMM dd, yyyy') : '—'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Contract End</p>
                          <p className="font-medium">{m.contractEndDate ? format(new Date(m.contractEndDate), 'MMM dd, yyyy') : '—'}</p>
                        </div>
                      </div>
                      {(m._count?.timesheets ?? 0) > 0 && (
                        <div className="flex items-center gap-3 text-xs text-muted-foreground pt-2 border-t">
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {m._count?.timesheets ?? 0} timesheets</span>
                          <span className="flex items-center gap-1"><Fuel className="h-3 w-3" /> {m._count?.fuelUsages ?? 0} fuel records</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Truck className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No machinery assigned to this contractor</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ─── Contracts Tab ─────────────────────────────────── */}
        <TabsContent value="contracts">
          <ContractorContractsTab
            contractorId={selectedContractor.id}
            canCreate={hasPermission('contracts:create')}
            canEdit={hasPermission('contracts:edit')}
            canDelete={hasPermission('contracts:delete')}
            canApprove={hasPermission('contracts:approve')}
          />
        </TabsContent>

        {/* ─── Financial Summary Tab ──────────────────────────── */}
        <TabsContent value="financial">
          {/* Date range filter */}
          <div className="flex items-center gap-2 mb-6">
            <Input
              type="date"
              value={finDateFrom}
              onChange={(e) => setFinDateFrom(e.target.value)}
              className="h-8 w-[140px] text-xs"
              placeholder="From date"
            />
            <span className="text-xs text-muted-foreground">to</span>
            <Input
              type="date"
              value={finDateTo}
              onChange={(e) => setFinDateTo(e.target.value)}
              className="h-8 w-[140px] text-xs"
              placeholder="To date"
            />
            {(finDateFrom || finDateTo) && (
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setFinDateFrom(''); setFinDateTo(''); }}>
                Clear
              </Button>
            )}
            <span className="text-xs text-muted-foreground ml-2">
              {finFilteredTimesheets.length} timesheet(s), {finFilteredFuel.length} fuel record(s)
            </span>
            {hasPermission('reports:generatePdf') && (
              <div className="flex items-center gap-2 ml-auto">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={handleDownloadFinancialPDF}
                  disabled={isFinPdfGenerating}
                >
                  {isFinPdfGenerating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                  ) : (
                    <Download className="h-3.5 w-3.5 mr-1" />
                  )}
                  {isFinPdfGenerating ? 'Generating...' : 'Download PDF'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={handleDownloadFinancialFarsiPDF}
                  disabled={isFarsiPdfGenerating}
                >
                  {isFarsiPdfGenerating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                  ) : (
                    <Download className="h-3.5 w-3.5 mr-1" />
                  )}
                  {isFarsiPdfGenerating ? 'در حال تولید...' : 'دانلود PDF (فارسی)'}
                </Button>
              </div>
            )}
          </div>

          {/* KPI Summary Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600/10">
                    <Timer className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total Work Hours</p>
                    <p className="text-lg font-bold">{finTotalHours.toFixed(2)} hrs</p>
                    {finTotalOvertime > 0 && (
                      <p className="text-[10px] text-amber-600">({finTotalOvertime.toFixed(2)} OT hrs)</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-600/10">
                    <DollarSign className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Estimated Revenue</p>
                    <p className="text-lg font-bold">{formatCurrency(timesheetRevenue)}</p>
                    <p className="text-[10px] text-muted-foreground">Based on {finTotalHours.toFixed(1)} hrs × effective hourly rates</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-rose-600/10">
                    <Receipt className="h-5 w-5 text-rose-600 dark:text-rose-400" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total Expenses Paid</p>
                    <p className="text-lg font-bold">{formatCurrency(finTabTotalExpenses)}</p>
                    <p className="text-[10px] text-muted-foreground">{c._count?.expensesPaidTo ?? finTabExpenseList.length} expense(s)</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-600/10">
                    <Fuel className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total Fuel Cost</p>
                    <p className="text-lg font-bold">{formatCurrency(finTotalFuelCost)}</p>
                    <p className="text-[10px] text-muted-foreground">{finTotalFuelQty.toFixed(2)} L total</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${isProfitable ? 'bg-emerald-600/10' : 'bg-red-600/10'}`}>
                    {isProfitable ? (
                      <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <TrendingDown className="h-5 w-5 text-red-600 dark:text-red-400" />
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Net (Revenue - All Costs)</p>
                    <p className={`text-lg font-bold ${isProfitable ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                      {formatCurrency(Math.abs(netFinancial))}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{isProfitable ? 'Surplus' : 'Deficit'} (incl. fuel)</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${isNetWithoutFuelPositive ? 'bg-emerald-600/10' : 'bg-red-600/10'}`}>
                    {isNetWithoutFuelPositive ? (
                      <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <TrendingDown className="h-5 w-5 text-red-600 dark:text-red-400" />
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Net (Revenue - Expenses)</p>
                    <p className={`text-lg font-bold ${isNetWithoutFuelPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                      {formatCurrency(Math.abs(netWithoutFuel))}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{isNetWithoutFuelPositive ? 'Surplus' : 'Deficit'} (excl. fuel)</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Machinery Rate Overview */}
          {rateTierRows.length > 0 && (
            <Card className="mb-6">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Truck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  Rate Tiers Overview
                </CardTitle>
                <CardDescription>Rate tiers per machine with hourly, daily, and monthly rates</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Machine</TableHead>
                        <TableHead>Rate Tier</TableHead>
                        <TableHead className="text-right">Hourly</TableHead>
                        <TableHead className="text-right">Daily</TableHead>
                        <TableHead className="text-right">Monthly</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rateTierRows.map((r, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{r.machineryName}</TableCell>
                          <TableCell>
                            <span className="text-xs">{r.rateName}{r.isDefault ? <span className="ml-1 text-amber-500" title="Default">★</span> : ''}</span>
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums">{formatCurrency(r.hourlyRate)}</TableCell>
                          <TableCell className="text-right font-mono tabular-nums">{formatCurrency(r.dailyRate)}</TableCell>
                          <TableCell className="text-right font-mono tabular-nums">{formatCurrency(r.monthlyRate)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Monthly Breakdown */}
          {monthlyRateEntries.length > 0 && (
            <Card className="mb-6">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Calendar className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  Monthly Breakdown
                </CardTitle>
                <CardDescription>Hours, revenue, and rates by month, machinery, and rate tier</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Month</TableHead>
                        <TableHead>Machinery</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Rate Tier</TableHead>
                        <TableHead className="text-right">Hours</TableHead>
                        <TableHead className="text-right">Revenue</TableHead>
                        <TableHead className="text-right">Selected Rate</TableHead>
                        <TableHead className="text-right">Default Rate</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(() => {
                        let lastMonth = '';
                        return monthlyRateEntries.map((r, i) => {
                          const showMonth = r.month !== lastMonth;
                          lastMonth = r.month;
                          const monthLabel = showMonth ? format(new Date(r.month + '-01'), 'MMM yyyy') : '';
                          return (
                            <TableRow
                              key={i}
                              className={r.isTotal ? 'bg-emerald-50 dark:bg-emerald-950/20' : ''}
                            >
                              <TableCell className={r.isTotal ? 'font-bold' : 'font-medium'}>{monthLabel}</TableCell>
                              <TableCell className={r.isTotal ? 'font-bold' : ''}>{r.isTotal ? '' : `${r.machineryName} (${r.plateNumber})`}</TableCell>
                              <TableCell className={r.isTotal ? 'font-bold' : ''}>{r.isTotal ? '' : r.machineryType}</TableCell>
                              <TableCell className={r.isTotal ? 'font-bold' : ''}>{r.rateLabel}</TableCell>
                              <TableCell className={`text-right font-mono tabular-nums ${r.isTotal ? 'font-bold' : ''}`}>
                                {r.hours.toFixed(1)}
                              </TableCell>
                              <TableCell className={`text-right font-mono tabular-nums ${r.isTotal ? 'font-bold' : ''}`}>
                                {formatCurrency(r.revenue)}
                              </TableCell>
                              <TableCell className="text-right font-mono tabular-nums text-xs">
                                {r.isTotal ? '' : formatCurrency(r.hourlyRate)}
                              </TableCell>
                              <TableCell className="text-right font-mono tabular-nums text-xs text-muted-foreground">
                                {r.isTotal ? '' : r.defaultRate > 0 ? formatCurrency(r.defaultRate) : '—'}
                              </TableCell>
                            </TableRow>
                          );
                        });
                      })()}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Expenses Table */}
          {finTabExpenseList.length > 0 && (
            <Card className="mb-6">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Receipt className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  Expenses
                </CardTitle>
                <CardDescription>Filtered expense records</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Title</TableHead>
                        <TableHead>Notes</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Payment Method</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {finTabExpenseList.map((exp) => {
                        const catColor = EXP_CATEGORY_COLORS[exp.category as Category] ?? '#78716c';
                        return (
                          <TableRow key={exp.id}>
                            <TableCell className="font-medium max-w-[150px] truncate">{exp.title}</TableCell>
                            <TableCell className="max-w-[150px] truncate text-muted-foreground text-xs whitespace-pre-wrap">{exp.notes ?? '—'}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="border-0 text-[10px] px-1.5 py-0" style={{ backgroundColor: `${catColor}18`, color: catColor }}>
                                {EXP_CATEGORY_LABELS[exp.category as Category] ?? exp.category}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-mono tabular-nums">{formatCurrency(exp.amount)}</TableCell>
                            <TableCell className="text-muted-foreground">{format(new Date(exp.expenseDate), 'MMM dd, yyyy')}</TableCell>
                            <TableCell className="text-muted-foreground">{exp.paymentMethod ?? '—'}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Empty state */}
          {finFilteredTimesheets.length === 0 && finFilteredFuel.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center">
                <Calculator className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  {finDateFrom || finDateTo
                    ? 'No financial data matches the selected date range'
                    : 'No financial data recorded for this contractor'}
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Machinery Detail Modal */}
      <MachineryDetailModal
        open={!!detailMachinery}
        onOpenChange={(open) => { if (!open) setDetailMachinery(null); }}
        machinery={detailMachinery}
      />
    </div>
  );
}
