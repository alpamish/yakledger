'use client';

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from '@tanstack/react-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Plus,
  Trash2,
  Loader2,
  Check,
  ChevronDown,
  Calendar,
  Receipt,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useBulkCreateExpenses } from '@/hooks/use-expense-query';
import { useEmployeeStore } from '@/hooks/use-employee-store';
import { useExpenseStore } from '@/hooks/use-expense-store';
import { cashAdvanceApi } from '@/services/api';
import { walletApi } from '@/services/wallet-api';
import { employeesApi } from '@/services/employee-api';
import { contractorsApi } from '@/services/contractor-api';
import {
  CATEGORIES,
  PAYMENT_METHODS,
  CATEGORY_LABELS,
  PAYMENT_METHOD_LABELS,
} from '@/types/expense';
import { DEPARTMENT_LABELS, EMPLOYEE_STATUS_LABELS } from '@/types/employee';
import { CONTRACTOR_STATUS_LABELS } from '@/types/contractor';
import type { Category, PaymentMethod, BulkExpenseRecord } from '@/types/expense';
import type { Department, Employee, EmployeeStatus } from '@/types/employee';
import type { Contractor, ContractorStatus } from '@/types/contractor';
import { gregorianToShamsi, shamsiToGregorian } from '@/lib/shamsi';

interface BatchExpenseRow {
  id: string;
  title: string;
  category: string;
  amount: number;
  paymentMethod: string;
  paidTo: string;
  paidToId?: string;
  paidToContractorId?: string;
  paidBy: string;
  paidById?: string;
  expenseDate: string;
  walletId?: string;
  deductFromWallet: boolean;
  notes: string;
}

interface BatchExpenseFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface CompanyWalletOption {
  id: string;
  name: string;
  balance: number;
  isActive: boolean;
  currency?: string;
}

type AllEmployeeOption = Pick<Employee, 'id' | 'fullName' | 'jobTitle' | 'department' | 'status'>;
type AllContractorOption = Pick<Contractor, 'id' | 'contractorName' | 'fatherName' | 'contractorType' | 'status'>;

type PaidToMode = 'employee' | 'contractor' | 'custom';

const PAID_TO_MODES: { value: PaidToMode; label: string }[] = [
  { value: 'employee', label: 'Employee' },
  { value: 'contractor', label: 'Contractor' },
  { value: 'custom', label: 'External' },
];

interface PaidByCellProps {
  value: string;
  paidById?: string;
  rowIndex: number;
  employeeList: ReturnType<typeof useEmployeeStore.getState>['employeeList'];
  onUpdate: (index: number, field: keyof BatchExpenseRow, value: string | number | boolean | undefined) => void;
}

interface PaidToCellProps {
  value: string;
  paidToId?: string;
  paidToContractorId?: string;
  rowIndex: number;
  employeeList: AllEmployeeOption[];
  contractorList: AllContractorOption[];
  onUpdate: (index: number, field: keyof BatchExpenseRow, value: string | number | boolean | undefined) => void;
}

