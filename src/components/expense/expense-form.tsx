'use client';

import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useForm, useFormState } from 'react-hook-form';
import type { Resolver } from 'react-hook-form';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ChevronDown, Check, AlertCircle } from 'lucide-react';
import { useExpenseStore } from '@/hooks/use-expense-store';
import { useCreateExpense, useUpdateExpense } from '@/hooks/use-expense-query';
import { useEmployeeStore } from '@/hooks/use-employee-store';
import { useContractorStore } from '@/hooks/use-contractor-store';
import { employeesApi } from '@/services/employee-api';
import { contractorsApi } from '@/services/contractor-api';
import { cashAdvanceApi } from '@/services/api';
import { walletApi } from '@/services/wallet-api';
import {
  CATEGORIES,
  PAYMENT_METHODS,
  CATEGORY_LABELS,
  PAYMENT_METHOD_LABELS,
} from '@/types/expense';
import { DEPARTMENT_LABELS, EMPLOYEE_STATUS_LABELS } from '@/types/employee';
import { CONTRACTOR_TYPE_LABELS, CONTRACTOR_STATUS_LABELS } from '@/types/contractor';
import type { Category, PaymentMethod, ExpenseItem, ExpenseFormData } from '@/types/expense';
import type { Department, Employee, EmployeeStatus } from '@/types/employee';
import type { Contractor, ContractorType, ContractorStatus } from '@/types/contractor';
import ExpenseItemsModal from '@/components/expense/expense-items-modal';
import { Loader2, TableIcon, Wallet as WalletIcon } from 'lucide-react';
import { toast } from 'sonner';
import { gregorianToShamsi, shamsiToGregorian } from '@/lib/shamsi';

const expenseFormSchema = z.object({
  title: z.string().min(1, 'Title is required').max(100, 'Title must be 100 characters or less'),
  description: z.string().optional().nullable(),
  category: z
    .string()
    .min(1, 'Category is required')
    .refine((v) => CATEGORIES.includes(v as Category), 'Category is required'),
  amount: z.coerce.number().positive('Amount must be greater than 0'),
  paymentMethod: z
    .string()
    .min(1, 'Payment method is required')
    .refine((v) => PAYMENT_METHODS.includes(v as PaymentMethod), 'Payment method is required'),
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
  walletId: z.string().optional().nullable(),
  deductFromWallet: z.boolean().optional().default(true),
});

type ExpenseFormValues = z.infer<typeof expenseFormSchema>;

type PaidToMode = 'employee' | 'contractor' | 'custom';

interface CompanyWalletOption {
  id: string;
  name: string;
  balance: number;
  isActive: boolean;
  currency?: string;
}

// Grid coordinates for arrow-key navigation. `amount` is read-only and excluded.
const NAV_FIELDS: Record<string, { row: number; col: number }> = {
  title: { row: 0, col: 0 },
  category: { row: 1, col: 0 },
  paymentMethod: { row: 2, col: 0 },
  expenseDate: { row: 2, col: 1 },
  paidTo: { row: 3, col: 0 },
  paidBy: { row: 4, col: 0 },
  wallet: { row: 5, col: 0 },
  deductFromWallet: { row: 5, col: 1 },
  tags: { row: 6, col: 0 },
  notes: { row: 7, col: 0 },
};

const NAV_KEYS = Object.keys(NAV_FIELDS);

