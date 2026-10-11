// Shared Zod schemas + constants for the contract subsystem (Phase 2).
// Used by every /api/contracts route so validation can't drift between them.
import { z } from "zod";

export const CONTRACT_TYPE_VALUES = [
  "MACHINERY_HIRE",
  "TRANSPORTATION",
  "LABOR",
  "MATERIAL_SUPPLY",
  "MIXED",
] as const;
export type ContractTypeValue = (typeof CONTRACT_TYPE_VALUES)[number];

export const CONTRACT_TYPE_LABELS: Record<ContractTypeValue, string> = {
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
export type ContractStatusValue = (typeof CONTRACT_STATUSES)[number];

export const CONTRACT_STATUS_LABELS: Record<ContractStatusValue, string> = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  SUSPENDED: "Suspended",
  COMPLETED: "Completed",
  TERMINATED: "Terminated",
};

/** Statuses a contract may be activated into (DRAFT/SUSPENDED → ACTIVE). */
export const ACTIVATABLE_CONTRACT_STATUSES: ContractStatusValue[] = [
  "DRAFT",
  "SUSPENDED",
];

export const CONTRACT_RATE_TYPES = ["HOURLY", "DAILY", "MONTHLY", "UNIT"] as const;
export type ContractRateTypeValue = (typeof CONTRACT_RATE_TYPES)[number];

export const CONTRACT_RATE_TYPE_LABELS: Record<ContractRateTypeValue, string> = {
  HOURLY: "Hourly",
  DAILY: "Daily",
  MONTHLY: "Monthly",
  UNIT: "Per Unit",
};

export const VARIATION_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;

const dateString = z
  .string()
  .min(1, "Date is required")
  .transform((s) => new Date(s))
  .refine((d) => !isNaN(d.getTime()), "Invalid date");

export const createContractSchema = z.object({
  contractorId: z.string().min(1, "Contractor is required"),
  title: z.string().min(1, "Title is required").max(200),
  projectName: z.string().max(200).nullish(),
  contractType: z.enum(CONTRACT_TYPE_VALUES).default("MACHINERY_HIRE"),
  value: z.number().min(0).default(0),
  startDate: dateString,
  endDate: dateString.nullish(),
  paymentTerms: z.string().max(2000).nullish(),
  retentionPercent: z.number().min(0).max(100).default(0),
  advanceAllowed: z.boolean().default(true),
  workHoursPerDay: z.number().int().min(1).max(24).default(9),
  contractDaysPerMonth: z.number().int().min(1).max(31).default(28),
  overtimeRatePercent: z.number().min(0).nullable().nullish(),
  penaltyTerms: z.string().max(2000).nullish(),
  companyProvidesFuel: z.boolean().default(false),
  contractorProvidesOperator: z.boolean().default(true),
  companyHandlesMaintenance: z.boolean().default(false),
  downtimeChargeable: z.boolean().default(true),
  notes: z.string().max(5000).nullish(),
});

export const updateContractSchema = createContractSchema.partial().extend({
  status: z.enum(CONTRACT_STATUSES).optional(),
});

export const createContractRateSchema = z.object({
  label: z.string().min(1, "Label is required").max(100),
  rateType: z.enum(CONTRACT_RATE_TYPES),
  unitLabel: z.string().max(50).nullish(),
  amount: z.number().min(0, "Amount must be >= 0"),
  effectiveFrom: dateString,
  effectiveTo: dateString.nullish(),
  isDefault: z.boolean().default(false),
  notes: z.string().max(2000).nullish(),
});

export const updateContractRateSchema = createContractRateSchema.partial();

export const createVariationSchema = z.object({
  description: z.string().min(1, "Description is required").max(2000),
  valueChange: z.number().default(0),
  rateLabel: z.string().max(100).nullish(),
  newAmount: z.number().min(0).nullable().nullish(),
  effectiveFrom: dateString,
});

export type CreateContractInput = z.infer<typeof createContractSchema>;
export type UpdateContractInput = z.infer<typeof updateContractSchema>;
export type CreateContractRateInput = z.infer<typeof createContractRateSchema>;
export type CreateVariationInput = z.infer<typeof createVariationSchema>;
