// Shared parsing for the Payroll list/export query string. Keeping it in one
// place means the on-screen table and the CSV/XLSX/PDF exports always agree on
// what a filter means. The payroll vocabulary lives in `payroll-status.ts`.

import { PAYROLL_STATUSES } from "./payroll-status";

// A payment state is a coarse, user-facing grouping of the payroll lifecycle:
// "unpaid" = approved with nothing settled yet, "partial" = some money
// recorded, "paid" = fully settled.
export const PAYROLL_PAYMENT_STATE_STATUS: Record<string, string> = {
  UNPAID: "APPROVED",
  PARTIAL: "PARTIALLY_PAID",
  PAID: "PAID",
};

export const PAYROLL_PAYMENT_STATES = ["UNPAID", "PARTIAL", "PAID"] as const;
export type PayrollPaymentState = (typeof PAYROLL_PAYMENT_STATES)[number];

export const PAYROLL_PAYMENT_STATE_LABELS: Record<PayrollPaymentState, string> = {
  UNPAID: "Unpaid",
  PARTIAL: "Partially paid",
  PAID: "Paid",
};

export const PAYROLL_SORT_FIELDS = ["period", "employee", "status"] as const;
export type PayrollSortField = (typeof PAYROLL_SORT_FIELDS)[number];

export interface ParsedPayrollQuery {
  status?: string;
  paymentState?: string;
  search?: string;
  periodStart?: string;
  periodEnd?: string;
  department?: string;
  walletId?: string;
  type?: string;
  minNetMinor?: number;
  maxNetMinor?: number;
  sort: PayrollSortField;
  dir: "asc" | "desc";
}

function toMinorParam(value: string | null): number | undefined {
  if (value == null || value.trim() === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : undefined;
}

export function parsePayrollQuery(searchParams: URLSearchParams): ParsedPayrollQuery {
  const statusRaw = searchParams.get("status") || "";
  const status = (PAYROLL_STATUSES as readonly string[]).includes(statusRaw)
    ? statusRaw
    : undefined;

  const paymentStateRaw = searchParams.get("paymentState") || "";
  const paymentState = PAYROLL_PAYMENT_STATE_STATUS[paymentStateRaw]
    ? paymentStateRaw
    : undefined;

  const sortRaw = searchParams.get("sort") || "";
  const sort = (PAYROLL_SORT_FIELDS as readonly string[]).includes(sortRaw)
    ? (sortRaw as PayrollSortField)
    : "period";
  const dir = searchParams.get("dir") === "asc" ? "asc" : "desc";

  return {
    status,
    paymentState,
    search: searchParams.get("search")?.trim() || undefined,
    periodStart: searchParams.get("periodStart") || undefined,
    periodEnd: searchParams.get("periodEnd") || undefined,
    department: searchParams.get("department") || undefined,
    walletId: searchParams.get("walletId") || undefined,
    type: searchParams.get("type") || undefined,
    minNetMinor: toMinorParam(searchParams.get("minNetMinor")),
    maxNetMinor: toMinorParam(searchParams.get("maxNetMinor")),
    sort,
    dir,
  };
}

/**
 * Build the Prisma `where` for a payroll query. `employeeIds` (when provided)
 * is the access scope: payrolls of employees outside it must not be returned.
 * Period filtering uses overlap semantics, so a payroll is included when its
 * period intersects the requested window.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildPayrollWhere(
  q: ParsedPayrollQuery,
  opts?: { employeeIds?: string[] }
): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const and: any[] = [];
  if (q.status) and.push({ status: q.status });
  if (q.paymentState)
    and.push({ status: PAYROLL_PAYMENT_STATE_STATUS[q.paymentState] });
  if (q.periodStart) and.push({ periodEnd: { gte: new Date(q.periodStart) } });
  if (q.periodEnd) and.push({ periodStart: { lte: new Date(q.periodEnd) } });
  if (q.department) and.push({ employee: { department: q.department } });
  if (q.walletId === "none") and.push({ walletId: null });
  else if (q.walletId) and.push({ walletId: q.walletId });
  if (q.type) and.push({ type: q.type });
  if (q.search) {
    and.push({
      employee: {
        OR: [
          { fullName: { contains: q.search } },
          { employeeNumber: { contains: q.search } },
        ],
      },
    });
  }
  if (q.minNetMinor != null || q.maxNetMinor != null) {
    and.push({
      lines: {
        some: {
          netPayableMinor: {
            ...(q.minNetMinor != null ? { gte: q.minNetMinor } : {}),
            ...(q.maxNetMinor != null ? { lte: q.maxNetMinor } : {}),
          },
        },
      },
    });
  }
  if (opts?.employeeIds) and.push({ employeeId: { in: opts.employeeIds } });
  return and.length > 0 ? { AND: and } : {};
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildPayrollOrderBy(q: ParsedPayrollQuery): any {
  if (q.sort === "employee") return { employee: { fullName: q.dir } };
  if (q.sort === "status") return { status: q.dir };
  return { periodStart: q.dir };
}
