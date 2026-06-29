"use client";

import { useState, useCallback, useEffect, ReactNode } from "react";
import { pdf } from "@react-pdf/renderer";
import { format } from "date-fns";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Expense } from "@/types/expense";
import ExpensePDFDocument, {
  type PdfFilters,
} from "@/components/pdf/expense-pdf-document";
import { settingsApi } from "@/services/settings";

interface PdfDownloadButtonProps {
  expenses: Expense[];
  filters?: {
    categories?: string[];
    dateFrom?: string;
    dateTo?: string;
  };
  selectedOnly?: boolean;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
  children?: ReactNode;
}

export function PdfDownloadButton({
  expenses,
  filters,
  selectedOnly = false,
  variant = "outline",
  size = "default",
  children,
}: PdfDownloadButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [companyName, setCompanyName] = useState("YakhshiLedger");

  useEffect(() => {
    settingsApi.get().then((res) => {
      if (res.data?.companyName) setCompanyName(res.data.companyName);
    }).catch(() => {});
  }, []);

  const handleDownload = useCallback(async () => {
    if (isGenerating || expenses.length === 0) return;

    setIsGenerating(true);
    try {
      const pdfFilters: PdfFilters | undefined = filters
        ? {
            categories: filters.categories,
            dateFrom: filters.dateFrom,
            dateTo: filters.dateTo,
          }
        : undefined;

      const blob = await pdf(
        <ExpensePDFDocument expenses={expenses} filters={pdfFilters} companyName={companyName} />
      ).toBlob();

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `expense-report-${format(new Date(), "yyyy-MM-dd")}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to generate PDF:", error);
    } finally {
      setIsGenerating(false);
    }
  }, [expenses, filters, isGenerating, selectedOnly]);

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleDownload}
      disabled={isGenerating || expenses.length === 0}
    >
      {isGenerating ? (
        <Loader2 className="size-4 animate-spin mr-1.5" />
      ) : children ? null : (
        <Download className="size-4 mr-1.5" />
      )}
      {children || (size !== "icon" && (
        <span>
          {isGenerating
            ? "Generating..."
            : selectedOnly
              ? "Download Selected"
              : "Download PDF"}
        </span>
      ))}
    </Button>
  );
}
