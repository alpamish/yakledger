'use client';

import * as React from 'react';
import { employeesApi } from '@/services/api';
import { loansApi, type Loan } from '@/services/loans-api';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { fromMinor, toMinor } from '@/lib/money';
import { usePermissions } from '@/hooks/use-permissions';
import { Check, ChevronsUpDown, Loader2, Plus } from 'lucide-react';
import type { EmployeeListItem } from '@/types/expense';

type Message = { type: 'success' | 'error'; text: string } | null;

function statusBadge(loan: Loan) {
  if (loan.approvalStatus === 'PENDING')
    return <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30">Pending approval</Badge>;
  if (loan.approvalStatus === 'REJECTED')
    return <Badge variant="destructive">Rejected</Badge>;
  switch (loan.status) {
    case 'PAID':
      return <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30">Paid</Badge>;
    case 'CANCELLED':
      return <Badge variant="secondary">Cancelled</Badge>;
    default:
      return <Badge className="bg-blue-500/15 text-blue-600 border-blue-500/30">Active</Badge>;
  }
}

export function LoansTab() {
  const { canCreate } = usePermissions();
  const [loans, setLoans] = React.useState<Loan[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [employees, setEmployees] = React.useState<EmployeeListItem[]>([]);
  const [open, setOpen] = React.useState(false);
  const [message, setMessage] = React.useState<Message>(null);
  const [submitting, setSubmitting] = React.useState(false);

  // Issue-loan form
  const [employeeId, setEmployeeId] = React.useState('');
  const [amount, setAmount] = React.useState('');
  const [issueDate, setIssueDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = React.useState('');
  const [installment, setInstallment] = React.useState('');
  const [autoDeduct, setAutoDeduct] = React.useState(true);
  const [note, setNote] = React.useState('');

  // Repayment dialog
  const [repayLoan, setRepayLoan] = React.useState<Loan | null>(null);
  const [repayAmount, setRepayAmount] = React.useState('');
  const [repayNote, setRepayNote] = React.useState('');
  const [repaying, setRepaying] = React.useState(false);

  const load = React.useCallback(() => {
    loansApi
      .list()
      .then((res) => setLoans(res.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    load();
    employeesApi
      .list()
      .then((res) => {
        if (res.data)
          setEmployees(res.data.filter((e) => e.department !== 'LABOR' && e.department !== 'SECURITY'));
      })
      .catch(() => {});
  }, [load]);

  async function handleIssue(e: React.FormEvent) {
    e.preventDefault();
    const principalMinor = Math.round((parseFloat(amount) || 0) * 100);
    if (!employeeId || principalMinor <= 0) {
      setMessage({ type: 'error', text: 'Employee and a positive amount are required' });
      return;
    }
    try {
      setSubmitting(true);
      setMessage(null);
      const res = await loansApi.create({
        employeeId,
        principalMinor,
        issueDate,
        dueDate: dueDate || null,
        monthlyInstallmentMinor: installment
          ? Math.round((parseFloat(installment) || 0) * 100)
          : null,
        autoDeduct,
        note: note || null,
      });
      if (res.success) {
        setMessage({
          type: 'success',
          text:
            res.data?.approvalStatus === 'APPROVED'
              ? 'Loan issued and disbursed.'
              : 'Loan created — awaiting approval.',
        });
        setAmount('');
        setInstallment('');
        setDueDate('');
        setNote('');
        load();
      } else {
        setMessage({ type: 'error', text: res.error || 'Failed to create loan' });
      }
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to create loan',
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRepay(e: React.FormEvent) {
    e.preventDefault();
    if (!repayLoan) return;
    const amountMinor = Math.round((parseFloat(repayAmount) || 0) * 100);
    if (amountMinor <= 0) {
      setMessage({ type: 'error', text: 'Repayment amount must be positive' });
      return;
    }
    try {
      setRepaying(true);
      setMessage(null);
      const res = await loansApi.recordRepayment(repayLoan.id, {
        amountMinor,
        note: repayNote || null,
      });
      if (res.success) {
        setMessage({ type: 'success', text: 'Repayment recorded.' });
        setRepayLoan(null);
        setRepayAmount('');
        setRepayNote('');
        load();
      } else {
        setMessage({ type: 'error', text: res.error || 'Failed to record repayment' });
      }
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to record repayment',
      });
    } finally {
      setRepaying(false);
    }
  }

  async function toggleAutoDeduct(loan: Loan) {
    try {
      const res = await loansApi.update(loan.id, { autoDeduct: !loan.autoDeduct });
      if (res.success) load();
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to update loan',
      });
    }
  }

  return (
    <div className="space-y-6">
      {message && (
        <div
          className={`p-3 rounded-md text-sm ${
            message.type === 'success'
              ? 'bg-emerald-500/10 text-emerald-600'
              : 'bg-red-500/10 text-red-600'
          }`}
        >
          {message.text}
        </div>
      )}

      {canCreate('cashAdvance') && (
        <Card>
          <CardHeader>
            <CardTitle>Issue Loan</CardTitle>
            <CardDescription>
              Formal loan with an optional repayment schedule. Repayments are deducted
              automatically from salary unless auto-deduct is switched off.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleIssue} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Employee</Label>
                  <Popover open={open} onOpenChange={setOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={open}
                        className="w-full justify-between"
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
                                <span className="ml-auto text-xs text-muted-foreground">
                                  {emp.jobTitle}
                                </span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="loan-amount">Amount (AFN)</Label>
                  <Input
                    id="loan-amount"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="5000"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="loan-issue-date">Issue date</Label>
                  <Input
                    id="loan-issue-date"
                    type="date"
                    value={issueDate}
                    onChange={(e) => setIssueDate(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="loan-due-date">Due date (optional)</Label>
                  <Input
                    id="loan-due-date"
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="loan-installment">Monthly installment (AFN, optional)</Label>
                  <Input
                    id="loan-installment"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Leave empty to settle in one deduction"
                    value={installment}
                    onChange={(e) => setInstallment(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="loan-note">Note (optional)</Label>
                  <Textarea
                    id="loan-note"
                    placeholder="Purpose of the loan..."
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={autoDeduct}
                  onChange={(e) => setAutoDeduct(e.target.checked)}
                  className="h-4 w-4 rounded border-input"
                />
                Deduct automatically from salary payrolls
              </label>

              <Button type="submit" disabled={submitting} variant="secondary">
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Plus className="mr-2 h-4 w-4" />
                Issue Loan
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Loans</CardTitle>
          <CardDescription>
            Outstanding balances, schedules and repayments across all employees
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : loans.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">No loans yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b">
                    <th className="py-2 pr-4">Employee</th>
                    <th className="py-2 pr-4">Issued</th>
                    <th className="py-2 pr-4">Outstanding</th>
                    <th className="py-2 pr-4">Installment</th>
                    <th className="py-2 pr-4">Due</th>
                    <th className="py-2 pr-4">Auto-deduct</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loans.map((loan) => {
                    const canRepay =
                      canCreate('cashAdvance') &&
                      loan.approvalStatus === 'APPROVED' &&
                      loan.status === 'ACTIVE' &&
                      loan.balanceMinor > 0;
                    return (
                      <tr key={loan.id} className="border-b last:border-0">
                        <td className="py-2.5 pr-4 font-medium">
                          {loan.employee?.fullName ?? 'Employee'}
                        </td>
                        <td className="py-2.5 pr-4">{fromMinor(loan.principalMinor)} AFN</td>
                        <td className="py-2.5 pr-4 font-semibold text-rose-500">
                          {fromMinor(loan.balanceMinor)} AFN
                        </td>
                        <td className="py-2.5 pr-4">
                          {loan.monthlyInstallmentMinor
                            ? `${fromMinor(loan.monthlyInstallmentMinor)} AFN`
                            : '—'}
                        </td>
                        <td className="py-2.5 pr-4">
                          {loan.dueDate ? new Date(loan.dueDate).toLocaleDateString() : '—'}
                        </td>
                        <td className="py-2.5 pr-4">
                          <button
                            type="button"
                            disabled={
                              !canCreate('cashAdvance') ||
                              loan.approvalStatus !== 'APPROVED' ||
                              loan.status !== 'ACTIVE'
                            }
                            onClick={() => toggleAutoDeduct(loan)}
                            className={cn(
                              'text-xs px-2 py-0.5 rounded-full border',
                              loan.autoDeduct
                                ? 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30'
                                : 'bg-muted text-muted-foreground border-border',
                              (!canCreate('cashAdvance') ||
                                loan.approvalStatus !== 'APPROVED' ||
                                loan.status !== 'ACTIVE') &&
                                'opacity-50 cursor-not-allowed'
                            )}
                            title="Toggle automatic payroll deduction"
                          >
                            {loan.autoDeduct ? 'On' : 'Off'}
                          </button>
                        </td>
                        <td className="py-2.5 pr-4">{statusBadge(loan)}</td>
                        <td className="py-2.5 pr-4 text-right">
                          {canRepay && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => setRepayLoan(loan)}
                            >
                              Record repayment
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!repayLoan} onOpenChange={(o) => !o && setRepayLoan(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Loan Repayment</DialogTitle>
            <DialogDescription>
              {repayLoan
                ? `${repayLoan.employee?.fullName ?? 'Employee'} — outstanding ${fromMinor(repayLoan.balanceMinor)} AFN`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleRepay} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="repay-amount">Amount (AFN)</Label>
              <Input
                id="repay-amount"
                type="number"
                min="0"
                step="0.01"
                autoFocus
                value={repayAmount}
                onChange={(e) => setRepayAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="repay-note">Note (optional)</Label>
              <Textarea
                id="repay-note"
                value={repayNote}
                onChange={(e) => setRepayNote(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={repaying} variant="secondary">
              {repaying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Record Repayment
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
