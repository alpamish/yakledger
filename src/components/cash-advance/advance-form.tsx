'use client';

import * as React from 'react';
import { cashAdvanceApi, employeesApi } from '@/services/api';
import { walletApi } from '@/services/wallet-api';
import {
  PAYROLL_PAYMENT_METHODS,
  PAYROLL_PAYMENT_METHOD_LABELS,
} from '@/lib/payroll-status';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react';
import type { EmployeeListItem } from '@/types/expense';

interface AdvanceFormProps {
  onSuccess: () => void;
}

export function AdvanceForm({ onSuccess }: AdvanceFormProps) {
  const [employees, setEmployees] = React.useState<EmployeeListItem[]>([]);
  const [loadingEmployees, setLoadingEmployees] = React.useState(true);
  const [employeeId, setEmployeeId] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const [amount, setAmount] = React.useState('');
  const [note, setNote] = React.useState('');
  const [dueDate, setDueDate] = React.useState('');
  const [paymentMethod, setPaymentMethod] = React.useState('CASH');
  const [walletId, setWalletId] = React.useState('');
  const [wallets, setWallets] = React.useState<{ id: string; name: string }[]>([]);
  const [submitting, setSubmitting] = React.useState(false);
  const [message, setMessage] = React.useState<{ type: 'success' | 'error'; text: string } | null>(null);

  React.useEffect(() => {
    employeesApi.list()
      .then((res) => { if (res.data) setEmployees(res.data.filter((e) => e.department !== 'LABOR' && e.department !== 'SECURITY')); })
      .catch(() => {})
      .finally(() => setLoadingEmployees(false));
    walletApi
      .list()
      .then((res) => {
        if (res.data) setWallets(res.data.filter((w) => w.isActive !== false));
      })
      .catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!employeeId || !amount) {
      setMessage({ type: 'error', text: 'Employee and amount are required' });
      return;
    }
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setMessage({ type: 'error', text: 'Amount must be positive' });
      return;
    }
    if (paymentMethod === 'COMPANY_WALLET' && !walletId) {
      setMessage({ type: 'error', text: 'Select the company wallet to pay from' });
      return;
    }

    try {
      setSubmitting(true);
      setMessage(null);
      const res = await cashAdvanceApi.createTransaction({
        employeeId,
        type: 'ADVANCE',
        amount: parsedAmount,
        note: note || undefined,
        dueDate: dueDate || undefined,
        paymentMethod,
        walletId: paymentMethod === 'COMPANY_WALLET' ? walletId : undefined,
      });
      if (res.success) {
        setMessage({ type: 'success', text: 'Cash advance issued successfully!' });
        setAmount('');
        setNote('');
        setDueDate('');
        setPaymentMethod('CASH');
        setWalletId('');
        setTimeout(() => onSuccess(), 1500);
      } else {
        setMessage({ type: 'error', text: res.error || 'Failed to issue advance' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to issue advance' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Issue Cash Advance</CardTitle>
        <CardDescription>Give cash to an employee for business expenses</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="employee">Employee</Label>
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={open}
                  className="w-full justify-between"
                  disabled={loadingEmployees}
                >
                  {employeeId
                    ? employees.find((emp) => emp.id === employeeId)?.fullName
                    : 'Select employee...'}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                <Command>
                  <CommandInput placeholder="Search employee..." />
                  <CommandList>
                    <CommandEmpty>No employee found.</CommandEmpty>
                    <CommandGroup>
                      {employees.map((emp) => (
                        <CommandItem
                          key={emp.id}
                          value={emp.id}
                          onSelect={(currentValue) => {
                            setEmployeeId(currentValue === employeeId ? '' : currentValue);
                            setOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              'mr-2 h-4 w-4',
                              employeeId === emp.id ? 'opacity-100' : 'opacity-0'
                            )}
                          />
                          {emp.fullName}
                          <span className="ml-auto text-xs text-muted-foreground">{emp.jobTitle}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount">Amount (AFN)</Label>
            <Input
              id="amount"
              type="number"
              min="0"
              step="0.01"
              placeholder="10000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="paymentMethod">Payment method</Label>
            <select
              id="paymentMethod"
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

          {paymentMethod === 'COMPANY_WALLET' && (
            <div className="space-y-2">
              <Label htmlFor="wallet">Company wallet</Label>
              <select
                id="wallet"
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
            <Label htmlFor="dueDate">Due date (optional)</Label>
            <Input
              id="dueDate"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Overdue advances are only flagged as warnings — nothing is deducted automatically.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="note">Note (optional)</Label>
            <Textarea
              id="note"
              placeholder="Reason for advance..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {message && (
            <div className={`p-3 rounded-md text-sm ${
              message.type === 'success' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-600'
            }`}>
              {message.text}
            </div>
          )}

          <Button type="submit" disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Issue Advance
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
