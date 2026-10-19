"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  PAYROLL_STATUSES,
  PAYROLL_STATUS_LABELS,
  PAYROLL_TYPES,
  PAYROLL_TYPE_LABELS,
} from "@/lib/payroll-status";
import {
  PAYROLL_PAYMENT_STATES,
  PAYROLL_PAYMENT_STATE_LABELS,
} from "@/lib/payroll-filters";
import { DEPARTMENTS, DEPARTMENT_LABELS } from "@/types/employee";
import {
  CalendarDays,
  ChevronDown,
  Columns3,
  ListFilter,
  Search,
  X,
} from "lucide-react";

export interface PayrollFilters {
  search: string;
  status: string;
  paymentState: string;
  /** "", this-month, last-month, last-3-months, this-year, custom */
  periodPreset: string;
  dateFrom: string;
  dateTo: string;
  department: string;
  walletId: string;
  type: string;
  minNet: string;
  maxNet: string;
}

export const DEFAULT_PAYROLL_FILTERS: PayrollFilters = {
  search: "",
  status: "",
  paymentState: "",
  periodPreset: "",
  dateFrom: "",
  dateTo: "",
  department: "",
  walletId: "",
  type: "",
  minNet: "",
  maxNet: "",
};

export const PERIOD_PRESETS: { value: string; label: string }[] = [
  { value: "", label: "All time" },
  { value: "this-month", label: "This month" },
  { value: "last-month", label: "Last month" },
  { value: "last-3-months", label: "Last 3 months" },
  { value: "this-year", label: "This year" },
  { value: "custom", label: "Custom range" },
];

const isoLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;

/** Resolve a period preset into concrete from/to dates (local, inclusive). */
export function payrollPresetRange(
  preset: string
): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const firstOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
  const lastOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
  switch (preset) {
    case "this-month":
      return { dateFrom: isoLocal(firstOfMonth(now)), dateTo: isoLocal(lastOfMonth(now)) };
    case "last-month": {
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return { dateFrom: isoLocal(firstOfMonth(d)), dateTo: isoLocal(lastOfMonth(d)) };
    }
    case "last-3-months": {
      const d = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      return { dateFrom: isoLocal(firstOfMonth(d)), dateTo: isoLocal(lastOfMonth(now)) };
    }
    case "this-year":
      return {
        dateFrom: isoLocal(new Date(now.getFullYear(), 0, 1)),
        dateTo: isoLocal(new Date(now.getFullYear(), 11, 31)),
      };
    default:
      return { dateFrom: "", dateTo: "" };
  }
}

interface Chip {
  key: string;
  label: string;
  patch: Partial<PayrollFilters>;
}

/** Removable representations of every active filter. */
export function payrollFilterChips(f: PayrollFilters): Chip[] {
  const chips: Chip[] = [];
  if (f.search) chips.push({ key: "search", label: `“${f.search}”`, patch: { search: "" } });
  if (f.status)
    chips.push({
      key: "status",
      label: PAYROLL_STATUS_LABELS[f.status as keyof typeof PAYROLL_STATUS_LABELS] ?? f.status,
      patch: { status: "" },
    });
  if (f.paymentState)
    chips.push({
      key: "paymentState",
      label:
        PAYROLL_PAYMENT_STATE_LABELS[
          f.paymentState as keyof typeof PAYROLL_PAYMENT_STATE_LABELS
        ] ?? f.paymentState,
      patch: { paymentState: "" },
    });
  if (f.periodPreset) {
    const presetLabel =
      PERIOD_PRESETS.find((p) => p.value === f.periodPreset)?.label ?? f.periodPreset;
    const label =
      f.periodPreset === "custom"
        ? `Period: ${f.dateFrom || "…"} → ${f.dateTo || "…"}`
        : `Period: ${presetLabel}`;
    chips.push({
      key: "period",
      label,
      patch: { periodPreset: "", dateFrom: "", dateTo: "" },
    });
  }
  if (f.department)
    chips.push({
      key: "department",
      label: `Dept: ${DEPARTMENT_LABELS[f.department as keyof typeof DEPARTMENT_LABELS] ?? f.department}`,
      patch: { department: "" },
    });
  if (f.walletId)
    chips.push({
      key: "walletId",
      label: f.walletId === "none" ? "Wallet: none" : "Wallet filter",
      patch: { walletId: "" },
    });
  if (f.type)
    chips.push({
      key: "type",
      label: PAYROLL_TYPE_LABELS[f.type as keyof typeof PAYROLL_TYPE_LABELS] ?? f.type,
      patch: { type: "" },
    });
  if (f.minNet || f.maxNet)
    chips.push({
      key: "net",
      label: `Net: ${f.minNet || "0"}${f.maxNet ? `–${f.maxNet}` : "+"}`,
      patch: { minNet: "", maxNet: "" },
    });
  return chips;
}

interface PayrollFiltersBarProps {
  filters: PayrollFilters;
  onChange: (patch: Partial<PayrollFilters>) => void;
  onReset: () => void;
  wallets: { id: string; name: string }[];
  columnOptions: { id: string; label: string }[];
  columnVisibility: Record<string, boolean>;
  onToggleColumn: (id: string) => void;
  onShowAllColumns: () => void;
}

