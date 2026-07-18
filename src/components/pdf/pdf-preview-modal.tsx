"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { pdf } from "@react-pdf/renderer";
import { format } from "date-fns";
import { Download, Loader2, FileText, Printer, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { Expense } from "@/types/expense";
import ExpensePDFDocument, {
  type PdfFilters,
} from "@/components/pdf/expense-pdf-document";
import { settingsApi } from "@/services/settings";
import { usePermissions } from "@/hooks/use-permissions";

interface PdfPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expenses: Expense[];
  filters?: {
    categories?: string[];
    dateFrom?: string;
    dateTo?: string;
  };
}

export default function PdfPreviewModal({
  open,
  onOpenChange,
  expenses,
  filters,
}: PdfPreviewModalProps) {
  const { hasPermission } = usePermissions();
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState("YakhshiLedger");
  const prevUrlRef = useRef<string | null>(null);

  useEffect(() => {
    settingsApi.get().then((res) => {
      if (res.data?.companyName) setCompanyName(res.data.companyName);
    }).catch(() => {});
  }, []);

  // Generate the PDF blob URL when the modal opens
  useEffect(() => {
    if (!open) {
      // Clean up previous URL when modal closes
      if (prevUrlRef.current) {
        URL.revokeObjectURL(prevUrlRef.current);
        prevUrlRef.current = null;
      }
      setPdfUrl(null);
      setError(null);
      return;
    }

    if (!Array.isArray(expenses) || expenses.length === 0) return;

    let cancelled = false;

    async function generatePdf() {
      setIsGenerating(true);
      setError(null);

      try {
        const pdfFilters: PdfFilters | undefined = filters
          ? {
              categories: filters.categories,
              dateFrom: filters.dateFrom,
              dateTo: filters.dateTo,
            }
          : undefined;

        if (!Array.isArray(expenses)) {
          setError("No expense data available. Please select expenses to generate a report.");
          return;
        }

        const blob = await pdf(
          <ExpensePDFDocument expenses={expenses} filters={pdfFilters} companyName={companyName} />
        ).toBlob();

        if (cancelled) return;

        // Clean up previous URL if any
        if (prevUrlRef.current) {
          URL.revokeObjectURL(prevUrlRef.current);
        }

        const url = URL.createObjectURL(blob);
        prevUrlRef.current = url;
        setPdfUrl(url);
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to generate PDF preview:", err);
        const message = err instanceof Error ? err.message : "Please try again.";
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
  }, [open, expenses, filters]);

  const handleDownload = useCallback(() => {
    if (!pdfUrl) return;

    const link = document.createElement("a");
    link.href = pdfUrl;
    link.download = `expense-report-${format(new Date(), "yyyy-MM-dd")}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [pdfUrl]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="size-5 text-emerald-600" />
            PDF Preview
          </DialogTitle>
          <DialogDescription>
            Preview your expense report before downloading.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 border rounded-md overflow-hidden bg-muted/30">
          {isGenerating && (
            <div className="flex flex-col items-center justify-center h-80 gap-3">
              <Loader2 className="size-8 animate-spin text-emerald-600" />
              <p className="text-sm text-muted-foreground">
                Generating PDF preview...
              </p>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center h-80 gap-3">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {!isGenerating && !error && expenses.length === 0 && (
            <div className="flex flex-col items-center justify-center h-80 gap-3">
              <FileText className="size-12 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                No expenses to preview. Select expenses to generate a report.
              </p>
            </div>
          )}

          {!isGenerating && !error && pdfUrl && expenses.length > 0 && (
            <iframe
              src={pdfUrl}
              className="w-full h-[70vh] border-0"
              title="PDF Preview"
            />
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <div className="flex w-full items-center justify-between gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-4 mr-1.5" />
              Close
            </Button>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.print()}
                disabled={!pdfUrl || isGenerating}
              >
                <Printer className="size-4 mr-1.5" />
                Print
              </Button>
              {hasPermission('reports:generatePdf') && (
                <Button
                  size="sm"
                  onClick={handleDownload}
                  disabled={!pdfUrl || isGenerating}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm hover:shadow-md transition-all"
                >
                  {isGenerating ? (
                    <Loader2 className="size-4 animate-spin mr-1.5" />
                  ) : (
                    <Download className="size-4 mr-1.5" />
                  )}
                  Download PDF
                </Button>
              )}
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
