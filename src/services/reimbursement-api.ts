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
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((options.headers as Record<string, string>) ?? {}),
  };
  const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(
      data?.error || data?.message || `Request failed (${res.status})`,
      res.status
    );
  }
  return data as T;
}

export type ReimbursementStatus =
  | "PENDING"
  | "APPROVED"
  | "REIMBURSED"
  | "REJECTED";

export interface ReimbursementInput {
  expenseIds: string[];
  paymentMethod: "CASH" | "BANK_TRANSFER" | "COMPANY_WALLET";
  walletId?: string;
  note?: string;
}

export const reimbursementApi = {
  list: (employeeId: string, status?: ReimbursementStatus): Promise<ApiResponse<any>> =>
    request(
      `/employees/${encodeURIComponent(employeeId)}/reimbursements${
        status ? `?status=${status}` : ""
      }`
    ),
  pay: (employeeId: string, body: ReimbursementInput): Promise<ApiResponse<any>> =>
    request(`/employees/${encodeURIComponent(employeeId)}/reimbursements`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
};
