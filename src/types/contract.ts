// Client-side types for the contract subsystem (mirror the API payloads).
import type { PaginatedResponse } from "@/types/expense";

export const CONTRACT_TYPE_VALUES = [
  "MACHINERY_HIRE",
  "TRANSPORTATION",
  "LABOR",
  "MATERIAL_SUPPLY",
  "MIXED",
] as const;
export type ContractType = (typeof CONTRACT_TYPE_VALUES)[number];

export const CONTRACT_TYPE_LABELS: Record<ContractType, string> = {
  MACHINERY_HIRE: "Machinery Hire",
  TRANSPORTATION: "Transportation",
  LABOR: "Labor",
  MATERIAL_SUPPLY: "Material Supply",
  MIXED: "Mixed",
};

export const CONTRACT_STATUSES = [
  "DRAFT",
  "ACTIVE",
  "SUSPENDED",
  "COMPLETED",
  "TERMINATED",
] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  SUSPENDED: "Suspended",
  COMPLETED: "Completed",
  TERMINATED: "Terminated",
};

export const CONTRACT_STATUS_COLORS: Record<ContractStatus, string> = {
  DRAFT: "#94a3b8",
  ACTIVE: "#10b981",
  SUSPENDED: "#f59e0b",
  COMPLETED: "#3b82f6",
  TERMINATED: "#ef4444",
};

export const CONTRACT_RATE_TYPES = ["HOURLY", "DAILY", "MONTHLY", "UNIT"] as const;
export type ContractRateType = (typeof CONTRACT_RATE_TYPES)[number];

export const CONTRACT_RATE_TYPE_LABELS: Record<ContractRateType, string> = {
  HOURLY: "Hourly",
  DAILY: "Daily",
  MONTHLY: "Monthly",
  UNIT: "Per Unit",
};

export interface ContractRate {
  id: string;
  contractId: string;
  label: string;
  rateType: ContractRateType;
  unitLabel: string | null;
  amount: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  isDefault: boolean;
  notes: string | null;
  approvedAt: string | null;
  approvedById: string | null;
  approver?: { id: string; name: string } | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContractVariation {
  id: string;
  contractId: string;
  variationNumber: string;
  description: string;
  valueChange: number;
  rateLabel: string | null;
  newAmount: number | null;
  effectiveFrom: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  approvedAt: string | null;
  approvedById: string | null;
  approver?: { id: string; name: string } | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContractorContract {
  id: string;
  contractNumber: string;
  contractorId: string;
  title: string;
  projectName: string | null;
  contractType: ContractType;
  value: number;
  startDate: string;
  endDate: string | null;
  paymentTerms: string | null;
  retentionPercent: number;
  advanceAllowed: boolean;
  workHoursPerDay: number;
  contractDaysPerMonth: number;
  overtimeRatePercent: number | null;
  penaltyTerms: string | null;
  companyProvidesFuel: boolean;
  contractorProvidesOperator: boolean;
  companyHandlesMaintenance: boolean;
  downtimeChargeable: boolean;
  status: ContractStatus;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  contractor?: {
    id: string;
    contractorName: string;
    contractorNumber: string | null;
    status: string;
  };
  rates?: ContractRate[];
  variations?: ContractVariation[];
  _count?: { rates: number; variations: number; timesheets: number };
}

export interface ContractFormData {
  contractorId: string;
  title: string;
  projectName?: string | null;
  contractType: ContractType;
  value: number;
  startDate: string;
  endDate?: string | null;
  paymentTerms?: string | null;
  retentionPercent: number;
  advanceAllowed: boolean;
  workHoursPerDay: number;
  contractDaysPerMonth: number;
  overtimeRatePercent?: number | null;
  penaltyTerms?: string | null;
  companyProvidesFuel: boolean;
  contractorProvidesOperator: boolean;
  companyHandlesMaintenance: boolean;
  downtimeChargeable: boolean;
  notes?: string | null;
}

export interface ContractRateFormData {
  label: string;
  rateType: ContractRateType;
  unitLabel?: string | null;
  amount: number;
  effectiveFrom: string;
  effectiveTo?: string | null;
  isDefault: boolean;
  notes?: string | null;
}

export interface ContractVariationFormData {
  description: string;
  valueChange: number;
  rateLabel?: string | null;
  newAmount?: number | null;
  effectiveFrom: string;
}

export type ContractListResponse = PaginatedResponse<ContractorContract>;
