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
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react';
import type { EmployeeListItem } from '@/types/expense';

interface ReturnFormProps {
  onSuccess: () => void;
}

export function ReturnForm({ onSuccess }: ReturnFormProps) {
  const [employees, setEmployees] = React.useState<EmployeeListItem[]>([]);
  const [loadingEmployees, setLoadingEmployees] = React.useState(true);
  const [employeeId, setEmployeeId] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const [amount, setAmount] = React.useState('');
  const [note, setNote] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [message, setMessage] = React.useState<{ type: 'success' | 'error'; text: string } | null>(null);

  React.useEffect(() => {
    employeesApi.list()
      .then((res) => { if (res.data) setEmployees(res.data.filter((e) => e.department !== 'LABOR' && e.department !== 'SECURITY')); })
      .catch(() => {})
      .finally(() => setLoadingEmployees(false));
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

    try {
      setSubmitting(true);
      setMessage(null);
      const res = await cashAdvanceApi.createTransaction({
        employeeId,
        type: 'RETURN',
        amount: parsedAmount,
        note: note || undefined,
      });
      if (res.success) {
        setMessage({ type: 'success', text: 'Cash return recorded successfully!' });
        setAmount('');
        setNote('');
        setTimeout(() => onSuccess(), 1500);
      } else {
        setMessage({ type: 'error', text: res.error || 'Failed to record return' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to record return' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Record Cash Return</CardTitle>
        <CardDescription>Record cash returned by an employee</CardDescription>
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
              placeholder="5000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="note">Note (optional)</Label>
            <Textarea
              id="note"
              placeholder="Reason for return..."
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

          <Button type="submit" disabled={submitting} variant="secondary">
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Record Return
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
