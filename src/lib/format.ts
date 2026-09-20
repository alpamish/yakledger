import { format } from 'date-fns';

export function fmtExportDate(value?: string | null): string {
  if (!value) return '—';
  try {
    return format(new Date(value), 'yyyy-MM-dd');
  } catch {
    return value;
  }
}

export function fmtExportLabel<T extends string>(labels: Record<T, string>, value?: string | null): string {
  if (!value) return '—';
  return labels[value as T] ?? value;
}
