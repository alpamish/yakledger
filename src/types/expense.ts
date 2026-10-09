// Expense Tracking Application - Type Definitions

export const CATEGORIES = [
  "FUEL",
  "SALARY",
  "MAINTENANCE",
  "REPAIR",
  "TRANSPORTATION",
  "MACHINERY",
  "MACHINERY_TRANSPORTATION",
  "FOOD",
  "MATERIALS",
  "EQUIPMENT_RENTAL",
  "OFFICE_EXPENSE",
  "REWARD",
  "BONUS",
  "MEDICATION",
  "LOG",
  "RENT",
  "UTILITIES",
  "TRAVEL",
  "MISCELLANEOUS",
] as const;

export const PAYMENT_METHODS = [
  "CASH",
  "BANK_TRANSFER",
  "CHECK",
  "CREDIT_CARD",
  "DEBIT_CARD",
  "MOBILE_PAYMENT",
  "COMPANY_WALLET",
  "OTHER",
] as const;

export type Category = (typeof CATEGORIES)[number];
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

import { ROLES, ROLE_LABELS } from "@/lib/permission-catalog";
import type { Role } from "@/lib/permission-catalog";

export { ROLES, ROLE_LABELS };
export type { Role };

// ─── Permission System Types ──────────────────────────────────────────────────

export const MODULES = [
  "dashboard", "projectCost", "expenses", "employees", "contractors",
  "timesheets", "fuelUsage", "machinery", "assets",
  "cashAdvance", "wallets", "reports", "settings", "users",
] as const;
export type Module = (typeof MODULES)[number];

export const PERMISSION_ACTIONS = ["view", "create", "edit", "delete", "approve", "managePermissions"] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

export function buildPermissionName(module: Module, action: PermissionAction): string {
  return `${module}:${action}`;
}

// ─── Approval Workflow Types ──────────────────────────────────────────────────

export const APPROVAL_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const APPROVAL_STATUS_LABELS: Record<ApprovalStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

export const APPROVAL_STATUS_COLORS: Record<ApprovalStatus, string> = {
  PENDING: "#f59e0b",
  APPROVED: "#10b981",
  REJECTED: "#ef4444",
};

export const RECORD_ACCESS_TYPES = ["view", "edit"] as const;
export type RecordAccessType = (typeof RECORD_ACCESS_TYPES)[number];

export interface ApprovalItem {
  entity: string;
  id: string;
  summary: string;
  amount?: number;
  totalHours?: number;
  date?: string;
  status: ApprovalStatus;
  approvalNote: string | null;
  createdAt: string;
  createdBy: { id: string; name: string } | null;
}

export interface ApprovalsResponse {
  items: ApprovalItem[];
  counts: Record<string, number>;
  total: number;
  totalPages: number;
  page: number;
  pageSize: number;
}

export interface RecordAccessGrant {
  id: string;
  entity: string;
  entityId: string;
  userId: string;
  accessType: RecordAccessType;
  grantedBy: string;
  createdAt: string;
  user?: { id: string; name: string; email: string; role: string };
}

export interface PermissionDefinition {
  name: string;
  label: string;
  description?: string;
  module: Module;
}

export interface PermissionInfo {
  id: string;
  name: string;
  label: string;
  description: string | null;
  module: Module;
}

export interface UserPermissionInfo {
  id: string;
  permissionId: string;
  permission: PermissionInfo;
  granted: boolean;
}

export type PermissionsMap = Record<string, boolean>;

export const UNIT_OPTIONS = [
  "unit", "ea", "pcs", "kg", "gram", "liter", "meter",
  "pair", "set", "box", "pack", "packet", "bundle", "roll", "carton",
  "bag", "sack", "bottle", "can", "barrel", "tube", "sheet", "block",
  "doz", "gross", "pallet", "hour", "day", "month", "other"
] as const;

export type Unit = (typeof UNIT_OPTIONS)[number];

