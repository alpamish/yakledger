'use client';

import { useMemo, useState, useCallback, useEffect } from 'react';
import { pdf } from '@react-pdf/renderer';
import { format } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { X, Pencil, Trash2, Receipt, TableIcon, Download, Loader2 } from 'lucide-react';
import type { Expense, ExpenseItem } from '@/types/expense';
import {
  CATEGORY_LABELS,
  CATEGORY_COLORS,
  PAYMENT_METHOD_LABELS,
} from '@/types/expense';
import ExpenseDetailPDFDocument from '@/components/pdf/expense-detail-pdf-document';
import { settingsApi } from '@/services/settings';

interface ExpenseDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense: Expense | null;
  onEdit: (expense: Expense) => void;
  onDelete: (expense: Expense) => void;
}

function formatDate(dateStr: string) {
  try {
    return format(new Date(dateStr), 'MMM dd, yyyy');
  } catch {
    return dateStr;
  }
}

function formatCurrency(amount: number) {
  return `Afs ${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function ExpenseDetailModal({
  open,
  onOpenChange,
  expense,
  onEdit,
  onDelete,
}: ExpenseDetailModalProps) {
  // Parse description: try JSON array (expense items), fall back to plain text
  const { items, plainText } = useMemo<{
    items: ExpenseItem[];
    plainText: string | null;
  }>(() => {
    if (!expense?.description) return { items: [], plainText: null };
    try {
      const parsed = JSON.parse(expense.description);
      if (Array.isArray(parsed)) return { items: parsed, plainText: null };
    } catch {}
    return { items: [], plainText: expense.description };
  }, [expense]);

  const grandTotal = useMemo(
    () => items.reduce((s, i) => s + i.total, 0),
    [items]
  );

  const [isGenerating, setIsGenerating] = useState(false);
  const [companyName, setCompanyName] = useState('YakhshiLedger');

  useEffect(() => {
    settingsApi.get().then((res) => {
      if (res.data?.companyName) setCompanyName(res.data.companyName);
    }).catch(() => {});
  }, []);

  const handleDownloadPdf = useCallback(async () => {
    if (isGenerating || !expense) return;
    setIsGenerating(true);
    try {
      const blob = await pdf(
        <ExpenseDetailPDFDocument expense={expense} companyName={companyName} />
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const fileName = `expense-${expense.title.replace(/\s+/g, '-').toLowerCase()}-${format(new Date(), 'yyyy-MM-dd')}.pdf`;
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to generate PDF:', err);
    } finally {
      setIsGenerating(false);
    }
  }, [isGenerating, expense, companyName]);

  if (!expense) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <DialogTitle className="flex items-center gap-2 text-xl">
                <Receipt className="size-5 text-emerald-600 shrink-0" />
                {expense.title}
              </DialogTitle>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Badge
                  className="text-white border-0 text-xs"
                  style={{ backgroundColor: CATEGORY_COLORS[expense.category] }}
                >
                  {CATEGORY_LABELS[expense.category]}
                </Badge>
                <span className="text-muted-foreground">·</span>
                <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(expense.amount)}
                </span>
              </div>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0 overflow-scroll">
          <div className="space-y-6 pr-4">
            {/* Info Grid */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div className="space-y-1">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Date
                </span>
                <p className="font-medium">{formatDate(expense.expenseDate)}</p>
              </div>
              <div className="space-y-1">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Payment Method
                </span>
                <p className="font-medium">
                  {PAYMENT_METHOD_LABELS[expense.paymentMethod] ?? expense.paymentMethod}
                </p>
              </div>
              <div className="space-y-1">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Paid To
                </span>
                <p className="font-medium">{expense.paidTo}</p>
              </div>
              <div className="space-y-1">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Paid By
                </span>
                <p className="font-medium">{expense.paidBy}</p>
              </div>
            </div>

            {/* Tags */}
            {expense.tags && (
              <div className="space-y-1.5">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Tags
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {expense.tags.split(',').map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs font-normal">
                      {tag.trim()}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Expense Items Table */}
            {items.length > 0 && (
              <div className="space-y-2">
                <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  <TableIcon className="size-3.5" />
                  Expense Items
                </span>
                <div className="rounded-md border overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="w-8 text-xs">#</TableHead>
                        <TableHead className="text-xs">Item</TableHead>
                        <TableHead className="text-xs text-right">Qty</TableHead>
                        <TableHead className="text-xs">Unit</TableHead>
                        <TableHead className="text-xs text-right">Unit Price</TableHead>
                        <TableHead className="text-xs text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody> 
                      {items.map((item, i) => (
                        <TableRow key={item.id}>
                          <TableCell className="text-xs text-muted-foreground tabular-nums">
                            {i + 1}
                          </TableCell>
                          <TableCell className="font-medium">{item.itemName}</TableCell>
                          <TableCell className="text-right tabular-nums">{item.quantity}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{item.unit}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatCurrency(item.unitPrice)}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums font-medium">
                            {formatCurrency(item.total)}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/30 font-medium">
                        <TableCell colSpan={5} className="text-right text-sm">
                          Grand Total
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-sm text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(grandTotal)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {/* Plain Text Description */}
            {plainText && (
              <div className="space-y-1.5">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Description
                </span>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {plainText}
                </p>
              </div>
            )}

            {/* Notes */}
            {expense.notes && (
              <div className="space-y-1.5">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Notes
                </span>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {expense.notes}
                </p>
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2 sm:gap-0 border-t pt-4">
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
                onClick={handleDownloadPdf}
                disabled={isGenerating}
              >
                {isGenerating ? (
                  <Loader2 className="size-4 animate-spin mr-1.5" />
                ) : (
                  <Download className="size-4 mr-1.5" />
                )}
                {isGenerating ? 'Generating...' : 'Download PDF'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onOpenChange(false);
                  onEdit(expense);
                }}
              >
                <Pencil className="size-4 mr-1.5" />
                Edit
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  onOpenChange(false);
                  onDelete(expense);
                }}
              >
                <Trash2 className="size-4 mr-1.5" />
                Delete
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
