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

export interface Loan {
  id: string;
  employeeId: string;
  principalMinor: number;
  balanceMinor: number;
  currency: string;
  issueDate: string;
  dueDate?: string | null;
  monthlyInstallmentMinor?: number | null;
  autoDeduct: boolean;
  /** PENDING | ACTIVE | PAID | CANCELLED */
  status: string;
  note?: string | null;
  approvalStatus: string;
  approvedAt?: string | null;
  createdAt: string;
  employee?: { id: string; fullName: string; jobTitle: string; department: string };
  createdBy?: { id: string; name: string };
  _count?: { allocations: number; repayments: number };
}

export interface CreateLoanBody {
  employeeId: string;
  principalMinor: number;
  issueDate: string;
  dueDate?: string | null;
  monthlyInstallmentMinor?: number | null;
  autoDeduct?: boolean;
  note?: string | null;
}

export const loansApi = {
  list: async (params: { employeeId?: string; status?: string } = {}): Promise<
    ApiResponse<Loan[]>
  > => {
    const qs = new URLSearchParams();
    if (params.employeeId) qs.set("employeeId", params.employeeId);
    if (params.status) qs.set("status", params.status);
    const q = qs.toString();
    return request(`/loans${q ? `?${q}` : ""}`);
  },

  create: async (body: CreateLoanBody): Promise<ApiResponse<Loan>> =>
    request("/loans", { method: "POST", body: JSON.stringify(body) }),

  update: async (
    id: string,
    body: {
      autoDeduct?: boolean;
      monthlyInstallmentMinor?: number | null;
      dueDate?: string | null;
      note?: string | null;
    }
  ): Promise<ApiResponse<Loan>> =>
    request(`/loans/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

  recordRepayment: async (
    id: string,
    body: { amountMinor: number; note?: string | null }
  ): Promise<ApiResponse<unknown>> =>
    request(`/loans/${id}/repayment`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
};