export const UNIT_LABELS: Record<Unit, string> = {
  pcs: "Piece (pcs)",
  unit: "Unit (unit)",
  ea: "Each (ea)",
  pair: "Pair",
  set: "Set",
  box: "Box",
  carton: "Carton",
  pack: "Pack",
  packet: "Packet",
  bundle: "Bundle",
  roll: "Roll",
  doz: "Dozen (doz)",
  gross: "Gross",
  pallet: "Pallet",
  bag: "Bag",
  sack: "Sack",
  bottle: "Bottle",
  can: "Can",
  barrel: "Barrel",
  tube: "Tube",
  sheet: "Sheet",
  block: "Block",
  gram: "Gram",
  kg: "kg",
  liter: "liter",
  meter: "meter",
  hour: "hour",
  day: "day",
  month: "month",
  other: "other",
};

export interface ExpenseItem {
  id: string;
  itemName: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  avatar?: string | null;
  createdAt: string;
  updatedAt: string;
  userPermissions?: UserPermissionInfo[];
}

export interface Expense {
  id: string;
  title: string;
  description?: string | null;
  category: Category;
  amount: number;
  paymentMethod: PaymentMethod;
  paidTo: string;
  paidBy: string;
  expenseDate: string;
  attachment?: string | null;
  tags?: string | null;
  notes?: string | null;
  currency: string;
  createdBy: string;
  paidById?: string | null;
  paidToId?: string | null;
  paidToContractorId?: string | null;
  paidByContractorId?: string | null;
  walletId?: string | null;
  deductFromWallet?: boolean;
  reimbursedAt?: string | null;
  reimbursedById?: string | null;
  reimbursementMethod?: string | null;
  createdAt: string;
  updatedAt: string;
  approvalStatus?: ApprovalStatus;
  approvalNote?: string | null;
  approvedById?: string | null;
  approvedAt?: string | null;
  creator?: User;
  paidByEmployee?: { id: string; fullName: string; jobTitle: string; department: string } | null;
  paidToEmployee?: { id: string; fullName: string; jobTitle: string; department: string } | null;
  paidToContractor?: { id: string; contractorName: string; fatherName: string; contractorType: string } | null;
  paidByContractor?: { id: string; contractorName: string; contractorType: string } | null;
}

export interface ExpenseFormData {
  title: string;
  description?: string | null;
  category: Category;
  amount: number;
  paymentMethod: PaymentMethod;
  paidTo: string;
  paidBy: string;
  expenseDate: string;
  attachment?: string | null;
  tags?: string | null;
  notes?: string | null;
  currency?: string;
  paidById?: string | null;
  paidToId?: string | null;
  paidToContractorId?: string | null;
  paidByContractorId?: string | null;
  walletId?: string | null;
  deductFromWallet?: boolean;
}

export interface BulkExpenseRecord {
  title: string;
  description?: string | null;
  category: Category;
  amount: number;
  paymentMethod: PaymentMethod;
  paidTo: string;
  paidBy: string;
  expenseDate: string;
  attachment?: string | null;
  tags?: string | null;
  notes?: string | null;
  currency?: string;
  paidById?: string | null;
  paidToId?: string | null;
  paidToContractorId?: string | null;
  paidByContractorId?: string | null;
  walletId?: string | null;
  deductFromWallet?: boolean;
}

export interface ExpenseFilters {
  search?: string;
  searchField?: string;
  categories?: Category[];
  paymentMethods?: PaymentMethod[];
  dateFrom?: string;
  dateTo?: string;
  amountMin?: number;
  amountMax?: number;
  paidBy?: string;
  paidTo?: string;
  paidById?: string;
  paidToId?: string;
  tags?: string;
}

