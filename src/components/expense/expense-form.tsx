'use client';

import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { ChevronDown, Check } from 'lucide-react';
import { useExpenseStore } from '@/hooks/use-expense-store';
import { useCreateExpense, useUpdateExpense } from '@/hooks/use-expense-query';
import { useEmployeeStore } from '@/hooks/use-employee-store';
import { useContractorStore } from '@/hooks/use-contractor-store';
import { cashAdvanceApi } from '@/services/api';
import {
  CATEGORIES,
  PAYMENT_METHODS,
  CATEGORY_LABELS,
  PAYMENT_METHOD_LABELS,
} from '@/types/expense';
import { DEPARTMENT_LABELS } from '@/types/employee';
import { CONTRACTOR_TYPE_LABELS } from '@/types/contractor';
import type { Category, PaymentMethod, ExpenseItem } from '@/types/expense';
import type { Department } from '@/types/employee';
import type { ContractorType } from '@/types/contractor';
import ExpenseItemsModal from '@/components/expense/expense-items-modal';
import { Loader2, TableIcon } from 'lucide-react';
import { toast } from 'sonner';

const expenseFormSchema = z.object({
  title: z.string().min(1, 'Title is required').max(100, 'Title must be 100 characters or less'),
  description: z.string().optional().nullable(),
  category: z.enum(CATEGORIES as unknown as [string, ...string[]]),
  amount: z.coerce.number().positive('Amount must be positive'),
  paymentMethod: z.enum(PAYMENT_METHODS as unknown as [string, ...string[]]),
  paidTo: z.string().min(1, 'Paid to is required'),
  paidBy: z.string().min(1, 'Paid by is required'),
  expenseDate: z.string().min(1, 'Date is required'),
  attachment: z.string().optional().nullable(),
  tags: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  paidById: z.string().optional().nullable(),
  paidToId: z.string().optional().nullable(),
  paidToContractorId: z.string().optional().nullable(),
  paidByContractorId: z.string().optional().nullable(),
});

type ExpenseFormValues = z.infer<typeof expenseFormSchema>;

type PaidToMode = 'employee' | 'contractor' | 'custom';

