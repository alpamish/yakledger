/**
 * Generate monthly payroll (flat salary, prorated partial months) from each
 * employee's hire month through the end of سنبله 1405, and write:
 *
 *   - payroll.csv    (header + one row per employee-month)
 *   - payroll.xlsx   (Payroll sheet + Summary sheet)
 *
 * Read-only against the SQLite DB. No Payroll rows are created.
 *
 * Run with TZ=UTC so Shamsi month boundaries land on UTC midnight, matching
 * how the app stores/prints dates (toISOString().slice(0, 10)):
 *
 *   TZ=UTC npx tsx scripts/generate-payroll.ts
 */
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import * as XLSX from "xlsx";
import {
  startOfMonth,
  endOfMonth,
  format as jalaliFormat,
  getMonth as jalaliGetMonth,
  addDays,
} from "date-fns-jalali";

const DAY_MS = 86_400_000;

const SHAMSI_MONTH_NAMES = [
  "حمل", "ثور", "جوزا", "سرطان", "اسد", "سنبله",
  "میزان", "عقرب", "قوس", "جدی", "دلو", "حوت",
];

/** Last day of سنبله 1405 = 2026-09-22 (میزان 1 = 2026-09-23). */
const RANGE_CAP = dateAtUtcDay(new Date(Date.UTC(2026, 8, 22)));

const OUT_CSV = path.join(process.cwd(), "payroll.csv");
const OUT_XLSX = path.join(process.cwd(), "payroll.xlsx");

type SalarySource = "SALARY_HISTORY" | "BASE_SALARY" | "LEGACY_SALARY" | "MISSING";

interface EmployeeRow {
  id: string;
  employeeNumber: string | null;
  fullName: string;
  department: string | null;
  jobTitle: string;
  status: string;
  currency: string;
  hireDate: number;
  quitingDate: number | null;
  terminationDate: number | null;
  baseSalaryMinor: number;
  salary: number;
}

interface SalaryHistoryRow {
  employeeId: string;
  amountMinor: number;
  currency: string;
  effectiveFrom: number;
}

interface PayrollRow {
  "Employee No": string;
  Employee: string;
  Department: string;
  "Job Title": string;
  Status: string;
  "Shamsi Month": string;
  "Period Start": string;
  "Period End": string;
  "Days Employed": number;
  "Days In Month": number;
  "Monthly Salary (AFN)": number;
  "Gross (AFN)": number;
  "Salary Source": SalarySource;
  Currency: string;
}

