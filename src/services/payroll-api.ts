import { getToken, ApiError } from "./api";
import type { ApiResponse } from "@/types/expense";

const API_BASE = "/api";

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    if (typeof window !== "undefined") {
      window.location.href = "/";
    }
    throw new ApiError("Unauthorized", 401);
  }

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const body = await response.json();
      if (body.error || body.message) {
        message = body.error || body.message;
      }
    } catch {
      // ignore
    }
    throw new ApiError(message, response.status);
  }

  return (await response.json()) as T;
}

export interface PayrollListParams {
  status?: string;
  /** Coarse payment grouping: UNPAID | PARTIAL | PAID. */
  paymentState?: string;
  search?: string;
  periodStart?: string;
  periodEnd?: string;
  department?: string;
  /** A wallet id, or "none" for payrolls with no wallet assigned. */
  walletId?: string;
  type?: string;
  minNetMinor?: number;
  maxNetMinor?: number;
  /** period | employee | status */
  sort?: string;
  dir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

/** Build the shared `?…` query string for the list and export endpoints. */
export function buildPayrollQuery(params: PayrollListParams): string {
  const qs = new URLSearchParams();
  const set = (key: string, value: string | number | undefined) => {
    if (value === undefined || value === null || value === "") return;
    qs.set(key, String(value));
  };
  set("status", params.status);
  set("paymentState", params.paymentState);
  set("search", params.search);
  set("periodStart", params.periodStart);
  set("periodEnd", params.periodEnd);
  set("department", params.department);
  set("walletId", params.walletId);
  set("type", params.type);
  set("minNetMinor", params.minNetMinor);
  set("maxNetMinor", params.maxNetMinor);
  set("sort", params.sort);
  set("dir", params.dir);
  set("page", params.page);
  set("pageSize", params.pageSize);
  return qs.toString();
}

export interface PayrollGenerateBody {
  periodStart: string;
  periodEnd: string;
  employeeIds?: string[];
  allowancesMinor?: number;
  bonusesMinor?: number;
  deductionsMinor?: number;
  walletId?: string;
  deductExpenses?: boolean;
  workDays?: number;
  type?: "STANDARD" | "FINAL_SETTLEMENT";
}

export interface ProjectAllocation {
  id: string;
  payrollId: string;
  project: string;
  mode: string;
  enteredValue: number;
  percentage: number;
  amountMinor: number;
  createdAt: string;
}

export interface UpdatePayrollLineBody {
  lineId: string;
  overtimeHours?: number;
  allowancesMinor?: number;
  bonusesMinor?: number;
  deductionsMinor?: number;
  /** AFN amount of loan repayment to deduct this period (0 = none). */
  loanDeductionMinor?: number;
  netPayableMinor?: number;
  remainingEmployeeDebtMinor?: number;
  deductExpenses?: boolean;
  walletId?: string;
}

export interface PayrollAdjustment {
  id: string;
  employeeId: string;
  payrollId: string | null;
  kind: string;
  direction: string;
  source: string;
  amountMinor: number;
  currency: string;
  reason: string;
  note?: string | null;
  createdById?: string | null;
  createdAt: string;
  employee?: { id: string; fullName: string };
  createdBy?: { id: string; name: string } | null;
  payroll?: { id: string; status: string } | null;
}

export interface CreatePayrollAdjustmentBody {
  employeeId: string;
  kind: string;
  /** Only used for kind OTHER; the PREVIOUS_* kinds imply their sign. */
  direction?: "DEDUCTION" | "EARNING";
  /** AFN (major units) — the route converts to minor. */
  amount: number;
  reason: string;
  note?: string;
}

export interface PayrollReconcileChange {
  payrollId: string;
  employeeId: string;
  employeeName: string;
  periodStart: string;
  periodEnd: string;
  previousStatus: string;
  nextStatus: string;
  previousPaidMinor: number;
  expensePaidMinor: number;
  nextPaidMinor: number;
  netPayMinor: number;
  expenseCount: number;
}

export interface PayrollReconcileResult {
  dryRun: boolean;
  examined: number;
  updated: number;
  paid: number;
  partiallyPaid: number;
  skipped: number;
  totalPaidMinorDelta: number;
  changes: PayrollReconcileChange[];
}

export const payrollApi = {
  list: async (
    params: PayrollListParams = {}
  ): Promise<ApiResponse<any>> => {
    const q = buildPayrollQuery(params);
    return request(`/payroll${q ? `?${q}` : ""}`);
  },

  // Reconcile settlement counters from approved SALARY expenses. Writes only
  // Payroll.totalPaidMinor / Payroll.status / PayrollLine.paymentStatus.
  reconcilePayments: async (
    body: { dryRun?: boolean; payrollIds?: string[] } = {}
  ): Promise<ApiResponse<PayrollReconcileResult>> =>
    request("/payroll/reconcile-payments", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  generate: async (body: PayrollGenerateBody): Promise<ApiResponse<any>> =>
    request("/payroll", { method: "POST", body: JSON.stringify(body) }),

  // Outstanding employee-paid expenses in a period (for the Generate form).
  periodExpenses: async (
    employeeId: string,
    periodStart: string,
    periodEnd: string
  ): Promise<
    ApiResponse<{ totalMinor: number; total: number; count: number }>
  > => {
    const qs = new URLSearchParams({ employeeId, periodStart, periodEnd });
    return request(`/payroll/period-expenses?${qs.toString()}`);
  },

  // Outstanding unpaid salary liability for the dashboard.
  summary: async (): Promise<
    ApiResponse<{ outstandingSalaryMinor: number; unpaidPayrolls: number }>
  > => request("/payroll/summary"),

  getAllocations: async (
    payrollId: string
  ): Promise<ApiResponse<ProjectAllocation[]>> =>
    request(`/payroll/${payrollId}/allocations`),

  setAllocations: async (
    payrollId: string,
    allocations: {
      project: string;
      mode: "PERCENT" | "AMOUNT";
      value: number;
    }[]
  ): Promise<ApiResponse<ProjectAllocation[]>> =>
    request(`/payroll/${payrollId}/allocations`, {
      method: "POST",
      body: JSON.stringify({ allocations }),
    }),

  approve: async (
    employeeId: string,
    payrollId: string
  ): Promise<ApiResponse<any>> =>
    request(`/employees/${employeeId}/payroll`, {
      method: "POST",
      body: JSON.stringify({ action: "approve", payrollId }),
    }),

  // One partial salary payment (§2 action 6). `amountMinor` omitted = settle
  // whatever is still outstanding.
  pay: async (
    payrollId: string,
    body: {
      amountMinor?: number;
      paymentMethod: string;
      walletId?: string;
      note?: string;
      reference?: string;
      evidenceUrl?: string;
    }
  ): Promise<ApiResponse<any>> =>
    request(`/payroll/${payrollId}/payments`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  payments: async (payrollId: string): Promise<ApiResponse<any>> =>
    request(`/payroll/${payrollId}/payments`),

  revert: async (
    employeeId: string,
    payrollId: string,
    reason?: string
  ): Promise<ApiResponse<any>> =>
    request(`/employees/${employeeId}/payroll`, {
      method: "POST",
      body: JSON.stringify({ action: "revert", payrollId, reason }),
    }),

  delete: async (id: string): Promise<ApiResponse<any>> =>
    request(`/payroll/${id}`, { method: "DELETE" }),

  updateLine: async (payrollId: string, data: UpdatePayrollLineBody): Promise<ApiResponse<any>> =>
    request(`/payroll/${payrollId}`, { method: "PATCH", body: JSON.stringify(data) }),

  // Manual payroll adjustments (PDF §1 "Payroll Adjustments").
  adjustments: async (employeeId?: string): Promise<ApiResponse<PayrollAdjustment[]>> => {
    const q = employeeId ? `?employeeId=${encodeURIComponent(employeeId)}` : "";
    return request(`/payroll/adjustments${q}`);
  },

  createAdjustment: async (
    body: CreatePayrollAdjustmentBody
  ): Promise<ApiResponse<PayrollAdjustment>> =>
    request("/payroll/adjustments", { method: "POST", body: JSON.stringify(body) }),

  deleteAdjustment: async (id: string): Promise<ApiResponse<any>> =>
    request(`/payroll/adjustments/${id}`, { method: "DELETE" }),
};
