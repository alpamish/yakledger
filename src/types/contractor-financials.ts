// Types for the contractor financial subsystem (Phase 4): claims, advances,
// payments, and the ledger statement. Mirrors the API responses.

// ─── Claims ─────────────────────────────────────────────────────────────────

export const CLAIM_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "VERIFIED",
  "FINANCE_REVIEW",
  "APPROVED",
  "POSTED",
  "PARTIALLY_PAID",
  "PAID",
  "REJECTED",
  "VOID",
] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export const CLAIM_STATUS_LABELS: Record<ClaimStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  VERIFIED: "Verified",
  FINANCE_REVIEW: "Finance Review",
  APPROVED: "Approved",
  POSTED: "Posted",
  PARTIALLY_PAID: "Partially Paid",
  PAID: "Paid",
  REJECTED: "Rejected",
  VOID: "Void",
};

export const CLAIM_STATUS_COLORS: Record<ClaimStatus, string> = {
  DRAFT: "#94a3b8",
  SUBMITTED: "#f59e0b",
  VERIFIED: "#8b5cf6",
  FINANCE_REVIEW: "#06b6d4",
  APPROVED: "#10b981",
  POSTED: "#3b82f6",
  PARTIALLY_PAID: "#f97316",
  PAID: "#22c55e",
  REJECTED: "#ef4444",
  VOID: "#64748b",
};

/** Workflow actions posted to /api/contractor-claims/[id]. */
export type ClaimWorkflowAction =
  | "submit"
  | "verify"
  | "financeReview"
  | "approve"
  | "reject"
  | "void"
  | "reverse";

export const CLAIM_DEDUCTION_TYPES = [
  "FUEL",
  "PENALTY",
  "MATERIALS",
  "ACCOMMODATION",
  "FOOD",
  "TRANSPORT",
  "TAX",
  "OTHER",
] as const;
export type ClaimDeductionType = (typeof CLAIM_DEDUCTION_TYPES)[number];

export const CLAIM_DEDUCTION_TYPE_LABELS: Record<ClaimDeductionType, string> = {
  FUEL: "Fuel",
  PENALTY: "Penalty",
  MATERIALS: "Materials",
  ACCOMMODATION: "Accommodation",
  FOOD: "Food",
  TRANSPORT: "Transport",
  TAX: "Tax",
  OTHER: "Other",
};

export interface ClaimLine {
  id: string;
  claimId: string;
  sourceType: string; // TIMESHEET | MANUAL | VARIATION
  timesheetId: string | null;
  description: string;
  quantity: number;
  unitLabel: string | null;
  rateLabel: string | null;
  rateAmount: number;
  amount: number;
}

export interface ClaimDeduction {
  id: string;
  claimId: string;
  type: ClaimDeductionType | string;
  description: string;
  amount: number;
  appliedBy: string;
  createdAt: string;
}

export interface RetentionRelease {
  id: string;
  claimId: string;
  amount: number;
  date: string;
  reason: string;
  releasedBy: string;
  createdAt: string;
}

export interface AdvanceRecovery {
  id: string;
  advanceId: string;
  claimId: string;
  amount: number;
  date: string;
  claim?: { claimNumber: string; netAmount: number };
}

export interface PaymentAllocation {
  id: string;
  paymentId: string;
  claimId: string;
  amount: number;
  createdAt: string;
  claim?: { id: string; claimNumber: string; title: string };
}

export interface ContractorClaim {
  id: string;
  claimNumber: string;
  contractorId: string;
  contractId: string;
  title: string;
  periodStart: string;
  periodEnd: string;
  grossAmount: number;
  retentionPercent: number;
  retentionAmount: number;
  deductionsTotal: number;
  advanceRecoveryTotal: number;
  netAmount: number;
  paidAmount: number;
  status: ClaimStatus | string;
  approvalStatus: string;
  approvedById: string | null;
  approvedAt: string | null;
  approvalNote: string | null;
  postedAt: string | null;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  contractor?: { id: string; contractorName: string; contractorNumber: string | null };
  contract?: { id: string; contractNumber: string; title: string; retentionPercent?: number };
  creator?: { id: string; name: string };
  lines?: ClaimLine[];
  deductions?: ClaimDeduction[];
  allocations?: PaymentAllocation[];
  advanceRecoveries?: AdvanceRecovery[];
  retentionReleases?: RetentionRelease[];
  _count?: { lines: number; deductions: number; allocations: number };
}

