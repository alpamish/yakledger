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
}

export const payrollApi = {
  list: async (
    params: PayrollListParams = {}
  ): Promise<ApiResponse<any>> => {
    const qs = new URLSearchParams();
    if (params.status) qs.set("status", params.status);
    if (params.page) qs.set("page", String(params.page));
    if (params.pageSize) qs.set("pageSize", String(params.pageSize));
    const q = qs.toString();
    return request(`/payroll${q ? `?${q}` : ""}`);
  },

  generate: async (body: PayrollGenerateBody): Promise<ApiResponse<any>> =>
    request("/payroll", { method: "POST", body: JSON.stringify(body) }),

  approve: async (
    employeeId: string,
    payrollId: string,
    paymentMethod?: string,
    walletId?: string
  ): Promise<ApiResponse<any>> =>
    request(`/employees/${employeeId}/payroll`, {
      method: "POST",
      body: JSON.stringify({ action: "approve", payrollId, paymentMethod, walletId }),
    }),

  revert: async (
    employeeId: string,
    payrollId: string,
    reason?: string
  ): Promise<ApiResponse<any>> =>
    request(`/employees/${employeeId}/payroll`, {
      method: "POST",
      body: JSON.stringify({ action: "revert", payrollId, reason }),
    }),
};
