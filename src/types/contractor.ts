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
  "BLACKLISTED",
  "ARCHIVED",
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
  contractorNumber?: string | null;
  contractorName: string;
  fatherName: string;
  companyName?: string | null;
  phoneNumber: string;
  alternativePhone?: string | null;
  email?: string | null;
  address?: string | null;
  nationalId?: string | null;
  idImageFront?: string | null;
  idImageBack?: string | null;
  contractorType: ContractorType;
  status: ContractorStatus;
  // Lifecycle / compliance (Phase 5)
  suspendedAt?: string | null;
  suspendedReason?: string | null;
  blacklistedAt?: string | null;
  blacklistedReason?: string | null;
  statusChangedById?: string | null;
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
  machineryRates?: MachineryRate[];
  totalExpensesPaid?: number;
  monthlyExpenses?: { month: string; amount: number }[];
}

// ── Authorization & compliance (Phase 5) ───────────────────────────────────

export const CONTRACTOR_DOCUMENT_TYPES = [
  "NATIONAL_ID",
  "BUSINESS_LICENSE",
  "TAX_CERTIFICATE",
  "INSURANCE",
  "OTHER",
] as const;
export type ContractorDocumentType = (typeof CONTRACTOR_DOCUMENT_TYPES)[number];

export const CONTRACTOR_DOCUMENT_TYPE_LABELS: Record<ContractorDocumentType, string> = {
  NATIONAL_ID: "National ID",
  BUSINESS_LICENSE: "Business License",
  TAX_CERTIFICATE: "Tax Certificate",
  INSURANCE: "Insurance",
  OTHER: "Other",
};

/** Document types whose expiry BLOCKS payments (when a row exists). */
export const PAYMENT_BLOCKING_DOC_TYPES: ContractorDocumentType[] = [
  "NATIONAL_ID",
  "BUSINESS_LICENSE",
];

