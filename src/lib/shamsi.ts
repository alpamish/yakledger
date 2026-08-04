import {
  format as jalaliFormat,
  addDays as jalaliAddDays,
  getDaysInMonth as jalaliGetDaysInMonth,
  getYear as jalaliGetYear,
  getMonth as jalaliGetMonth,
  getDate as jalaliGetDate,
  startOfMonth as jalaliStartOfMonth,
  parse as jalaliParse,
} from "date-fns-jalali";
import { format as gregorianFormat } from "date-fns";

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

const PERSIAN_DIGITS: Record<string, string> = {
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
  "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
  "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
};

export function normalizePersianDigits(value: string): string {
  return value.replace(/[۰-۹٠-٩]/g, (ch) => PERSIAN_DIGITS[ch] ?? ch);
}

export function gregorianToShamsi(date: Date | string): string {
  return formatShamsi(typeof date === "string" ? new Date(date) : date, "yyyy/MM/dd");
}

export function shamsiToGregorian(dateStr: string): string | null {
  const normalized = normalizePersianDigits(dateStr ?? "").trim().replace(/[\/\-.]/g, "/");
  if (!normalized) return null;
  const parts = normalized.split(/[\/\-.]/).map((p) => parseInt(p, 10));
  if (parts.length !== 3 || parts.some((p) => Number.isNaN(p))) return null;
  const [year, month, day] = parts;
  if (year < 1200 || year > 1600 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  try {
    const date = jalaliParse(normalized, "yyyy/MM/dd", new Date());
    const padded = `${String(year).padStart(4, "0")}/${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}`;
    if (gregorianToShamsi(date) !== padded) return null;
    return gregorianFormat(date, "yyyy-MM-dd");
  } catch {
    return null;
  }
}
