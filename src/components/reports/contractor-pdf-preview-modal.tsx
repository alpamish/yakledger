'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { pdf } from '@react-pdf/renderer';
import { Loader2, Download, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import ContractorPDFDocument from '@/components/pdf/contractor-pdf-document';
import { filterTimesheetsByDate, filterFuelUsagesByDate } from '@/lib/pdf-utils';
import type { Contractor, Timesheet, FuelUsage } from '@/types/contractor';

export function ContractorPdfPreviewModal({
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
  const prevUrlRef = useRef<string | null>(null);

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
        const filteredTs = filterTimesheetsByDate(timesheets, dateFrom, dateTo);
        const filteredFu = filterFuelUsagesByDate(fuelUsages, dateFrom, dateTo);

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