export interface ClaimListResponse {
  data: ContractorClaim[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ClaimFormData {
  contractId: string;
  timesheetIds: string[];
  title?: string;
  periodStart?: string;
  periodEnd?: string;
  notes?: string | null;
}

// ─── Advances ───────────────────────────────────────────────────────────────

export const ADVANCE_STATUSES = [
  "OUTSTANDING",
  "PARTIALLY_RECOVERED",
  "RECOVERED",
  "WRITTEN_OFF",
] as const;
export type AdvanceStatus = (typeof ADVANCE_STATUSES)[number];

export const ADVANCE_STATUS_LABELS: Record<AdvanceStatus, string> = {
  OUTSTANDING: "Outstanding",
  PARTIALLY_RECOVERED: "Partially Recovered",
  RECOVERED: "Recovered",
  WRITTEN_OFF: "Written Off",
};

export const ADVANCE_STATUS_COLORS: Record<AdvanceStatus, string> = {
  OUTSTANDING: "#f59e0b",
  PARTIALLY_RECOVERED: "#06b6d4",
  RECOVERED: "#22c55e",
  WRITTEN_OFF: "#94a3b8",
};

export interface ContractorAdvance {
  id: string;
  advanceNumber: string;
  contractorId: string;
  contractId: string | null;
  amount: number;
  date: string;
  recoveredAmount: number;
  recoveryPercent: number | null;
  status: AdvanceStatus | string;
  walletId: string | null;
  expenseId: string | null;
  writtenOffAt: string | null;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  contractor?: { id: string; contractorName: string; contractorNumber: string | null };
  recoveries?: AdvanceRecovery[];
}

export interface AdvanceFormData {
  contractorId: string;
  contractId?: string | null;
  amount: number;
  date: string;
  recoveryPercent?: number | null;
  walletId?: string | null;
  notes?: string | null;
}

// ─── Payments ───────────────────────────────────────────────────────────────

export const PAYMENT_METHODS = ["CASH", "BANK_TRANSFER", "CHEQUE"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank Transfer",
  CHEQUE: "Cheque",
};

export const PAYMENT_STATUSES = ["PENDING", "COMPLETED", "BOUNCED", "REVERSED"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PENDING: "Pending",
  COMPLETED: "Completed",
  BOUNCED: "Bounced",
  REVERSED: "Reversed",
};

export const PAYMENT_STATUS_COLORS: Record<PaymentStatus, string> = {
  PENDING: "#f59e0b",
  COMPLETED: "#10b981",
  BOUNCED: "#ef4444",
  REVERSED: "#64748b",
};

export interface ContractorPayment {
  id: string;
  paymentNumber: string;
  contractorId: string;
  contractId: string | null;
  amount: number;
  paymentDate: string;
  method: PaymentMethod | string;
  walletId: string | null;
  authorizedById: string | null;
  expenseId: string | null;
  status: PaymentStatus | string;
  idempotencyKey: string | null;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  contractor?: { id: string; contractorName: string; contractorNumber: string | null };
  allocations?: PaymentAllocation[];
}

export interface PaymentFormData {
  contractorId: string;
  contractId?: string | null;
  amount: number;
  paymentDate: string;
  method: PaymentMethod;
  walletId?: string | null;
  /** Receiver/authorizer free-text (Phase 5: matched against authorizations). */
  authorizedById?: string | null;
  notes?: string | null;
}

// ─── Ledger ─────────────────────────────────────────────────────────────────

export const LEDGER_ENTRY_TYPES = [
  "CLAIM_POSTED",
  "CLAIM_REVERSAL",
  "RETENTION_HELD",
  "RETENTION_RELEASED",
  "ADVANCE_DISBURSED",
  "ADVANCE_RECOVERY",
  "PAYMENT",
  "PAYMENT_REVERSAL",
  "WRITE_OFF",
] as const;
export type LedgerEntryType = (typeof LEDGER_ENTRY_TYPES)[number];

export const LEDGER_ENTRY_TYPE_LABELS: Record<LedgerEntryType, string> = {
  CLAIM_POSTED: "Claim Posted",
  CLAIM_REVERSAL: "Claim Reversal",
  RETENTION_HELD: "Retention Held",
  RETENTION_RELEASED: "Retention Released",
  ADVANCE_DISBURSED: "Advance Disbursed",
  ADVANCE_RECOVERY: "Advance Recovery",
  PAYMENT: "Payment",
  PAYMENT_REVERSAL: "Payment Reversal",
  WRITE_OFF: "Write Off",
};

/** Types that increase what the company owes the contractor. */
export const POSITIVE_LEDGER_TYPES: string[] = [
  "CLAIM_POSTED",
  "RETENTION_HELD",
  "WRITE_OFF",
];

export interface ContractorLedgerEntry {
  id: string;
  contractorId: string;
  contractId: string | null;
  claimId: string | null;
  paymentId: string | null;
  advanceId: string | null;
  retentionReleaseId: string | null;
  type: LedgerEntryType | string;
  amount: number;
  balanceAfter: number;
  reference: string | null;
  occurredAt: string;
  createdBy: string;
  createdAt: string;
}

export interface LedgerStatement {
  data: ContractorLedgerEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  balance: number;
}

export interface OutstandingClaim {
  claimId: string;
  claimNumber: string;
  title: string;
  netAmount: number;
  paidAmount: number;
  advanceRecoveryTotal: number;
  outstanding: number;
  retentionAmount: number;
  periodEnd: string;
  status: string;
}

export interface AgingBucket {
  bucket: "current" | "0-30" | "31-60" | "61-90" | "90+";
  amount: number;
  claimNumbers: string[];
}

export interface OutstandingResponse {
  contractor: { id: string; contractorName: string; contractorNumber: string | null };
  claims: OutstandingClaim[];
  totalOutstanding: number;
  totalRetention: number;
  aging: { buckets: AgingBucket[]; total: number };
  balance: number;
}