function PaidToCell({
  value,
  paidToId,
  paidToContractorId,
  rowIndex,
  employeeList,
  contractorList,
  onUpdate,
}: PaidToCellProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<PaidToMode>('employee');
  const [customDraft, setCustomDraft] = useState('');

  useEffect(() => {
    if (open) {
      if (paidToId) setMode('employee');
      else if (paidToContractorId) setMode('contractor');
      else setMode('custom');
    }
  }, [open, paidToId, paidToContractorId]);

  const selectedEmployee = paidToId ? employeeList.find((e) => e.id === paidToId) : undefined;
  const selectedContractor = paidToContractorId
    ? contractorList.find((c) => c.id === paidToContractorId)
    : undefined;
  const display = selectedEmployee?.fullName ?? selectedContractor?.contractorName ?? value;

  const selectEmployee = (id: string, name: string) => {
    onUpdate(rowIndex, 'paidToId', id);
    onUpdate(rowIndex, 'paidToContractorId', undefined);
    onUpdate(rowIndex, 'paidTo', name);
    setOpen(false);
  };

  const selectContractor = (id: string, name: string) => {
    onUpdate(rowIndex, 'paidToContractorId', id);
    onUpdate(rowIndex, 'paidToId', undefined);
    onUpdate(rowIndex, 'paidTo', name);
    setOpen(false);
  };

  const selectCustom = () => {
    onUpdate(rowIndex, 'paidToId', undefined);
    onUpdate(rowIndex, 'paidToContractorId', undefined);
    onUpdate(rowIndex, 'paidTo', customDraft.trim());
    setCustomDraft('');
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className="h-8 w-full justify-between border-0 shadow-none focus-visible:ring-1 bg-transparent px-1 text-xs font-normal"
        >
          <span className="truncate">{display || 'Recipient...'}</span>
          <ChevronDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[340px] p-0">
        <div className="flex items-center gap-1 p-2 border-b">
          {PAID_TO_MODES.map((m) => (
            <Button
              key={m.value}
              type="button"
              variant={mode === m.value ? 'default' : 'ghost'}
              size="sm"
              className={`h-6 text-xs px-2 ${mode === m.value ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}`}
              onClick={() => setMode(m.value)}
            >
              {m.label}
            </Button>
          ))}
        </div>
        {mode === 'employee' && (
          <Command>
            <CommandInput placeholder="Search employee..." />
            <CommandList>
              <CommandEmpty>No employee found.</CommandEmpty>
              {employeeList.map((emp) => (
                <CommandItem
                  key={emp.id}
                  value={emp.fullName}
                  onSelect={() => selectEmployee(emp.id, emp.fullName)}
                >
                  <Check
                    className="mr-2 h-4 w-4"
                    style={{ opacity: paidToId === emp.id ? 1 : 0 }}
                  />
                  <span className="flex flex-1 items-center justify-between gap-2">
                    <span className="truncate">
                      {emp.fullName} — {emp.jobTitle} ({DEPARTMENT_LABELS[emp.department as Department] ?? emp.department})
                    </span>
                    {emp.status !== 'ACTIVE' && (
                      <span className="text-xs text-muted-foreground shrink-0">
                        {EMPLOYEE_STATUS_LABELS[emp.status as EmployeeStatus]}
                      </span>
                    )}
                  </span>
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        )}
        {mode === 'contractor' && (
          <Command>
            <CommandInput placeholder="Search contractor..." />
            <CommandList>
              <CommandEmpty>No contractor found.</CommandEmpty>
              {contractorList.map((c) => (
                <CommandItem
                  key={c.id}
                  value={c.contractorName}
                  onSelect={() => selectContractor(c.id, c.contractorName)}
                >
                  <Check
                    className="mr-2 h-4 w-4"
                    style={{ opacity: paidToContractorId === c.id ? 1 : 0 }}
                  />
                  <span className="flex flex-1 items-center justify-between gap-2">
                    <span className="truncate">{c.contractorName}</span>
                    {c.status !== 'ACTIVE' && (
                      <span className="text-xs text-muted-foreground shrink-0">
                        {CONTRACTOR_STATUS_LABELS[c.status as ContractorStatus]}
                      </span>
                    )}
                  </span>
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        )}
        {mode === 'custom' && (
          <div className="p-2">
            <Input
              placeholder="Type a custom recipient name..."
              value={customDraft}
              onChange={(e) => setCustomDraft(e.target.value)}
              className="h-8 text-xs"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-1 h-7 w-full text-xs"
              disabled={!customDraft.trim()}
              onClick={selectCustom}
            >
              Use &quot;{customDraft.trim()}&quot; as recipient
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function PaidByCell({ value, paidById, rowIndex, employeeList, onUpdate }: PaidByCellProps) {
  const [open, setOpen] = useState(false);
  const [customDraft, setCustomDraft] = useState('');
  const selected = paidById ? employeeList.find((e) => e.id === paidById) : undefined;
  const display = selected?.fullName ?? value;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className="h-8 w-full justify-between border-0 shadow-none focus-visible:ring-1 bg-transparent px-1 text-xs font-normal"
        >
          <span className="truncate">{display || 'Payer...'}</span>
          <ChevronDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[340px] p-0">
        <div className="p-2 border-b">
          <Input
            placeholder="Type a custom payer name..."
            value={customDraft}
            onChange={(e) => setCustomDraft(e.target.value)}
            className="h-8 text-xs"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-1 h-7 w-full text-xs"
            disabled={!customDraft.trim()}
            onClick={() => {
              onUpdate(rowIndex, 'paidById', undefined);
              onUpdate(rowIndex, 'paidBy', customDraft.trim());
              setOpen(false);
              setCustomDraft('');
            }}
          >
            Use &quot;{customDraft.trim()}&quot; as payer
          </Button>
        </div>
        <Command>
          <CommandInput placeholder="Search employee..." />
          <CommandList>
            <CommandEmpty>No employee found.</CommandEmpty>
            {employeeList.map((emp) => (
              <CommandItem
                key={emp.id}
                value={emp.fullName}
                onSelect={() => {
                  onUpdate(rowIndex, 'paidById', emp.id);
                  onUpdate(rowIndex, 'paidBy', emp.fullName);
                  setOpen(false);
                }}
              >
                <Check
                  className="mr-2 h-4 w-4"
                  style={{ opacity: paidById === emp.id ? 1 : 0 }}
                />
                {emp.fullName} — {emp.jobTitle} ({DEPARTMENT_LABELS[emp.department as Department] ?? emp.department})
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

let idCounter = 0;
function generateId() {
  idCounter += 1;
  return `batch_exp_${Date.now()}_${idCounter}`;
}

function createEmptyRow(
  date: string,
  overrides?: Partial<BatchExpenseRow>
): BatchExpenseRow {
  return {
    id: generateId(),
    title: overrides?.title ?? '',
    category: overrides?.category ?? '',
    amount: overrides?.amount ?? 0,
    paymentMethod: overrides?.paymentMethod ?? '',
    paidTo: overrides?.paidTo ?? '',
    paidToId: overrides?.paidToId,
    paidToContractorId: overrides?.paidToContractorId,
    paidBy: overrides?.paidBy ?? '',
    paidById: overrides?.paidById,
    expenseDate: date,
    walletId: overrides?.walletId,
    deductFromWallet: overrides?.deductFromWallet ?? true,
    notes: overrides?.notes ?? '',
  };
}

export function BatchExpenseForm({ open, onOpenChange, onSuccess }: BatchExpenseFormProps) {
  const [rows, setRows] = useState<BatchExpenseRow[]>([]);
  const [globalDate, setGlobalDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [useShamsi, setUseShamsi] = useState(false);
  const [globalShamsiDate, setGlobalShamsiDate] = useState('');
  const [globalCategory, setGlobalCategory] = useState('');
  const [globalPaymentMethod, setGlobalPaymentMethod] = useState('');
  const [globalPaidTo, setGlobalPaidTo] = useState('');
  const [globalPaidToId, setGlobalPaidToId] = useState<string | undefined>();
  const [globalPaidToContractorId, setGlobalPaidToContractorId] = useState<string | undefined>();
  const [globalPaidToMode, setGlobalPaidToMode] = useState<PaidToMode>('custom');
  const [globalPaidBy, setGlobalPaidBy] = useState('');
  const [globalPaidById, setGlobalPaidById] = useState<string | undefined>();
  const [globalWalletId, setGlobalWalletId] = useState('');
  const [globalDeductFromWallet, setGlobalDeductFromWallet] = useState(true);
  const [globalNotes, setGlobalNotes] = useState('');
  const [employeeList, setEmployeeList] = useState<
    ReturnType<typeof useEmployeeStore.getState>['employeeList']
  >([]);
  const [allEmployees, setAllEmployees] = useState<AllEmployeeOption[]>([]);
  const [allContractors, setAllContractors] = useState<AllContractorOption[]>([]);
  const [companyWallets, setCompanyWallets] = useState<CompanyWalletOption[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [globalPaidByPopoverOpen, setGlobalPaidByPopoverOpen] = useState(false);
  const [globalPaidToPopoverOpen, setGlobalPaidToPopoverOpen] = useState(false);
  const [paidByCustomDraft, setPaidByCustomDraft] = useState('');
  const [paidToCustomDraft, setPaidToCustomDraft] = useState('');
  const cellRefs = useRef<Map<string, HTMLTableCellElement>>(new Map());
  const focusAfterRender = useRef<{ row: number; col: string } | null>(null);

  const storeEmployeeList = useEmployeeStore((s) => s.employeeList);
  const fetchEmployeeList = useEmployeeStore((s) => s.fetchEmployeeList);
  const bulkCreateExpenses = useBulkCreateExpenses();

  useEffect(() => {
    if (open) {
      idCounter = 0;
      const today = format(new Date(), 'yyyy-MM-dd');
      setGlobalDate(today);
      setGlobalShamsiDate(gregorianToShamsi(new Date(today)));
      setUseShamsi(false);
      setGlobalCategory('');
      setGlobalPaymentMethod('');
      setGlobalPaidTo('');
      setGlobalPaidToId(undefined);
      setGlobalPaidToContractorId(undefined);
      setGlobalPaidToMode('custom');
      setGlobalPaidBy('');
      setGlobalPaidById(undefined);
      setGlobalWalletId('');
      setGlobalDeductFromWallet(true);
      setGlobalNotes('');
      setIsLoadingData(true);

      fetchEmployeeList();
      employeesApi
        .getList()
        .then((res) => {
          if (res.data) setAllEmployees(res.data as AllEmployeeOption[]);
        })
        .catch(() => {});
      contractorsApi
        .getList()
        .then((res) => {
          if (res.data) setAllContractors(res.data as AllContractorOption[]);
        })
        .catch(() => {});
      cashAdvanceApi
        .getEmployeeWallets()
        .then((res) => {
          if (res.data) {
            const withWallet = new Set(res.data.map((a) => a.employeeId));
            setEmployeeList(
              useEmployeeStore.getState().employeeList.filter((e) => withWallet.has(e.id))
            );
          }
        })
        .catch(() => {});

      walletApi
        .list()
        .then((res) => {
          if (res.data) {
            setCompanyWallets(
              (res.data as CompanyWalletOption[]).filter((w) => w.isActive)
            );
          }
        })
        .catch(() => {})
        .finally(() => setIsLoadingData(false));

      setRows([createEmptyRow(today)]);
    }
  }, [open, fetchEmployeeList]);

  // Keep the employee list in sync after the store fetches.
  useEffect(() => {
    if (!open) return;
    cashAdvanceApi
      .getEmployeeWallets()
      .then((res) => {
        if (res.data) {
          const withWallet = new Set(res.data.map((a) => a.employeeId));
          setEmployeeList(storeEmployeeList.filter((e) => withWallet.has(e.id)));
        }
      })
      .catch(() => {});
  }, [storeEmployeeList, open]);

  const handleToggleShamsi = useCallback(() => {
    setUseShamsi((prev) => {
      const next = !prev;
      if (next) {
        setGlobalShamsiDate(gregorianToShamsi(new Date(globalDate)));
      } else {
        const g = shamsiToGregorian(globalShamsiDate);
        if (g) setGlobalDate(g);
      }
      return next;
    });
  }, [globalDate, globalShamsiDate]);

  const handleGlobalDateChange = useCallback((value: string) => {
    setGlobalDate(value);
    setRows((prev) => prev.map((r) => ({ ...r, expenseDate: value })));
  }, []);

  const handleGlobalShamsiChange = useCallback((value: string) => {
    setGlobalShamsiDate(value);
    const g = shamsiToGregorian(value);
    if (g) {
      setGlobalDate(g);
      setRows((prev) => prev.map((r) => ({ ...r, expenseDate: g })));
    }
  }, []);

  const handleGlobalCategoryChange = useCallback((value: string) => {
    setGlobalCategory(value);
    setRows((prev) => prev.map((r) => ({ ...r, category: value })));
  }, []);

  const handleGlobalPaymentMethodChange = useCallback((value: string) => {
    setGlobalPaymentMethod(value);
    setRows((prev) => prev.map((r) => ({ ...r, paymentMethod: value })));
  }, []);

  const handleGlobalPaidToChange = useCallback(
    (employeeId: string | undefined, contractorId: string | undefined, name: string) => {
      setGlobalPaidToId(employeeId);
      setGlobalPaidToContractorId(contractorId);
      setGlobalPaidTo(name);
      setRows((prev) =>
        prev.map((r) => ({
          ...r,
          paidToId: employeeId,
          paidToContractorId: contractorId,
          paidTo: name,
        }))
      );
    },
    []
  );

  const handleGlobalPaidToModeChange = useCallback((mode: PaidToMode) => {
    setGlobalPaidToMode(mode);
    setGlobalPaidToId(undefined);
    setGlobalPaidToContractorId(undefined);
    setGlobalPaidTo('');
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        paidToId: undefined,
        paidToContractorId: undefined,
        paidTo: '',
      }))
    );
  }, []);

  const handleGlobalPaidByChange = useCallback(
    (employeeId: string | undefined, name: string) => {
      setGlobalPaidById(employeeId);
      setGlobalPaidBy(name);
      setRows((prev) =>
        prev.map((r) => ({ ...r, paidById: employeeId, paidBy: name }))
      );
    },
    []
  );

  const handleGlobalWalletChange = useCallback((value: string) => {
    setGlobalWalletId(value);
    const walletValue = value === '__none__' ? '' : value;
    const deduct = walletValue ? false : true;
    setGlobalDeductFromWallet(deduct);
    const userName = useExpenseStore.getState().user?.name;
    // When a company wallet is selected and no payer has been chosen yet,
    // default the payer to the current user.
    const autoFill = !!(walletValue && !globalPaidById && !globalPaidBy && userName);
    if (autoFill) setGlobalPaidBy(userName);
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        walletId: walletValue || undefined,
        deductFromWallet: deduct,
        paidBy: autoFill && !r.paidById && !r.paidBy ? userName! : r.paidBy,
      }))
    );
  }, [globalPaidBy, globalPaidById]);

  const handleGlobalDeductChange = useCallback((checked: boolean) => {
    setGlobalDeductFromWallet(checked);
    setRows((prev) => prev.map((r) => ({ ...r, deductFromWallet: checked })));
  }, []);

  const handleGlobalNotesChange = useCallback((value: string) => {
    setGlobalNotes(value);
    setRows((prev) => prev.map((r) => ({ ...r, notes: value })));
  }, []);

  const updateItem = useCallback(
    (index: number, field: keyof BatchExpenseRow, value: string | number | boolean | undefined) => {
      setRows((prev) => {
        const updated = prev.map((r) => ({ ...r }));
        const target = updated[index];
        if (!target) return prev;
        if (field === 'walletId') {
          const walletValue = value ? String(value) : '';
          target.walletId = walletValue || undefined;
          target.deductFromWallet = walletValue ? false : true;
          // When a company wallet is selected and no payer has been chosen yet,
          // default the payer to the current user.
          if (walletValue && !target.paidById && !target.paidBy) {
            target.paidBy = useExpenseStore.getState().user?.name ?? '';
          }
        } else if (field === 'paidById') {
          target.paidById = value ? String(value) : undefined;
        } else if (field === 'paidToId') {
          target.paidToId = value ? String(value) : undefined;
          if (value) target.paidToContractorId = undefined;
        } else if (field === 'paidToContractorId') {
          target.paidToContractorId = value ? String(value) : undefined;
          if (value) target.paidToId = undefined;
        } else if (field === 'amount') {
          target.amount = Number(value) || 0;
        } else {
          (target as any)[field] = value;
        }
        return updated;
      });
    },
    []
  );

  const removeRow = useCallback((index: number) => {
    setRows((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const addRow = useCallback(() => {
    setRows((prev) => [
      ...prev,
      createEmptyRow(globalDate, {
        category: globalCategory,
        paymentMethod: globalPaymentMethod,
        paidTo: globalPaidTo,
        paidToId: globalPaidToId,
        paidToContractorId: globalPaidToContractorId,
        paidBy: globalPaidBy,
        paidById: globalPaidById,
        walletId: globalWalletId || undefined,
        deductFromWallet: globalWalletId ? false : globalDeductFromWallet,
        notes: globalNotes,
      }),
    ]);
  }, [globalDate, globalCategory, globalPaymentMethod, globalPaidTo, globalPaidToId, globalPaidToContractorId, globalPaidBy, globalPaidById, globalWalletId, globalDeductFromWallet, globalNotes]);

  const columns = useMemo<ColumnDef<BatchExpenseRow>[]>(
    () => [
      {
        id: 'rowNumber',
        header: '#',
        cell: ({ row }) => (
          <span className="text-muted-foreground text-xs tabular-nums">
            {row.index + 1}
          </span>
        ),
        size: 32,
        enableResizing: false,
      },
      {
        id: 'title',
        header: 'Title *',
        cell: ({ row }) => (
          <Input
            value={row.original.title}
            onChange={(e) => updateItem(row.index, 'title', e.target.value)}
            placeholder="—"
            className="h-8 border-0 shadow-none focus-visible:ring-1 bg-transparent px-1 text-xs"
          />
        ),
        size: 180,
      },
      {
        id: 'category',
        header: 'Category *',
        cell: ({ row }) => (
          <Select
            value={row.original.category}
            onValueChange={(v) => updateItem(row.index, 'category', v)}
          >
            <SelectTrigger className="h-8 w-full border-0 shadow-none bg-transparent px-1 text-xs">
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {CATEGORY_LABELS[cat]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ),
        size: 150,
      },
      {
        id: 'amount',
        header: 'Amount *',
        cell: ({ row }) => (
          <Input
            type="number"
            step="0.01"
            min="0"
            value={row.original.amount || ''}
            onChange={(e) => updateItem(row.index, 'amount', e.target.value)}
            placeholder="0.00"
            className="h-8 border-0 shadow-none focus-visible:ring-1 bg-transparent px-1 text-xs text-right font-mono"
          />
        ),
        size: 110,
      },
      {
        id: 'paymentMethod',
        header: 'Payment *',
        cell: ({ row }) => (
          <Select
            value={row.original.paymentMethod}
            onValueChange={(v) => updateItem(row.index, 'paymentMethod', v)}
          >
            <SelectTrigger className="h-8 w-full border-0 shadow-none bg-transparent px-1 text-xs">
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_METHODS.map((pm) => (
                <SelectItem key={pm} value={pm}>
                  {PAYMENT_METHOD_LABELS[pm]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ),
        size: 120,
      },
      {
        id: 'paidTo',
        header: 'Paid To *',
        cell: ({ row }) => (
          <PaidToCell
            value={row.original.paidTo}
            paidToId={row.original.paidToId}
            paidToContractorId={row.original.paidToContractorId}
            rowIndex={row.index}
            employeeList={allEmployees}
            contractorList={allContractors}
            onUpdate={updateItem}
          />
        ),
        size: 160,
      },
      {
        id: 'paidBy',
        header: 'Paid By *',
        cell: ({ row }) => (
          <PaidByCell
            value={row.original.paidBy}
            paidById={row.original.paidById}
            rowIndex={row.index}
            employeeList={employeeList}
            onUpdate={updateItem}
          />
        ),
        size: 160,
      },
      {
        id: 'expenseDate',
        header: 'Date *',
        cell: ({ row }) => (
          <Input
            type="date"
            value={row.original.expenseDate}
            onChange={(e) => updateItem(row.index, 'expenseDate', e.target.value)}
            className="h-8 border-0 shadow-none focus-visible:ring-1 bg-transparent px-1 text-xs"
          />
        ),
        size: 130,
      },
      {
        id: 'walletId',
        header: 'Company Wallet',
        cell: ({ row }) => (
          <Select
            value={row.original.walletId ?? ''}
            onValueChange={(v) =>
              updateItem(row.index, 'walletId', v === '__none__' ? '' : v)
            }
          >
            <SelectTrigger className="h-8 w-full border-0 shadow-none bg-transparent px-1 text-xs">
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">None</SelectItem>
              {companyWallets.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ),
        size: 130,
      },
      {
        id: 'deductFromWallet',
        header: 'Deduct',
        cell: ({ row }) => {
          const disabled = !row.original.paidById || !!row.original.walletId;
          return (
            <div className="flex justify-center">
              <Checkbox
                checked={disabled ? false : row.original.deductFromWallet}
                disabled={disabled}
                onCheckedChange={(checked) =>
                  updateItem(row.index, 'deductFromWallet', checked === true)
                }
              />
            </div>
          );
        },
        size: 64,
        enableResizing: false,
      },
      {
        id: 'notes',
        header: 'Notes',
        cell: ({ row }) => (
          <Input
            value={row.original.notes}
            onChange={(e) => updateItem(row.index, 'notes', e.target.value)}
            placeholder="—"
            className="h-8 border-0 shadow-none focus-visible:ring-1 bg-transparent px-1 text-xs"
          />
        ),
        size: 120,
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={() => removeRow(row.index)}
            disabled={rows.length <= 1}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        ),
        size: 40,
        enableResizing: false,
      },
    ],
    [updateItem, removeRow, rows.length, employeeList, allEmployees, allContractors, companyWallets]
  );

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const navigableColumnIds = ['title', 'category', 'amount', 'paymentMethod', 'paidTo', 'paidBy', 'expenseDate', 'walletId', 'notes'];

  useEffect(() => {
    const target = focusAfterRender.current;
    if (!target) return;
    focusAfterRender.current = null;
    const key = `${target.row}-${target.col}`;
    const cell = cellRefs.current.get(key);
    if (!cell) return;
    const focusable = cell.querySelector<HTMLElement>('input, button, [tabindex]:not([tabindex="-1"])');
    if (!focusable) return;
    const raf = requestAnimationFrame(() => focusable.focus());
    return () => cancelAnimationFrame(raf);
  }, [rows.length]);

  const handleCellKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;

      const td = (e.target as HTMLElement).closest<HTMLTableCellElement>('[data-cell-key]');
      if (!td) return;
      const cellKey = td.dataset.cellKey;
      if (!cellKey) return;

      const [rowStr, colId] = cellKey.split('-');
      const rowIndex = parseInt(rowStr, 10);
      const colIndex = navigableColumnIds.indexOf(colId);
      if (colIndex === -1) return;

      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && e.target instanceof HTMLInputElement) {
        const input = e.target;
        if (e.key === 'ArrowLeft' && (input.selectionStart ?? 0) !== 0) return;
        if (e.key === 'ArrowRight' && (input.selectionEnd ?? 0) !== input.value.length) return;
      }

      e.preventDefault();

      let targetRow = rowIndex;
      let targetCol = colIndex;

      switch (e.key) {
        case 'ArrowUp':
          targetRow = Math.max(0, rowIndex - 1);
          break;
        case 'ArrowDown':
          targetRow = rowIndex + 1;
          break;
        case 'ArrowLeft':
          targetCol = Math.max(0, colIndex - 1);
          break;
        case 'ArrowRight':
          targetCol = Math.min(navigableColumnIds.length - 1, colIndex + 1);
          break;
      }

      if (e.key === 'ArrowDown' && targetRow >= rows.length) {
        addRow();
        focusAfterRender.current = { row: rows.length, col: navigableColumnIds[colIndex] };
        return;
      }

      targetRow = Math.min(targetRow, rows.length - 1);
      if (targetRow === rowIndex && targetCol === colIndex) return;

      const targetKey = `${targetRow}-${navigableColumnIds[targetCol]}`;
      const targetCell = cellRefs.current.get(targetKey);
      if (!targetCell) return;

      const focusable = targetCell.querySelector<HTMLElement>('input, button, [tabindex]:not([tabindex="-1"])');
      focusable?.focus();
    },
    [rows.length, addRow]
  );

  const validRows = useMemo(
    () =>
      rows.filter(
        (r) =>
          r.title &&
          r.category &&
          r.amount > 0 &&
          r.paymentMethod &&
          r.paidTo &&
          r.paidBy &&
          r.expenseDate
      ),
    [rows]
  );

  const totalAmount = useMemo(
    () => rows.reduce((sum, r) => sum + (r.amount || 0), 0),
    [rows]
  );

  const handleSubmit = useCallback(async () => {
    if (useShamsi) {
      const g = shamsiToGregorian(globalShamsiDate);
      if (!g) {
        toast.error('Invalid Shamsi date. Use the format 1404/05/03.');
        return;
      }
    }

    const valid = rows.filter(
      (r) =>
        r.title &&
        r.category &&
        r.amount > 0 &&
        r.paymentMethod &&
        r.paidTo &&
        r.paidBy &&
        r.expenseDate
    );

    if (valid.length === 0) {
      toast.error('No valid rows to save. Complete all required fields for at least one row.');
      return;
    }

    const invalid = rows.length - valid.length;
    if (invalid > 0) {
      toast.warning(`${invalid} row(s) are incomplete and will be skipped.`);
    }

    setIsSubmitting(true);
    try {
      const records: BulkExpenseRecord[] = valid.map((r) => ({
        title: r.title,
        category: r.category as Category,
        amount: r.amount,
        paymentMethod: r.paymentMethod as PaymentMethod,
        paidTo: r.paidTo,
        paidToId: r.paidToId ?? null,
        paidToContractorId: r.paidToContractorId ?? null,
        paidBy: r.paidBy,
        expenseDate: r.expenseDate,
        paidById: r.paidById ?? null,
        walletId: r.walletId ?? null,
        deductFromWallet: r.walletId ? false : r.deductFromWallet,
        notes: r.notes || null,
      }));

      const res = await bulkCreateExpenses.mutateAsync(records);
      toast.success(res.message ?? `${valid.length} expenses created successfully`);
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create expenses';
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }, [rows, useShamsi, globalShamsiDate, bulkCreateExpenses, onSuccess, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[98vw] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="size-5 text-emerald-600" />
            Batch Expense Entry
          </DialogTitle>
          <DialogDescription>
            Add multiple expenses at once. Each row represents one expense.
          </DialogDescription>
        </DialogHeader>

        {/* Global Settings */}
        <div className="flex items-center gap-4 py-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground whitespace-nowrap">Date:</span>
            {useShamsi ? (
              <Input
                value={globalShamsiDate}
                onChange={(e) => handleGlobalShamsiChange(e.target.value)}
                placeholder="1404/05/03"
                className="h-8 w-[120px] text-xs"
              />
            ) : (
              <Input
                type="date"
                value={globalDate}
                onChange={(e) => handleGlobalDateChange(e.target.value)}
                className="h-8 w-[150px] text-xs"
              />
            )}
            <button
              type="button"
              role="switch"
              aria-checked={useShamsi}
              onClick={handleToggleShamsi}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors ${
                useShamsi ? 'bg-emerald-600' : 'bg-input'
              }`}
            >
              <span
                className={`pointer-events-none block h-4 w-4 rounded-full bg-white shadow-lg ring-0 transition-transform ${
                  useShamsi ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
            <span className="text-xs text-muted-foreground whitespace-nowrap">Shamsi</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">Category:</span>
            <Select value={globalCategory} onValueChange={handleGlobalCategoryChange}>
              <SelectTrigger className="h-8 w-[170px] text-xs">
                <SelectValue placeholder="All rows" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {CATEGORY_LABELS[cat]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">Payment:</span>
            <Select value={globalPaymentMethod} onValueChange={handleGlobalPaymentMethodChange}>
              <SelectTrigger className="h-8 w-[150px] text-xs">
                <SelectValue placeholder="All rows" />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((pm) => (
                  <SelectItem key={pm} value={pm}>
                    {PAYMENT_METHOD_LABELS[pm]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">Paid To:</span>
            <Popover open={globalPaidToPopoverOpen} onOpenChange={setGlobalPaidToPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className="h-8 w-[180px] justify-between text-xs font-normal"
                >
                  <span className="truncate">
                    {globalPaidToId
                      ? allEmployees.find((e) => e.id === globalPaidToId)?.fullName ?? globalPaidTo
                      : globalPaidToContractorId
                        ? allContractors.find((c) => c.id === globalPaidToContractorId)?.contractorName ?? globalPaidTo
                        : globalPaidTo || 'All rows'}
                  </span>
                  <ChevronDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[340px] p-0">
                <div className="flex items-center gap-1 p-2 border-b">
                  {PAID_TO_MODES.map((m) => (
                    <Button
                      key={m.value}
                      type="button"
                      variant={globalPaidToMode === m.value ? 'default' : 'ghost'}
                      size="sm"
                      className={`h-6 text-xs px-2 ${globalPaidToMode === m.value ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}`}
                      onClick={() => handleGlobalPaidToModeChange(m.value)}
                    >
                      {m.label}
                    </Button>
                  ))}
                </div>
                {globalPaidToMode === 'employee' && (
                  <Command>
                    <CommandInput placeholder="Search employee..." />
                    <CommandList>
                      <CommandEmpty>No employee found.</CommandEmpty>
                      {allEmployees.map((emp) => (
                        <CommandItem
                          key={emp.id}
                          value={emp.fullName}
                          onSelect={() => {
                            handleGlobalPaidToChange(emp.id, undefined, emp.fullName);
                            setGlobalPaidToPopoverOpen(false);
                          }}
                        >
                          <Check
                            className="mr-2 h-4 w-4"
                            style={{ opacity: globalPaidToId === emp.id ? 1 : 0 }}
                          />
                          <span className="flex flex-1 items-center justify-between gap-2">
                            <span className="truncate">
                              {emp.fullName} — {emp.jobTitle} ({DEPARTMENT_LABELS[emp.department as Department] ?? emp.department})
                            </span>
                            {emp.status !== 'ACTIVE' && (
                              <span className="text-xs text-muted-foreground shrink-0">
                                {EMPLOYEE_STATUS_LABELS[emp.status as EmployeeStatus]}
                              </span>
                            )}
                          </span>
                        </CommandItem>
                      ))}
                    </CommandList>
                  </Command>
                )}
                {globalPaidToMode === 'contractor' && (
                  <Command>
                    <CommandInput placeholder="Search contractor..." />
                    <CommandList>
                      <CommandEmpty>No contractor found.</CommandEmpty>
                      {allContractors.map((c) => (
                        <CommandItem
                          key={c.id}
                          value={c.contractorName}
                          onSelect={() => {
                            handleGlobalPaidToChange(undefined, c.id, c.contractorName);
                            setGlobalPaidToPopoverOpen(false);
                          }}
                        >
                          <Check
                            className="mr-2 h-4 w-4"
                            style={{ opacity: globalPaidToContractorId === c.id ? 1 : 0 }}
                          />
                          <span className="flex flex-1 items-center justify-between gap-2">
                            <span className="truncate">{c.contractorName}</span>
                            {c.status !== 'ACTIVE' && (
                              <span className="text-xs text-muted-foreground shrink-0">
                                {CONTRACTOR_STATUS_LABELS[c.status as ContractorStatus]}
                              </span>
                            )}
                          </span>
                        </CommandItem>
                      ))}
                    </CommandList>
                  </Command>
                )}
                {globalPaidToMode === 'custom' && (
                  <div className="p-2">
                    <Input
                      placeholder="Type a custom recipient name..."
                      value={paidToCustomDraft}
                      onChange={(e) => setPaidToCustomDraft(e.target.value)}
                      className="h-8 text-xs"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="mt-1 h-7 w-full text-xs"
                      disabled={!paidToCustomDraft.trim()}
                      onClick={() => {
                        handleGlobalPaidToChange(undefined, undefined, paidToCustomDraft.trim());
                        setPaidToCustomDraft('');
                        setGlobalPaidToPopoverOpen(false);
                      }}
                    >
                      Use &quot;{paidToCustomDraft.trim()}&quot; as recipient
                    </Button>
                  </div>
                )}
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">Paid By:</span>
            <Popover open={globalPaidByPopoverOpen} onOpenChange={setGlobalPaidByPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className="h-8 w-[180px] justify-between text-xs font-normal"
                >
                  <span className="truncate">
                    {globalPaidById
                      ? employeeList.find((e) => e.id === globalPaidById)?.fullName ?? globalPaidBy
                      : globalPaidBy || 'All rows'}
                  </span>
                  <ChevronDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[340px] p-0">
                <div className="p-2 border-b">
                  <Input
                    placeholder="Type a custom payer name..."
                    value={paidByCustomDraft}
                    onChange={(e) => setPaidByCustomDraft(e.target.value)}
                    className="h-8 text-xs"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="mt-1 h-7 w-full text-xs"
                    disabled={!paidByCustomDraft.trim()}
                    onClick={() => {
                      handleGlobalPaidByChange(undefined, paidByCustomDraft.trim());
                      setPaidByCustomDraft('');
                      setGlobalPaidByPopoverOpen(false);
                    }}
                  >
                    Use &quot;{paidByCustomDraft.trim()}&quot; as payer
                  </Button>
                </div>
                <Command>
                  <CommandInput placeholder="Search employee..." />
                  <CommandList>
                    <CommandEmpty>No employee found.</CommandEmpty>
                    {employeeList.map((emp) => (
                      <CommandItem
                        key={emp.id}
                        value={emp.fullName}
                        onSelect={() => {
                          handleGlobalPaidByChange(emp.id, emp.fullName);
                          setGlobalPaidByPopoverOpen(false);
                        }}
                      >
                        <Check
                          className="mr-2 h-4 w-4"
                          style={{ opacity: globalPaidById === emp.id ? 1 : 0 }}
                        />
                        {emp.fullName} — {emp.jobTitle} (
                        {DEPARTMENT_LABELS[emp.department as Department] ?? emp.department})
                      </CommandItem>
                    ))}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">Wallet:</span>
            <Select
              value={globalWalletId || '__none__'}
              onValueChange={handleGlobalWalletChange}
            >
              <SelectTrigger className="h-8 w-[150px] text-xs">
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {companyWallets.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">Deduct:</span>
            <Checkbox
              checked={globalWalletId ? false : globalDeductFromWallet}
              disabled={!!globalWalletId}
              onCheckedChange={(checked) => handleGlobalDeductChange(checked === true)}
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">Notes:</span>
            <Input
              value={globalNotes}
              onChange={(e) => handleGlobalNotesChange(e.target.value)}
              className="h-8 w-[140px] text-xs"
              placeholder="—"
            />
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between gap-2 py-1">
          <Button type="button" size="sm" variant="outline" onClick={addRow}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add Row
          </Button>
        </div>

        {/* Grid */}
        <div
          onKeyDown={handleCellKeyDown}
          className="flex-1 min-h-0 border rounded-md overflow-auto"
        >
          {isLoadingData ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <ScrollArea className="h-full">
              <Table>
                <TableHeader>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <TableRow key={headerGroup.id}>
                      {headerGroup.headers.map((header) => (
                        <TableHead
                          key={header.id}
                          style={{
                            width: header.getSize() !== 150 ? header.getSize() : undefined,
                            minWidth: header.getSize() !== 150 ? header.getSize() : undefined,
                          }}
                          className="bg-muted/50 text-xs font-semibold uppercase tracking-wider whitespace-nowrap"
                        >
                          {header.isPlaceholder
                            ? null
                            : flexRender(header.column.columnDef.header, header.getContext())}
                        </TableHead>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {table.getRowModel().rows.length > 0 ? (
                    table.getRowModel().rows.map((row) => (
                      <TableRow key={row.id} className="group hover:bg-muted/30">
                        {row.getVisibleCells().map((cell) => (
                          <TableCell
                            key={cell.id}
                            data-cell-key={`${row.index}-${cell.column.id}`}
                            ref={(el) => {
                              const key = `${row.index}-${cell.column.id}`;
                              if (el) cellRefs.current.set(key, el);
                              else cellRefs.current.delete(key);
                            }}
                            className="py-1 px-1.5"
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={columns.length}
                        className="h-32 text-center text-muted-foreground"
                      >
                        No rows. Click "Add Row" to get started.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </div>

        {/* Summary Bar */}
        <div className="flex items-center justify-between gap-3 px-3 py-2 bg-muted/30 rounded-md border">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>Rows: {rows.length}</span>
            <span className="text-muted-foreground">|</span>
            <span>Valid: {validRows.length}</span>
            <span className="text-muted-foreground">|</span>
            <span>
              Total:{' '}
              <span className="font-mono tabular-nums">
                Afs {totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
            </span>
          </div>
          {validRows.length < rows.length && rows.length > 0 && (
            <span className="text-xs text-amber-600">
              {rows.length - validRows.length} row(s) need required fields
            </span>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || validRows.length === 0}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save {validRows.length > 0 ? `${validRows.length} Expense${validRows.length > 1 ? 's' : ''}` : 'Expenses'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
