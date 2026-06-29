'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Trash2, TableIcon, ClipboardPaste } from 'lucide-react';
import type { ExpenseItem } from '@/types/expense';
import { UNIT_OPTIONS } from '@/types/expense';

interface ExpenseItemsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: ExpenseItem[];
  onSave: (description: string) => void;
}

let idCounter = 0;
function generateId() {
  idCounter += 1;
  return `item_${Date.now()}_${idCounter}`;
}

function createEmptyRow(): ExpenseItem {
  return {
    id: generateId(),
    itemName: '',
    quantity: 1,
    unit: 'pcs',
    unitPrice: 0,
    total: 0,
  };
}

export default function ExpenseItemsModal({
  open,
  onOpenChange,
  items,
  onSave,
}: ExpenseItemsModalProps) {
  const [localItems, setLocalItems] = useState<ExpenseItem[]>([]);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      idCounter = 0;
      setLocalItems(
        items.length > 0 ? items : [createEmptyRow()]
      );
    }
  }, [open, items]);

  const updateItem = useCallback(
    (index: number, field: keyof ExpenseItem, value: string | number) => {
      setLocalItems((prev) => {
        const updated = prev.map((item) => ({ ...item }));
        const target = updated[index];
        if (!target) return prev;

        if (field === 'quantity' || field === 'unitPrice') {
          const numVal = typeof value === 'string' ? parseFloat(value) || 0 : value;
          (target as any)[field] = numVal;
          target.total = target.quantity * target.unitPrice;
        } else {
          (target as any)[field] = value;
        }

        return updated;
      });
    },
    []
  );

  const removeRow = useCallback((index: number) => {
    setLocalItems((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const addRow = useCallback(() => {
    setLocalItems((prev) => [...prev, createEmptyRow()]);
  }, []);

  const grandTotal = useMemo(
    () => localItems.reduce((sum, item) => sum + item.total, 0),
    [localItems]
  );

  // Paste from clipboard
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const text = e.clipboardData.getData('text');
      if (!text.trim()) return;

      const rows = text
        .split('\n')
        .map((r) => r.trim())
        .filter(Boolean);

      if (rows.length === 0) return;
      e.preventDefault();

      const parsed: ExpenseItem[] = rows.map((line) => {
        const cols = line.split('\t').map((c) => c.trim());
        const itemName = cols[0] || '';
        const quantity = parseFloat(cols[1]) || 1;

        let unit = 'pcs';
        let unitPrice = 0;

        if (cols.length >= 4) {
          const unitRaw = cols[2].toLowerCase();
          unit = UNIT_OPTIONS.includes(unitRaw as any)
            ? unitRaw
            : 'pcs';
          unitPrice = parseFloat(cols[3]) || 0;
        } else if (cols.length === 3) {
          const col2 = cols[2].toLowerCase();
          if (UNIT_OPTIONS.includes(col2 as any)) {
            unit = col2;
          } else {
            unitPrice = parseFloat(cols[2]) || 0;
          }
        }

        return {
          id: generateId(),
          itemName,
          quantity,
          unit,
          unitPrice,
          total: quantity * unitPrice,
        };
      });

      setLocalItems((prev) => [...prev, ...parsed]);
    },
    []
  );

  const columns = useMemo<ColumnDef<ExpenseItem>[]>(
    () => [
      {
        id: 'rowNumber',
        header: '#',
        cell: ({ row }) => (
          <span className="text-muted-foreground text-xs tabular-nums">
            {row.index + 1}
          </span>
        ),
        size: 40,
        enableResizing: false,
      },
      {
        accessorKey: 'itemName',
        header: 'Item Name',
        cell: ({ row }) => (
          <Input
            value={row.original.itemName}
            onChange={(e) => updateItem(row.index, 'itemName', e.target.value)}
            placeholder="Enter item name"
            className="h-8 border-0 shadow-none focus-visible:ring-1 bg-transparent px-1"
          />
        ),
      },
      {
        accessorKey: 'quantity',
        header: 'Qty',
        cell: ({ row }) => (
          <Input
            type="number"
            min="0"
            step="0.01"
            value={row.original.quantity || ''}
            onChange={(e) => updateItem(row.index, 'quantity', e.target.value)}
            className="h-8 border-0 shadow-none focus-visible:ring-1 bg-transparent px-1 text-right tabular-nums"
          />
        ),
        size: 80,
      },
      {
        accessorKey: 'unit',
        header: 'Unit',
        cell: ({ row }) => (
          <Select
            value={row.original.unit}
            onValueChange={(val) => updateItem(row.index, 'unit', val)}
          >
            <SelectTrigger className="h-8 border-0 shadow-none focus-visible:ring-1 bg-transparent px-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {UNIT_OPTIONS.map((u) => (
                <SelectItem key={u} value={u}>
                  {u}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ),
        size: 90,
      },
      {
        accessorKey: 'unitPrice',
        header: 'Unit Price',
        cell: ({ row }) => (
          <div className="relative">
            <span className="absolute left-1 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">
              Afs
            </span>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={row.original.unitPrice || ''}
              onChange={(e) => updateItem(row.index, 'unitPrice', e.target.value)}
              className="h-8 border-0 shadow-none focus-visible:ring-1 bg-transparent pl-7 pr-1 text-right tabular-nums"
            />
          </div>
        ),
        size: 130,
      },
      {
        id: 'total',
        header: 'Total',
        cell: ({ row }) => (
          <span className="font-mono tabular-nums text-sm font-medium">
            Afs {row.original.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        ),
        size: 130,
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
            disabled={localItems.length <= 1}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        ),
        size: 50,
        enableResizing: false,
      },
    ],
    [updateItem, removeRow, localItems.length]
  );

  const table = useReactTable({
    data: localItems,
    columns,
    getCoreRowModel: getCoreRowModel(),
    defaultColumn: {
      enableResizing: true,
    },
  });

  const handleSave = useCallback(() => {
    // Filter out completely empty rows
    const validItems = localItems.filter(
      (item) => item.itemName.trim() !== '' || item.unitPrice > 0
    );
    const itemsToSave = validItems.length > 0 ? validItems : [];
    onSave(
      itemsToSave.length > 0 ? JSON.stringify(itemsToSave) : ''
    );
    onOpenChange(false);
  }, [localItems, onSave, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TableIcon className="size-5 text-emerald-600" />
            Expense Items
          </DialogTitle>
          <DialogDescription>
            Add, edit, or paste items from Excel. Each row's total is calculated automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-2 py-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={addRow}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Add Row
          </Button>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ClipboardPaste className="h-3.5 w-3.5" />
            <span>Paste from Excel (Ctrl+V)</span>
          </div>
        </div>

        <div
          ref={tableContainerRef}
          className="flex-1 min-h-0 border rounded-md overflow-scroll"
          onPaste={handlePaste}
        >
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
                        className="bg-muted/50 text-xs font-semibold uppercase tracking-wider"
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.length > 0 ? (
                  table.getRowModel().rows.map((row) => (
                    <TableRow
                      key={row.id}
                      className="group hover:bg-muted/30"
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id} className="py-1.5 px-2">
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
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
                      No items. Click "Add Row" or paste from Excel.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </div>

        {/* Grand Total Bar */}
        <div className="flex items-center justify-end gap-3 px-3 py-2 bg-muted/30 rounded-md border">
          <span className="text-sm text-muted-foreground">Items: {localItems.length}</span>
          <span className="text-muted-foreground">|</span>
          <span className="text-sm font-semibold">Grand Total:</span>
          <span className="font-mono text-lg font-bold tabular-nums text-emerald-600">
            Afs {grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            Save Items
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
