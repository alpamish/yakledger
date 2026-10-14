// API client for contractor authorization & compliance (Phase 5): contacts,
// bank accounts, documents, payment authorizations, the compliance status
// summary, and lifecycle actions (suspend / blacklist / reactivate).
import type {
  ContractorBankAccount,
  ContractorComplianceStatus,
  ContractorContact,
  ContractorDocument,
  ContractorStatus,
  PaymentAuthorization,
} from "@/types/contractor";
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

export interface ContactFormData {
  name: string;
  role?: string | null;
  phone: string;
  email?: string | null;
  isPrimary?: boolean;
  notes?: string | null;
}

export interface BankAccountFormData {
  accountName: string;
  accountNumber: string;
  bankName: string;
  branch?: string | null;
  isDefault?: boolean;
  notes?: string | null;
}

export interface DocumentFormData {
  docType: string;
  title: string;
  documentNumber?: string | null;
  issueDate?: string | null;
  expiryDate?: string | null;
  fileUrl?: string | null;
  notes?: string | null;
}

export interface AuthorizationFormData {
  contractorId: string;
  receiverName: string;
  validFrom: string;
  validTo?: string | null;
  maxAmount?: number | null;
  notes?: string | null;
}

export type LifecycleAction = "suspend" | "blacklist" | "reactivate";

export interface LifecycleResult {
  id: string;
  contractorName: string;
  status: ContractorStatus;
  suspendedAt?: string | null;
  suspendedReason?: string | null;
  blacklistedAt?: string | null;
  blacklistedReason?: string | null;
  statusChangedById?: string | null;
  updatedAt: string;
}

export const contractorComplianceApi = {
  // ── Compliance status ────────────────────────────────────────────────────
  getCompliance: (contractorId: string): Promise<ContractorComplianceStatus> =>
    request<ContractorComplianceStatus>(`/contractors/${contractorId}/compliance`),

  // ── Lifecycle ────────────────────────────────────────────────────────────
  lifecycle: (
    contractorId: string,
    body: { action: LifecycleAction; reason?: string | null }
  ): Promise<LifecycleResult> =>
    request<LifecycleResult>(`/contractors/${contractorId}/lifecycle`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  // ── Contacts ─────────────────────────────────────────────────────────────
  listContacts: (contractorId: string): Promise<ContractorContact[]> =>
    request<ContractorContact[]>(`/contractors/${contractorId}/contacts`),

  createContact: (contractorId: string, body: ContactFormData): Promise<ContractorContact> =>
    request<ContractorContact>(`/contractors/${contractorId}/contacts`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  updateContact: (
    contractorId: string,
    contactId: string,
    body: Partial<ContactFormData>
  ): Promise<ContractorContact> =>
    request<ContractorContact>(`/contractors/${contractorId}/contacts/${contactId}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  deleteContact: (contractorId: string, contactId: string): Promise<{ id: string }> =>
    request(`/contractors/${contractorId}/contacts/${contactId}`, { method: "DELETE" }),

  // ── Bank accounts ────────────────────────────────────────────────────────
  listBankAccounts: (contractorId: string): Promise<ContractorBankAccount[]> =>
    request<ContractorBankAccount[]>(`/contractors/${contractorId}/bank-accounts`),

  createBankAccount: (
    contractorId: string,
    body: BankAccountFormData
  ): Promise<ContractorBankAccount> =>
    request<ContractorBankAccount>(`/contractors/${contractorId}/bank-accounts`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  updateBankAccount: (
    contractorId: string,
    accountId: string,
    body: Partial<BankAccountFormData>
  ): Promise<ContractorBankAccount> =>
    request<ContractorBankAccount>(
      `/contractors/${contractorId}/bank-accounts/${accountId}`,
      { method: "PUT", body: JSON.stringify(body) }
    ),

  deleteBankAccount: (contractorId: string, accountId: string): Promise<{ id: string }> =>
    request(`/contractors/${contractorId}/bank-accounts/${accountId}`, {
      method: "DELETE",
    }),

  /** Verify (default) or unverify ({ verified: false }) — contractors:authorize only. */
  verifyBankAccount: (
    contractorId: string,
    accountId: string,
    verified = true
  ): Promise<ContractorBankAccount> =>
    request<ContractorBankAccount>(
      `/contractors/${contractorId}/bank-accounts/${accountId}/verify`,
      { method: "POST", body: JSON.stringify({ verified }) }
    ),

  // ── Documents ────────────────────────────────────────────────────────────
  listDocuments: (contractorId: string): Promise<ContractorDocument[]> =>
    request<ContractorDocument[]>(`/contractors/${contractorId}/documents`),

  createDocument: (contractorId: string, body: DocumentFormData): Promise<ContractorDocument> =>
    request<ContractorDocument>(`/contractors/${contractorId}/documents`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  updateDocument: (
    contractorId: string,
    docId: string,
    body: Partial<DocumentFormData>
  ): Promise<ContractorDocument> =>
    request<ContractorDocument>(`/contractors/${contractorId}/documents/${docId}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  deleteDocument: (contractorId: string, docId: string): Promise<{ id: string }> =>
    request(`/contractors/${contractorId}/documents/${docId}`, { method: "DELETE" }),

  // ── Payment authorizations ───────────────────────────────────────────────
  listAuthorizations: (
    params: Record<string, string> = {}
  ): Promise<{ total: number; page: number; pageSize: number; data: PaymentAuthorization[] }> => {
    const qs = new URLSearchParams(params).toString();
    return request(`/payment-authorizations${qs ? `?${qs}` : ""}`);
  },

  createAuthorization: (body: AuthorizationFormData): Promise<PaymentAuthorization> =>
    request<PaymentAuthorization>("/payment-authorizations", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  updateAuthorization: (
    id: string,
    body: Partial<Omit<AuthorizationFormData, "contractorId">>
  ): Promise<PaymentAuthorization> =>
    request<PaymentAuthorization>(`/payment-authorizations/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  revokeAuthorization: (id: string, reason?: string | null): Promise<PaymentAuthorization> =>
    request<PaymentAuthorization>(`/payment-authorizations/${id}/revoke`, {
      method: "POST",
      body: JSON.stringify({ reason: reason ?? null }),
    }),
};
