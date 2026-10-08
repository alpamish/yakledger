'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { walletApi } from '@/services/wallet-api';
import { reimbursementApi } from '@/services/reimbursement-api';
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS, type Expense } from '@/types/expense';
import { formatMinor } from '@/lib/money';

const REIMBURSABLE_METHODS = PAYMENT_METHODS.filter((m) =>
  ['CASH', 'BANK_TRANSFER', 'COMPANY_WALLET'].includes(m)
);

/**
 * Pay an approved employee-paid expense back to the employee.
 * Reimbursement is always separate from salary (Plan-payroll.pdf §2 action 7).
 */
export function ReimburseDialog({
  open,
  onOpenChange,
  expense,
  onReimbursed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense: Expense | null;
  onReimbursed?: () => void;
}) {
  const [paymentMethod, setPaymentMethod] = useState<string>('CASH');
  const [walletId, setWalletId] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [wallets, setWallets] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPaymentMethod('CASH');
    setWalletId('');
    setNote('');
    walletApi
      .list()
      .then((res) => setWallets(res.data ?? []))
      .catch(() => setWallets([]));
  }, [open]);

  if (!expense || !expense.paidById) return null;

  const amountMinor = Math.round(expense.amount * 100);

  async function submit() {
    if (!expense?.paidById) return;
    if (paymentMethod === 'COMPANY_WALLET' && !walletId) {
      toast.error('Select a wallet to pay from');
      return;
    }
    setSaving(true);
    try {
      const res = await reimbursementApi.pay(expense.paidById!, {
        expenseIds: [expense.id],
        paymentMethod: paymentMethod as 'CASH' | 'BANK_TRANSFER' | 'COMPANY_WALLET',
        ...(walletId ? { walletId } : {}),
        ...(note ? { note } : {}),
      });
      if (!res.success) throw new Error('Reimbursement failed');
      toast.success(
        `Reimbursed ${formatMinor(amountMinor, expense.currency ?? 'AFN')}`
      );
      onOpenChange(false);
      onReimbursed?.();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to record reimbursement');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record reimbursement</DialogTitle>
          <DialogDescription>
            Pay back an approved employee-paid expense. This is separate from
            salary payroll.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-md border p-3 text-sm">
            <p className="font-medium">{expense.title}</p>
            <p className="text-muted-foreground text-xs mt-1">
              {expense.category} · {expense.paidTo}
            </p>
            <p className="font-mono mt-2">
              {formatMinor(amountMinor, expense.currency ?? 'AFN')}
            </p>
          </div>

          <div className="space-y-2">
            <Label>Payment method</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger>
                <SelectValue placeholder="Select method" />
              </SelectTrigger>
              <SelectContent>
                {REIMBURSABLE_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {PAYMENT_METHOD_LABELS[m] ?? m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {paymentMethod === 'COMPANY_WALLET' && (
            <div className="space-y-2">
              <Label>Wallet</Label>
              <Select value={walletId} onValueChange={setWalletId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select wallet" />
                </SelectTrigger>
                <SelectContent>
                  {wallets.length === 0 ? (
                    <SelectItem value="__none" disabled>
                      No wallets configured
                    </SelectItem>
                  ) : (
                    wallets.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name} — {formatMinor(w.balance, w.currency)}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="reimb-note">Note (optional)</Label>
            <Input
              id="reimb-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Reimbursed in cash"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={saving}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Record payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
