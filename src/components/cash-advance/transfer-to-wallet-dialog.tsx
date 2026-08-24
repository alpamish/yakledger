'use client';

import * as React from 'react';
import { cashAdvanceApi } from '@/services/api';
import { walletApi } from '@/services/wallet-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Loader2, ChevronDown, Check } from 'lucide-react';

interface CompanyWallet {
  id: string;
  name: string;
  balance: number;
  isActive: boolean;
  currency?: string;
}

interface EmployeeOption {
  id: string;
  name: string;
  jobTitle?: string;
  department?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId?: string;
  employeeName?: string;
  walletId?: string;
  walletName?: string;
  onSuccess?: () => void;
}

export function TransferToWalletDialog({
  open,
  onOpenChange,
  employeeId,
  employeeName,
  walletId,
  walletName,
  onSuccess,
}: Props) {
  const [wallets, setWallets] = React.useState<CompanyWallet[]>([]);
  const [employees, setEmployees] = React.useState<EmployeeOption[]>([]);
  const [loadingOptions, setLoadingOptions] = React.useState(false);

  const [selectedWalletId, setSelectedWalletId] = React.useState(walletId ?? '');
  const [selectedEmployeeId, setSelectedEmployeeId] = React.useState(employeeId ?? '');
  const [employeePopoverOpen, setEmployeePopoverOpen] = React.useState(false);
  const [amount, setAmount] = React.useState('');
  const [note, setNote] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [message, setMessage] = React.useState<{ type: 'success' | 'error'; text: string } | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setMessage(null);
    setAmount('');
    setNote('');
    setSelectedWalletId(walletId ?? '');
    setSelectedEmployeeId(employeeId ?? '');

    const load = async () => {
      setLoadingOptions(true);
      try {
        const [walletRes, empRes] = await Promise.all([
          walletId ? Promise.resolve(null) : walletApi.list(),
          employeeId ? Promise.resolve(null) : cashAdvanceApi.getEmployeeWallets(),
        ]);
        if (walletRes?.data) {
          setWallets(walletRes.data.filter((w: CompanyWallet) => w.isActive));
        }
        if (empRes?.data) {
          setEmployees(
            empRes.data
              .map((a: any) => ({
                id: a.employeeId ?? a.id,
                name: a.employee?.fullName ?? 'Unknown',
                jobTitle: a.employee?.jobTitle,
                department: a.employee?.department,
              }))
              .filter((e: EmployeeOption) => e.id && e.name !== 'Unknown')
          );
        }
      } finally {
        setLoadingOptions(false);
      }
    };
    load();
  }, [open, walletId, employeeId]);

  const walletListReady = Boolean(walletId) || wallets.length > 0;
  const employeeListReady = Boolean(employeeId) || employees.length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const finalWalletId = walletId ?? selectedWalletId;
    const finalEmployeeId = employeeId ?? selectedEmployeeId;
    const parsedAmount = parseFloat(amount);

    if (!finalWalletId || !finalEmployeeId) {
      setMessage({ type: 'error', text: 'Employee and wallet are required' });
      return;
    }
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setMessage({ type: 'error', text: 'Amount must be positive' });
      return;
    }

    try {
      setSubmitting(true);
      setMessage(null);
      const res = await cashAdvanceApi.transferToWallet({
        employeeId: finalEmployeeId,
        walletId: finalWalletId,
        amount: parsedAmount,
        note: note || undefined,
      });
      if (res.success) {
        setMessage({ type: 'success', text: 'Cash transferred to wallet successfully!' });
        setAmount('');
        setNote('');
        setTimeout(() => {
          onOpenChange(false);
          onSuccess?.();
        }, 1200);
      } else {
        setMessage({ type: 'error', text: res.error || 'Failed to transfer cash to wallet' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to transfer cash to wallet' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Transfer Cash to Wallet</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {!employeeId && (
            <div className="space-y-2">
              <Label>Employee</Label>
              <Popover open={employeePopoverOpen} onOpenChange={setEmployeePopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    disabled={loadingOptions}
                    className="w-full justify-between font-normal"
                  >
                    {selectedEmployeeId
                      ? employees.find((e) => e.id === selectedEmployeeId)?.name ?? 'Select employee...'
                      : 'Search employee...'}
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search employee by name..." />
                    <CommandList>
                      <CommandEmpty>No employee found.</CommandEmpty>
                      {loadingOptions ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="h-4 w-4 animate-spin" />
                        </div>
                      ) : employees.length === 0 ? (
                        <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                          No employees with a cash account
                        </div>
                      ) : (
                        employees.map((emp) => (
                          <CommandItem
                            key={emp.id}
                            value={emp.id}
                            keywords={[emp.name, emp.jobTitle, emp.department].filter(
                              (k): k is string => Boolean(k)
                            )}
                            onSelect={() => {
                              setSelectedEmployeeId(emp.id);
                              setEmployeePopoverOpen(false);
                            }}
                          >
                            <Check
                              className="mr-2 h-4 w-4"
                              style={{ opacity: selectedEmployeeId === emp.id ? 1 : 0 }}
                            />
                            {emp.name}
                            {emp.jobTitle ? ` — ${emp.jobTitle}` : ''}
                          </CommandItem>
                        ))
                      )}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          )}
          {employeeId && (
            <div className="space-y-1">
              <Label>Employee</Label>
              <p className="text-sm font-medium">{employeeName ?? 'Selected employee'}</p>
            </div>
          )}

          {!walletId && (
            <div className="space-y-2">
              <Label htmlFor="wallet">Company Wallet</Label>
              <Select
                value={selectedWalletId || undefined}
                onValueChange={setSelectedWalletId}
                disabled={loadingOptions}
              >
                <SelectTrigger id="wallet" className="w-full">
                  <SelectValue placeholder="Select wallet..." />
                </SelectTrigger>
                <SelectContent>
                  {wallets.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {walletId && (
            <div className="space-y-1">
              <Label>Company Wallet</Label>
              <p className="text-sm font-medium">{walletName ?? 'Selected wallet'}</p>
            </div>
          )}

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

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !walletListReady || !employeeListReady} variant="secondary">
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Transfer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
