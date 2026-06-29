// Employee Management Module - Type Definitions

export const DEPARTMENTS = [
  "ADMINISTRATION",
  "FINANCE",
  "OPERATIONS",
  "ENGINEERING",
  "LOGISTICS",
  "SECURITY",
  "MACHINERY_TEAM",
  "LABOR",
  "KITCHEN",
] as const;

export const EMPLOYMENT_TYPES = [
  "FULL_TIME",
  "PART_TIME",
  "CONTRACT",
] as const;

export const EMPLOYEE_STATUSES = [
  "ACTIVE",
  "INACTIVE",
  "TERMINATED",
] as const;

export const GENDERS = ["male", "female", "other"] as const;

export type Department = (typeof DEPARTMENTS)[number];
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];
export type Gender = (typeof GENDERS)[number];

export interface Employee {
  id: string;
  fullName: string;
  fatherName: string;
  gender: string;
  dateOfBirth?: string | null;
  phoneNumber: string;
  email?: string | null;
  address?: string | null;
  nationalId?: string | null;
  jobTitle: string;
  department: Department;
  employmentType: EmploymentType;
  salary: number;
  hireDate: string;
  status: EmployeeStatus;
  quitingDate?: string | null;
  idImageFront?: string | null;
  idImageBack?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  creator?: {
    id: string;
    email: string;
    name: string;
    role: string;
    avatar?: string | null;
  };
  _count?: {
    expensesPaidBy?: number;
    expensesPaidTo?: number;
  };
  expensesPaidBy?: ExpenseBrief[];
  expensesPaidTo?: ExpenseBrief[];
  totalExpensesPaidBy?: number;
  totalExpensesPaidTo?: number;
  // Financial calculation fields
  daysWorked?: number;
  dailySalary?: number;
  earnedSalary?: number;
  netBalance?: number;
}

export interface ExpenseBrief {
  id: string;
  title: string;
  amount: number;
  category: string;
  expenseDate: string;
}

export interface EmployeeFormData {
  fullName: string;
  fatherName: string;
  gender: string;
  dateOfBirth?: string;
  phoneNumber: string;
  email?: string;
  address?: string;
  nationalId?: string;
  jobTitle: string;
  department: Department;
  employmentType: EmploymentType;
  salary: number;
  hireDate: string;
  status: EmployeeStatus;
  quitingDate?: string;
  idImageFront?: string;
  idImageBack?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
}

export const SEARCH_FIELDS = [
  "all",
  "fullName",
  "fatherName",
  "phoneNumber",
  "email",
  "nationalId",
  "jobTitle",
] as const;

export type SearchField = (typeof SEARCH_FIELDS)[number];

export const SEARCH_FIELD_LABELS: Record<SearchField, string> = {
  all: "All Fields",
  fullName: "Name",
  fatherName: "Father Name",
  phoneNumber: "Phone",
  email: "Email",
  nationalId: "National ID",
  jobTitle: "Job Title",
};

export interface EmployeeFilters {
  search?: string;
  searchField?: SearchField;
  departments?: Department[];
  statuses?: EmployeeStatus[];
  employmentTypes?: EmploymentType[];
}

export interface EmployeeDashboardStats {
  totalEmployees: number;
  activeEmployees: number;
  inactiveEmployees: number;
  terminatedEmployees: number;
  employeesByDepartment: { department: string; count: number }[];
  recentHires: Employee[];
  totalPayroll: number;
  averageSalary: number;
}

// Label mappings for display
export const DEPARTMENT_LABELS: Record<Department, string> = {
  ADMINISTRATION: "Administration",
  FINANCE: "Finance",
  OPERATIONS: "Operations",
  ENGINEERING: "Engineering",
  LOGISTICS: "Logistics",
  SECURITY: "Security",
  MACHINERY_TEAM: "Machinery Team",
  LABOR: "Labor",
  KITCHEN: "Kitchen",
};

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  FULL_TIME: "Full-Time",
  PART_TIME: "Part-Time",
  CONTRACT: "Contract",
};

export const EMPLOYEE_STATUS_LABELS: Record<EmployeeStatus, string> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  TERMINATED: "Terminated",
};

export const GENDER_LABELS: Record<Gender, string> = {
  male: "Male",
  female: "Female",
  other: "Other",
};

export const DEPARTMENT_COLORS: Record<Department, string> = {
  ADMINISTRATION: "#3b82f6",
  FINANCE: "#10b981",
  OPERATIONS: "#f59e0b",
  ENGINEERING: "#8b5cf6",
  LOGISTICS: "#ef4444",
  SECURITY: "#6366f1",
  MACHINERY_TEAM: "#f97316",
  LABOR: "#14b8a6",
  KITCHEN: "#f43f5e",
};

export const EMPLOYEE_STATUS_COLORS: Record<EmployeeStatus, string> = {
  ACTIVE: "#10b981",
  INACTIVE: "#f59e0b",
  TERMINATED: "#ef4444",
};

export interface EmployeeFinancialSummaryItem {
  id: string;
  fullName: string;
  jobTitle: string;
  department: Department;
  salary: number;
  dailySalary: number;
  daysWorked: number;
  earnedSalary: number;
  totalExpensesPaidBy: number;
  totalExpensesPaidTo: number;
  totalAdvanceReceived: number;
  walletBalance: number;
  netBalance: number;
}

export interface EmployeeFinancialTotals {
  totalSalary: number;
  totalEarnedSalary: number;
  totalExpensesPaidBy: number;
  totalExpensesPaidTo: number;
  totalAdvanceReceived: number;
  totalWalletBalance: number;
  totalNetBalance: number;
  employeeCount: number;
}

export interface EmployeeFinancialSummaryResponse {
  employees: EmployeeFinancialSummaryItem[];
  totals: EmployeeFinancialTotals;
}

// Attendance types
export const ATTENDANCE_STATUSES = [
  "PRESENT",
  "ABSENT",
  "HALF_DAY",
  "LEAVE",
  "HOLIDAY",
] as const;

export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  PRESENT: "Present",
  ABSENT: "Absent",
  HALF_DAY: "Half Day",
  LEAVE: "Leave",
  HOLIDAY: "Holiday",
};

export const ATTENDANCE_STATUS_COLORS: Record<AttendanceStatus, string> = {
  PRESENT: "#10b981",
  ABSENT: "#ef4444",
  HALF_DAY: "#f59e0b",
  LEAVE: "#3b82f6",
  HOLIDAY: "#8b5cf6",
};

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  date: string;
  status: AttendanceStatus;
  notes: string | null;
  createdAt: string;
}

export interface AttendanceSummary {
  presentDays: number;
  halfDays: number;
  absentDays: number;
  leaveDays: number;
  holidayDays: number;
  totalDays: number;
  effectiveDays: number;
}

export interface AttendanceFilters {
  employeeId?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: AttendanceStatus;
  page?: number;
  pageSize?: number;
}

export interface BulkAttendanceEntry {
  employeeId: string;
  status: AttendanceStatus;
  notes?: string;
}
