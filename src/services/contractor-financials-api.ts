// API client for the contractor financial subsystem (Phase 4): claims,
// advances, payments, and the ledger statement.
import type {
  AdvanceFormData,
  ClaimFormData,
  ClaimDeduction,
  ClaimDeductionType,
  ClaimListResponse,
  ContractorAdvance,
  ContractorClaim,
  ContractorLedgerEntry,
  ContractorPayment,
  LedgerStatement,
  OutstandingResponse,
  PaymentFormData,
  PaymentAllocation,
} from "@/types/contractor-financials";
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

export const contractorFinancialsApi = {
  // ── Claims ───────────────────────────────────────────────────────────────
  listClaims: async (params: Record<string, string> = {}): Promise<ClaimListResponse> => {
    const qs = new URLSearchParams(params).toString();
    return request<ClaimListResponse>(`/contractor-claims${qs ? `?${qs}` : ""}`);
  },

  getClaim: (id: string): Promise<ContractorClaim> =>
    request<ContractorClaim>(`/contractor-claims/${id}`),

  createClaim: (body: ClaimFormData): Promise<ContractorClaim> =>
    request<ContractorClaim>("/contractor-claims", { method: "POST", body: JSON.stringify(body) }),

  updateClaim: (
    id: string,
    body: { title?: string; periodStart?: string; periodEnd?: string; notes?: string | null }
  ): Promise<ContractorClaim> =>
    request<ContractorClaim>(`/contractor-claims/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  voidClaim: (id: string): Promise<ContractorClaim> =>
    request<ContractorClaim>(`/contractor-claims/${id}`, { method: "DELETE" }),

  /** Workflow + money actions: submit/verify/financeReview/approve/reject/void/reverse/releaseRetention. */
  claimAction: (
    id: string,
    body: {
      action: string;
      note?: string | null;
      reason?: string | null;
      amount?: number;
      date?: string;
    }
  ): Promise<ContractorClaim> =>
    request<ContractorClaim>(`/contractor-claims/${id}`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  addDeduction: (
    claimId: string,
    body: { type: ClaimDeductionType; description: string; amount: number }
  ): Promise<ContractorClaim> =>
    request<ContractorClaim>(`/contractor-claims/${claimId}/deductions`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  removeDeduction: (claimId: string, deductionId: string): Promise<ContractorClaim> =>
    request<ContractorClaim>(
      `/contractor-claims/${claimId}/deductions?deductionId=${encodeURIComponent(deductionId)}`,
      { method: "DELETE" }
    ),

  // ── Advances ─────────────────────────────────────────────────────────────
  listAdvances: async (params: Record<string, string> = {}): Promise<ContractorAdvance[]> => {
    const qs = new URLSearchParams(params).toString();
    const res = await request<{ data: ContractorAdvance[] }>(
      `/contractor-advances${qs ? `?${qs}` : ""}`
    );
    return res.data;
  },

  createAdvance: (body: AdvanceFormData): Promise<ContractorAdvance> =>
    request<ContractorAdvance>("/contractor-advances", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  updateAdvance: (
    id: string,
    body: { recoveryPercent?: number | null; notes?: string | null }
  ): Promise<ContractorAdvance> =>
    request<ContractorAdvance>(`/contractor-advances/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  writeOffAdvance: (id: string, reason: string): Promise<ContractorAdvance> =>
    request<ContractorAdvance>(`/contractor-advances/${id}/write-off`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),

  // ── Payments ─────────────────────────────────────────────────────────────
  listPayments: async (params: Record<string, string> = {}): Promise<ContractorPayment[]> => {
    const qs = new URLSearchParams(params).toString();
    const res = await request<{ data: ContractorPayment[] }>(
      `/contractor-payments${qs ? `?${qs}` : ""}`
    );
    return res.data;
  },

  /** Set an Idempotency-Key header to make retries safe. */
  createPayment: (body: PaymentFormData, idempotencyKey?: string): Promise<ContractorPayment> =>
    request<ContractorPayment>("/contractor-payments", {
      method: "POST",
      headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
      body: JSON.stringify(body),
    }),

  allocatePayment: (
    id: string,
    allocations: { claimId: string; amount: number }[]
  ): Promise<ContractorClaim[]> =>
    request<ContractorClaim[]>(`/contractor-payments/${id}/allocations`, {
      method: "POST",
      body: JSON.stringify({ allocations }),
    }),

  removeAllocation: (paymentId: string, allocationId: string): Promise<PaymentAllocation> =>
    request<PaymentAllocation>(
      `/contractor-payments/${paymentId}/allocations?allocationId=${encodeURIComponent(allocationId)}`,
      { method: "DELETE" }
    ),

  reversePayment: (id: string, reason: string): Promise<ContractorPayment> =>
    request<ContractorPayment>(`/contractor-payments/${id}/reverse`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),

  // ── Ledger ───────────────────────────────────────────────────────────────
  getLedger: async (
    contractorId: string,
    params: Record<string, string> = {}
  ): Promise<LedgerStatement> => {
    const qs = new URLSearchParams(params).toString();
    return request<LedgerStatement>(
      `/contractors/${contractorId}/ledger${qs ? `?${qs}` : ""}`
    );
  },

  getOutstanding: (contractorId: string): Promise<OutstandingResponse> =>
    request<OutstandingResponse>(`/contractors/${contractorId}/outstanding`),
};

export type { ContractorLedgerEntry };
