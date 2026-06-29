// Contractor Management Module - Type Definitions

export const CONTRACTOR_TYPES = [
  "MACHINERY_CONTRACTOR",
  "TRANSPORTATION_CONTRACTOR",
  "LABOR_CONTRACTOR",
  "MATERIAL_SUPPLIER",
  "ELECTRICAL_CONTRACTOR",
  "PLUMBING_CONTRACTOR",
  "SUBCONTRACTOR",
  "CONSULTANT",
  "STRUCTURAL_CONTRACTOR",
  "OTHER",
] as const;

export const CONTRACTOR_STATUSES = [
  "ACTIVE",
  "INACTIVE",
  "SUSPENDED",
] as const;

export const FUEL_TYPES = [
  "DIESEL",
  "GASOLINE",
  "LPG",
  "CNG",
  "OTHER",
] as const;

export const MACHINERY_STATUSES = [
  "OPERATIONAL",
  "UNDER_MAINTENANCE",
  "OUT_OF_SERVICE",
] as const;

export type ContractorType = (typeof CONTRACTOR_TYPES)[number];
export type ContractorStatus = (typeof CONTRACTOR_STATUSES)[number];
export type FuelType = (typeof FUEL_TYPES)[number];
export type MachineryStatus = (typeof MACHINERY_STATUSES)[number];

export interface Contractor {
  id: string;
  contractorName: string;
  fatherName: string;
  companyName?: string | null;
  phoneNumber: string;
  alternativePhone?: string | null;
  email?: string | null;
  address?: string | null;
  nationalId?: string | null;
  contractorType: ContractorType;
  status: ContractorStatus;
  notes?: string | null;
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
  // Computed/relation fields
  _count?: {
    expensesPaidTo?: number;
    timesheets?: number;
    fuelUsages?: number;
    machinery?: number;
  };
  // For profile views
  expensesPaidTo?: ExpenseBrief[];
  timesheets?: Timesheet[];
  fuelUsages?: FuelUsage[];
  machinery?: Machinery[];
  totalExpensesPaid?: number;
  monthlyExpenses?: { month: string; amount: number }[];
}

export interface Timesheet {
  id: string;
  contractorId: string;
  machineryId?: string | null;
  operatorName?: string | null;
  workSite?: string | null;
  date: string;
  startTime?: string | null;
  lunchStart?: string | null;
  lunchEnd?: string | null;
  endTime?: string | null;
  totalHours: number;
  overtimeHours: number;
  approvedBy?: string | null;
  approvedAt?: string | null;
  notes?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  contractor?: Pick<Contractor, "id" | "contractorName" | "contractorType">;
  machinery?: Pick<Machinery, "id" | "machineryName" | "machineryType" | "plateNumber" | "driverName">;
  approver?: { id: string; name: string } | null;
}

export interface DailyEntry {
  day: number;
  dateStr: string;
  farsiDate: string;
  startTime: string;
  lunchStart: string;
  lunchEnd: string;
  endTime: string;
  totalHours: number;
  overtimeHours: number;
  notes: string;
}

export interface FuelEntry {
  index: number;
  date: string;
  fuelType: string;
  liters: number;
  amount: number;
  notes: string;
}

export type TimesheetPageSelection = "front" | "back" | "both";

export interface FuelUsage {
  id: string;
  contractorId: string;
  machineryId?: string | null;
  fuelType: FuelType;
  quantity: number;
  unitPrice: number;
  totalCost: number;
  date: string;
  fuelStation?: string | null;
  receiptAttachment?: string | null;
  linkedExpenseId?: string | null;
  notes?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  contractor?: Pick<Contractor, "id" | "contractorName" | "contractorType">;
  machinery?: Pick<Machinery, "id" | "machineryName" | "machineryType" | "plateNumber">;
  linkedExpense?: {
    id: string;
    title: string;
    amount: number;
    category: string;
  } | null;
}

export interface Machinery {
  id: string;
  machineryName: string;
  machineryType: string;
  plateNumber?: string | null;
  model?: string | null;
  driverName?: string | null;
  status: MachineryStatus;
  assignedContractorId: string;
  fuelType: FuelType;
  hourlyConsumptionRate: number;
  hourlyRate: number;
  dailyRate: number;
  monthlyRate: number;
  contractDaysPerMonth: number;
  workHoursPerDay: number;
  contractStartDate?: string | null;
  contractEndDate?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  assignedContractor?: Pick<Contractor, "id" | "contractorName" | "contractorType">;
  _count?: {
    timesheets?: number;
    fuelUsages?: number;
  };
}

