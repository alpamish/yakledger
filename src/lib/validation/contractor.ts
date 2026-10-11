// Shared validation schemas and constants for the contractor module.
// Single source of truth used by every /api/contractors* route so that API,
// UI (src/types/contractor.ts), and the database enums stay in sync.
import { z } from "zod";

// Canonical contractor types: must match the PG `ContractorType` enum and
// CONTRACTOR_TYPES in src/types/contractor.ts (10 values).
export const CONTRACTOR_TYPE_VALUES = [
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

// Must match the PG `ContractorStatus` enum. ARCHIVED is set automatically when
// deleting a contractor that still has financial/operational history.
export const CONTRACTOR_STATUS_VALUES = [
  "ACTIVE",
  "INACTIVE",
  "SUSPENDED",
  "ARCHIVED",
] as const;

export const FUEL_TYPE_VALUES = [
  "DIESEL", "GASOLINE", "LPG", "CNG", "OTHER",
] as const;

export const MACHINERY_STATUS_VALUES = [
  "OPERATIONAL", "UNDER_MAINTENANCE", "OUT_OF_SERVICE",
] as const;

export const inlineMachinerySchema = z.object({
  machineryName: z.string().min(1, "Machinery name is required"),
  machineryType: z.string().min(1, "Machinery type is required"),
  plateNumber: z.string().optional().nullable(),
  model: z.string().optional().nullable(),
  driverName: z.string().optional().nullable(),
  status: z.enum(MACHINERY_STATUS_VALUES).default("OPERATIONAL"),
  fuelType: z.enum(FUEL_TYPE_VALUES).default("DIESEL"),
  hourlyConsumptionRate: z.number().min(0).default(0),
  hourlyRate: z.number().min(0).default(0),
  dailyRate: z.number().min(0).default(0),
  monthlyRate: z.number().min(0).default(0),
  contractDaysPerMonth: z.number().int().min(1).max(31).default(28),
  workHoursPerDay: z.number().int().min(1).max(24).default(9),
  contractStartDate: z.string().optional().nullable(),
  contractEndDate: z.string().optional().nullable(),
}).superRefine((data, ctx) => {
  if (data.hourlyRate <= 0 && data.dailyRate <= 0 && data.monthlyRate <= 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["monthlyRate"],
      message: "At least one rate (hourly, daily, or monthly) is required",
    });
  }
});

export const createContractorSchema = z.object({
  contractorName: z.string().min(1, "Contractor name is required"),
  fatherName: z.string().min(1, "Father name is required"),
  companyName: z.string().optional().nullable(),
  phoneNumber: z.string().min(1, "Phone number is required"),
  alternativePhone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  address: z.string().optional().nullable(),
  nationalId: z.string().optional().nullable(),
  idImageFront: z.string().optional().nullable(),
  idImageBack: z.string().optional().nullable(),
  contractorType: z.enum(CONTRACTOR_TYPE_VALUES),
  status: z.enum(CONTRACTOR_STATUS_VALUES).default("ACTIVE"),
  notes: z.string().optional().nullable(),
  machinery: z.array(inlineMachinerySchema).optional(),
});

export const updateContractorSchema = z.object({
  contractorName: z.string().min(1).optional(),
  fatherName: z.string().min(1).optional(),
  companyName: z.string().optional().nullable(),
  phoneNumber: z.string().min(1).optional(),
  alternativePhone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  address: z.string().optional().nullable(),
  nationalId: z.string().optional().nullable(),
  idImageFront: z.string().optional().nullable(),
  idImageBack: z.string().optional().nullable(),
  contractorType: z.enum(CONTRACTOR_TYPE_VALUES).optional(),
  status: z.enum(CONTRACTOR_STATUS_VALUES).optional(),
  notes: z.string().optional().nullable(),
});

export const contractorBulkActionSchema = z.object({
  ids: z.array(z.string()).min(1, "At least one ID is required"),
  action: z.enum(["delete", "activate", "suspend"]),
});

export const CONTRACTOR_CREATE_SCHEMA = createContractorSchema;
export const CONTRACTOR_UPDATE_SCHEMA = updateContractorSchema;
