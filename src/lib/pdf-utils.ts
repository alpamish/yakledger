import { format } from 'date-fns';
import type { Timesheet, FuelUsage } from '@/types/contractor';
import type { Expense } from '@/types/expense';
import type { LedgerEntry } from '@/types/expense';

export function downloadPdfBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function filterTimesheetsByDate(items: Timesheet[], dateFrom?: string, dateTo?: string): Timesheet[] {
  let result = items;
  if (dateFrom) result = result.filter((t) => t.date >= dateFrom);
  if (dateTo) result = result.filter((t) => t.date <= dateTo);
  return result;
}

export function filterFuelUsagesByDate(items: FuelUsage[], dateFrom?: string, dateTo?: string): FuelUsage[] {
  let result = items;
  if (dateFrom) result = result.filter((f) => f.date >= dateFrom);
  if (dateTo) result = result.filter((f) => f.date <= dateTo);
  return result;
}

export function filterExpensesByDate(items: Expense[], dateFrom?: string, dateTo?: string, dateField: keyof Expense = 'expenseDate' as keyof Expense): Expense[] {
  let result = items;
  if (dateFrom) result = result.filter((e) => (e[dateField] as string) >= dateFrom);
  if (dateTo) result = result.filter((e) => (e[dateField] as string) <= dateTo);
  return result;
}

export function filterLedgerByValidEntries(items: unknown[]): LedgerEntry[] {
  return items.filter((e): e is LedgerEntry => Boolean(e && typeof e === 'object' && 'id' in e && (e as { id: unknown }).id));
}

export function todayString(): string {
  return format(new Date(), 'yyyy-MM-dd');
}
