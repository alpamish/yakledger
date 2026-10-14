'use client';

// Generic PDF preview modal for the Phase 6 contractor finance reports: takes
// an already-built @react-pdf document element, renders it into an iframe
// blob, and offers print + permission-gated download. Mirrors the generate /
// revoke / download behaviour of pdf-preview-modal.tsx without being tied to
// one report's data shape.
import { useState, useEffect, useCallback, useRef } from 'react';
import { format } from 'date-fns';
import { Download, Loader2, FileText, Printer, X } from 'lucide-react';
import type { DocumentProps } from '@react-pdf/renderer';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/hooks/use-permissions';

interface ContractorFinancePdfPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The PDF document element (props already applied) or null when no data. */
  document: React.ReactElement | null;
  /** Download filename, e.g. `payable-aging-2026-10-14.pdf`. */
  filename: string;
}

export function ContractorFinancePdfPreviewModal({
  open,
  onOpenChange,
  document: docElement,
  filename,
}: ContractorFinancePdfPreviewModalProps) {
  const { hasPermission } = usePermissions();
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
    if (!docElement) return;

    let cancelled = false;

    async function generatePdf() {
      setIsGenerating(true);
      setError(null);
      try {
        const { pdf } = await import('@react-pdf/renderer');
        // React 19 types widen every JSX element to `ReactElement<unknown>`;
        // the caller only ever passes <Document> elements, so narrow here.
        const blob = await pdf(docElement as React.ReactElement<DocumentProps>).toBlob();
        if (cancelled) return;
        if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current);
        const url = URL.createObjectURL(blob);
        prevUrlRef.current = url;
        setPdfUrl(url);
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to generate PDF preview:', err);
        const message = err instanceof Error ? err.message : 'Please try again.';
        setError(`Failed to generate PDF: ${message}`);
      } finally {
        if (!cancelled) setIsGenerating(false);
      }
    }

    generatePdf();
    return () => {
      cancelled = true;
    };
    // Only regenerate when the modal is (re)opened — `docElement` is a new
    // element identity on every parent render, and re-running on it would
    // regenerate the blob on unrelated parent state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleDownload = useCallback(() => {
    if (!pdfUrl) return;
    const link = document.createElement('a');
    link.href = pdfUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [pdfUrl, filename]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="size-5 text-emerald-600" />
            PDF Preview
          </DialogTitle>
          <DialogDescription>Preview the report before downloading.</DialogDescription>
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

          {!isGenerating && !error && !docElement && (
            <div className="flex flex-col items-center justify-center h-80 gap-3">
              <FileText className="size-12 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Run the report first to preview it.</p>
            </div>
          )}

          {!isGenerating && !error && pdfUrl && (
            <iframe src={pdfUrl} className="w-full h-[70vh] border-0" title="PDF Preview" />
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
                  <Download className="size-4 mr-1.5" />
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