export function PayrollFiltersBar({
  filters,
  onChange,
  onReset,
  wallets,
  columnOptions,
  columnVisibility,
  onToggleColumn,
  onShowAllColumns,
}: PayrollFiltersBarProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const chips = useMemo(() => payrollFilterChips(filters), [filters]);

  const moreFilterCount = [
    filters.department,
    filters.walletId,
    filters.type,
    filters.minNet,
    filters.maxNet,
  ].filter(Boolean).length;

  const hiddenCount = columnOptions.filter(
    (c) => columnVisibility[c.id] === false
  ).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search employee name or number…"
            value={filters.search}
            onChange={(e) => onChange({ search: e.target.value })}
            className="h-9 pl-8"
          />
        </div>

        <Select
          value={filters.status || "all"}
          onValueChange={(v) => onChange({ status: v === "all" ? "" : v })}
        >
          <SelectTrigger className="h-9 w-[150px]">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {PAYROLL_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {PAYROLL_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.paymentState || "all"}
          onValueChange={(v) => onChange({ paymentState: v === "all" ? "" : v })}
        >
          <SelectTrigger className="h-9 w-[150px]">
            <SelectValue placeholder="Any payment" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any payment</SelectItem>
            {PAYROLL_PAYMENT_STATES.map((s) => (
              <SelectItem key={s} value={s}>
                {PAYROLL_PAYMENT_STATE_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.periodPreset || "all"}
          onValueChange={(v) => {
            const preset = v === "all" ? "" : v;
            if (preset === "custom") onChange({ periodPreset: "custom" });
            else onChange({ periodPreset: preset, ...payrollPresetRange(preset) });
          }}
        >
          <SelectTrigger className="h-9 w-[150px]">
            <CalendarDays className="mr-1 h-4 w-4 text-muted-foreground" />
            <SelectValue placeholder="All time" />
          </SelectTrigger>
          <SelectContent>
            {PERIOD_PRESETS.map((p) => (
              <SelectItem key={p.value || "all"} value={p.value || "all"}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant={moreOpen || moreFilterCount > 0 ? "secondary" : "outline"}
          className="h-9"
          onClick={() => setMoreOpen((v) => !v)}
        >
          <ListFilter className="mr-2 h-4 w-4" />
          More filters
          {moreFilterCount > 0 && (
            <Badge variant="default" className="ml-2">
              {moreFilterCount}
            </Badge>
          )}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="h-9">
              <Columns3 className="mr-2 h-4 w-4" />
              Columns
              {hiddenCount > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {columnOptions.length - hiddenCount}
                </Badge>
              )}
              <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-[60vh] overflow-y-auto">
            <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {columnOptions.map((c) => (
              <DropdownMenuCheckboxItem
                key={c.id}
                checked={columnVisibility[c.id] !== false}
                onCheckedChange={() => onToggleColumn(c.id)}
                onSelect={(e) => e.preventDefault()}
              >
                {c.label}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <button
              type="button"
              className="w-full px-2 py-1.5 text-left text-sm hover:bg-accent"
              onClick={onShowAllColumns}
            >
              Show all
            </button>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {moreOpen && (
        <div className="grid gap-3 rounded-lg border bg-muted/20 p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Department</Label>
            <Select
              value={filters.department || "all"}
              onValueChange={(v) => onChange({ department: v === "all" ? "" : v })}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Any department" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any department</SelectItem>
                {DEPARTMENTS.map((d) => (
                  <SelectItem key={d} value={d}>
                    {DEPARTMENT_LABELS[d]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Wallet</Label>
            <Select
              value={filters.walletId || "all"}
              onValueChange={(v) => onChange({ walletId: v === "all" ? "" : v })}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Any wallet" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any wallet</SelectItem>
                <SelectItem value="none">No wallet</SelectItem>
                {wallets.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Type</Label>
            <Select
              value={filters.type || "all"}
              onValueChange={(v) => onChange({ type: v === "all" ? "" : v })}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Any type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any type</SelectItem>
                {PAYROLL_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {PAYROLL_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Net payable (AFN)</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                inputMode="decimal"
                placeholder="Min"
                value={filters.minNet}
                onChange={(e) => onChange({ minNet: e.target.value })}
                className="h-9 font-mono"
              />
              <span className="text-muted-foreground">–</span>
              <Input
                type="number"
                inputMode="decimal"
                placeholder="Max"
                value={filters.maxNet}
                onChange={(e) => onChange({ maxNet: e.target.value })}
                className="h-9 font-mono"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Period from / to</Label>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={filters.dateFrom}
                onChange={(e) =>
                  onChange({ dateFrom: e.target.value, periodPreset: "custom" })
                }
                className="h-9"
              />
              <span className="text-muted-foreground">–</span>
              <Input
                type="date"
                value={filters.dateTo}
                onChange={(e) =>
                  onChange({ dateTo: e.target.value, periodPreset: "custom" })
                }
                className="h-9"
              />
            </div>
          </div>
        </div>
      )}

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((chip) => (
            <Badge key={chip.key} variant="secondary" className="gap-1 font-normal">
              {chip.label}
              <button
                type="button"
                onClick={() => onChange(chip.patch)}
                className="ml-0.5 rounded-full hover:text-foreground"
                aria-label={`Remove filter ${chip.label}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground"
            onClick={onReset}
          >
            <X className="mr-1 h-3 w-3" />
            Clear all
          </Button>
        </div>
      )}
    </div>
  );
}
