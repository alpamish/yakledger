'use client';

import { useState, useCallback, useEffect } from 'react';
import { pdf } from '@react-pdf/renderer';
import { contractorsApi, timesheetsApi, fuelUsageApi, machineryApi } from '@/services/contractor-api';
import type { Contractor, Timesheet, FuelUsage, Machinery, ContractorType } from '@/types/contractor';
import { CONTRACTOR_TYPE_LABELS } from '@/types/contractor';
import { downloadPdfBlob, filterTimesheetsByDate, filterFuelUsagesByDate } from '@/lib/pdf-utils';
import { formatCurrency } from '@/lib/utils';
import ContractorPDFDocument from '@/components/pdf/contractor-pdf-document';
import ContractorFinancialReportPDFDocument from '@/components/pdf/contractor-financial-report-pdf-document';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  User,
  Clock,
  Fuel,
  Receipt,
  FileDown,
  Eye,
  Loader2,
  ChevronsUpDown,
  Check,
  FileText,
} from 'lucide-react';
import {
  Card,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ContractorPdfPreviewModal } from '@/components/reports/contractor-pdf-preview-modal';
import { MachineryPdfPreviewModal } from '@/components/reports/machinery-pdf-preview-modal';

interface ContractorReportsTabProps {
  companyName: string;
  hasPermission: (action: string) => boolean;
  onOpenTimesheetDialog: () => void;
}

export function ContractorReportsTab({
  companyName,
  hasPermission,
  onOpenTimesheetDialog,
}: ContractorReportsTabProps) {
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
  const [showTimesheets, setShowTimesheets] = useState(true);
  const [showFuelUsages, setShowFuelUsages] = useState(true);
  const [showExpenses, setShowExpenses] = useState(true);
  const [machineryList, setMachineryList] = useState<Pick<Machinery, 'id' | 'machineryName' | 'plateNumber'>[]>([]);
  const [selectedMachineryId, setSelectedMachineryId] = useState('');
  const [selectedMachinery, setSelectedMachinery] = useState<Machinery | null>(null);
  const [machineryTimesheets, setMachineryTimesheets] = useState<Timesheet[]>([]);
  const [machineryFuelUsages, setMachineryFuelUsages] = useState<FuelUsage[]>([]);
  const [machineryIsLoading, setMachineryIsLoading] = useState(false);
  const [machineryPdfGenerating, setMachineryPdfGenerating] = useState(false);
  const [machineryPdfPreviewOpen, setMachineryPdfPreviewOpen] = useState(false);
  const [machinerySelectOpen, setMachinerySelectOpen] = useState(false);

  useEffect(() => {
    contractorsApi
      .getList()
      .then((res) => {
        if (res.data) setContractorList(res.data);
      })
      .catch(() => {});
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

      downloadPdfBlob(blob, `contractor-report-${selectedContractor.contractorName.replace(/\s+/g, '-').toLowerCase()}-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
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
      downloadPdfBlob(blob, `all-contractors-financial-report-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
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
      const { default: MachineryPDFDocument } = await import('@/components/pdf/machinery-pdf-document');
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

      downloadPdfBlob(blob, `machinery-report-${selectedMachinery.machineryName.replace(/\s+/g, '-').toLowerCase()}-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
      toast.success('Machinery report downloaded');
    } catch (err) {
      console.error('PDF generation failed:', err);
      toast.error('Failed to generate machinery report');
    } finally {
      setMachineryPdfGenerating(false);
    }
  }, [selectedMachinery, selectedContractor, machineryTimesheets, machineryFuelUsages, ctrDateFrom, ctrDateTo, companyName]);

  return (
    <div className="space-y-6">
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
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={() => {
                setCtrDateFrom('');
                setCtrDateTo('');
              }}
            >
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
                      : 'Choose a contractor...'}
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
                    <p className="text-xs text-muted-foreground">
                      {CONTRACTOR_TYPE_LABELS[selectedContractor.contractorType as ContractorType] ?? selectedContractor.contractorType}
                    </p>
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
                    <p className="text-lg font-bold">
                      {contractorTimesheets.reduce((s, t) => s + t.totalHours, 0).toFixed(1)} hrs
                    </p>
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
                    <p className="text-lg font-bold">
                      {formatCurrency(contractorFuelUsages.reduce((s, f) => s + f.totalCost, 0))}
                    </p>
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
                    <p className="text-lg font-bold">
                      {formatCurrency(selectedContractor.totalExpensesPaid ?? 0)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {(selectedContractor.expensesPaidTo ?? []).length} records
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="p-4">
              <p className="text-sm font-medium mb-3">Include in Contractor Report PDF</p>
              <div className="flex flex-wrap items-center gap-6">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="show-ts"
                    checked={showTimesheets}
                    onCheckedChange={(v) => setShowTimesheets(v === true)}
                  />
                  <Label htmlFor="show-ts" className="text-sm cursor-pointer">
                    Timesheet Records
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="show-fu"
                    checked={showFuelUsages}
                    onCheckedChange={(v) => setShowFuelUsages(v === true)}
                  />
                  <Label htmlFor="show-fu" className="text-sm cursor-pointer">
                    Fuel Usage Records
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="show-exp"
                    checked={showExpenses}
                    onCheckedChange={(v) => setShowExpenses(v === true)}
                  />
                  <Label htmlFor="show-exp" className="text-sm cursor-pointer">
                    Expense Records
                  </Label>
                </div>
              </div>
            </CardContent>
          </Card>

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
                          : 'Choose a machinery...'}
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
                        onClick={onOpenTimesheetDialog}
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
              <p className="text-sm text-muted-foreground">
                Select a contractor above to generate a report
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                The report will include contractor details, timesheets, fuel usage, expenses, and machinery information
              </p>
            </div>
          </CardContent>
        </Card>
      )}

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
    </div>
  );
}