export interface ExpenseBrief {
  id: string;
  title: string;
  description?: string | null;
  amount: number;
  category: string;
  expenseDate: string;
  paymentMethod?: string;
}

export interface ContractorFormData {
  contractorName: string;
  fatherName: string;
  companyName?: string;
  phoneNumber: string;
  alternativePhone?: string;
  email?: string;
  address?: string;
  nationalId?: string;
  contractorType: ContractorType;
  status?: ContractorStatus;
  notes?: string;
  machinery?: InlineMachineryEntry[];
}

export interface InlineMachineryEntry {
  machineryName: string;
  machineryType: string;
  plateNumber?: string;
  model?: string;
  driverName?: string;
  status?: MachineryStatus;
  fuelType?: FuelType;
  hourlyConsumptionRate?: number;
  hourlyRate?: number;
  dailyRate?: number;
  monthlyRate?: number;
  contractDaysPerMonth?: number;
  workHoursPerDay?: number;
  contractStartDate?: string;
  contractEndDate?: string;
}

export interface TimesheetFormData {
  contractorId: string;
  machineryId: string;
  operatorName?: string;
  workSite?: string;
  date: string;
  startTime?: string;
  lunchStart?: string;
  lunchEnd?: string;
  endTime?: string;
  totalHours?: number;
  overtimeHours?: number;
  approvedBy?: string;
  notes?: string;
}

export interface FuelUsageFormData {
  contractorId: string;
  machineryId: string;
  fuelType: FuelType;
  quantity: number;
  unitPrice: number;
  totalCost?: number;
  date: string;
  fuelStation?: string;
  receiptAttachment?: string;
  linkedExpenseId?: string;
  containerId?: string;
  notes?: string;
}

export interface BulkTimesheetRecord {
  contractorId: string;
  machineryId?: string;
  operatorName?: string;
  workSite?: string;
  date: string;
  startTime?: string;
  lunchStart?: string;
  lunchEnd?: string;
  endTime?: string;
  totalHours?: number;
  overtimeHours?: number;
  notes?: string;
}

export interface BulkTimesheetRequest {
  records: BulkTimesheetRecord[];
}

export interface BulkTimesheetResponse {
  created: number;
  records: Timesheet[];
}

export interface BulkFuelUsageRecord {
  contractorId: string;
  machineryId: string;
  fuelType: FuelType;
  quantity: number;
  unitPrice: number;
  date: string;
  fuelStation?: string;
  notes?: string;
}

export interface BulkFuelUsageRequest {
  records: BulkFuelUsageRecord[];
  containerId?: string;
}

export interface BulkFuelUsageResponse {
  created: number;
  records: FuelUsage[];
}

export interface MachineryFilters {
  search?: string;
  statuses?: MachineryStatus[];
  machineryTypes?: string[];
  fuelTypes?: FuelType[];
  assignedContractorId?: string;
}

export interface MachineryByContractor {
  contractorId: string;
  contractorName: string;
  machineryCount: number;
  totalHours: number;
  totalFuelQuantity: number;
  totalFuelCost: number;
}

export interface MachineryFuelPerMachinery {
  machineryId: string;
  machineryName: string;
  driverName: string | null;
  contractorName: string | null;
  totalFuelQuantity: number;
  totalFuelCost: number;
  totalHours: number;
  litersPerHour: number;
}

export interface MachinerySummaryStats {
  totalMachinery: number;
  machineryByType: { machineryType: string; count: number }[];
  machineryByStatus: { status: string; count: number }[];
  totalTimesheetHours: number;
  totalTimesheetDays: number;
  totalFuelQuantity: number;
  totalFuelCost: number;
  averageFuelPerHour: number;
  averageFuelPerDay: number;
}

export interface MachineryFormData {
  machineryName: string;
  machineryType: string;
  plateNumber?: string;
  model?: string;
  driverName?: string;
  status?: MachineryStatus;
  assignedContractorId: string;
  fuelType?: FuelType;
  hourlyConsumptionRate?: number;
  hourlyRate?: number;
  dailyRate?: number;
  monthlyRate?: number;
  contractDaysPerMonth?: number;
  workHoursPerDay?: number;
  contractStartDate?: string;
  contractEndDate?: string;
}

