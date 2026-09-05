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
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(
      data?.error || data?.message || `Request failed (${res.status})`,
      res.status
    );
  }
  return data as T;
}

export interface WalletInput {
  name: string;
  type?: string;
  currency?: string;
  initialBalance?: number;
  employeeIds?: string[];
  userIds?: string[];
}

export const walletApi = {
  list: (): Promise<ApiResponse<any[]>> => request("/wallets"),
  listForEmployee: (employeeId: string): Promise<ApiResponse<any[]>> =>
    request(`/wallets?employeeId=${encodeURIComponent(employeeId)}`),
  get: (id: string): Promise<ApiResponse<any>> => request(`/wallets/${id}`),
  transactions: (params?: {
    walletId?: string;
    type?: string;
    from?: string;
    to?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  }): Promise<ApiResponse<any>> => {
    const qs = new URLSearchParams();
    if (params) {
      if (params.walletId) qs.set("walletId", params.walletId);
      if (params.type) qs.set("type", params.type);
      if (params.from) qs.set("from", params.from);
      if (params.to) qs.set("to", params.to);
      if (params.search) qs.set("search", params.search);
      if (params.page) qs.set("page", String(params.page));
      if (params.pageSize) qs.set("pageSize", String(params.pageSize));
    }
    const q = qs.toString();
    return request(`/wallets/transactions${q ? `?${q}` : ""}`);
  },
  create: (body: WalletInput): Promise<ApiResponse<any>> =>
    request("/wallets", { method: "POST", body: JSON.stringify(body) }),
  update: (id: string, body: Partial<WalletInput> & { isActive?: boolean }): Promise<ApiResponse<any>> =>
    request(`/wallets/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deactivate: (id: string): Promise<ApiResponse<any>> =>
    request(`/wallets/${id}`, { method: "DELETE" }),
  fund: (id: string, amount: number, note?: string): Promise<ApiResponse<any>> =>
    request(`/wallets/${id}/fund`, {
      method: "POST",
      body: JSON.stringify({ amount, note }),
    }),
  adjust: (id: string, amount: number, note?: string): Promise<ApiResponse<any>> =>
    request(`/wallets/${id}/adjust`, {
      method: "POST",
      body: JSON.stringify({ amount, note }),
    }),
  transfer: (
    fromWalletId: string,
    toWalletId: string,
    amount: number,
    note?: string
  ): Promise<ApiResponse<any>> =>
    request("/wallets/transfer", {
      method: "POST",
      body: JSON.stringify({ fromWalletId, toWalletId, amount, note }),
    }),
};