export interface ContractorContact {
  id: string;
  contractorId: string;
  name: string;
  role?: string | null;
  phone: string;
  email?: string | null;
  isPrimary: boolean;
  notes?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContractorBankAccount {
  id: string;
  contractorId: string;
  accountName: string;
  accountNumber: string;
  bankName: string;
  branch?: string | null;
  isVerified: boolean;
  verifiedById?: string | null;
  verifiedAt?: string | null;
  isDefault: boolean;
  notes?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContractorDocument {
  id: string;
  contractorId: string;
  docType: ContractorDocumentType;
  title: string;
  documentNumber?: string | null;
  issueDate?: string | null;
  expiryDate?: string | null;
  fileUrl?: string | null;
  notes?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentAuthorization {
  id: string;
  authorizationNumber: string;
  contractorId: string;
  receiverName: string;
  validFrom: string;
  validTo?: string | null;
  maxAmount?: number | null;
  revokedAt?: string | null;
  revokedById?: string | null;
  notes?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  contractor?: Pick<Contractor, "id" | "contractorName" | "status">;
}

/** Aggregated compliance state for one contractor (GET compliance route). */
export interface ContractorComplianceStatus {
  contractorId: string;
  contractorName: string;
  status: ContractorStatus;
  /** Expired blocking docs (NATIONAL_ID / BUSINESS_LICENSE rows only). */
  expiredBlockingDocs: ContractorDocument[];
  /** Blocking docs expiring within the warning window (default 30 days). */
  expiringBlockingDocs: (ContractorDocument & { daysUntilExpiry: number })[];
  unverifiedBankAccounts: number;
  activeAuthorizations: number;
  /** True when payments are currently blocked (status or expired docs). */
  paymentsBlocked: boolean;
  blockedReason: string | null;
}

// ── Reporting (Phase 6) ─────────────────────────────────────────────────────
// Read-only aggregates. Every figure is computed server-side through the shared
// ledger/claim/advance services (never float-math in a component), so reports,
// the profile, PDFs, and the ledger always reconcile.

/** One line of a contractor statement (a ledger entry, in statement order). */
export interface StatementLine {
  id: string;
  occurredAt: string;
  /** CLAIM_POSTED | CLAIM_REVERSAL | RETENTION_HELD | RETENTION_RELEASED | ADVANCE_DISBURSED | ADVANCE_RECOVERY | PAYMENT | PAYMENT_REVERSAL | WRITE_OFF */
  type: string;
  reference?: string | null;
  /** Signed: positive increases what the company owes the contractor. */
  amount: number;
  balanceAfter: number;
  claimId?: string | null;
  paymentId?: string | null;
  advanceId?: string | null;
}

/** Totals per ledger entry type inside the statement window. */
export type StatementTypeTotals = Partial<Record<string, number>>;

export interface StatementReport {
  contractorId: string;
  contractorName: string;
  from: string | null;
  to: string | null;
  /** Sum of all entries strictly before `from` (0 when no `from`). */
  openingBalance: number;
  /** openingBalance + sum(in-period amounts). */
  closingBalance: number;
  /** Live balance from the ledger (independent of the window). */
  currentBalance: number;
  lines: StatementLine[];
  totalsByType: StatementTypeTotals;
  totalInPeriod: number;
}

export interface PayableAgingRow {
  contractorId: string;
  contractorName: string;
  buckets: Record<"current" | "0-30" | "31-60" | "61-90" | "90+", number>;
  total: number;
  claimCount: number;
}

export interface PayableAgingReport {
  asOf: string;
  rows: PayableAgingRow[];
  totals: Record<"current" | "0-30" | "31-60" | "61-90" | "90+", number>;
  grandTotal: number;
}

export interface RetentionReportRow {
  contractorId: string;
  contractorName: string;
  held: number;
  released: number;
  /** held - released: retention still withheld. */
  balance: number;
  claimCount: number;
}

export interface RetentionReport {
  from: string | null;
  to: string | null;
  rows: RetentionReportRow[];
  totalHeld: number;
  totalReleased: number;
  totalBalance: number;
}

export interface AdvanceRecoveryReportRow {
  contractorId: string;
  contractorName: string;
  disbursed: number;
  recovered: number;
  writtenOff: number;
  outstanding: number;
}

export interface AdvanceRecoveryReport {
  from: string | null;
  to: string | null;
  rows: AdvanceRecoveryReportRow[];
  totalDisbursed: number;
  totalRecovered: number;
  totalWrittenOff: number;
  totalOutstanding: number;
}

export interface DeductionsReportRow {
  contractorId: string;
  contractorName: string;
  /** Deduction type (FUEL | PENALTY | MATERIALS | ...) → total amount. */
  byType: Record<string, number>;
  total: number;
  deductionCount: number;
}

export interface DeductionsReport {
  from: string | null;
  to: string | null;
  rows: DeductionsReportRow[];
  totalsByType: Record<string, number>;
  grandTotal: number;
}

export interface ClaimsPaymentsReportRow {
  contractorId: string;
  contractorName: string;
  // Claims side
  claimCount: number;
  grossAmount: number;
  retentionAmount: number;
  deductionsTotal: number;
  netAmount: number;
  paidAmount: number;
  outstanding: number;
  // Payments side
  paymentCount: number;
  paymentsTotal: number;
  reversedTotal: number;
}

export interface ClaimsPaymentsReport {
  from: string | null;
  to: string | null;
  rows: ClaimsPaymentsReportRow[];
  totals: Omit<ClaimsPaymentsReportRow, "contractorId" | "contractorName">;
}

// ── Contract summary (Phase 6: budget vs approved work vs variations vs paid)

export interface ContractSummaryRow {
  contractId: string;
  contractNumber: string;
  title: string;
  projectName: string | null;
  status: string;
  contractorId: string;
  contractorName: string;
  /** Original budget: current value minus every approved value change. */
  baseValue: number;
  variationCount: number;
  /** Sum of APPROVED variation value changes (PENDING/REJECTED never count). */
  variationsTotal: number;
  /** Current contract.value = baseValue + variationsTotal. Point-in-time, not windowed. */
  revisedValue: number;
  // Approved work in the window (posted claims, by periodEnd).
  claimCount: number;
  approvedGross: number;
  deductionsTotal: number;
  approvedNet: number;
  retentionHeld: number;
  /** Released by date in the window (windowed independently, like the retention report). */
  retentionReleased: number;
  retentionBalance: number;
  advanceRecovered: number;
  paidAmount: number;
  /** approvedNet − advanceRecovered − paidAmount (the claim engine's formula). */
  outstanding: number;
}

export interface ContractSummaryReport {
  from: string | null;
  to: string | null;
  rows: ContractSummaryRow[];
  totals: Omit<
    ContractSummaryRow,
    "contractId" | "contractNumber" | "title" | "projectName" | "status" | "contractorId" | "contractorName"
  >;
}

// ── Machinery & project ops reports (Phase 6, Batch B) ─────────────────────
// Read-only aggregates over MachineryDailyLog / DowntimeRecord / FuelUsage and
// contract-vs-claim-vs-payment figures. Computed server-side; components render.

export interface UtilizationReportRow {
  machineryId: string;
  machineryName: string;
  machineryType: string;
  plateNumber: string | null;
  assignedContractorName: string | null;
  loggedDays: number;
  normalHours: number;
  overtimeHours: number;
  /** normalHours + overtimeHours (the producing hours). */
  workedHours: number;
  idleHours: number;
  breakdownHours: number;
  /** From DowntimeRecord windows, clipped to the report range. */
  downtimeHours: number;
  chargeableDowntimeHours: number;
  /** worked / (worked + idle + downtime) as a whole-number percent, or null when no denominator. */
  utilizationPercent: number | null;
}

export interface UtilizationReport {
  from: string | null;
  to: string | null;
  rows: UtilizationReportRow[];
  totals: Omit<
    UtilizationReportRow,
    "machineryId" | "machineryName" | "machineryType" | "plateNumber" | "assignedContractorName" | "utilizationPercent"
  > & { utilizationPercent: number | null };
}

export interface DowntimeReasonSummary {
  reason: string;
  recordCount: number;
  hours: number;
  chargeableHours: number;
}

export interface DowntimeReportRow {
  machineryId: string;
  machineryName: string;
  machineryType: string;
  assignedContractorName: string | null;
  recordCount: number;
  /** Open records (no end) are clamped to the report range end (or now). */
  totalHours: number;
  chargeableHours: number;
  byReason: DowntimeReasonSummary[];
}

export interface DowntimeReport {
  from: string | null;
  to: string | null;
  rows: DowntimeReportRow[];
  totalHours: number;
  chargeableHours: number;
  byReason: DowntimeReasonSummary[];
}

export interface ProjectCostReportRow {
  contractId: string;
  contractTitle: string;
  /** Free-text project grouping; null contracts are grouped under "—". */
  projectName: string | null;
  contractorId: string;
  contractorName: string;
  contractValue: number;
  claimCount: number;
  /** Sum of posted-claim netAmount in the window. */
  approvedNet: number;
  retentionHeld: number;
  advanceRecovered: number;
  /** Sum of claim.paidAmount (allocations) on posted claims in the window. */
  paidAmount: number;
  /** approvedNet − advanceRecovered − paidAmount. */
  outstanding: number;
}

export interface ProjectCostReport {
  from: string | null;
  to: string | null;
  rows: ProjectCostReportRow[];
  totals: Omit<
    ProjectCostReportRow,
    "contractId" | "contractTitle" | "projectName" | "contractorId" | "contractorName"
  > & { claimCount: number };
}

export interface Timesheet {
  id: string;
  contractorId: string;
  machineryId?: string | null;
  machineryRateId?: string | null;
  // Contract billing snapshots (Phase 2/4).
  contractId?: string | null;
  contractRateId?: string | null;
  rateLabel?: string | null;
  rateAmount?: number | null;
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
  approvalStatus?: import("@/types/expense").ApprovalStatus;
  approvalNote?: string | null;
  notes?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  contractor?: Pick<Contractor, "id" | "contractorName" | "contractorType">;
  machinery?: Pick<Machinery, "id" | "machineryName" | "machineryType" | "plateNumber" | "driverName">;
  machineryRate?: Pick<MachineryRate, "id" | "rateName" | "hourlyRate" | "dailyRate" | "monthlyRate">;
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
  billable?: boolean;
  notes?: string | null;
  approvalStatus?: import("@/types/expense").ApprovalStatus;
  approvalNote?: string | null;
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
  driverFatherName?: string | null;
  driverPhoneNumber?: string | null;
  driverNationalId?: string | null;
  driverIdImageFront?: string | null;
  driverIdImageBack?: string | null;
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
  // Ownership & commercial terms (Phase 3)
  ownershipType: MachineryOwnershipType;
  rentalRate?: number | null;
  rentalRateType?: "DAILY" | "MONTHLY" | null;
  rentalStartDate?: string | null;
  rentalEndDate?: string | null;
  // Meter jump (closing - opening) above this flags daily logs; null = never flag.
  meterJumpThreshold?: number | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  assignedContractor?: Pick<Contractor, "id" | "contractorName" | "contractorType">;
  machineryRates?: MachineryRate[];
  _count?: {
    timesheets?: number;
    fuelUsages?: number;
  };
}

// Transfer history: one row per assignment of a machine to a contractor.
export interface MachineryAssignment {
  id: string;
  machineryId: string;
  contractorId: string;
  contractId?: string | null;
  projectName?: string | null;
  startDate: string;
  endDate?: string | null;
  transferredBy: string;
  notes?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  contractor?: Pick<
    Contractor,
    "id" | "contractorName" | "contractorNumber" | "contractorType"
  >;
  contract?: { id: string; contractNumber: string; title: string } | null;
}

// One operating record per machine per day.
export interface MachineryDailyLog {
  id: string;
  date: string;
  machineryId: string;
  contractId?: string | null;
  openingMeter: number;
  closingMeter: number;
  normalHours: number;
  overtimeHours: number;
  idleHours: number;
  breakdownHours: number;
  weather?: string | null;
  delayReason?: string | null;
  operator?: string | null;
  flagged: boolean;
  flagReason?: string | null;
  loggedBy: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  contract?: { id: string; contractNumber: string; title: string } | null;
}

export interface DowntimeRecord {
  id: string;
  machineryId: string;
  start: string;
  end?: string | null;
  reason: string;
  chargeable: boolean;
  notes?: string | null;
  loggedBy: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  durationHours?: number | null;
}

export interface FuelVarianceRow {
  machineryId: string;
  machineryName: string;
  date: string;
  workedHours: number | null;
  consumptionRate: number;
  expectedLiters: number | null;
  actualLiters: number;
  variance: number | null;
  loggedDays: number;
  expectedDays: number;
}

export interface FuelVarianceSummary {
  machineryId: string;
  machineryName: string;
  consumptionRate: number;
  actualLiters: number;
  expectedLiters: number;
  variance: number;
  totalDays: number;
  loggedDays: number;
  expectedDays: number;
  coveragePercent: number;
}

export interface MachineryRate {
  id: string;
  machineryId: string;
  rateName: string;
  monthlyRate: number;
  dailyRate: number;
  hourlyRate: number;
  contractDaysPerMonth: number;
  workHoursPerDay: number;
  isDefault: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface MachineryRateFormData {
  rateName: string;
  monthlyRate: number;
  dailyRate: number;
  hourlyRate: number;
  contractDaysPerMonth: number;
  workHoursPerDay: number;
  isDefault: boolean;
}

export interface ExpenseBrief {
  id: string;
  title: string;
  description?: string | null;
  notes?: string | null;
  amount: number;
  category: string;
  expenseDate: string;
  paymentMethod?: string;
  paidBy?: string;
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
  idImageFront?: string | null;
  idImageBack?: string | null;
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
  machineryRateId?: string;
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
  containerId: string;
  billable?: boolean;
  notes?: string;
}

export interface BulkTimesheetRecord {
  contractorId: string;
  machineryId?: string;
  machineryRateId?: string;
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
  containerId: string;
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

export interface MachineryWorkHours {
  machineryId: string;
  machineryName: string;
  driverName: string | null;
  contractorName: string | null;
  totalHours: number;
  hourlyRate: number;
  dailyRate: number;
  monthlyRate: number;
  workHoursPerDay: number;
  contractDaysPerMonth: number;
  efficiency: number;
  totalCost: number;
  rateName?: string;
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
  driverFatherName?: string;
  driverPhoneNumber?: string;
  driverNationalId?: string;
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
  // Ownership & commercial terms (Phase 3)
  ownershipType?: MachineryOwnershipType;
  rentalRate?: number | null;
  rentalRateType?: "DAILY" | "MONTHLY" | null;
  rentalStartDate?: string | null;
  rentalEndDate?: string | null;
  meterJumpThreshold?: number | null;
  driverIdImageFront?: string | null;
  driverIdImageBack?: string | null;
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
  approvalStatus?: import("@/types/expense").ApprovalStatus;
}

export interface FuelUsageFilters {
  search?: string;
  contractorId?: string;
  machineryId?: string;
  machineryType?: string;
  fuelTypes?: FuelType[];
  approvalStatus?: import("@/types/expense").ApprovalStatus;
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
  totalIssuedFromStock: number;
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

// ─── Monthly Fuel Analysis Types ─────────────────────────────────────────────

export interface MonthlyFuelData {
  month: string; // "2026-01"
  monthLabel: string; // "January"
  totalLiters: number;
  totalCost: number;
  totalHours: number;
  litersPerHour: number;
  expectedRate: number;
  deviationPercent: number; // vs expected rate
  prevMonthLitersPerHour: number | null;
  monthOverMonthPercent: number | null; // change from prev month
  recordCount: number;
  hasTimesheetData: boolean; // whether we had real timesheet hours vs fallback
  ytdLiters: number; // cumulative liters from Jan to this month
  ytdCost: number; // cumulative cost from Jan to this month
}

export interface DailyFuelData {
  date: string;
  totalLiters: number;
  totalCost: number;
  totalHours: number;
  litersPerHour: number;
  monthlyAvgLitersPerHour: number;
  deviationPercent: number;
  isAbnormal: boolean;
  hasTimesheetData: boolean;
}

export interface FuelAnomaly {
  type: 'month_over_month' | 'vs_expected' | 'day_deviation';
  severity: 'warning' | 'critical';
  message: string;
  month?: string;
  date?: string;
  actualValue: number;
  expectedValue: number;
  deviationPercent: number;
}

export interface MachineryInfo {
  id: string;
  machineryName: string;
  machineryType: string;
  plateNumber: string | null;
  driverName: string | null;
  hourlyConsumptionRate: number;
  workHoursPerDay: number;
  contractorName?: string | null;
}

export interface MonthlyAnalysisResponse {
  machinery: MachineryInfo;
  year: number;
  monthlyData: MonthlyFuelData[];
  dailyData?: DailyFuelData[];
  anomalies: FuelAnomaly[];
  fuelTypeDistribution?: Array<{ fuelType: string; totalLiters: number }>;
  fuelTypeByMonth?: Array<{
    month: string;
    monthLabel: string;
    fuelTypes: Array<{ fuelType: string; totalLiters: number }>;
  }>;
}

export interface MonthlyAnalysisParams {
  machineryId?: string;
  year?: number;
  fuelType?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface DailyDetailParams {
  machineryId: string;
  month: string;
}

export interface DailyDetailResponse {
  machinery: MachineryInfo;
  year: number;
  month: string;
  monthLabel: string;
  monthlyAvgLitersPerHour: number;
  dailyData: DailyFuelData[];
  anomalies: FuelAnomaly[];
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
  BLACKLISTED: "Blacklisted",
  ARCHIVED: "Archived",
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

export const MACHINERY_OWNERSHIP_TYPES = [
  "COMPANY",
  "CONTRACTOR_OWNED",
  "RENTED",
  "LEASED",
] as const;
export type MachineryOwnershipType = (typeof MACHINERY_OWNERSHIP_TYPES)[number];

export const MACHINERY_OWNERSHIP_LABELS: Record<MachineryOwnershipType, string> = {
  COMPANY: "Company Owned",
  CONTRACTOR_OWNED: "Contractor Owned",
  RENTED: "Rented",
  LEASED: "Leased",
};

export const MACHINERY_OWNERSHIP_COLORS: Record<MachineryOwnershipType, string> = {
  COMPANY: "#3b82f6",
  CONTRACTOR_OWNED: "#8b5cf6",
  RENTED: "#f59e0b",
  LEASED: "#06b4d4",
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
  BLACKLISTED: "#7c2d12",
  ARCHIVED: "#64748b",
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
