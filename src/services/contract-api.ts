// API client for the contract subsystem (Phase 2).
import type {
  ContractorContract,
  ContractListResponse,
  ContractFormData,
  ContractRate,
  ContractRateFormData,
  ContractVariation,
  ContractVariationFormData,
} from "@/types/contract";
import { getToken, ApiError } from "./api";

const API_BASE = "/api";

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ApiError(
      data.error || `Request failed with status ${response.status}`,
      response.status
    );
  }
  return data.data as T;
}

export const contractsApi = {
  list: async (params: Record<string, string> = {}): Promise<ContractListResponse> => {
    const qs = new URLSearchParams(params).toString();
    return request<ContractListResponse>(`/contracts${qs ? `?${qs}` : ""}`);
  },

  get: (id: string): Promise<ContractorContract> => request<ContractorContract>(`/contracts/${id}`),

  create: (body: ContractFormData): Promise<ContractorContract> =>
    request<ContractorContract>("/contracts", { method: "POST", body: JSON.stringify(body) }),

  update: (id: string, body: Partial<ContractFormData>): Promise<ContractorContract> =>
    request<ContractorContract>(`/contracts/${id}`, { method: "PUT", body: JSON.stringify(body) }),

  remove: (id: string): Promise<{ id: string }> =>
    request<{ id: string }>(`/contracts/${id}`, { method: "DELETE" }),

  // Rates
  listRates: (contractId: string): Promise<ContractRate[]> =>
    request<ContractRate[]>(`/contracts/${contractId}/rates`),

  createRate: (contractId: string, body: ContractRateFormData): Promise<ContractRate> =>
    request<ContractRate>(`/contracts/${contractId}/rates`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  updateRate: (
    contractId: string,
    rateId: string,
    body: Partial<ContractRateFormData>
  ): Promise<ContractRate> =>
    request<ContractRate>(`/contracts/${contractId}/rates/${rateId}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  deleteRate: (contractId: string, rateId: string): Promise<{ id: string }> =>
    request<{ id: string }>(`/contracts/${contractId}/rates/${rateId}`, { method: "DELETE" }),

  approveRate: (contractId: string, rateId: string): Promise<ContractRate> =>
    request<ContractRate>(`/contracts/${contractId}/rates/${rateId}/approve`, {
      method: "POST",
    }),

  // Variations
  listVariations: (contractId: string): Promise<ContractVariation[]> =>
    request<ContractVariation[]>(`/contracts/${contractId}/variations`),

  createVariation: (
    contractId: string,
    body: ContractVariationFormData
  ): Promise<ContractVariation> =>
    request<ContractVariation>(`/contracts/${contractId}/variations`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  decideVariation: (
    contractId: string,
    variationId: string,
    action: "approve" | "reject",
    note?: string
  ): Promise<ContractVariation> =>
    request<ContractVariation>(`/contracts/${contractId}/variations/${variationId}`, {
      method: "POST",
      body: JSON.stringify({ action, note }),
    }),
};
