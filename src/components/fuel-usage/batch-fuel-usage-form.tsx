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
  Fuel,
  Calendar,
  Check,
  ChevronDown,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { fuelUsageApi, machineryApi } from '@/services/contractor-api';
import { fuelApi } from '@/services/asset-api';
import type {
  FuelType,
  BulkFuelUsageRecord,
  BulkFuelUsageRequest,
} from '@/types/contractor';
import {
  FUEL_TYPES,
  FUEL_TYPE_LABELS,
} from '@/types/contractor';

interface BatchFuelRow {
  id: string;
  contractorId: string;
  machineryId: string;
  fuelType: string;
  quantity: number;
  unitPrice: number;
  totalCost: number;
  date: string;
  fuelStation: string;
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

interface ContainerOption {
  id: string;
  name: string;
  fuelType?: string | null;
}

interface BatchFuelUsageFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface MachineryCellProps {
  value: string;
  rowIndex: number;
  machineryList: MachineryOption[];
  onUpdate: (index: number, field: keyof BatchFuelRow, value: string | number) => void;
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

let idCounter = 0;
function generateId() {
  idCounter += 1;
  return `batch_${Date.now()}_${idCounter}`;
}

function createEmptyRow(date: string, overrides?: Partial<BatchFuelRow>): BatchFuelRow {
  return {
    id: generateId(),
    contractorId: '',
    machineryId: '',
    fuelType: 'DIESEL',
    quantity: 0,
    unitPrice: overrides?.unitPrice ?? 0,
    totalCost: 0,
    date,
    fuelStation: overrides?.fuelStation ?? '',
    notes: overrides?.notes ?? '',
  };
}

export function BatchFuelUsageForm({ open, onOpenChange, onSuccess }: BatchFuelUsageFormProps) {
  const [rows, setRows] = useState<BatchFuelRow[]>([]);
  const [globalDate, setGlobalDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [globalContainer, setGlobalContainer] = useState('');
  const [globalUnitPrice, setGlobalUnitPrice] = useState(0);
  const [globalFuelStation, setGlobalFuelStation] = useState('');
  const [globalNotes, setGlobalNotes] = useState('');
  const [machineryList, setMachineryList] = useState<MachineryOption[]>([]);
  const [containers, setContainers] = useState<ContainerOption[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const cellRefs = useRef<Map<string, HTMLTableCellElement>>(new Map());
  const focusAfterRender = useRef<{ row: number; col: string } | null>(null);

  useEffect(() => {
    if (open) {
      idCounter = 0;
      const today = format(new Date(), 'yyyy-MM-dd');
      setGlobalDate(today);
      setGlobalContainer('');
      setGlobalUnitPrice(0);
      setGlobalFuelStation('');
      setGlobalNotes('');
      setIsLoadingData(true);

      Promise.all([
        machineryApi.getAll({ pageSize: 1000, statuses: ['OPERATIONAL', 'UNDER_MAINTENANCE'] }),
        fuelApi.getContainers(),
      ])
        .then(([machRes, contRes]) => {
          if (machRes.data?.data) {
            setMachineryList(machRes.data.data as unknown as MachineryOption[]);
          }
          if (contRes.data) {
            setContainers(
              (contRes.data as unknown as Array<{ id: string; name: string; isMainContainer: boolean; fuelType?: string }>)
                .filter((c) => !c.isMainContainer)
                .map((c) => ({ id: c.id, name: c.name, fuelType: c.fuelType }))
            );
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

  const handleGlobalPriceChange = useCallback((value: string) => {
    const numVal = parseFloat(value) || 0;
    setGlobalUnitPrice(numVal);
    setRows((prev) =>
      prev.map((r) => {
        const unitPrice = numVal;
        const totalCost = Math.round((r.quantity || 0) * unitPrice * 100) / 100;
        return { ...r, unitPrice, totalCost };
      })
    );
  }, []);

  const handleGlobalFuelStationChange = useCallback((value: string) => {
    setGlobalFuelStation(value);
    setRows((prev) => prev.map((r) => ({ ...r, fuelStation: value })));
  }, []);

  const handleGlobalNotesChange = useCallback((value: string) => {
    setGlobalNotes(value);
    setRows((prev) => prev.map((r) => ({ ...r, notes: value })));
  }, []);

  const updateItem = useCallback(
    (index: number, field: keyof BatchFuelRow, value: string | number) => {
      if (field === 'machineryId') {
        const selectedMachinery = machineryList.find((m) => m.id === value);
        setRows((prev) => {
          const updated = prev.map((r) => ({ ...r }));
          const target = updated[index];
          if (!target) return prev;
          target.machineryId = String(value);
          target.contractorId = selectedMachinery?.assignedContractorId ?? '';
          return updated;
        });
      } else {
        setRows((prev) => {
          const updated = prev.map((r) => ({ ...r }));
          const target = updated[index];
          if (!target) return prev;

          if (field === 'quantity' || field === 'unitPrice') {
            const numVal = typeof value === 'string' ? parseFloat(value) || 0 : value;
            (target as any)[field] = numVal;
            target.totalCost = Math.round(target.quantity * target.unitPrice * 100) / 100;
          } else if (field === 'contractorId') {
            target.contractorId = String(value);
            target.machineryId = '';
          } else {
            (target as any)[field] = value;
          }

          return updated;
        });
      }
    },
    [machineryList]
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
        unitPrice: globalUnitPrice,
        fuelStation: globalFuelStation,
        notes: globalNotes,
      }),
    ]);
  }, [globalDate, globalUnitPrice, globalFuelStation, globalNotes]);

  const columns = useMemo<ColumnDef<BatchFuelRow>[]>(
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
        id: 'fuelType',
        header: 'Fuel Type *',
        cell: ({ row }) => (
          <Select
            value={row.original.fuelType}
            onValueChange={(v) => updateItem(row.index, 'fuelType', v)}
          >
            <SelectTrigger className="h-8 border-0 shadow-none focus-visible:ring-1 bg-transparent px-1 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FUEL_TYPES.map((f) => (
                <SelectItem key={f} value={f} className="text-xs">
                  {FUEL_TYPE_LABELS[f]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
        id: 'quantity',
        header: 'Qty (L) *',
        cell: ({ row }) => (
          <Input
            type="number"
            min="0"
            step="0.01"
            value={row.original.quantity || ''}
            onChange={(e) => updateItem(row.index, 'quantity', e.target.value)}
            className="h-8 border-0 shadow-none focus-visible:ring-1 bg-transparent px-1 text-right tabular-nums text-xs"
          />
        ),
        size: 85,
      },
      {
        id: 'unitPrice',
        header: 'Price (Afs/L)',
        cell: ({ row }) => (
          <Input
            type="number"
            min="0"
            step="0.01"
            value={row.original.unitPrice || ''}
            onChange={(e) => updateItem(row.index, 'unitPrice', e.target.value)}
            className="h-8 border-0 shadow-none focus-visible:ring-1 bg-transparent px-1 text-right tabular-nums text-xs"
          />
        ),
        size: 105,
      },
      {
        id: 'totalCost',
        header: 'Total',
        cell: ({ row }) => (
          <span className="font-mono tabular-nums text-xs font-medium">
            {row.original.totalCost.toFixed(2)}
          </span>
        ),
        size: 85,
      },
      {
        id: 'fuelStation',
        header: 'Station',
        cell: ({ row }) => (
          <Input
            value={row.original.fuelStation}
            onChange={(e) => updateItem(row.index, 'fuelStation', e.target.value)}
            placeholder="—"
            className="h-8 border-0 shadow-none focus-visible:ring-1 bg-transparent px-1 text-xs"
          />
        ),
        size: 100,
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

  const navigableColumnIds = ['machineryId', 'fuelType', 'date', 'quantity', 'unitPrice', 'fuelStation', 'notes'];

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

  const totalQuantity = useMemo(
    () => rows.reduce((sum, r) => sum + (r.quantity || 0), 0),
    [rows]
  );

  const validRows = useMemo(
    () => rows.filter((r) => r.machineryId && r.quantity > 0),
    [rows]
  );

  const handleSubmit = useCallback(async () => {
    const valid = rows.filter(
      (r) => r.machineryId && r.quantity > 0
    );

    if (valid.length === 0) {
      toast.error('No valid rows to save. Fill in machinery and quantity.');
      return;
    }

    setIsSubmitting(true);
    try {
      const records: BulkFuelUsageRecord[] = valid.map((r) => ({
        contractorId: r.contractorId,
        machineryId: r.machineryId,
        fuelType: r.fuelType as FuelType,
        quantity: r.quantity,
        unitPrice: r.unitPrice,
        date: r.date,
        fuelStation: r.fuelStation || undefined,
        notes: r.notes || undefined,
      }));

      const payload: BulkFuelUsageRequest = {
        records,
        containerId: globalContainer || undefined,
      };

      const res = await fuelUsageApi.bulkCreate(payload);
      toast.success(res.message ?? `${valid.length} fuel usage records created`);
      onSuccess();
      onOpenChange(false);
    } catch {
      toast.error('Failed to create fuel usage records');
    } finally {
      setIsSubmitting(false);
    }
  }, [rows, globalContainer, onSuccess, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[95vw] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Fuel className="size-5 text-emerald-600" />
            Batch Fuel Usage Entry
          </DialogTitle>
          <DialogDescription>
            Add multiple fuel usage records at once. Each row represents one record.
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
            <span className="text-sm text-muted-foreground whitespace-nowrap">Price (Afs/L):</span>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={globalUnitPrice || ''}
              onChange={(e) => handleGlobalPriceChange(e.target.value)}
              className="h-8 w-[120px] text-xs"
              placeholder="0.00"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">Station:</span>
            <Input
              value={globalFuelStation}
              onChange={(e) => handleGlobalFuelStationChange(e.target.value)}
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
          <div className="flex items-center gap-2">
            <Fuel className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground whitespace-nowrap">Container:</span>
            <Select value={globalContainer || 'none'} onValueChange={(v) => setGlobalContainer(v === 'none' ? '' : v)}>
              <SelectTrigger className="h-8 w-[220px] text-xs">
                <SelectValue placeholder="No container (standalone)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none" className="text-xs">No container (standalone)</SelectItem>
                {containers.map((c) => (
                  <SelectItem key={c.id} value={c.id} className="text-xs">
                    {c.name}
                    {c.fuelType ? ` (${FUEL_TYPE_LABELS[c.fuelType as FuelType] ?? c.fuelType})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            <span>Total Liters: {totalQuantity.toFixed(2)}</span>
          </div>
          {validRows.length < rows.length && rows.length > 0 && (
            <span className="text-xs text-amber-600">
              {rows.length - validRows.length} row(s) need machinery and quantity
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
