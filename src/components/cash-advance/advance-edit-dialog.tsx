'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { cashAdvanceApi } from '@/services/api';
import { walletApi } from '@/services/wallet-api';
import {
  PAYROLL_PAYMENT_METHODS,
  PAYROLL_PAYMENT_METHOD_LABELS,
} from '@/lib/payroll-status';
import type { ApiResponse, CashTransaction } from '@/types/expense';

export interface AdvanceEditResult {
  recalculated: string[];
  adjustments: string[];
}

interface AdvanceEditDialogProps {
  advance: CashTransaction | null;
  onClose: () => void;
  onSaved: (result: AdvanceEditResult) => void;
}

/**
 * Edit a cash advance. Paid advances stay editable for authorized users
 * (Plan-payroll.pdf §2 action 3); an amount change recalculates affected
 * unpaid payrolls and posts an adjustment for paid ones (action 4).
 */
export function AdvanceEditDialog({ advance, onClose, onSaved }: AdvanceEditDialogProps) {
  const [amount, setAmount] = React.useState('');
  const [dueDate, setDueDate] = React.useState('');
  const [note, setNote] = React.useState('');
  const [referenceNumber, setReferenceNumber] = React.useState('');
  const [paymentMethod, setPaymentMethod] = React.useState('CASH');
  const [walletId, setWalletId] = React.useState('');
  const [wallets, setWallets] = React.useState<{ id: string; name: string; balance?: number }[]>([]);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!advance) return;
    setAmount(String(advance.amount ?? ''));
    setDueDate(advance.dueDate ? advance.dueDate.slice(0, 10) : '');
    setNote(advance.note ?? '');
    setReferenceNumber(advance.referenceNumber ?? '');
    setPaymentMethod(
      (advance.paymentMethod as string | null | undefined) ?? 'CASH'
    );
    setWalletId((advance as { walletId?: string | null }).walletId ?? '');
    setError(null);
  }, [advance]);

  React.useEffect(() => {
    if (!advance) return;
    walletApi
      .list()
      .then((res) => {
        if (res.data) setWallets(res.data.filter((w) => w.isActive !== false));
      })
      .catch(() => {});
  }, [advance]);

  const isPaid = Boolean(advance?.paidAt);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!advance) return;
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Amount must be positive');
      return;
    }
    if (paymentMethod === 'COMPANY_WALLET' && !walletId) {
      setError('Select the company wallet to pay from');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      const res = (await cashAdvanceApi.updateTransaction(advance.id, {
        amount: parsedAmount,
        note: note || null,
        referenceNumber: referenceNumber || null,
        dueDate: dueDate || null,
        ...(isPaid ? {} : { paymentMethod, walletId: walletId || null }),
      })) as ApiResponse<CashTransaction> & { payroll?: AdvanceEditResult };

      if (!res.success) {
        setError(res.error || 'Failed to update advance');
        return;
      }
      onSaved(res.payroll ?? { recalculated: [], adjustments: [] });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update advance');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={!!advance} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Cash Advance</DialogTitle>
          <DialogDescription>
            {advance?.employee?.fullName ?? 'Employee'}
            {isPaid
              ? ' — this advance is already paid; changes are audited and affect payroll.'
              : ''}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-amount">Amount (AFN)</Label>
            <Input
              id="edit-amount"
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-dueDate">Due date</Label>
            <Input
              id="edit-dueDate"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>

          {!isPaid && (
            <div className="space-y-2">
              <Label htmlFor="edit-paymentMethod">Payment method</Label>
              <select
                id="edit-paymentMethod"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              >
                {PAYROLL_PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {PAYROLL_PAYMENT_METHOD_LABELS[m]}
                  </option>
                ))}
              </select>
            </div>
          )}

          {(!isPaid && paymentMethod === 'COMPANY_WALLET') && (
            <div className="space-y-2">
              <Label htmlFor="edit-wallet">Company wallet</Label>
              <select
                id="edit-wallet"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                value={walletId}
                onChange={(e) => setWalletId(e.target.value)}
              >
                <option value="">Select wallet...</option>
                {wallets.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="edit-reference">Reference number</Label>
            <Input
              id="edit-reference"
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-note">Note</Label>
            <Textarea
              id="edit-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {error && (
            <div className="rounded-md bg-red-500/10 p-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
