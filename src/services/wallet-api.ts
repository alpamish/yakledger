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
}

export const walletApi = {
  list: (): Promise<ApiResponse<any[]>> => request("/wallets"),
  get: (id: string): Promise<ApiResponse<any>> => request(`/wallets/${id}`),
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