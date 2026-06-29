'use client';

import * as React from 'react';
import { cashAdvanceApi, employeesApi } from '@/services/api';
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
import { Check, ChevronsUpDown, Loader2, ArrowRightLeft } from 'lucide-react';
import type { EmployeeListItem } from '@/types/expense';
import { ConfirmDialog } from '@/components/common/confirm-dialog';

interface TransferFormProps {
  onSuccess: () => void;
}

export function TransferForm({ onSuccess }: TransferFormProps) {
  const [employees, setEmployees] = React.useState<EmployeeListItem[]>([]);
  const [loadingEmployees, setLoadingEmployees] = React.useState(true);
  const [fromEmployeeId, setFromEmployeeId] = React.useState('');
  const [toEmployeeId, setToEmployeeId] = React.useState('');
  const [fromOpen, setFromOpen] = React.useState(false);
  const [toOpen, setToOpen] = React.useState(false);
  const [amount, setAmount] = React.useState('');
  const [note, setNote] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [message, setMessage] = React.useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [sourceBalance, setSourceBalance] = React.useState<number | null>(null);
  const [loadingBalance, setLoadingBalance] = React.useState(false);
  const [showOverdraftConfirm, setShowOverdraftConfirm] = React.useState(false);
  const pendingTransfer = React.useRef<{ fromEmployeeId: string; toEmployeeId: string; amount: number; note: string } | null>(null);

  React.useEffect(() => {
    employeesApi.list()
      .then((res) => { if (res.data) setEmployees(res.data.filter((e) => e.department !== 'LABOR' && e.department !== 'SECURITY')); })
      .catch(() => {})
      .finally(() => setLoadingEmployees(false));
  }, []);

  React.useEffect(() => {
    if (fromEmployeeId) {
      setLoadingBalance(true);
      cashAdvanceApi.getEmployeeWallet(fromEmployeeId)
        .then((res) => {
          if (res.success) setSourceBalance(res.data?.account?.currentBalance ?? null);
        })
        .catch(() => setSourceBalance(null))
        .finally(() => setLoadingBalance(false));
    } else {
      setSourceBalance(null);
    }
  }, [fromEmployeeId]);

  function swapEmployees() {
    const temp = fromEmployeeId;
    setFromEmployeeId(toEmployeeId);
    setToEmployeeId(temp);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fromEmployeeId || !toEmployeeId || !amount) {
      setMessage({ type: 'error', text: 'Both employees and amount are required' });
      return;
    }
    if (fromEmployeeId === toEmployeeId) {
      setMessage({ type: 'error', text: 'Cannot transfer to the same employee' });
      return;
    }
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setMessage({ type: 'error', text: 'Amount must be positive' });
      return;
    }
    if (sourceBalance !== null && parsedAmount > sourceBalance) {
      pendingTransfer.current = { fromEmployeeId, toEmployeeId, amount: parsedAmount, note };
      setShowOverdraftConfirm(true);
      return;
    }

    await submitTransfer(fromEmployeeId, toEmployeeId, parsedAmount, note);
  }

  async function submitTransfer(fromId: string, toId: string, amt: number, noteText: string) {
    try {
      setSubmitting(true);
      setMessage(null);
      const res = await cashAdvanceApi.createTransfer({
        fromEmployeeId: fromId,
        toEmployeeId: toId,
        amount: amt,
        note: noteText || undefined,
      });
      if (res.success) {
        setMessage({ type: 'success', text: 'Transfer completed successfully!' });
        setAmount('');
        setNote('');
        setTimeout(() => onSuccess(), 1500);
      } else {
        setMessage({ type: 'error', text: res.error || 'Failed to transfer' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to transfer' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Transfer Between Wallets</CardTitle>
        <CardDescription>Move cash from one employee wallet to another</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fromEmployee">From (Source Wallet)</Label>
            <Popover open={fromOpen} onOpenChange={setFromOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={fromOpen}
                  className="w-full justify-between"
                  disabled={loadingEmployees}
                >
                  {fromEmployeeId
                    ? employees.find((emp) => emp.id === fromEmployeeId)?.fullName
                    : 'Select source employee...'}
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
                          value={emp.fullName}
                          disabled={emp.id === toEmployeeId}
                          onSelect={() => {
                            setFromEmployeeId(emp.id === fromEmployeeId ? '' : emp.id);
                            setFromOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              'mr-2 h-4 w-4',
                              fromEmployeeId === emp.id ? 'opacity-100' : 'opacity-0'
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
            {sourceBalance !== null && (
              <p className="text-xs text-muted-foreground">
                Balance: <span className="font-mono font-medium">{sourceBalance.toFixed(2)} AFN</span>
                {loadingBalance && <Loader2 className="inline h-3 w-3 ml-1 animate-spin" />}
              </p>
            )}
          </div>

          <div className="flex justify-center">
            <Button type="button" variant="ghost" size="sm" onClick={swapEmployees} className="gap-2">
              <ArrowRightLeft className="h-4 w-4" />
              Swap
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="toEmployee">To (Destination Wallet)</Label>
            <Popover open={toOpen} onOpenChange={setToOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={toOpen}
                  className="w-full justify-between"
                  disabled={loadingEmployees}
                >
                  {toEmployeeId
                    ? employees.find((emp) => emp.id === toEmployeeId)?.fullName
                    : 'Select destination employee...'}
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
                          value={emp.fullName}
                          disabled={emp.id === fromEmployeeId}
                          onSelect={() => {
                            setToEmployeeId(emp.id === toEmployeeId ? '' : emp.id);
                            setToOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              'mr-2 h-4 w-4',
                              toEmployeeId === emp.id ? 'opacity-100' : 'opacity-0'
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
              placeholder="5000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="note">Note (optional)</Label>
            <Textarea
              id="note"
              placeholder="Reason for transfer..."
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
            Transfer
          </Button>
        </form>

        <ConfirmDialog
          open={showOverdraftConfirm}
          onOpenChange={(open) => {
            setShowOverdraftConfirm(open);
            if (!open) pendingTransfer.current = null;
          }}
          title="Insufficient Balance"
          description={`The source wallet only has ${sourceBalance?.toFixed(2)} AFN. Transferring will overdraw it. Do you want to proceed?`}
          confirmText="Proceed"
          cancelText="Cancel"
          onConfirm={() => {
            setShowOverdraftConfirm(false);
            const data = pendingTransfer.current;
            if (data) submitTransfer(data.fromEmployeeId, data.toEmployeeId, data.amount, data.note);
          }}
        />
      </CardContent>
    </Card>
  );
}
