// Single source of truth for the payroll vocabulary defined in
// Plan-payroll.pdf ("Finalized Decisions & Immediate Actions").
// Shared by server services, API routes and UI components.
//
// Schema note: `Payroll.status` / `Payroll.type` are plain String columns in
// both prisma/schema.prisma (SQLite) and prisma/schema.pg.prisma, exactly as
// they were before this module existed — the allowed values are enforced here
// so that client and server agree on the lifecycle.

export const PAYROLL_STATUSES = [
  "DRAFT",
  "APPROVED",
  "PARTIALLY_PAID",
  "PAID",
  "NEEDS_RECALCULATION",
  "CANCELLED",
] as const;

export type PayrollStatus = (typeof PAYROLL_STATUSES)[number];

export const PAYROLL_STATUS_LABELS: Record<PayrollStatus, string> = {
  DRAFT: "Draft",
  APPROVED: "Approved",
  PARTIALLY_PAID: "Partially Paid",
  PAID: "Paid",
  NEEDS_RECALCULATION: "Needs Recalculation",
  CANCELLED: "Cancelled",
};

// Allowed lifecycle transitions (Plan-payroll.pdf §2 action 8).
export const PAYROLL_STATUS_TRANSITIONS: Record<PayrollStatus, PayrollStatus[]> =
  {
    DRAFT: ["APPROVED", "CANCELLED"],
    APPROVED: ["PARTIALLY_PAID", "PAID", "DRAFT", "CANCELLED"],
    PARTIALLY_PAID: ["PAID", "DRAFT", "CANCELLED"],
    PAID: [],
    NEEDS_RECALCULATION: ["DRAFT", "CANCELLED"],
    CANCELLED: [],
  };

export function isPayrollStatus(value: unknown): value is PayrollStatus {
  return (
    typeof value === "string" &&
    (PAYROLL_STATUSES as readonly string[]).includes(value)
  );
}

export function canTransitionPayrollStatus(
  from: PayrollStatus,
  to: PayrollStatus
): boolean {
  return PAYROLL_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

// Lines (and therefore the payroll record itself) stay editable while the
// payroll is open: drafts, approved/unpaid payrolls and partially paid
// payrolls whose recorded payments are preserved (PDF §1 "Payroll Editing &
// Correction" — "HR can edit payroll until payment begins", and a partially
// paid payroll can be modified while its payment history is kept). PAID and
// CANCELLED are locked.
export function isPayrollEditable(status: string): boolean {
  return (
    status === "DRAFT" ||
    status === "APPROVED" ||
    status === "NEEDS_RECALCULATION" ||
    status === "PARTIALLY_PAID"
  );
}

export function isPayrollPaymentBegun(status: PayrollStatus): boolean {
  return status === "PARTIALLY_PAID" || status === "PAID";
}

export function isTerminalPayrollStatus(status: PayrollStatus): boolean {
  return status === "PAID" || status === "CANCELLED";
}

// Statuses whose advance allocations are live: a payroll that has been approved
// still "owns" its advance allocations while it is being paid, and after it is
// fully paid. Draft / cancelled / recalculation-pending payrolls hold none.
export const ALLOCATING_PAYROLL_STATUSES: readonly PayrollStatus[] = [
  "APPROVED",
  "PARTIALLY_PAID",
  "PAID",
];

// Payroll.type
export const PAYROLL_TYPES = ["STANDARD", "FINAL_SETTLEMENT"] as const;
export type PayrollType = (typeof PAYROLL_TYPES)[number];

export const PAYROLL_TYPE_LABELS: Record<PayrollType, string> = {
  STANDARD: "Standard Payroll",
  FINAL_SETTLEMENT: "Final Settlement",
};

export function isPayrollType(value: unknown): value is PayrollType {
  return (
    typeof value === "string" && (PAYROLL_TYPES as readonly string[]).includes(value)
  );
}

// Line-level payment marker (kept alongside the payroll-level status).
export const PAYROLL_LINE_PAYMENT_STATUSES = [
  "UNPAID",
  "PARTIALLY_PAID",
  "PAID",
] as const;
export type PayrollLinePaymentStatus =
  (typeof PAYROLL_LINE_PAYMENT_STATUSES)[number];

// PayrollAdjustment.kind — every adjustment requires a reason (PDF §1).
export const PAYROLL_ADJUSTMENT_KINDS = [
  "PREVIOUS_OVERPAYMENT_DEDUCTION",
  "PREVIOUS_UNDERPAYMENT_EARNING",
  "OTHER",
] as const;
export type PayrollAdjustmentKind = (typeof PAYROLL_ADJUSTMENT_KINDS)[number];

export const PAYROLL_ADJUSTMENT_KIND_LABELS: Record<
  PayrollAdjustmentKind,
  string
> = {
  PREVIOUS_OVERPAYMENT_DEDUCTION: "Previous Overpayment Adjustment",
  PREVIOUS_UNDERPAYMENT_EARNING: "Previous Underpayment Adjustment",
  OTHER: "Payroll Adjustment",
};

export function isPayrollAdjustmentKind(
  value: unknown
): value is PayrollAdjustmentKind {
  return (
    typeof value === "string" &&
    (PAYROLL_ADJUSTMENT_KINDS as readonly string[]).includes(value)
  );
}

// Payment methods available for salary payments and paid advances
// (PDF §2 actions 5 and 6). A superset of these exists for expenses in
// src/types/expense.ts (PAYMENT_METHODS).
export const PAYROLL_PAYMENT_METHODS = [
  "CASH",
  "BANK_TRANSFER",
  "COMPANY_WALLET",
] as const;
export type PayrollPaymentMethod = (typeof PAYROLL_PAYMENT_METHODS)[number];

export const PAYROLL_PAYMENT_METHOD_LABELS: Record<
  PayrollPaymentMethod,
  string
> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank Transfer",
  COMPANY_WALLET: "Company Wallet",
};

export function isPayrollPaymentMethod(
  value: unknown
): value is PayrollPaymentMethod {
  return (
    typeof value === "string" &&
    (PAYROLL_PAYMENT_METHODS as readonly string[]).includes(value)
  );
}

// AccountingEntry.type — corrections always post a reversal + a corrected
// entry instead of mutating history (PDF §4 guardrails).
export const ACCOUNTING_ENTRY_TYPES = [
  "PAYROLL_APPROVAL",
  "PAYROLL_PAYMENT",
  "PAYROLL_REVERSAL",
  "PAYROLL_CORRECTION",
  "ADVANCE_PAYMENT",
  "EXPENSE_REIMBURSEMENT",
  "OTHER",
] as const;
export type AccountingEntryType = (typeof ACCOUNTING_ENTRY_TYPES)[number];

export const ACCOUNTING_ENTRY_TYPE_LABELS: Record<AccountingEntryType, string> =
  {
    PAYROLL_APPROVAL: "Payroll Approval",
    PAYROLL_PAYMENT: "Salary Payment",
    PAYROLL_REVERSAL: "Reversal",
    PAYROLL_CORRECTION: "Correction",
    ADVANCE_PAYMENT: "Advance Payment",
    EXPENSE_REIMBURSEMENT: "Reimbursement",
    OTHER: "Other",
  };

export function isAccountingEntryType(
  value: unknown
): value is AccountingEntryType {
  return (
    typeof value === "string" &&
    (ACCOUNTING_ENTRY_TYPES as readonly string[]).includes(value)
  );
}
