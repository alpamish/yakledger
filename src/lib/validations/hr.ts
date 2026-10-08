import { z } from "zod";

export const salaryChangeSchema = z.object({
  amount: z.number().min(0, "Salary must be non-negative"),
  currency: z.string().default("AFN"),
  effectiveFrom: z.string().min(1, "Effective date is required"),
  reason: z.string().optional(),
  notes: z.string().optional(),
});

export const contractSchema = z.object({
  contractNumber: z.string().min(1, "Contract number is required"),
  contractType: z.string().default("FIXED_TERM"),
  startDate: z.string().min(1),
  endDate: z.string().optional().nullable(),
  salaryMinor: z.number().min(0).optional(),
  currency: z.string().default("AFN"),
  position: z.string().optional(),
  department: z.string().optional(),
  project: z.string().optional(),
  status: z.string().default("ACTIVE"),
  fileUrl: z.string().optional(),
  notes: z.string().optional(),
});

export const documentSchema = z.object({
  documentType: z.string().min(1, "Document type is required"),
  documentNumber: z.string().optional(),
  issueDate: z.string().optional().nullable(),
  expiryDate: z.string().optional().nullable(),
  fileUrl: z.string().optional(),
  notes: z.string().optional(),
});

export const leaveTypeSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  isPaid: z.boolean().default(true),
  defaultDays: z.number().int().positive().optional(),
  isActive: z.boolean().default(true),
});

export const leaveRequestSchema = z.object({
  leaveTypeId: z.string().optional().nullable(),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  days: z.number().min(0).optional(),
  reason: z.string().optional(),
});

export const assignmentSchema = z.object({
  project: z.string().min(1, "Project is required"),
  position: z.string().optional(),
  startDate: z.string().min(1),
  endDate: z.string().optional().nullable(),
  notes: z.string().optional(),
});

export const payrollGenerateSchema = z.object({
  periodStart: z.string().min(1),
  periodEnd: z.string().min(1),
  employeeIds: z.array(z.string()).optional(),
  allowancesMinor: z.number().int().min(0).optional(),
  bonusesMinor: z.number().int().min(0).optional(),
  deductionsMinor: z.number().int().min(0).optional(),
  walletId: z.string().optional(),
  deductExpenses: z.boolean().optional(),
  workDays: z.number().int().min(1).max(31).optional(),
});

export const payrollLineUpdateSchema = z.object({
  lineId: z.string().min(1),
  overtimeHours: z.number().min(0).optional(),
  allowancesMinor: z.number().int().min(0).optional(),
  bonusesMinor: z.number().int().min(0).optional(),
  deductionsMinor: z.number().int().min(0).optional(),
  netPayableMinor: z.number().int().optional(),
  remainingEmployeeDebtMinor: z.number().int().min(0).optional(),
  deductExpenses: z.boolean().optional(),
  walletId: z.string().optional(),
});

// Reimbursement of approved employee-paid expenses (outside salary payroll).
export const reimbursementSchema = z.object({
  expenseIds: z.array(z.string().min(1)).min(1, "Select at least one expense"),
  paymentMethod: z.enum(["CASH", "BANK_TRANSFER", "COMPANY_WALLET"]),
  walletId: z.string().optional(),
  note: z.string().optional(),
});