export function ExpenseForm() {
  const [paidToMode, setPaidToMode] = useState<PaidToMode>('custom');
  const [employeePopoverOpen, setEmployeePopoverOpen] = useState(false);
  const [contractorPopoverOpen, setContractorPopoverOpen] = useState(false);
  const [paidByMode, setPaidByMode] = useState<'employee' | 'custom'>('employee');
  const [employeePaidByPopoverOpen, setEmployeePaidByPopoverOpen] = useState(false);
  const [walletEmployeeIds, setWalletEmployeeIds] = useState<Set<string>>(new Set());
  const [itemsModalOpen, setItemsModalOpen] = useState(false);
  const [modalItems, setModalItems] = useState<ExpenseItem[]>([]);

  const isFormOpen = useExpenseStore((s) => s.isFormOpen);
  const editingExpense = useExpenseStore((s) => s.editingExpense);
  const closeForm = useExpenseStore((s) => s.closeForm);
  const createExpense = useCreateExpense();
  const updateExpense = useUpdateExpense();
  const isLoading = createExpense.isPending || updateExpense.isPending;

  const employeeList = useEmployeeStore((s) => s.employeeList);
  const fetchEmployeeList = useEmployeeStore((s) => s.fetchEmployeeList);

  const contractorList = useContractorStore((s) => s.contractorList);
  const fetchContractorList = useContractorStore((s) => s.fetchContractorList);

  const isEditing = !!editingExpense;

  const form = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: {
      title: '',
      description: '',
      category: '' as ExpenseFormValues['category'],
      amount: 0,
      paymentMethod: '' as ExpenseFormValues['paymentMethod'],
      paidTo: '',
      paidBy: '',
      expenseDate: format(new Date(), 'yyyy-MM-dd'),
      attachment: '',
      tags: '',
      notes: '',
      paidById: null,
      paidToId: null,
      paidToContractorId: null,
      paidByContractorId: null,
    },
  });

  useEffect(() => {
    if (isFormOpen) {
      fetchEmployeeList();
      fetchContractorList();
      cashAdvanceApi.getEmployeeWallets().then((res) => {
        if (res.data) {
          setWalletEmployeeIds(new Set(res.data.map((a) => a.employeeId)));
        }
      }).catch(() => {});
    }
  }, [isFormOpen, fetchEmployeeList, fetchContractorList]);

  // Parse expense items from the form's description JSON field
  const descriptionValue = form.watch('description');
  const expenseItems: ExpenseItem[] = useMemo(() => {
    if (!descriptionValue) return [];
    try {
      const parsed = JSON.parse(descriptionValue);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [descriptionValue]);

  const itemsTotal = useMemo(
    () => expenseItems.reduce((s, i) => s + i.total, 0),
    [expenseItems]
  );

  // Sync computed items total to the form amount field for validation
  useEffect(() => {
    if (isFormOpen && itemsTotal > 0) {
      form.setValue('amount', itemsTotal, { shouldValidate: false });
    }
  }, [itemsTotal, isFormOpen, form]);

  // Reset form when dialog opens with editing data
  useEffect(() => {
    if (isFormOpen) {
      if (editingExpense) {
        form.reset({
          title: editingExpense.title,
          description: editingExpense.description ?? '',
          category: editingExpense.category as Category,
          amount: editingExpense.amount,
          paymentMethod: editingExpense.paymentMethod as PaymentMethod,
          paidTo: editingExpense.paidTo,
          paidBy: editingExpense.paidBy,
          expenseDate: editingExpense.expenseDate
            ? format(new Date(editingExpense.expenseDate), 'yyyy-MM-dd')
            : format(new Date(), 'yyyy-MM-dd'),
          attachment: editingExpense.attachment ?? '',
          tags: editingExpense.tags ?? '',
          notes: editingExpense.notes ?? '',
          paidById: editingExpense.paidById ?? null,
          paidToId: editingExpense.paidToId ?? null,
          paidToContractorId: editingExpense.paidToContractorId ?? null,
          paidByContractorId: editingExpense.paidByContractorId ?? null,
        });
      } else {
        form.reset({
          title: '',
          description: '',
          category: '' as Category,
          amount: 0,
          paymentMethod: '' as PaymentMethod,
          paidTo: '',
          paidBy: '',
          expenseDate: format(new Date(), 'yyyy-MM-dd'),
          attachment: '',
          tags: '',
          notes: '',
          paidById: null,
          paidToId: null,
          paidToContractorId: null,
        });
      }
    }
  }, [isFormOpen, editingExpense, form]);

  // Handle paid_by employee selection
  const handlePaidByEmployeeChange = (employeeId: string) => {
    const employee = employeeList.find((e) => e.id === employeeId);
    if (employee) {
      form.setValue('paidById', employeeId);
      form.setValue('paidByContractorId', null);
      form.setValue('paidBy', employee.fullName);
    }
  };

  // Handle paid_to employee selection
  const handlePaidToEmployeeChange = (employeeId: string) => {
    const employee = employeeList.find((e) => e.id === employeeId);
    if (employee) {
      form.setValue('paidToId', employeeId);
      form.setValue('paidToContractorId', null);
      form.setValue('paidTo', employee.fullName);
    }
  };

  // Handle paid_to contractor selection
  const handlePaidToContractorChange = (contractorId: string) => {
    const contractor = contractorList.find((c) => c.id === contractorId);
    if (contractor) {
      form.setValue('paidToContractorId', contractorId);
      form.setValue('paidToId', null);
      form.setValue('paidTo', contractor.contractorName);
    }
  };

  const handleOpenItemsModal = useCallback(() => {
    const raw = form.getValues('description');
    let current: ExpenseItem[] = [];
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) current = parsed;
      } catch {}
    }
    setModalItems(current);
    setItemsModalOpen(true);
  }, [form]);

  async function onSubmit(values: ExpenseFormValues) {
    try {
      const itemsTotal = expenseItems.reduce((sum, item) => sum + item.total, 0);

      const data = {
        ...values,
        amount: itemsTotal,
        attachment: values.attachment || undefined,
        tags: values.tags || undefined,
        notes: values.notes || undefined,
        paidById: values.paidById || undefined,
        paidToId: values.paidToId || undefined,
        paidToContractorId: values.paidToContractorId || undefined,
        paidByContractorId: values.paidByContractorId || undefined,
      };

      if (isEditing && editingExpense) {
        await updateExpense.mutateAsync({ id: editingExpense.id, data });
        toast.success('Expense updated successfully');
      } else {
        await createExpense.mutateAsync(data);
        toast.success('Expense created successfully');
      }
      closeForm();
    } catch (error) {
      toast.error(
        isEditing ? 'Failed to update expense' : 'Failed to create expense'
      );
    }
  }

  return (
    <Dialog open={isFormOpen} onOpenChange={(open) => !open && closeForm()}>
      <DialogContent className="sm:max-w-4xl max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Edit Expense' : 'Add Expense'}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update the expense details below.'
              : 'Fill in the details to add a new expense.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Row 1: Title (full width) */}
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter expense title" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Row 2: Category + Amount */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {CATEGORIES.map((cat) => (
                          <SelectItem key={cat} value={cat}>
                            {CATEGORY_LABELS[cat]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => {
                  const computedTotal = expenseItems.reduce((s, i) => s + i.total, 0);
                  const displayValue = computedTotal > 0 ? computedTotal : (field.value ?? 0);
                  return (
                    <FormItem>
                      <FormLabel>Amount</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                            Afs
                          </span>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            className="pl-10 font-mono font-bold text-emerald-600 dark:text-emerald-400"
                            value={displayValue}
                            readOnly
                            tabIndex={-1}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />
            </div>

            {/* Row 3: Payment Method + Date */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="paymentMethod"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Payment Method</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select payment method" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PAYMENT_METHODS.map((pm) => (
                          <SelectItem key={pm} value={pm}>
                            {PAYMENT_METHOD_LABELS[pm]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="expenseDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Expense Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Row 4: Paid To (with employee/contractor/external selection) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <FormLabel className="text-sm">Paid To</FormLabel>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant={paidToMode === 'employee' ? 'default' : 'ghost'}
                    size="sm"
                    className={`h-6 text-xs px-2 ${paidToMode === 'employee' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}`}
                    onClick={() => {
                      setPaidToMode('employee');
                      form.setValue('paidToId', '');
                      form.setValue('paidToContractorId', null);
                      form.setValue('paidTo', '');
                    }}
                  >
                    Employee
                  </Button>
                  <Button
                    type="button"
                    variant={paidToMode === 'contractor' ? 'default' : 'ghost'}
                    size="sm"
                    className={`h-6 text-xs px-2 ${paidToMode === 'contractor' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}`}
                    onClick={() => {
                      setPaidToMode('contractor');
                      form.setValue('paidToContractorId', '');
                      form.setValue('paidToId', null);
                      form.setValue('paidTo', '');
                    }}
                  >
                    Contractor
                  </Button>
                  <Button
                    type="button"
                    variant={paidToMode === 'custom' ? 'default' : 'ghost'}
                    size="sm"
                    className={`h-6 text-xs px-2 ${paidToMode === 'custom' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}`}
                    onClick={() => {
                      setPaidToMode('custom');
                      form.setValue('paidToId', null);
                      form.setValue('paidToContractorId', null);
                      form.setValue('paidTo', '');
                    }}
                  >
                    External
                  </Button>
                </div>
              </div>
              {paidToMode === 'employee' ? (
                <FormField
                  control={form.control}
                  name="paidToId"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <Popover open={employeePopoverOpen} onOpenChange={setEmployeePopoverOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            className="w-full justify-between font-normal"
                          >
                            {field.value
                              ? employeeList.find((e) => e.id === field.value)?.fullName ?? 'Select employee'
                              : 'Search employee...'}
                            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[400px] p-0">
                          <Command>
                            <CommandInput placeholder="Search employee..." />
                            <CommandList>
                              <CommandEmpty>No employee found.</CommandEmpty>
                              {employeeList.map((emp) => (
                                <CommandItem
                                  key={emp.id}
                                  value={emp.fullName}
                                  onSelect={() => {
                                    field.onChange(emp.id);
                                    handlePaidToEmployeeChange(emp.id);
                                    setEmployeePopoverOpen(false);
                                  }}
                                >
                                  <Check
                                    className="mr-2 h-4 w-4"
                                    style={{ opacity: field.value === emp.id ? 1 : 0 }}
                                  />
                                  {emp.fullName} — {emp.jobTitle} ({DEPARTMENT_LABELS[emp.department as Department] ?? emp.department})
                                </CommandItem>
                              ))}
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : paidToMode === 'contractor' ? (
                <FormField
                  control={form.control}
                  name="paidToContractorId"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <Popover open={contractorPopoverOpen} onOpenChange={setContractorPopoverOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            className="w-full justify-between font-normal"
                          >
                            {field.value
                              ? contractorList.find((c) => c.id === field.value)?.contractorName ?? 'Select contractor'
                              : 'Search contractor...'}
                            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[400px] p-0">
                          <Command>
                            <CommandInput placeholder="Search contractor..." />
                            <CommandList>
                              <CommandEmpty>No contractor found.</CommandEmpty>
                              {contractorList.map((c) => (
                                <CommandItem
                                  key={c.id}
                                  value={c.contractorName}
                                  onSelect={() => {
                                    field.onChange(c.id);
                                    handlePaidToContractorChange(c.id);
                                    setContractorPopoverOpen(false);
                                  }}
                                >
                                  <Check
                                    className="mr-2 h-4 w-4"
                                    style={{ opacity: field.value === c.id ? 1 : 0 }}
                                  />
                                  {c.contractorName}
                                </CommandItem>
                              ))}
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : (
                <FormField
                  control={form.control}
                  name="paidTo"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input placeholder="Recipient name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            {/* Row 5: Paid By (with employee/contractor/external selection) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <FormLabel className="text-sm">Paid By</FormLabel>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant={paidByMode === 'employee' ? 'default' : 'ghost'}
                    size="sm"
                    className={`h-6 text-xs px-2 ${paidByMode === 'employee' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}`}
                    onClick={() => {
                      setPaidByMode('employee');
                      form.setValue('paidById', '');
                      form.setValue('paidBy', '');
                    }}
                  >
                    Employee
                  </Button>
                  <Button
                    type="button"
                    variant={paidByMode === 'custom' ? 'default' : 'ghost'}
                    size="sm"
                    className={`h-6 text-xs px-2 ${paidByMode === 'custom' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}`}
                    onClick={() => {
                      setPaidByMode('custom');
                      form.setValue('paidById', null);
                      form.setValue('paidByContractorId', null);
                      form.setValue('paidBy', '');
                    }}
                  >
                    External
                  </Button>
                </div>
              </div>
              {paidByMode === 'employee' ? (
                <FormField
                  control={form.control}
                  name="paidById"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <Popover open={employeePaidByPopoverOpen} onOpenChange={setEmployeePaidByPopoverOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            className="w-full justify-between font-normal"
                          >
                            {field.value
                              ? employeeList.find((e) => e.id === field.value)?.fullName ?? 'Select employee'
                              : 'Search employee...'}
                            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[400px] p-0">
                          <Command>
                            <CommandInput placeholder="Search employee..." />
                            <CommandList>
                              <CommandEmpty>No employee found.</CommandEmpty>
                              {employeeList.filter((e) => walletEmployeeIds.has(e.id)).map((emp) => (
                                <CommandItem
                                  key={emp.id}
                                  value={emp.id}
                                  onSelect={() => {
                                    field.onChange(emp.id);
                                    handlePaidByEmployeeChange(emp.id);
                                    setEmployeePaidByPopoverOpen(false);
                                  }}
                                >
                                  <Check
                                    className="mr-2 h-4 w-4"
                                    style={{ opacity: field.value === emp.id ? 1 : 0 }}
                                  />
                                  {emp.fullName} — {emp.jobTitle} ({DEPARTMENT_LABELS[emp.department as Department] ?? emp.department})
                                </CommandItem>
                              ))}
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : (
                <FormField
                  control={form.control}
                  name="paidBy"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input placeholder="Payer name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            {/* Row 6: Tags */}
            <FormField
              control={form.control}
              name="tags"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tags</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Comma-separated tags (e.g., urgent, monthly)"
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Row 7: Expense Items */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <FormLabel>Expense Items</FormLabel>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleOpenItemsModal}
                >
                  <TableIcon className="mr-1.5 h-4 w-4" />
                  {expenseItems.length > 0
                    ? `Edit Items (${expenseItems.length})`
                    : '+ Add Expense Items'}
                </Button>
              </div>
              {expenseItems.length > 0 ? (
                <div className="rounded-md border bg-muted/20 p-3 space-y-1 max-h-60 overflow-y-auto">
                  <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    <div className="col-span-4">Item</div>
                    <div className="col-span-2 text-right">Qty</div>
                    <div className="col-span-2 text-right">Unit Price</div>
                    <div className="col-span-2 text-right">Total</div>
                    <div className="col-span-2" />
                  </div>
                  {expenseItems.map((item, i) => (
                    <div
                      key={item.id}
                      className="grid grid-cols-12 gap-2 text-sm"
                    >
                      <div className="col-span-4 truncate">{item.itemName || '—'}</div>
                      <div className="col-span-2 text-right tabular-nums">{item.quantity}</div>
                      <div className="col-span-2 text-right tabular-nums">
                        Afs {item.unitPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </div>
                      <div className="col-span-2 text-right font-mono tabular-nums">
                        Afs {item.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </div>
                      <div className="col-span-2 text-xs text-muted-foreground">{item.unit}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No items added. Click the button above to add expense items.
                </p>
              )}
            </div>

            {/* Row 8: Notes */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Additional notes or comments"
                      rows={2}
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={closeForm}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isLoading}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {isLoading && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {isEditing ? 'Update Expense' : 'Add Expense'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      {/* Expense Items Modal */}
      <ExpenseItemsModal
        open={itemsModalOpen}
        onOpenChange={setItemsModalOpen}
        items={modalItems}
        onSave={(description) => {
          form.setValue('description', description || '', { shouldDirty: true });
          setItemsModalOpen(false);
        }}
      />
      </DialogContent>
    </Dialog>
  );
}