export function ExpenseForm() {
  const [paidToMode, setPaidToMode] = useState<PaidToMode>('custom');
  const [employeePopoverOpen, setEmployeePopoverOpen] = useState(false);
  const [contractorPopoverOpen, setContractorPopoverOpen] = useState(false);
  const [paidByMode, setPaidByMode] = useState<'employee' | 'custom'>('employee');
  const [employeePaidByPopoverOpen, setEmployeePaidByPopoverOpen] = useState(false);
  const [walletEmployeeIds, setWalletEmployeeIds] = useState<Set<string>>(new Set());
  const [companyWallets, setCompanyWallets] = useState<CompanyWalletOption[]>([]);
  const [itemsModalOpen, setItemsModalOpen] = useState(false);
  const [modalItems, setModalItems] = useState<ExpenseItem[]>([]);
  const [useShamsiDate, setUseShamsiDate] = useState(false);
  const [shamsiDateDraft, setShamsiDateDraft] = useState('');
  const [allEmployees, setAllEmployees] = useState<
    Pick<Employee, 'id' | 'fullName' | 'jobTitle' | 'department' | 'status'>[]
  >([]);
  const [allContractors, setAllContractors] = useState<
    Pick<Contractor, 'id' | 'contractorName' | 'fatherName' | 'contractorType' | 'status'>[]
  >([]);

  const navRefs = useRef<Record<string, HTMLElement | null>>({});

  const setNavRef = useCallback((key: string) => (el: HTMLElement | null) => {
    navRefs.current[key] = el;
  }, []);

  const isFormOpen = useExpenseStore((s) => s.isFormOpen);
  const editingExpense = useExpenseStore((s) => s.editingExpense);
  const currentUser = useExpenseStore((s) => s.user);
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
    resolver: zodResolver(expenseFormSchema) as Resolver<ExpenseFormValues>,
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
      walletId: null,
      deductFromWallet: true,
    },
  });

  const { errors } = useFormState({ control: form.control });

  useEffect(() => {
    if (isFormOpen) {
      fetchEmployeeList();
      fetchContractorList();
      employeesApi.getList().then((res) => {
        if (res.data) setAllEmployees(res.data);
      }).catch(() => {});
      contractorsApi.getList().then((res) => {
        if (res.data) setAllContractors(res.data);
      }).catch(() => {});
      cashAdvanceApi.getEmployeeWallets().then((res) => {
        if (res.data) {
          setWalletEmployeeIds(new Set(res.data.map((a) => a.employeeId)));
        }
      }).catch(() => {});
      walletApi.list().then((res) => {
        if (res.data) {
          setCompanyWallets(
            (res.data as CompanyWalletOption[]).filter((w) => w.isActive)
          );
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

  // Company wallet and employee-wallet deductions are mutually exclusive: when
  // a company wallet is selected, the employee-wallet deduction is disabled.
  const selectedWalletId = form.watch('walletId');
  const employeeWalletDisabled = !!selectedWalletId;

  // Sync computed items total to the form amount field for validation
  useEffect(() => {
    if (isFormOpen && itemsTotal > 0) {
      form.setValue('amount', itemsTotal, { shouldValidate: false });
    }
  }, [itemsTotal, isFormOpen, form]);

  // Reset form when dialog opens with editing data
  useEffect(() => {
    if (isFormOpen) {
      setUseShamsiDate(false);
      setShamsiDateDraft('');
      if (editingExpense) {
        if (editingExpense.paidToId) setPaidToMode('employee');
        else if (editingExpense.paidToContractorId) setPaidToMode('contractor');
        else setPaidToMode('custom');

        if (editingExpense.paidById) setPaidByMode('employee');
        else setPaidByMode('custom');

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
          walletId: editingExpense.walletId ?? null,
          deductFromWallet: editingExpense.deductFromWallet ?? true,
        });
      } else {
        setPaidToMode('custom');
        setPaidByMode('employee');

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
          walletId: null,
          deductFromWallet: true,
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

  // Shamsi / Miladi date toggle. The form's `expenseDate` field always holds a
  // Gregorian yyyy-MM-dd value; the Shamsi input is a draft converted on toggle.
  const handleToggleShamsiDate = useCallback(() => {
    setUseShamsiDate((prev) => {
      const next = !prev;
      if (next) {
        const current = form.getValues('expenseDate');
        setShamsiDateDraft(current ? gregorianToShamsi(new Date(current)) : '');
      } else {
        const g = shamsiToGregorian(shamsiDateDraft);
        if (g) form.setValue('expenseDate', g, { shouldValidate: true });
      }
      return next;
    });
  }, [shamsiDateDraft, form]);

  const handleShamsiDateChange = useCallback(
    (value: string) => {
      setShamsiDateDraft(value);
      const g = shamsiToGregorian(value);
      if (g) form.setValue('expenseDate', g, { shouldValidate: false });
    },
    [form]
  );

  // Arrow-key navigation between fields (up/down/left/right).
  const handleFieldKeyDown = useCallback((e: React.KeyboardEvent, key: string) => {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;

    const current = NAV_FIELDS[key];
    if (!current) return;

    // For text inputs, let the caret move within the field unless it is at a
    // boundary (mirrors the batch-timesheet navigation behaviour).
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && e.target instanceof HTMLInputElement) {
      const input = e.target;
      const isTextLike = input.type === 'text' || input.type === 'number' || input.type === 'date';
      if (!isTextLike) return;
      if (e.key === 'ArrowLeft' && (input.selectionStart ?? 0) !== 0) return;
      if (e.key === 'ArrowRight' && (input.selectionEnd ?? 0) !== input.value.length) return;
    }

    // Prevent dropdowns (Select/combobox) from opening/stealing the key.
    e.preventDefault();
    e.stopPropagation();

    const { row, col } = current;
    let targetKey: string | null = null;

    switch (e.key) {
      case 'ArrowUp': {
        // Nearest field in the row above, closest to the current column.
        const above = NAV_KEYS.filter((k) => NAV_FIELDS[k].row === row - 1);
        if (above.length > 0) {
          targetKey = above.reduce((best, k) =>
            Math.abs(NAV_FIELDS[k].col - col) < Math.abs(NAV_FIELDS[best].col - col) ? k : best
          );
        }
        break;
      }
      case 'ArrowDown': {
        const below = NAV_KEYS.filter((k) => NAV_FIELDS[k].row === row + 1);
        if (below.length > 0) {
          targetKey = below.reduce((best, k) =>
            Math.abs(NAV_FIELDS[k].col - col) < Math.abs(NAV_FIELDS[best].col - col) ? k : best
          );
        }
        break;
      }
      case 'ArrowLeft': {
        const inRow = NAV_KEYS.filter((k) => NAV_FIELDS[k].row === row);
        const left = inRow.filter((k) => NAV_FIELDS[k].col < col);
        targetKey = left.length > 0
          ? left.sort((a, b) => NAV_FIELDS[b].col - NAV_FIELDS[a].col)[0]
          : null;
        break;
      }
      case 'ArrowRight': {
        const inRow = NAV_KEYS.filter((k) => NAV_FIELDS[k].row === row);
        const right = inRow.filter((k) => NAV_FIELDS[k].col > col);
        targetKey = right.length > 0
          ? right.sort((a, b) => NAV_FIELDS[a].col - NAV_FIELDS[b].col)[0]
          : null;
        break;
      }
    }

    if (targetKey && navRefs.current[targetKey]) {
      navRefs.current[targetKey]?.focus();
    }
  }, []);

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
      if (useShamsiDate) {
        if (!shamsiToGregorian(shamsiDateDraft)) {
          toast.error('Invalid Shamsi date. Use the format 1404/05/03.');
          return;
        }
      }

      const itemsTotal = expenseItems.reduce((sum, item) => sum + item.total, 0);

      const baseData = {
        ...values,
        amount: itemsTotal,
        description: values.description || null,
        attachment: values.attachment || null,
        tags: values.tags || null,
        notes: values.notes || null,
      };

      if (isEditing && editingExpense) {
        await updateExpense.mutateAsync({
          id: editingExpense.id,
          data: {
            ...baseData,
            paidById: values.paidById ?? null,
            paidToId: values.paidToId ?? null,
            paidToContractorId: values.paidToContractorId ?? null,
            paidByContractorId: values.paidByContractorId ?? null,
            walletId: values.walletId ?? null,
            deductFromWallet: values.deductFromWallet ?? true,
          } as Partial<ExpenseFormData>,
        });
        toast.success('Expense updated successfully');
      } else {
        await createExpense.mutateAsync({
          ...baseData,
          paidById: values.paidById ?? null,
          paidToId: values.paidToId ?? null,
          paidToContractorId: values.paidToContractorId ?? null,
          paidByContractorId: values.paidByContractorId ?? null,
          walletId: values.walletId ?? null,
          deductFromWallet: values.deductFromWallet ?? true,
        } as ExpenseFormData);
        toast.success('Expense created successfully');
      }
      closeForm();
    } catch (error) {
      const fallback = isEditing ? 'Failed to update expense' : 'Failed to create expense';
      toast.error(error instanceof Error && error.message ? error.message : fallback);
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
                  <FormLabel>Title *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Enter expense title"
                      {...field}
                      ref={(el) => setNavRef('title')(el as unknown as HTMLElement)}
                      onKeyDown={(e) => handleFieldKeyDown(e, 'title')}
                    />
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
                    <FormLabel>Category *</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger
                          className="w-full"
                          ref={(el) => setNavRef('category')(el as unknown as HTMLElement)}
                          onKeyDown={(e) => handleFieldKeyDown(e, 'category')}
                        >
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
                      <FormLabel>Amount *</FormLabel>
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
                    <FormLabel>Payment Method *</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger
                          className="w-full"
                          ref={(el) => setNavRef('paymentMethod')(el as unknown as HTMLElement)}
                          onKeyDown={(e) => handleFieldKeyDown(e, 'paymentMethod')}
                        >
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
                render={({ field }) => {
                  const shamsiInvalid = useShamsiDate && !!shamsiDateDraft && !shamsiToGregorian(shamsiDateDraft);
                  return (
                    <FormItem>
                      <div className="flex items-center justify-between">
                        <FormLabel>Expense Date *</FormLabel>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={useShamsiDate}
                            onClick={handleToggleShamsiDate}
                            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors ${
                              useShamsiDate ? 'bg-emerald-600' : 'bg-input'
                            }`}
                          >
                            <span
                              className={`pointer-events-none block h-4 w-4 rounded-full bg-white shadow-lg ring-0 transition-transform ${
                                useShamsiDate ? 'translate-x-4' : 'translate-x-0'
                              }`}
                            />
                          </button>
                          <span className="text-xs text-muted-foreground">Shamsi</span>
                        </div>
                      </div>
                      <FormControl>
                        {useShamsiDate ? (
                          <Input
                            placeholder="1404/05/03"
                            value={shamsiDateDraft}
                            onChange={(e) => handleShamsiDateChange(e.target.value)}
                            ref={(el) => setNavRef('expenseDate')(el as unknown as HTMLElement)}
                            onKeyDown={(e) => handleFieldKeyDown(e, 'expenseDate')}
                            className={shamsiInvalid ? 'border-destructive' : ''}
                          />
                        ) : (
                          <Input
                            type="date"
                            {...field}
                            ref={(el) => setNavRef('expenseDate')(el as unknown as HTMLElement)}
                            onKeyDown={(e) => handleFieldKeyDown(e, 'expenseDate')}
                          />
                        )}
                      </FormControl>
                      {useShamsiDate && shamsiDateDraft && (
                        <p className={`text-xs ${shamsiInvalid ? 'text-destructive' : 'text-muted-foreground'}`}>
                          {shamsiInvalid
                            ? 'Invalid Shamsi date — use the format 1404/05/03'
                            : `Gregorian: ${shamsiToGregorian(shamsiDateDraft) ?? '—'}`}
                        </p>
                      )}
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />
            </div>

            {/* Row 4: Paid To (with employee/contractor/external selection) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <FormLabel className="text-sm">Paid To *</FormLabel>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant={paidToMode === 'employee' ? 'default' : 'ghost'}
                    size="sm"
                    className={`h-6 text-xs px-2 ${paidToMode === 'employee' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}`}
                    onClick={() => {
                      setPaidToMode('employee');
                      form.setValue('paidToId', null);
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
                      form.setValue('paidToContractorId', null);
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
                  render={({ field }) => {
                    const selectedEmployee = allEmployees.find((e) => e.id === field.value);
                    const selectedEmployeeStatus = selectedEmployee?.status;
                    return (
                    <FormItem className="flex flex-col">
                      <Popover open={employeePopoverOpen} onOpenChange={setEmployeePopoverOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            className="w-full justify-between font-normal"
                            ref={(el) => setNavRef('paidTo')(el as unknown as HTMLElement)}
                            onKeyDown={(e) => handleFieldKeyDown(e, 'paidTo')}
                          >
                            {field.value
                              ? allEmployees.find((e) => e.id === field.value)?.fullName ?? 'Select employee'
                              : 'Search employee...'}
                            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[400px] p-0">
                          <Command>
                            <CommandInput placeholder="Search employee..." />
                            <CommandList>
                              <CommandEmpty>No employee found.</CommandEmpty>
                              {allEmployees.map((emp) => (
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
                                  <span className="flex flex-1 items-center justify-between">
                                    <span>
                                      {emp.fullName} — {emp.jobTitle} ({DEPARTMENT_LABELS[emp.department as Department] ?? emp.department})
                                    </span>
                                    {emp.status !== 'ACTIVE' && (
                                      <span className="text-xs text-muted-foreground">
                                        {EMPLOYEE_STATUS_LABELS[emp.status as EmployeeStatus]}
                                      </span>
                                    )}
                                  </span>
                                </CommandItem>
                              ))}
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                      {selectedEmployeeStatus &&
                        (selectedEmployeeStatus === 'INACTIVE' || selectedEmployeeStatus === 'TERMINATED') && (
                        <Alert variant="destructive" className="mt-2">
                          <AlertCircle className="h-4 w-4" />
                          <AlertTitle>Inactive Employee</AlertTitle>
                          <AlertDescription>
                            This employee is {EMPLOYEE_STATUS_LABELS[selectedEmployeeStatus as EmployeeStatus].toLowerCase()}. The payment will still be recorded — confirm the recipient before proceeding.
                          </AlertDescription>
                        </Alert>
                      )}
                      <FormMessage>{errors.paidTo?.message}</FormMessage>
                    </FormItem>
                    );
                  }}
                />
              ) : paidToMode === 'contractor' ? (
                <FormField
                  control={form.control}
                  name="paidToContractorId"
                  render={({ field }) => {
                    const selectedContractor = allContractors.find((c) => c.id === field.value);
                    const selectedContractorStatus = selectedContractor?.status;
                    return (
                    <FormItem className="flex flex-col">
                      <Popover open={contractorPopoverOpen} onOpenChange={setContractorPopoverOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            className="w-full justify-between font-normal"
                            ref={(el) => setNavRef('paidTo')(el as unknown as HTMLElement)}
                            onKeyDown={(e) => handleFieldKeyDown(e, 'paidTo')}
                          >
                            {field.value
                              ? allContractors.find((c) => c.id === field.value)?.contractorName ?? 'Select contractor'
                              : 'Search contractor...'}
                            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[400px] p-0">
                          <Command>
                            <CommandInput placeholder="Search contractor..." />
                            <CommandList>
                              <CommandEmpty>No contractor found.</CommandEmpty>
                              {allContractors.map((c) => (
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
                                  <span className="flex flex-1 items-center justify-between">
                                    <span>{c.contractorName}</span>
                                    {c.status !== 'ACTIVE' && (
                                      <span className="text-xs text-muted-foreground">
                                        {CONTRACTOR_STATUS_LABELS[c.status as ContractorStatus]}
                                      </span>
                                    )}
                                  </span>
                                </CommandItem>
                              ))}
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                      {selectedContractorStatus &&
                        (selectedContractorStatus === 'INACTIVE' || selectedContractorStatus === 'SUSPENDED') && (
                        <Alert variant="destructive" className="mt-2">
                          <AlertCircle className="h-4 w-4" />
                          <AlertTitle>Inactive Contractor</AlertTitle>
                          <AlertDescription>
                            This contractor is {CONTRACTOR_STATUS_LABELS[selectedContractorStatus as ContractorStatus].toLowerCase()}. The payment will still be recorded — confirm the recipient before proceeding.
                          </AlertDescription>
                        </Alert>
                      )}
                      <FormMessage>{errors.paidTo?.message}</FormMessage>
                    </FormItem>
                    );
                  }}
                />
              ) : (
                <FormField
                  control={form.control}
                  name="paidTo"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input
                          placeholder="Recipient name"
                          {...field}
                          ref={(el) => setNavRef('paidTo')(el as unknown as HTMLElement)}
                          onKeyDown={(e) => handleFieldKeyDown(e, 'paidTo')}
                        />
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
                <FormLabel className="text-sm">Paid By *</FormLabel>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant={paidByMode === 'employee' ? 'default' : 'ghost'}
                    size="sm"
                    className={`h-6 text-xs px-2 ${paidByMode === 'employee' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}`}
                    onClick={() => {
                      setPaidByMode('employee');
                      form.setValue('paidById', null);
                      form.setValue('paidByContractorId', null);
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
                            ref={(el) => setNavRef('paidBy')(el as unknown as HTMLElement)}
                            onKeyDown={(e) => handleFieldKeyDown(e, 'paidBy')}
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
                      <FormMessage>{errors.paidBy?.message}</FormMessage>
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
                        <Input
                          placeholder="Payer name"
                          {...field}
                          ref={(el) => setNavRef('paidBy')(el as unknown as HTMLElement)}
                          onKeyDown={(e) => handleFieldKeyDown(e, 'paidBy')}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              {paidByMode === 'employee' && form.watch('paidById') && (
                <p className="text-xs text-muted-foreground">
                  When an employee pays on the company's behalf, the approved amount is
                  reimbursed automatically in the employee's next payroll.
                </p>
              )}
            </div>

            {/* Row 6: Wallet deduction (company wallet + employee wallet toggle) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="walletId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Pay From Company Wallet</FormLabel>
                    <Select
                      onValueChange={(value) => {
                        const walletValue = value === '__none__' ? null : value;
                        field.onChange(walletValue);
                        // Mutually exclusive: selecting a company wallet turns
                        // off the employee-wallet deduction; clearing it restores it.
                        form.setValue('deductFromWallet', walletValue ? false : true);
                        // When a company wallet is selected and no payer has been
                        // chosen yet, default the payer to the current user.
                        if (walletValue && !isEditing) {
                          const paidByIdVal = form.getValues('paidById');
                          const paidByVal = form.getValues('paidBy');
                          if (!paidByIdVal && !paidByVal && currentUser?.name) {
                            setPaidByMode('custom');
                            form.setValue('paidById', null);
                            form.setValue('paidByContractorId', null);
                            form.setValue('paidBy', currentUser.name);
                          }
                        }
                      }}
                      value={field.value ?? ''}
                    >
                      <FormControl>
                        <SelectTrigger
                          className="w-full"
                          ref={(el) => setNavRef('wallet')(el as unknown as HTMLElement)}
                          onKeyDown={(e) => handleFieldKeyDown(e, 'wallet')}
                        >
                          <SelectValue placeholder="No wallet (optional)" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="__none__">No wallet</SelectItem>
                        {companyWallets.map((w) => (
                          <SelectItem key={w.id} value={w.id}>
                            {w.name}
                            <span className="text-muted-foreground">
                              {' '}({w.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })} {w.currency ?? 'AFN'})
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      <WalletIcon className="mr-1 inline h-3 w-3" />
                      Deduct the approved amount from this company wallet.
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {paidByMode === 'employee' && form.watch('paidById') ? (
                <FormField
                  control={form.control}
                  name="deductFromWallet"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Employee Wallet</FormLabel>
                      <div className={`flex items-center gap-2 rounded-md border p-3 h-9 ${employeeWalletDisabled ? 'bg-muted/30 opacity-70' : ''}`}>
                        <Checkbox
                          id="deductFromWallet"
                          checked={employeeWalletDisabled ? false : (field.value ?? true)}
                          disabled={employeeWalletDisabled}
                          onCheckedChange={(checked) => field.onChange(checked === true)}
                          ref={(el) => setNavRef('deductFromWallet')(el as unknown as HTMLElement)}
                          onKeyDown={(e) => handleFieldKeyDown(e, 'deductFromWallet')}
                        />
                        <label htmlFor="deductFromWallet" className="text-sm leading-none">
                          Deduct amount from employee's wallet
                        </label>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {employeeWalletDisabled
                          ? 'A company wallet is selected — employee wallet deduction is disabled.'
                          : 'When enabled, the approved amount reduces the paying employee\'s wallet balance (credited for the expense they covered).'}
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : (
                <div className="flex flex-col justify-end pb-1">
                  <p className="text-xs text-muted-foreground">
                    Select an employee as the payer to control the employee wallet deduction.
                  </p>
                </div>
              )}
            </div>

            {/* Row 7: Tags */}
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
                      ref={(el) => setNavRef('tags')(el as unknown as HTMLElement)}
                      onKeyDown={(e) => handleFieldKeyDown(e, 'tags')}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Row 8: Expense Items */}
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

            {/* Row 9: Notes */}
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
                      ref={(el) => setNavRef('notes')(el as unknown as HTMLElement)}
                      onKeyDown={(e) => handleFieldKeyDown(e, 'notes')}
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
