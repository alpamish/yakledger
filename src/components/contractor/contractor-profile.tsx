'use client';

import * as React from 'react';
import { useEffect, useState, useCallback } from 'react';
import { pdf } from "@react-pdf/renderer";
import ContractorPDFDocument from "@/components/pdf/contractor-pdf-document";
import { useContractorStore } from '@/hooks/use-contractor-store';
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
import type { ContractorType, ContractorStatus, FuelType, MachineryStatus } from '@/types/contractor';
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
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
} from 'lucide-react';
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

function StatusBadge({ value, colorMap, labelMap }: { value: string; colorMap: Record<string, string>; labelMap: Record<string, string> }) {
  const color = colorMap[value] ?? '#78716c';
  const label = labelMap[value] ?? value;
  return (
    <Badge variant="outline" className="border-0" style={{ backgroundColor: `${color}18`, color }}>
      {label}
    </Badge>
  );
}

export function ContractorProfile({ contractorId }: { contractorId: string }) {
  const selectedContractor = useContractorStore((s) => s.selectedContractor);
  const isLoading = useContractorStore((s) => s.isLoading);
  const timesheets = useContractorStore((s) => s.timesheets);
  const fuelUsages = useContractorStore((s) => s.fuelUsages);
  const fetchContractorProfile = useContractorStore((s) => s.fetchContractorProfile);
  const clearSelectedContractor = useContractorStore((s) => s.clearSelectedContractor);
  const openForm = useContractorStore((s) => s.openForm);

  // Search states for tab filtering
  const [expenseSearch, setExpenseSearch] = useState('');
  const [timesheetSearch, setTimesheetSearch] = useState('');
  const [fuelSearch, setFuelSearch] = useState('');

  // PDF report state
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [isPdfGenerating, setIsPdfGenerating] = useState(false);

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
    if (contractorId) {
      fetchContractorProfile(contractorId);
    }
  }, [contractorId, fetchContractorProfile]);

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
          <Button onClick={() => openForm(c)} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            Edit Contractor
          </Button>
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
              <h3 className="text-xl font-bold">{c.contractorName}</h3>
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
              onChange={(e) => setExpenseSearch(e.target.value)}
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
                      {filteredExpenses.map((exp) => {
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
                        <Badge variant="outline" className="border-0 shrink-0" style={{ backgroundColor: `${mStatusColor}18`, color: mStatusColor }}>
                          {MACHINERY_STATUS_LABELS[m.status as MachineryStatus] ?? m.status}
                        </Badge>
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
      </Tabs>
    </div>
  );
}
