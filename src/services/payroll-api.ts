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
  search?: string;
  page?: number;
  pageSize?: number;
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
  netPayableMinor?: number;
  remainingEmployeeDebtMinor?: number;
  deductExpenses?: boolean;
  walletId?: string;
}

export const payrollApi = {
  list: async (
    params: PayrollListParams = {}
  ): Promise<ApiResponse<any>> => {
    const qs = new URLSearchParams();
    if (params.status) qs.set("status", params.status);
    if (params.search) qs.set("search", params.search);
    if (params.page) qs.set("page", String(params.page));
    if (params.pageSize) qs.set("pageSize", String(params.pageSize));
    const q = qs.toString();
    return request(`/payroll${q ? `?${q}` : ""}`);
  },

  generate: async (body: PayrollGenerateBody): Promise<ApiResponse<any>> =>
    request("/payroll", { method: "POST", body: JSON.stringify(body) }),

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
};