/** Normalize any timestamp to its UTC calendar date at midnight. */
function dateAtUtcDay(value: Date | number): Date {
  const d = typeof value === "number" ? new Date(value) : value;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Whole days between two UTC-midnight dates, inclusive. */
function inclusiveDays(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1;
}

function minDate(a: Date, b: Date): Date {
  return a.getTime() <= b.getTime() ? a : b;
}

function maxDate(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b;
}

function toAfn(minor: number): number {
  return Number((minor / 100).toFixed(2));
}

function shamsiMonthLabel(monthStart: Date): string {
  const index = jalaliGetMonth(monthStart);
  return `${jalaliFormat(monthStart, "yyyy/MM")} ${SHAMSI_MONTH_NAMES[index] ?? ""}`;
}

function resolveSalary(
  history: SalaryHistoryRow[],
  employee: EmployeeRow,
  periodEndMs: number
): { amountMinor: number; source: SalarySource } {
  // Latest SalaryHistory record effective on/before the end of this period.
  let pick: SalaryHistoryRow | undefined;
  for (const record of history) {
    if (record.effectiveFrom <= periodEndMs) {
      if (!pick || record.effectiveFrom >= pick.effectiveFrom) pick = record;
    }
  }
  if (pick) return { amountMinor: pick.amountMinor, source: "SALARY_HISTORY" };
  if (employee.baseSalaryMinor > 0) {
    return { amountMinor: employee.baseSalaryMinor, source: "BASE_SALARY" };
  }
  if (employee.salary > 0) {
    return { amountMinor: Math.round(employee.salary * 100), source: "LEGACY_SALARY" };
  }
  return { amountMinor: 0, source: "MISSING" };
}

function main() {
  const db = new Database(path.join(process.cwd(), "prisma/db/custom.db"), {
    readonly: true,
  });

  const employees = db
    .prepare(
      `SELECT id, employeeNumber, fullName, department, jobTitle, status, currency,
              hireDate, quitingDate, terminationDate, baseSalaryMinor, salary
         FROM Employee
        ORDER BY hireDate`
    )
    .all() as EmployeeRow[];

  const historyByEmployee = new Map<string, SalaryHistoryRow[]>();
  const historyRows = db
    .prepare(
      `SELECT employeeId, amountMinor, currency, effectiveFrom
         FROM SalaryHistory
        ORDER BY employeeId, effectiveFrom`
    )
    .all() as SalaryHistoryRow[];
  for (const row of historyRows) {
    const list = historyByEmployee.get(row.employeeId);
    if (list) list.push(row);
    else historyByEmployee.set(row.employeeId, [row]);
  }
  db.close();

  const rows: PayrollRow[] = [];
  const missing = new Map<string, number>();
  const perMonth = new Map<string, { count: number; grossMinor: number }>();
  let skipped = 0;

  for (const employee of employees) {
    const hire = dateAtUtcDay(employee.hireDate);
    const exitRaw = employee.quitingDate ?? employee.terminationDate;
    const exitDate = exitRaw != null ? dateAtUtcDay(exitRaw) : null;
    const rangeEnd = exitDate ? minDate(exitDate, RANGE_CAP) : RANGE_CAP;

    if (rangeEnd.getTime() < hire.getTime()) {
      skipped += 1;
      continue;
    }

    const history = historyByEmployee.get(employee.id) ?? [];
    let monthStart = startOfMonth(hire);
    const lastMonth = startOfMonth(rangeEnd);

    while (monthStart.getTime() <= lastMonth.getTime()) {
      const monthEnd = dateAtUtcDay(endOfMonth(monthStart));
      const daysInMonth = inclusiveDays(monthStart, monthEnd);
      const employedStart = maxDate(monthStart, hire);
      const employedEnd = minDate(monthEnd, rangeEnd);
      const daysEmployed = inclusiveDays(employedStart, employedEnd);

      const salary = resolveSalary(history, employee, monthEnd.getTime() + DAY_MS - 1);
      const grossMinor = Math.round((salary.amountMinor * daysEmployed) / daysInMonth);
      const monthLabel = shamsiMonthLabel(monthStart);

      rows.push({
        "Employee No": employee.employeeNumber ?? "",
        Employee: employee.fullName.trim(),
        Department: employee.department ?? "",
        "Job Title": employee.jobTitle,
        Status: employee.status,
        "Shamsi Month": monthLabel,
        "Period Start": monthStart.toISOString().slice(0, 10),
        "Period End": monthEnd.toISOString().slice(0, 10),
        "Days Employed": daysEmployed,
        "Days In Month": daysInMonth,
        "Monthly Salary (AFN)": toAfn(salary.amountMinor),
        "Gross (AFN)": toAfn(grossMinor),
        "Salary Source": salary.source,
        Currency: employee.currency || "AFN",
      });

      if (salary.source === "MISSING") {
        const name = employee.fullName.trim();
        missing.set(name, (missing.get(name) ?? 0) + 1);
      }

      const bucket = perMonth.get(monthLabel) ?? { count: 0, grossMinor: 0 };
      bucket.count += 1;
      bucket.grossMinor += grossMinor;
      perMonth.set(monthLabel, bucket);

      monthStart = startOfMonth(addDays(monthEnd, 1));
    }
  }

  // Employees without a number sort last, then by name and period.
  rows.sort((a, b) => {
    const an = a["Employee No"];
    const bn = b["Employee No"];
    if (!an !== !bn) return an ? -1 : 1;
    if (an && bn && an !== bn) return an < bn ? -1 : 1;
    if (a.Employee !== b.Employee) return a.Employee < b.Employee ? -1 : 1;
    return a["Period Start"] < b["Period Start"] ? -1 : 1;
  });

  writeCsv(rows);
  writeExcel(rows, perMonth, missing);

  const totalGrossMinor = rows.reduce(
    (sum, r) => sum + Math.round(r["Gross (AFN)"] * 100),
    0
  );
  console.log(
    `Employees:      ${employees.length}${skipped ? ` (${skipped} skipped: exit before hire)` : ""}`
  );
  console.log(`Payroll rows:   ${rows.length}`);
  for (const [month, bucket] of [...perMonth.entries()].sort()) {
    console.log(`  ${month}: ${bucket.count} employees, ${toAfn(bucket.grossMinor)} AFN`);
  }
  console.log(`Total gross:    ${toAfn(totalGrossMinor)} AFN`);
  if (missing.size > 0) {
    console.log(`No salary source (${missing.size}): ${[...missing.keys()].join(", ")}`);
  }
  console.log(`Wrote ${OUT_CSV}`);
  console.log(`Wrote ${OUT_XLSX}`);
}

function writeCsv(rows: PayrollRow[]) {
  const headers = Object.keys(rows[0] ?? {});
  const escape = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    headers.map(escape).join(","),
    ...rows.map((row) => headers.map((h) => escape(row[h as keyof PayrollRow])).join(",")),
  ];
  // UTF-8 BOM so Excel detects the encoding for Persian text.
  const bom = String.fromCharCode(0xfeff);
  fs.writeFileSync(OUT_CSV, bom + lines.join("\n") + "\n", "utf8");
}

function writeExcel(
  rows: PayrollRow[],
  perMonth: Map<string, { count: number; grossMinor: number }>,
  missing: Map<string, number>
) {
  const headers = Object.keys(rows[0] ?? {});
  const body: (string | number)[][] = rows.map((row) =>
    headers.map((h) => row[h as keyof PayrollRow])
  );
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...body]);
  sheet["!cols"] = headers.map((h, i) => ({
    wch:
      Math.max(h.length, ...body.map((r) => String(r[i] ?? "").length).slice(0, 50)) + 2,
  }));

  const totalGrossMinor = rows.reduce(
    (sum, r) => sum + Math.round(r["Gross (AFN)"] * 100),
    0
  );
  const summary: (string | number)[][] = [
    ["Shamsi Month", "Employees", "Total Gross (AFN)"],
    ...[...perMonth.entries()].sort().map(([month, b]) => [
      month,
      b.count,
      toAfn(b.grossMinor),
    ]),
    [],
    ["Grand Total", rows.length, toAfn(totalGrossMinor)],
    [],
    ["Employees with no salary source", missing.size],
    ...[...missing.entries()].map(([name, months]) => [name, `${months} month(s)`]),
  ];
  const summarySheet = XLSX.utils.aoa_to_sheet(summary);
  summarySheet["!cols"] = [{ wch: 40 }, { wch: 14 }, { wch: 20 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "Payroll");
  XLSX.utils.book_append_sheet(wb, summarySheet, "Summary");
  XLSX.writeFile(wb, OUT_XLSX);
}

main();
