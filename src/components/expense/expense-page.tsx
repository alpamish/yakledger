'use client';

import { useCallback, useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useExpenseStore } from '@/hooks/use-expense-store';
import { ExpenseTable } from '@/components/expense/expense-table';
import { ExpenseForm } from '@/components/expense/expense-form';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import PdfPreviewModal from '@/components/pdf/pdf-preview-modal';
import ExpenseDetailModal from '@/components/expense/expense-detail-modal';
import type { Expense } from '@/types/expense';
import { Plus, Receipt } from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';

export function ExpensePage() {
  const { canCreate, canEdit, canDelete } = usePermissions();
  const openForm = useExpenseStore((s) => s.openForm);
  const deleteExpense = useExpenseStore((s) => s.deleteExpense);
  const bulkDeleteExpenses = useExpenseStore((s) => s.bulkDeleteExpenses);
  const selectedExpenseIds = useExpenseStore((s) => s.selectedExpenseIds);
  const expenses = useExpenseStore((s) => s.expenses);

  // Delete confirmation state
  const [deleteConfirm, setDeleteConfirm] = useState<{
    open: boolean;
    expense: Expense | null;
  }>({ open: false, expense: null });

  // Bulk delete confirmation state
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);

  // PDF preview state
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);

  // Detail modal state
  const [detailExpense, setDetailExpense] = useState<Expense | null>(null);

  // Keyboard shortcut: Alt+N to open Add Expense form
  useEffect(() => {
    if (!canCreate('expenses')) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key === 'n') {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
        e.preventDefault();
        openForm();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [openForm, canCreate]);

  // Get selected expenses for PDF
  const selectedExpenses = useMemo(() => {
    if (selectedExpenseIds.size === 0) return expenses;
    return expenses.filter((e) => selectedExpenseIds.has(e.id));
  }, [expenses, selectedExpenseIds]);

  const handleEdit = useCallback(
    (expense: Expense) => {
      if (!canEdit('expenses')) return;
      openForm(expense);
    },
    [openForm, canEdit]
  );

  const handleDelete = useCallback((expense: Expense) => {
    if (!canDelete('expenses')) return;
    setDeleteConfirm({ open: true, expense });
  }, [canDelete]);

  const handleDeleteConfirm = useCallback(async () => {
    if (deleteConfirm.expense) {
      await deleteExpense(deleteConfirm.expense.id);
    }
    setDeleteConfirm({ open: false, expense: null });
  }, [deleteConfirm.expense, deleteExpense]);

  const handleBulkDelete = useCallback(() => {
    setBulkDeleteConfirm(true);
  }, []);

  const handleBulkDeleteConfirm = useCallback(async () => {
    await bulkDeleteExpenses();
    setBulkDeleteConfirm(false);
  }, [bulkDeleteExpenses]);

  const handleExportPdf = useCallback(() => {
    setPdfPreviewOpen(true);
  }, []);

  const handleViewDetail = useCallback((expense: Expense) => {
    setDetailExpense(expense);
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Receipt className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            Expenses
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage and track all your expenses
          </p>
        </div>
        {canCreate('expenses') && (
          <Button
            onClick={() => openForm()}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Expense
          </Button>
        )}
      </div>

      {/* Table Card */}
      <Card>
        <CardContent className="p-4 sm:p-6">
          <ExpenseTable
            onEdit={handleEdit}
            onDelete={handleDelete}
            onBulkDelete={handleBulkDelete}
            onExportPdf={handleExportPdf}
            onViewDetail={handleViewDetail}
          />
        </CardContent>
      </Card>

      {/* Expense Form Dialog */}
      <ExpenseForm />

      {/* Single Delete Confirmation */}
      <ConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={(open) =>
          setDeleteConfirm({ open, expense: open ? deleteConfirm.expense : null })
        }
        title="Delete Expense"
        description={
          deleteConfirm.expense
            ? `Are you sure you want to delete "${deleteConfirm.expense.title}"? This action cannot be undone.`
            : 'Are you sure you want to delete this expense?'
        }
        onConfirm={handleDeleteConfirm}
        confirmText="Delete"
        variant="destructive"
      />

      {/* Bulk Delete Confirmation */}
      <ConfirmDialog
        open={bulkDeleteConfirm}
        onOpenChange={setBulkDeleteConfirm}
        title="Delete Selected Expenses"
        description={`Are you sure you want to delete ${selectedExpenseIds.size} selected expense${selectedExpenseIds.size > 1 ? 's' : ''}? This action cannot be undone.`}
        onConfirm={handleBulkDeleteConfirm}
        confirmText="Delete All"
        variant="destructive"
      />

      {/* PDF Preview Modal */}
      <PdfPreviewModal
        open={pdfPreviewOpen}
        onOpenChange={setPdfPreviewOpen}
        expenses={selectedExpenses}
      />

      {/* Expense Detail Modal */}
      <ExpenseDetailModal
        open={!!detailExpense}
        onOpenChange={(open) => {
          if (!open) setDetailExpense(null);
        }}
        expense={detailExpense}
        onEdit={(expense) => {
          setDetailExpense(null);
          openForm(expense);
        }}
        onDelete={(expense) => {
          setDetailExpense(null);
          handleDelete(expense);
        }}
      />
    </div>
  );
}