export interface DashboardStats {
  totalExpenses: number;
  totalAmount: number;
  averageAmount: number;
  expensesThisMonth: number;
  amountThisMonth: number;
  expensesByCategory: { category: string; amount: number; count: number }[];
  monthlyTrend: { month: string; amount: number; count: number }[];
  recentExpenses: Expense[];
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

export interface AuditLog {
  id: string;
  action: string;
  entity: string;
  entityId?: string | null;
  details?: string | null;
  userId: string;
  createdAt: string;
  user?: User;
}

// Label mappings for display

export interface EmployeeListItem {
  id: string;
  fullName: string;
  jobTitle: string;
  department: string;
}

// ─── Cash Advance / Wallet Types ─────────────────────────────────────────────

export const CASH_TRANSACTION_TYPES = [
  "ADVANCE",
  "RETURN",
  "ADJUSTMENT",
  "SALARY_PAYMENT",
  "REIMBURSEMENT",
  "LOAN",
  "LOAN_REPAYMENT",
] as const;
export type CashTransactionType = (typeof CASH_TRANSACTION_TYPES)[number];

export const CASH_TRANSACTION_TYPE_LABELS: Record<CashTransactionType, string> = {
  ADVANCE: "Cash Advance",
  RETURN: "Cash Return",
  ADJUSTMENT: "Adjustment",
  SALARY_PAYMENT: "Salary Payment",
  REIMBURSEMENT: "Reimbursement",
  LOAN: "Loan",
  LOAN_REPAYMENT: "Loan Repayment",
};

export interface EmployeeCashAccount {
  id: string;
  employeeId: string;
  currentBalance: number;
  createdAt: string;
  updatedAt: string;
  employee?: { id: string; fullName: string; jobTitle: string; department: string };
}

export interface CashTransaction {
  id: string;
  employeeId: string;
  type: CashTransactionType;
  amount: number;
  note?: string | null;
  referenceNumber?: string | null;
  dueDate?: string | null;
  paymentMethod?: PaymentMethod | string | null;
  paidAt?: string | null;
  editedAt?: string | null;
  editedById?: string | null;
  /** Portion already consumed by approved payrolls (advances only). */
  allocatedAmount?: number;
  createdBy: string;
  createdAt: string;
  approvalStatus?: ApprovalStatus;
  approvalNote?: string | null;
  employee?: { id: string; fullName: string; jobTitle: string; department: string };
  creator?: { id: string; name: string };
}

export interface CashTransactionFormData {
  employeeId: string;
  type: CashTransactionType;
  amount: number;
  note?: string;
  referenceNumber?: string;
  dueDate?: string | null;
  paymentMethod?: string;
  walletId?: string;
}

export interface Transfer {
  id: string;
  fromEmployeeId: string;
  toEmployeeId: string;
  amount: number;
  note?: string | null;
  referenceNumber?: string | null;
  createdBy: string;
  createdAt: string;
  approvalStatus?: ApprovalStatus;
  approvalNote?: string | null;
  fromEmployee?: { id: string; fullName: string; jobTitle: string; department: string };
  toEmployee?: { id: string; fullName: string; jobTitle: string; department: string };
  creator?: { id: string; name: string };
}

export interface CashTransactionFilters {
  search?: string;
  type?: string;
  dateFrom?: string;
  dateTo?: string;
  amountMin?: number;
  amountMax?: number;
}

export interface TransferFormData {
  fromEmployeeId: string;
  toEmployeeId: string;
  amount: number;
  note?: string;
}

export interface LedgerEntry {
  id: string;
  date: string;
  type:
    | "ADVANCE"
    | "RETURN"
    | "ADJUSTMENT"
    | "SALARY_PAYMENT"
    | "REIMBURSEMENT"
    | "LOAN"
    | "LOAN_REPAYMENT"
    | "EXPENSE"
    | "TRANSFER";
  description: string;
  amount: number;
  runningBalance: number;
}

export const CASH_TXN_TYPE_COLORS: Record<CashTransactionType, string> = {
  ADVANCE: "#f59e0b",
  RETURN: "#10b981",
  ADJUSTMENT: "#6366f1",
  SALARY_PAYMENT: "#0ea5e9",
  REIMBURSEMENT: "#14b8a6",
  LOAN: "#e11d48",
  LOAN_REPAYMENT: "#84cc16",
};

export const CATEGORY_LABELS: Record<Category, string> = {
  FUEL: "Fuel",
  SALARY: "Salary",
  MAINTENANCE: "Maintenance",
  REPAIR: "Repair",
  TRANSPORTATION: "Transportation",
  MACHINERY: "Machinery",
  MACHINERY_TRANSPORTATION: "Machinery Transportation",
  FOOD: "Food",
  MATERIALS: "Materials",
  EQUIPMENT_RENTAL: "Equipment Rental",
  OFFICE_EXPENSE: "Office Expense",
  REWARD: "Reward",
  BONUS: "Bonus",
  MEDICATION: "Medication",
  LOG: "Log",
  RENT: "Rent",
  UTILITIES: "Utilities",
  TRAVEL: "Travel",
  MISCELLANEOUS: "Miscellaneous",
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank Transfer",
  CHECK: "Check",
  CREDIT_CARD: "Credit Card",
  DEBIT_CARD: "Debit Card",
  MOBILE_PAYMENT: "Mobile Payment",
  COMPANY_WALLET: "Company Wallet",
  OTHER: "Other",
};

export const CATEGORY_COLORS: Record<Category, string> = {
  FUEL: "#ef4444",
  SALARY: "#3b82f6",
  MAINTENANCE: "#f59e0b",
  REPAIR: "#eab308",
  TRANSPORTATION: "#10b981",
  MACHINERY: "#8b5cf6",
  MACHINERY_TRANSPORTATION: "#ec4899",
  FOOD: "#f97316",
  MATERIALS: "#06b6d4",
  EQUIPMENT_RENTAL: "#84cc16",
  OFFICE_EXPENSE: "#6366f1",
  REWARD: "#ec4899",
  BONUS: "#f59e0b",
  MEDICATION: "#14b8a6",
  LOG: "#64748b",
  RENT: "#a855f7",
  UTILITIES: "#0ea5e9",
  TRAVEL: "#f43f5e",
  MISCELLANEOUS: "#78716c",
};

export const CATEGORY_DEFAULT_ITEMS: Partial<Record<Category, { itemName: string; unit: Unit }>> = {
  FUEL:                     { itemName: "Fuel",                     unit: "liter" },
  SALARY:                   { itemName: "Salary",                   unit: "month" },
  MAINTENANCE:              { itemName: "Maintenance",              unit: "pcs" },
  REPAIR:                   { itemName: "Repair",                   unit: "pcs" },
  TRANSPORTATION:           { itemName: "Transportation",           unit: "other" },
  MACHINERY:                { itemName: "Machinery",                unit: "pcs" },
  MACHINERY_TRANSPORTATION: { itemName: "Machinery Transportation", unit: "other" },
  FOOD:                     { itemName: "Food",                     unit: "kg" },
  MATERIALS:                { itemName: "Materials",                unit: "pcs" },
  EQUIPMENT_RENTAL:         { itemName: "Equipment Rental",         unit: "day" },
  OFFICE_EXPENSE:           { itemName: "Office Expense",           unit: "pcs" },
  REWARD:                   { itemName: "Reward",                   unit: "other" },
  BONUS:                    { itemName: "Bonus",                    unit: "other" },
  MEDICATION:               { itemName: "Medication",               unit: "other" },
  LOG:                      { itemName: "Log",                      unit: "other" },
  RENT:                     { itemName: "Rent",                     unit: "month" },
  UTILITIES:                { itemName: "Utilities",                unit: "other" },
  TRAVEL:                   { itemName: "Travel",                   unit: "day" },
  MISCELLANEOUS:            { itemName: "Miscellaneous",            unit: "pcs" },
};
