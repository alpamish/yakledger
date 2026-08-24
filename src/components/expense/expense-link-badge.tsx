'use client';

import { useCallback, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import ExpenseDetailModal from '@/components/expense/expense-detail-modal';
import { expensesApi } from '@/services/api';
import { usePermissions } from '@/hooks/use-permissions';
import type { Expense } from '@/types/expense';

interface ExpenseLinkBadgeProps {
  expense: {
    id: string;
    amount: number;
    approvalStatus: string;
    walletId?: string | null;
  };
}

export function ExpenseLinkBadge({ expense }: ExpenseLinkBadgeProps) {
  const { canView } = usePermissions();
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<Expense | null>(null);
  const [loading, setLoading] = useState(false);

  if (!canView('expenses')) return null;

  const paid = !!expense.walletId;

  const handleClick = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setOpen(true);
    try {
      const res = await expensesApi.getById(expense.id);
      if (res.data) setDetail(res.data);
    } catch {
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [expense.id, loading]);

  return (
    <>
      <Badge
        variant="outline"
        className="cursor-pointer border-0 text-[10px] px-1.5 py-0"
        style={
          paid
            ? { backgroundColor: '#10b98120', color: '#10b981' }
            : { backgroundColor: '#f59e0b20', color: '#f59e0b' }
        }
        onClick={handleClick}
        title="View linked expense"
      >
        {paid ? 'Paid' : 'Unpaid'}
      </Badge>
      <ExpenseDetailModal
        open={open && !!detail}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setDetail(null);
        }}
        expense={detail}
        onEdit={() => {
          setOpen(false);
          setDetail(null);
        }}
        onDelete={() => {
          setOpen(false);
          setDetail(null);
        }}
      />
    </>
  );
}
