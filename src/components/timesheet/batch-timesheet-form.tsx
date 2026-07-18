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
  Clock,
  Calendar,
  Check,
  ChevronDown,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { timesheetsApi, machineryApi } from '@/services/contractor-api';
import type {
  BulkTimesheetRecord,
  BulkTimesheetRequest,
  MachineryRate,
} from '@/types/contractor';

interface BatchTimesheetRow {
  id: string;
  contractorId: string;
  machineryId: string;
  machineryRateId?: string;
  operatorName: string;
  workSite: string;
  date: string;
  startTime: string;
  lunchStart: string;
  lunchEnd: string;
  endTime: string;
  totalHours: number;
  overtimeHours: number;
  notes: string;
}

interface MachineryOption {
  id: string;
  machineryName: string;
  machineryType: string;
  plateNumber?: string | null;
  driverName?: string | null;
  assignedContractorId: string;
}

interface BatchTimesheetFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface MachineryCellProps {
  value: string;
  rowIndex: number;
  machineryList: MachineryOption[];
  onUpdate: (index: number, field: keyof BatchTimesheetRow, value: string | number) => void;
}

function MachineryCell({ value, rowIndex, machineryList, onUpdate }: MachineryCellProps) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className="h-8 w-full justify-between border-0 shadow-none focus-visible:ring-1 bg-transparent px-1 text-xs font-normal"
        >
          {value
            ? (() => {
                const m = machineryList.find((m) => m.id === value);
                if (!m) return 'Select...';
                return (
                  <span className="truncate">
                    {m.machineryName}
                    {m.plateNumber && <span className="ml-1 text-muted-foreground">[{m.plateNumber}]</span>}
                  </span>
                );
              })()
            : 'Search machinery...'}
          <ChevronDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0">
        <Command>
          <CommandInput placeholder="Search by name, plate, driver, or type..." />
          <CommandList>
            <CommandEmpty>No machinery found.</CommandEmpty>
            {machineryList.map((m) => (
              <CommandItem
                key={m.id}
                value={`${m.machineryName} ${m.plateNumber ?? ''} ${m.driverName ?? ''} ${m.machineryType}`}
                onSelect={() => {
                  onUpdate(rowIndex, 'machineryId', m.id);
                  setOpen(false);
                }}
              >
                <Check
                  className="mr-2 h-4 w-4"
                  style={{ opacity: value === m.id ? 1 : 0 }}
                />
                <span>{m.machineryName}</span>
                {m.plateNumber && (
                  <span className="ml-1.5 text-muted-foreground">[{m.plateNumber}]</span>
                )}
                {m.driverName && (
                  <span className="ml-1.5 text-muted-foreground">- {m.driverName}</span>
                )}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

interface MachineryRateCellProps {
  machineryId: string;
  value?: string;
  rowIndex: number;
  rates: MachineryRate[];
  onUpdate: (index: number, field: keyof BatchTimesheetRow, value: string | number) => void;
}

function MachineryRateCell({ machineryId, value, rowIndex, rates, onUpdate }: MachineryRateCellProps) {
  const [open, setOpen] = useState(false);
  const filtered = machineryId ? rates : [];
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className="h-8 w-full justify-between border-0 shadow-none focus-visible:ring-1 bg-transparent px-1 text-xs font-normal"
          disabled={!machineryId}
        >
          {value
            ? (() => {
                const r = filtered.find((r) => r.id === value);
                return r ? <span className="truncate">{r.rateName}</span> : 'Default';
              })()
            : 'Default'}
          <ChevronDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-0">
        <Command>
          <CommandInput placeholder="Search rate tier..." />
          <CommandList>
            <CommandEmpty>No rates available.</CommandEmpty>
            {filtered.map((r) => (
              <CommandItem
                key={r.id}
                value={r.rateName}
                onSelect={() => {
                  onUpdate(rowIndex, 'machineryRateId', r.id);
                  setOpen(false);
                }}
              >
                <Check
                  className="mr-2 h-4 w-4"
                  style={{ opacity: value === r.id ? 1 : 0 }}
                />
                <span>{r.rateName}</span>
                <span className="ml-auto text-muted-foreground text-xs">
                  {r.rateName === 'Default' ? `${r.hourlyRate}/hr` : `${r.monthlyRate}/mo`}
                </span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function calculateRowHours(
  startTime: string,
  lunchStart: string,
  lunchEnd: string,
  endTime: string
): { totalHours: number; overtimeHours: number } {
  function parseMinutes(val: string): number {
    if (!val) return -1;
    const [h, m] = val.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return -1;
    return h * 60 + m;
  }

  const s = parseMinutes(startTime);
  const ls = parseMinutes(lunchStart);
  const le = parseMinutes(lunchEnd);
  const e = parseMinutes(endTime);

  let total = 0;

  if (ls < 0 || le < 0) {
    if (s >= 0 && e > s) total = (e - s) / 60;
  } else {
    if (s >= 0 && ls > s) total += (ls - s) / 60;
    if (le >= 0 && e > le) total += (e - le) / 60;
  }

  total = Math.round(total * 100) / 100;
  const ot = Math.max(0, Math.round((total - 9) * 100) / 100);

  return { totalHours: total, overtimeHours: ot };
}

let idCounter = 0;
function generateId() {
  idCounter += 1;
  return `batch_${Date.now()}_${idCounter}`;
}

function createEmptyRow(
  date: string,
  overrides?: Partial<BatchTimesheetRow>
): BatchTimesheetRow {
  const startTime = overrides?.startTime ?? '07:00';
  const lunchStart = overrides?.lunchStart ?? '12:00';
  const lunchEnd = overrides?.lunchEnd ?? '13:00';
  const endTime = overrides?.endTime ?? '17:00';
  const hours = calculateRowHours(startTime, lunchStart, lunchEnd, endTime);
  return {
    id: generateId(),
    contractorId: overrides?.contractorId ?? '',
    machineryId: overrides?.machineryId ?? '',
    machineryRateId: undefined,
    operatorName: '',
    workSite: overrides?.workSite ?? '',
    date,
    startTime,
    lunchStart,
    lunchEnd,
    endTime,
    totalHours: hours.totalHours,
    overtimeHours: hours.overtimeHours,
    notes: overrides?.notes ?? '',
  };
}

export function BatchTimesheetForm({ open, onOpenChange, onSuccess }: BatchTimesheetFormProps) {
  const [rows, setRows] = useState<BatchTimesheetRow[]>([]);
  const [globalDate, setGlobalDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [globalMachineryId, setGlobalMachineryId] = useState('');
  const [globalMachineryRateId, setGlobalMachineryRateId] = useState('');
  const [globalStartTime, setGlobalStartTime] = useState('07:00');
  const [globalLunchStart, setGlobalLunchStart] = useState('12:00');
  const [globalLunchEnd, setGlobalLunchEnd] = useState('13:00');
  const [globalEndTime, setGlobalEndTime] = useState('17:00');
  const [globalWorkSite, setGlobalWorkSite] = useState('');
  const [globalNotes, setGlobalNotes] = useState('');
  const [machineryList, setMachineryList] = useState<MachineryOption[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [globalMachineryPopoverOpen, setGlobalMachineryPopoverOpen] = useState(false);
  const [machineryRatesMap, setMachineryRatesMap] = useState<Map<string, MachineryRate[]>>(new Map());
  const machineryRatesRef = useRef(machineryRatesMap);
  machineryRatesRef.current = machineryRatesMap;
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const cellRefs = useRef<Map<string, HTMLTableCellElement>>(new Map());
  const focusAfterRender = useRef<{ row: number; col: string } | null>(null);

  useEffect(() => {
    if (open) {
      idCounter = 0;
      const today = format(new Date(), 'yyyy-MM-dd');
      setGlobalDate(today);
      setGlobalMachineryId('');
      setGlobalStartTime('07:00');
      setGlobalLunchStart('12:00');
      setGlobalLunchEnd('13:00');
      setGlobalEndTime('17:00');
      setGlobalWorkSite('');
      setGlobalNotes('');
        setGlobalMachineryRateId('');
    setIsLoadingData(true);

      machineryApi.getAll({ pageSize: 1000, statuses: ['OPERATIONAL', 'UNDER_MAINTENANCE'] })
        .then((res) => {
          if (res.data?.data) {
            setMachineryList(res.data.data as unknown as MachineryOption[]);
          }
        })
        .finally(() => setIsLoadingData(false));

      setRows([createEmptyRow(today)]);
    }
  }, [open]);

  const handleGlobalDateChange = useCallback((value: string) => {
    setGlobalDate(value);
    setRows((prev) => prev.map((r) => ({ ...r, date: value })));
  }, []);

  const fetchRatesForMachinery = useCallback(async (machineryId: string) => {
    if (machineryRatesRef.current.has(machineryId)) return;
    try {
      const res = await machineryApi.getRates(machineryId);
      if (res.data) {
        setMachineryRatesMap((prev) => {
          const next = new Map(prev);
          next.set(machineryId, res.data!);
          return next;
        });
      }
    } catch {
      // ignore
    }
  }, []);

  const getDefaultRateId = useCallback((machineryId: string): string | undefined => {
    const rates = machineryRatesRef.current.get(machineryId);
    return rates?.find((r) => r.isDefault)?.id ?? rates?.[0]?.id;
  }, []);

  const handleGlobalMachineryChange = useCallback((value: string) => {
    setGlobalMachineryId(value);
    const selected = machineryList.find((m) => m.id === value);
    fetchRatesForMachinery(value);
    const defaultRateId = getDefaultRateId(value);
    setGlobalMachineryRateId(defaultRateId ?? '');
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        machineryId: value,
        machineryRateId: defaultRateId,
        contractorId: selected?.assignedContractorId ?? '',
      }))
    );
  }, [machineryList, fetchRatesForMachinery, getDefaultRateId]);

  const handleGlobalTimeChange = useCallback(
    (field: 'startTime' | 'lunchStart' | 'lunchEnd' | 'endTime', value: string) => {
      const setters = {
        startTime: setGlobalStartTime,
        lunchStart: setGlobalLunchStart,
        lunchEnd: setGlobalLunchEnd,
        endTime: setGlobalEndTime,
      };
      setters[field](value);
      setRows((prev) =>
        prev.map((r) => {
          const updated = { ...r, [field]: value };
          const hours = calculateRowHours(
            updated.startTime,
            updated.lunchStart,
            updated.lunchEnd,
            updated.endTime
          );
          return { ...updated, ...hours };
        })
      );
    },
    []
  );

  const handleGlobalRateChange = useCallback((value: string) => {
    setGlobalMachineryRateId(value);
    setRows((prev) =>
      prev.map((r) => ({ ...r, machineryRateId: value || undefined }))
    );
  }, []);

  const handleGlobalWorkSiteChange = useCallback((value: string) => {
    setGlobalWorkSite(value);
    setRows((prev) => prev.map((r) => ({ ...r, workSite: value })));
  }, []);

  const handleGlobalNotesChange = useCallback((value: string) => {
    setGlobalNotes(value);
    setRows((prev) => prev.map((r) => ({ ...r, notes: value })));
  }, []);

  const updateItem = useCallback(
    (index: number, field: keyof BatchTimesheetRow, value: string | number) => {
      if (field === 'machineryId') {
        const selectedMachinery = machineryList.find((m) => m.id === value);
        const machId = String(value);
        fetchRatesForMachinery(machId);
        const defaultRateId = getDefaultRateId(machId);
        setRows((prev) => {
          const updated = prev.map((r) => ({ ...r }));
          const target = updated[index];
          if (!target) return prev;
          target.machineryId = machId;
          target.machineryRateId = defaultRateId;
          target.contractorId = selectedMachinery?.assignedContractorId ?? '';
          return updated;
        });
      } else if (field === 'startTime' || field === 'lunchStart' || field === 'lunchEnd' || field === 'endTime') {
        setRows((prev) => {
          const updated = prev.map((r) => ({ ...r }));
          const target = updated[index];
          if (!target) return prev;
          (target as any)[field] = value;
          const hours = calculateRowHours(
            target.startTime,
            target.lunchStart,
            target.lunchEnd,
            target.endTime
          );
          target.totalHours = hours.totalHours;
          target.overtimeHours = hours.overtimeHours;
          return updated;
        });
      } else {
        setRows((prev) => {
          const updated = prev.map((r) => ({ ...r }));
          const target = updated[index];
          if (!target) return prev;
          (target as any)[field] = value;
          return updated;
        });
      }
    },
    [machineryList, fetchRatesForMachinery, getDefaultRateId]
  );

  const removeRow = useCallback((index: number) => {
    setRows((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const addRow = useCallback(() => {
    const selected = globalMachineryId
      ? machineryList.find((m) => m.id === globalMachineryId)
      : undefined;
    setRows((prev) => [
      ...prev,
      createEmptyRow(globalDate, {
        machineryId: globalMachineryId,
        contractorId: selected?.assignedContractorId ?? '',
        startTime: globalStartTime,
        lunchStart: globalLunchStart,
        lunchEnd: globalLunchEnd,
        endTime: globalEndTime,
        workSite: globalWorkSite,
        notes: globalNotes,
      }),
    ]);
  }, [globalDate, globalMachineryId, machineryList, globalStartTime, globalLunchStart, globalLunchEnd, globalEndTime, globalWorkSite, globalNotes]);

  const columns = useMemo<ColumnDef<BatchTimesheetRow>[]>(
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
        id: 'machineryId',
        header: 'Machinery *',
        cell: ({ row }) => (
          <MachineryCell
            value={row.original.machineryId}
            rowIndex={row.index}
            machineryList={machineryList}
            onUpdate={updateItem}
          />
        ),
        size: 260,
      },
      {
        id: 'machineryRateId',
        header: 'Rate Tier',
        cell: ({ row }) => (
          <MachineryRateCell
            machineryId={row.original.machineryId}
            value={row.original.machineryRateId}
            rowIndex={row.index}
            rates={machineryRatesMap.get(row.original.machineryId) ?? []}
            onUpdate={updateItem}
          />
        ),
        size: 120,
      },
      {
        id: 'operatorName',
        header: 'Operator',
        cell: ({ row }) => (
          <Input
            value={row.original.operatorName}
            onChange={(e) => updateItem(row.index, 'operatorName', e.target.value)}
            placeholder="—"
            className="h-8 border-0 shadow-none focus-visible:ring-1 bg-transparent px-1 text-xs"
          />
        ),
        size: 100,
      },
      {
        id: 'workSite',
        header: 'Work Site',
        cell: ({ row }) => (
          <Input
            value={row.original.workSite}
            onChange={(e) => updateItem(row.index, 'workSite', e.target.value)}
            placeholder="—"
            className="h-8 border-0 shadow-none focus-visible:ring-1 bg-transparent px-1 text-xs"
          />
        ),
        size: 100,
      },
      {
        id: 'date',
        header: 'Date',
        cell: ({ row }) => (
          <Input
            type="date"
            value={row.original.date}
            onChange={(e) => updateItem(row.index, 'date', e.target.value)}
            className="h-8 border-0 shadow-none focus-visible:ring-1 bg-transparent px-1 text-xs"
          />
        ),
        size: 120,
      },
      {
        id: 'startTime',
        header: 'AM Start',
        cell: ({ row }) => (
          <Input
            type="text"
            placeholder="HH:mm"
            inputMode="numeric"
            value={row.original.startTime}
            onChange={(e) => updateItem(row.index, 'startTime', e.target.value)}
            className="h-8 border-0 shadow-none focus-visible:ring-1 bg-transparent px-1 text-xs"
          />
        ),
        size: 90,
      },
      {
        id: 'lunchStart',
        header: 'AM End',
        cell: ({ row }) => (
          <Input
            type="text"
            placeholder="HH:mm"
            inputMode="numeric"
            value={row.original.lunchStart}
            onChange={(e) => updateItem(row.index, 'lunchStart', e.target.value)}
            className="h-8 border-0 shadow-none focus-visible:ring-1 bg-transparent px-1 text-xs"
          />
        ),
        size: 90,
      },
      {
        id: 'lunchEnd',
        header: 'PM Start',
        cell: ({ row }) => (
          <Input
            type="text"
            placeholder="HH:mm"
            inputMode="numeric"
            value={row.original.lunchEnd}
            onChange={(e) => updateItem(row.index, 'lunchEnd', e.target.value)}
            className="h-8 border-0 shadow-none focus-visible:ring-1 bg-transparent px-1 text-xs"
          />
        ),
        size: 90,
      },
      {
        id: 'endTime',
        header: 'PM End',
        cell: ({ row }) => (
          <Input
            type="text"
            placeholder="HH:mm"
            inputMode="numeric"
            value={row.original.endTime}
            onChange={(e) => updateItem(row.index, 'endTime', e.target.value)}
            className="h-8 border-0 shadow-none focus-visible:ring-1 bg-transparent px-1 text-xs"
          />
        ),
        size: 90,
      },
      {
        id: 'totalHours',
        header: 'Hours',
        cell: ({ row }) => (
          <span className="font-mono tabular-nums text-xs font-medium">
            {row.original.totalHours.toFixed(2)}
          </span>
        ),
        size: 60,
      },
      {
        id: 'overtimeHours',
        header: 'OT',
        cell: ({ row }) => (
          <span className="font-mono tabular-nums text-xs font-medium">
            {row.original.overtimeHours.toFixed(2)}
          </span>
        ),
        size: 50,
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
        size: 100,
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
        size: 44,
        enableResizing: false,
      },
    ],
    [updateItem, removeRow, rows.length, machineryList]
  );

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    defaultColumn: {
      enableResizing: true,
    },
  });

  const navigableColumnIds = ['machineryId', 'machineryRateId', 'operatorName', 'workSite', 'date', 'startTime', 'lunchStart', 'lunchEnd', 'endTime', 'notes'];

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

  const handleCellKeyDown = useCallback((e: React.KeyboardEvent) => {
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
  }, [rows.length, addRow]);

  const validRows = useMemo(
    () => rows.filter((r) => r.machineryId),
    [rows]
  );

  const totalHoursAll = useMemo(
    () => rows.reduce((sum, r) => sum + r.totalHours, 0),
    [rows]
  );

  const handleSubmit = useCallback(async () => {
    const valid = rows.filter((r) => r.machineryId);

    if (valid.length === 0) {
      toast.error('No valid rows to save. Select machinery for each row.');
      return;
    }

    const missingContractor = valid.some((r) => !r.contractorId);
    if (missingContractor) {
      toast.error('Some rows have machinery selected but no contractor reference. Reselect machinery for those rows.');
      return;
    }

    setIsSubmitting(true);
    try {
      const records: BulkTimesheetRecord[] = valid.map((r) => ({
        contractorId: r.contractorId,
        machineryId: r.machineryId || undefined,
        machineryRateId: r.machineryRateId || undefined,
        operatorName: r.operatorName || undefined,
        workSite: r.workSite || undefined,
        date: r.date,
        startTime: r.startTime || undefined,
        lunchStart: r.lunchStart || undefined,
        lunchEnd: r.lunchEnd || undefined,
        endTime: r.endTime || undefined,
        totalHours: r.totalHours,
        overtimeHours: r.overtimeHours,
        notes: r.notes || undefined,
      }));

      const payload: BulkTimesheetRequest = { records };

      const res = await timesheetsApi.bulkCreate(payload);
      toast.success(res.message ?? `${valid.length} timesheet records created`);
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create timesheet records';
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }, [rows, onSuccess, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[98vw] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="size-5 text-emerald-600" />
            Batch Timesheet Entry
          </DialogTitle>
          <DialogDescription>
            Add multiple timesheet records at once. Each row represents one record.
          </DialogDescription>
        </DialogHeader>

        {/* Global Settings */}
        <div className="flex items-center gap-4 py-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground whitespace-nowrap">Date:</span>
            <Input
              type="date"
              value={globalDate}
              onChange={(e) => handleGlobalDateChange(e.target.value)}
              className="h-8 w-[150px] text-xs"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">Machinery:</span>
            <Popover open={globalMachineryPopoverOpen} onOpenChange={setGlobalMachineryPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className="h-8 w-[220px] justify-between text-xs font-normal"
                >
                  {globalMachineryId
                    ? (() => {
                        const m = machineryList.find((m) => m.id === globalMachineryId);
                        if (!m) return 'Select...';
                        return (
                          <span className="truncate">
                            {m.machineryName}
                            {m.plateNumber && <span className="ml-1 text-muted-foreground">[{m.plateNumber}]</span>}
                          </span>
                        );
                      })()
                    : 'All rows'}
                  <ChevronDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[320px] p-0">
                <Command>
                  <CommandInput placeholder="Search machinery..." />
                  <CommandList>
                    <CommandEmpty>No machinery found.</CommandEmpty>
                    {machineryList.map((m) => (
                      <CommandItem
                        key={m.id}
                        value={`${m.machineryName} ${m.plateNumber ?? ''} ${m.driverName ?? ''} ${m.machineryType}`}
                        onSelect={() => {
                          handleGlobalMachineryChange(m.id);
                          setGlobalMachineryPopoverOpen(false);
                        }}
                      >
                        <Check
                          className="mr-2 h-4 w-4"
                          style={{ opacity: globalMachineryId === m.id ? 1 : 0 }}
                        />
                        <span>{m.machineryName}</span>
                        {m.plateNumber && (
                          <span className="ml-1.5 text-muted-foreground">[{m.plateNumber}]</span>
                        )}
                        {m.driverName && (
                          <span className="ml-1.5 text-muted-foreground">- {m.driverName}</span>
                        )}
                      </CommandItem>
                    ))}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">Rate Tier:</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className="h-8 w-[160px] justify-between text-xs font-normal"
                  disabled={!globalMachineryId}
                >
                  {globalMachineryRateId
                    ? (() => {
                        const r = machineryRatesMap.get(globalMachineryId)?.find((r) => r.id === globalMachineryRateId);
                        return <span className="truncate">{r?.rateName ?? 'Default'}</span>;
                      })()
                    : 'Default'}
                  <ChevronDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[220px] p-0">
                <Command>
                  <CommandInput placeholder="Search rate tier..." />
                  <CommandList>
                    <CommandEmpty>No rates available.</CommandEmpty>
                    {(machineryRatesMap.get(globalMachineryId) ?? []).map((r) => (
                      <CommandItem
                        key={r.id}
                        value={r.rateName}
                        onSelect={() => handleGlobalRateChange(r.id)}
                      >
                        <Check
                          className="mr-2 h-4 w-4"
                          style={{ opacity: globalMachineryRateId === r.id ? 1 : 0 }}
                        />
                        <span>{r.rateName}</span>
                        <span className="ml-auto text-muted-foreground text-xs">
                          {r.rateName === 'Default' ? `${r.hourlyRate}/hr` : `${r.monthlyRate}/mo`}
                        </span>
                      </CommandItem>
                    ))}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">AM Start:</span>
            <Input
              type="time"
              value={globalStartTime}
              onChange={(e) => handleGlobalTimeChange('startTime', e.target.value)}
              className="h-8 w-[110px] text-xs"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">AM End:</span>
            <Input
              type="time"
              value={globalLunchStart}
              onChange={(e) => handleGlobalTimeChange('lunchStart', e.target.value)}
              className="h-8 w-[110px] text-xs"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">PM Start:</span>
            <Input
              type="time"
              value={globalLunchEnd}
              onChange={(e) => handleGlobalTimeChange('lunchEnd', e.target.value)}
              className="h-8 w-[110px] text-xs"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">PM End:</span>
            <Input
              type="time"
              value={globalEndTime}
              onChange={(e) => handleGlobalTimeChange('endTime', e.target.value)}
              className="h-8 w-[110px] text-xs"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">Site:</span>
            <Input
              value={globalWorkSite}
              onChange={(e) => handleGlobalWorkSiteChange(e.target.value)}
              className="h-8 w-[160px] text-xs"
              placeholder="—"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">Notes:</span>
            <Input
              value={globalNotes}
              onChange={(e) => handleGlobalNotesChange(e.target.value)}
              className="h-8 w-[160px] text-xs"
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
          ref={tableContainerRef}
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
            <span>Hours: {totalHoursAll.toFixed(2)}</span>
          </div>
          {validRows.length < rows.length && rows.length > 0 && (
            <span className="text-xs text-amber-600">
              {rows.length - validRows.length} row(s) need machinery
            </span>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || validRows.length === 0}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save {validRows.length > 0 ? `${validRows.length} Record${validRows.length > 1 ? 's' : ''}` : 'Records'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