export interface ContractorFilters {
  search?: string;
  contractorTypes?: ContractorType[];
  statuses?: ContractorStatus[];
}

export interface TimesheetFilters {
  search?: string;
  contractorId?: string;
  machineryId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface FuelUsageFilters {
  search?: string;
  contractorId?: string;
  machineryId?: string;
  machineryType?: string;
  fuelTypes?: FuelType[];
  dateFrom?: string;
  dateTo?: string;
}

export interface FuelUsageDailyEntry {
  date: string;
  quantity: number;
  cost: number;
}

export interface FuelUsageByType {
  machineryType: string;
  quantity: number;
  cost: number;
}

export interface FuelUsageByFuelType {
  fuelType: string;
  quantity: number;
  cost: number;
}

export interface FuelUsageSummary {
  totalQuantity: number;
  totalCost: number;
  avgUnitPrice: number;
  recordCount: number;
  dailyUsage: FuelUsageDailyEntry[];
  byMachineryType: FuelUsageByType[];
  byFuelType: FuelUsageByFuelType[];
}

export interface ContractorDashboardStats {
  totalContractors: number;
  activeContractors: number;
  inactiveContractors: number;
  suspendedContractors: number;
  totalContractorExpenses: number;
  monthlyContractorPayments: number;
  totalTimesheetHours: number;
  totalFuelCost: number;
  contractorsByType: { type: string; count: number }[];
  monthlyPaymentTrend: { month: string; amount: number }[];
  recentContractors: Contractor[];
  topContractorsByExpense: { id: string; contractorName: string; totalAmount: number }[];
}

// Label mappings
export const CONTRACTOR_TYPE_LABELS: Record<ContractorType, string> = {
  MACHINERY_CONTRACTOR: "Machinery Contractor",
  TRANSPORTATION_CONTRACTOR: "Transportation Contractor",
  LABOR_CONTRACTOR: "Labor Contractor",
  MATERIAL_SUPPLIER: "Material Supplier",
  ELECTRICAL_CONTRACTOR: "Electrical Contractor",
  PLUMBING_CONTRACTOR: "Plumbing Contractor",
  SUBCONTRACTOR: "Subcontractor",
  CONSULTANT: "Consultant",
  STRUCTURAL_CONTRACTOR: "Structural Contractor",
  OTHER: "Other",
};

export const CONTRACTOR_STATUS_LABELS: Record<ContractorStatus, string> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  SUSPENDED: "Suspended",
};

export const FUEL_TYPE_LABELS: Record<FuelType, string> = {
  DIESEL: "Diesel",
  GASOLINE: "Gasoline",
  LPG: "LPG",
  CNG: "CNG",
  OTHER: "Other",
};

export const MACHINERY_STATUS_LABELS: Record<MachineryStatus, string> = {
  OPERATIONAL: "Operational",
  UNDER_MAINTENANCE: "Under Maintenance",
  OUT_OF_SERVICE: "Out of Service",
};

export const CONTRACTOR_TYPE_COLORS: Record<ContractorType, string> = {
  MACHINERY_CONTRACTOR: "#8b5cf6",
  TRANSPORTATION_CONTRACTOR: "#10b981",
  LABOR_CONTRACTOR: "#f59e0b",
  MATERIAL_SUPPLIER: "#3b82f6",
  ELECTRICAL_CONTRACTOR: "#ec4899",
  PLUMBING_CONTRACTOR: "#06b6d4",
  SUBCONTRACTOR: "#f97316",
  CONSULTANT: "#14b8a6",
  STRUCTURAL_CONTRACTOR: "#64748b",
  OTHER: "#78716c",
};

export const CONTRACTOR_STATUS_COLORS: Record<ContractorStatus, string> = {
  ACTIVE: "#10b981",
  INACTIVE: "#f59e0b",
  SUSPENDED: "#ef4444",
};

export const FUEL_TYPE_COLORS: Record<FuelType, string> = {
  DIESEL: "#f59e0b",
  GASOLINE: "#ef4444",
  LPG: "#3b82f6",
  CNG: "#10b981",
  OTHER: "#78716c",
};

export const MACHINERY_STATUS_COLORS: Record<MachineryStatus, string> = {
  OPERATIONAL: "#10b981",
  UNDER_MAINTENANCE: "#f59e0b",
  OUT_OF_SERVICE: "#ef4444",
};
