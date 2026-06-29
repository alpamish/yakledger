// Expense Tracking Application - Type Definitions

export const CATEGORIES = [
  "FUEL",
  "SALARY",
  "MAINTENANCE",
  "TRANSPORTATION",
  "MACHINERY",
  "MACHINERY_TRANSPORTATION",
  "FOOD",
  "MATERIALS",
  "EQUIPMENT_RENTAL",
  "OFFICE_EXPENSE",
  "MISCELLANEOUS",
] as const;

export const PAYMENT_METHODS = [
  "CASH",
  "BANK_TRANSFER",
  "CHECK",
  "CREDIT_CARD",
  "DEBIT_CARD",
  "MOBILE_PAYMENT",
  "OTHER",
] as const;

export const ROLES = ["ADMIN", "MANAGER", "USER", "WATCHER", "TIMESHEET_USER"] as const;

export type Category = (typeof CATEGORIES)[number];
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrator",
  MANAGER: "Manager",
  USER: "User",
  WATCHER: "Watcher",
  TIMESHEET_USER: "Timesheet User",
};

// ─── Permission System Types ──────────────────────────────────────────────────

export const MODULES = [
  "dashboard", "expenses", "employees", "contractors",
  "timesheets", "fuelUsage", "machinery", "assets",
  "cashAdvance", "reports", "settings", "users",
] as const;
export type Module = (typeof MODULES)[number];

export const PERMISSION_ACTIONS = ["view", "create", "edit", "delete", "approve", "managePermissions"] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

export function buildPermissionName(module: Module, action: PermissionAction): string {
  return `${module}:${action}`;
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
  "pcs", "kg", "liter", "meter", "hour", "day", "month", "set", "box", "other"
] as const;

export type Unit = (typeof UNIT_OPTIONS)[number];

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
  createdAt: string;
  updatedAt: string;
  creator?: User;
  paidByEmployee?: { id: string; fullName: string; jobTitle: string; department: string } | null;
  paidToEmployee?: { id: string; fullName: string; jobTitle: string; department: string } | null;
  paidToContractor?: { id: string; contractorName: string; fatherName: string; contractorType: string } | null;
  paidByContractor?: { id: string; contractorName: string; contractorType: string } | null;
}

export interface ExpenseFormData {
  title: string;
  description?: string;
  category: Category;
  amount: number;
  paymentMethod: PaymentMethod;
  paidTo: string;
  paidBy: string;
  expenseDate: string;
  attachment?: string;
  tags?: string;
  notes?: string;
  currency?: string;
  paidById?: string;
  paidToId?: string;
  paidToContractorId?: string;
  paidByContractorId?: string;
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

export const CASH_TRANSACTION_TYPES = ["ADVANCE", "RETURN", "ADJUSTMENT"] as const;
export type CashTransactionType = (typeof CASH_TRANSACTION_TYPES)[number];

export const CASH_TRANSACTION_TYPE_LABELS: Record<CashTransactionType, string> = {
  ADVANCE: "Cash Advance",
  RETURN: "Cash Return",
  ADJUSTMENT: "Adjustment",
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
  createdById: string;
  createdAt: string;
  employee?: { id: string; fullName: string; jobTitle: string; department: string };
  creator?: { id: string; name: string };
}

export interface CashTransactionFormData {
  employeeId: string;
  type: CashTransactionType;
  amount: number;
  note?: string;
  referenceNumber?: string;
}

export interface Transfer {
  id: string;
  fromEmployeeId: string;
  toEmployeeId: string;
  amount: number;
  note?: string | null;
  referenceNumber?: string | null;
  createdById: string;
  createdAt: string;
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
  type: "ADVANCE" | "RETURN" | "ADJUSTMENT" | "EXPENSE" | "TRANSFER";
  description: string;
  amount: number;
  runningBalance: number;
}

export const CASH_TXN_TYPE_COLORS: Record<CashTransactionType, string> = {
  ADVANCE: "#f59e0b",
  RETURN: "#10b981",
  ADJUSTMENT: "#6366f1",
};

export const CATEGORY_LABELS: Record<Category, string> = {
  FUEL: "Fuel",
  SALARY: "Salary",
  MAINTENANCE: "Maintenance",
  TRANSPORTATION: "Transportation",
  MACHINERY: "Machinery",
  MACHINERY_TRANSPORTATION: "Machinery Transportation",
  FOOD: "Food",
  MATERIALS: "Materials",
  EQUIPMENT_RENTAL: "Equipment Rental",
  OFFICE_EXPENSE: "Office Expense",
  MISCELLANEOUS: "Miscellaneous",
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank Transfer",
  CHECK: "Check",
  CREDIT_CARD: "Credit Card",
  DEBIT_CARD: "Debit Card",
  MOBILE_PAYMENT: "Mobile Payment",
  OTHER: "Other",
};

export const CATEGORY_COLORS: Record<Category, string> = {
  FUEL: "#ef4444",
  SALARY: "#3b82f6",
  MAINTENANCE: "#f59e0b",
  TRANSPORTATION: "#10b981",
  MACHINERY: "#8b5cf6",
  MACHINERY_TRANSPORTATION: "#ec4899",
  FOOD: "#f97316",
  MATERIALS: "#06b6d4",
  EQUIPMENT_RENTAL: "#84cc16",
  OFFICE_EXPENSE: "#6366f1",
  MISCELLANEOUS: "#78716c",
};
