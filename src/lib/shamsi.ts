import {
  format as jalaliFormat,
  addDays as jalaliAddDays,
  getDaysInMonth as jalaliGetDaysInMonth,
  getYear as jalaliGetYear,
  getMonth as jalaliGetMonth,
  getDate as jalaliGetDate,
  startOfMonth as jalaliStartOfMonth,
} from "date-fns-jalali";

export const SHAMSI_MONTH_NAMES = [
  "حمل", "ثور", "جوزا", "سرطان", "اسد", "سنبله",
  "میزان", "عقرب", "قوس", "جدی", "دلو", "حوت",
];

export function getShamsiMonthName(monthIndex: number): string {
  return SHAMSI_MONTH_NAMES[monthIndex] ?? "";
}

export function getShamsiMonthDays(year: number, month: number): number {
  return jalaliGetDaysInMonth(new Date(year, month));
}

export function formatShamsi(date: Date, formatStr: string): string {
  return jalaliFormat(date, formatStr);
}

export function addShamsiDays(date: Date, days: number): Date {
  return jalaliAddDays(date, days);
}

export function toShamsiYear(date: Date): number {
  return jalaliGetYear(date);
}

export function toShamsiMonth(date: Date): number {
  return jalaliGetMonth(date);
}

export function toShamsiDay(date: Date): number {
  return jalaliGetDate(date);
}

export function shamsiStartOfMonth(date: Date): Date {
  return jalaliStartOfMonth(date);
}

export function shamsiDate(year: number, month: number, day: number): Date {
  const date = new Date(year, month, day);
  return date;
}
