/**
 * Remove salary fields from an employee object when the caller lacks the
 * `employees:salary:view` permission. Keeps identity/employment data intact.
 */
export function sanitizeSalaryFields<T extends Record<string, any>>(
  emp: T,
  canViewSalary: boolean
): T {
  if (canViewSalary) return emp;
  const next = { ...emp };
  delete next.salary;
  delete next.baseSalaryMinor;
  return next;
}

/**
 * HR Service Layer
 * ----------------
 * Centralizes all employee HR business logic so it can be reused consistently
 * across payroll, dashboards, and APIs. Keeps money exact (integer minor units)
 * and preserves historical data.
 *
 * Key guarantees:
 *  - Salary for any historical date is derived from SalaryHistory, never the
 *    current employee record (so approved payroll is never recomputed).
 *  - Future-dated salary changes do not affect current calculations.
 *  - All mutations run in transactions and write audit events.
 */
import { db } from "../lib/db";
import { toMinor, fromMinor } from "../lib/money";
import {
  ALLOCATING_PAYROLL_STATUSES,
  adjustmentDirectionForKind,
  isPayrollEditable,
  isPayrollPaymentMethod,
} from "../lib/payroll-status";
import type {
  PayrollAdjustmentDirection,
  PayrollAdjustmentKind,
} from "../lib/payroll-status";
import { Prisma } from "@prisma/client";
import { walletService } from "./wallet.service";
import { companyWalletService } from "./company-wallet.service";
import { loanService } from "./loan.service";
import type { EmployeeStatement, StatementEntry } from "../types/statement";

export type SalaryAtDate = {
  amountMinor: number;
  currency: string;
  effectiveFrom: Date;
};

/** Returns the salary applicable on `date` (latest effectiveFrom <= date). */
export async function getEmployeeSalaryAtDate(
  employeeId: string,
  date: Date | string
): Promise<SalaryAtDate | null> {
  const d = typeof date === "string" ? new Date(date) : date;
  const record = await db.salaryHistory.findFirst({
    where: { employeeId, effectiveFrom: { lte: d } },
    orderBy: { effectiveFrom: "desc" },
  });
  if (!record) return null;
  return {
    amountMinor: record.amountMinor,
    currency: record.currency,
    effectiveFrom: record.effectiveFrom,
  };
}

/** Current salary = salary applicable today. */
export async function getCurrentEmployeeSalary(
  employeeId: string
): Promise<SalaryAtDate | null> {
  return getEmployeeSalaryAtDate(employeeId, new Date());
}

export async function getSalaryHistory(
  employeeId: string,
  order: "asc" | "desc" = "desc"
) {
  return db.salaryHistory.findMany({
    where: { employeeId },
    orderBy: { effectiveFrom: order },
    include: { createdBy: { select: { id: true, name: true } } },
  });
}

/**
 * Create a salary change. `effectiveFrom` may be in the future. Validates:
 *  - positive amount
 *  - no duplicate (employeeId, effectiveFrom)
 *  - effectiveFrom not in the past relative to an already-active later record
 * Writes a SalaryHistory row AND an EmployeeAuditEvent, and syncs the employee's
 * baseSalaryMinor only when the change is effective now or in the past.
 */
export async function createSalaryChange(params: {
  employeeId: string;
  amount: number;
  currency?: string;
  effectiveFrom: Date | string;
  reason?: string;
  notes?: string;
  performedById: string;
}) {
  const employee = await db.employee.findUnique({
    where: { id: params.employeeId },
    select: { id: true, baseSalaryMinor: true, currency: true, status: true },
  });
  if (!employee) throw new Error("Employee not found");

  const amountMinor = toMinor(params.amount);
  if (amountMinor < 0) throw new Error("Salary amount must be non-negative");

  const effectiveFrom =
    typeof params.effectiveFrom === "string"
      ? new Date(params.effectiveFrom)
      : params.effectiveFrom;
  const currency = params.currency || employee.currency || "AFN";

  // Prevent duplicate effective date for same employee
  const dup = await db.salaryHistory.findUnique({
    where: {
      employeeId_effectiveFrom: {
        employeeId: params.employeeId,
        effectiveFrom,
      },
    },
  });
  if (dup) {
    throw new Error("A salary record already exists for this effective date");
  }

  // Prevent a future change that is older than an already-existing later one
  const laterExisting = await db.salaryHistory.findFirst({
    where: { employeeId: params.employeeId, effectiveFrom: { gt: effectiveFrom } },
    orderBy: { effectiveFrom: "asc" },
  });
  if (laterExisting && laterExisting.amountMinor === amountMinor) {
    throw new Error(
      "A conflicting salary record already exists after this date"
    );
  }

  const isEffectiveNow = effectiveFrom <= new Date();

  return db.$transaction(async (tx) => {
    const created = await tx.salaryHistory.create({
      data: {
        employeeId: params.employeeId,
        amountMinor,
        currency,
        effectiveFrom,
        reason: params.reason,
        notes: params.notes,
        createdById: params.performedById,
      },
    });

    if (isEffectiveNow) {
      await tx.employee.update({
        where: { id: params.employeeId },
        data: { baseSalaryMinor: amountMinor, currency },
      });
    }

    await tx.employeeAuditEvent.create({
      data: {
        employeeId: params.employeeId,
        action: "SALARY_CHANGE",
        field: "salary",
        previousValue: String(employee.baseSalaryMinor),
        newValue: String(amountMinor),
        effectiveDate: effectiveFrom,
        reason: params.reason,
        performedById: params.performedById,
      },
    });

    return created;
  });
}

/** Returns the contract active on `date`. */
export async function getEmployeeContractAtDate(
  employeeId: string,
  date: Date | string
) {
  const d = typeof date === "string" ? new Date(date) : date;
  return db.employeeContract.findFirst({
    where: {
      employeeId,
      startDate: { lte: d },
      OR: [{ endDate: null }, { endDate: { gte: d } }],
    },
    orderBy: { startDate: "desc" },
  });
}

/** Returns the position/department assignment active on `date`. */
export async function getEmployeePositionAtDate(
  employeeId: string,
  date: Date | string
) {
  const d = typeof date === "string" ? new Date(date) : date;
  return db.employeePositionHistory.findFirst({
    where: {
      employeeId,
      effectiveFrom: { lte: d },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: d } }],
    },
    orderBy: { effectiveFrom: "desc" },
  });
}

/** Returns the project assignment active on `date`. */
export async function getEmployeeAssignmentAtDate(
  employeeId: string,
  date: Date | string
) {
  const d = typeof date === "string" ? new Date(date) : date;
  return db.employeeProjectAssignment.findFirst({
    where: {
      employeeId,
      startDate: { lte: d },
      OR: [{ endDate: null }, { endDate: { gte: d } }],
    },
    orderBy: { startDate: "desc" },
  });
}

/**
 * Generate (or fetch existing) a payroll record for an employee and period.
 *
 * - If an APPROVED payroll already exists it is returned as-is (immutable).
 * - If a DRAFT payroll already exists it is returned as-is (skipped, not
 *   deleted and regenerated).
 * - Otherwise a new DRAFT payroll is created.
 *
 * Returns `{ payroll, created }` where `created` indicates whether a new
 * record was generated.
 */
/**
 * Record who changed a payroll and when (Plan-payroll.pdf §2 action 13).
 *
 * `oldValues` (JSON snapshot of the previous state) are retained only for
 * Admin changes; every other role logs the action itself without the previous
 * state. Accepts either the root client or an open transaction so the audit
 * row commits atomically with the change it describes.
 */
export async function logPayrollChange(
  tx: typeof db | Prisma.TransactionClient,
  data: {
    payrollId?: string | null;
    employeeId?: string | null;
    action: string;
    summary?: string | null;
    oldValues?: unknown;
    newValues?: unknown;
    reason?: string | null;
    userId: string | null;
    /** Pass when the caller already knows the actor's role (saves a lookup). */
    actorRole?: string;
  }
): Promise<void> {
  const role =
    data.actorRole ??
    (data.userId
      ? (
          await tx.user.findUnique({
            where: { id: data.userId },
            select: { role: true },
          })
        )?.role
      : undefined);
  const retainOldValues = role === "ADMIN" && data.oldValues !== undefined;
  await tx.payrollAuditLog.create({
    data: {
      payrollId: data.payrollId ?? null,
      employeeId: data.employeeId ?? null,
      action: data.action,
      summary: data.summary ?? null,
      oldValues: retainOldValues ? JSON.stringify(data.oldValues) : null,
      newValues:
        data.newValues !== undefined ? JSON.stringify(data.newValues) : null,
      reason: data.reason ?? null,
      userId: data.userId,
    },
  });
}

export async function generatePayroll(params: {
  employeeId: string;
  periodStart: Date | string;
  periodEnd: Date | string;
  createdById: string;
  allowancesMinor?: number;
  bonusesMinor?: number;
  deductionsMinor?: number;
  /** Preferred company wallet the salary should be paid from. */
  walletId?: string;
  /** Whether to deduct employee-paid expenses from debt calculation. */
  deductExpenses?: boolean;
  /** Number of days the employee worked in this period. Auto-calculated from hireDate if omitted. */
  workDays?: number;
  /** Payroll type: a FINAL_SETTLEMENT covers the window up to termination. */
  type?: "STANDARD" | "FINAL_SETTLEMENT";
}): Promise<{ payroll: any; created: boolean }> {
  const periodStart =
    typeof params.periodStart === "string"
      ? new Date(params.periodStart)
      : params.periodStart;
  const periodEnd =
    typeof params.periodEnd === "string"
      ? new Date(params.periodEnd)
      : params.periodEnd;

  const existing = await db.payroll.findUnique({
    where: {
      employeeId_periodStart_periodEnd: {
        employeeId: params.employeeId,
        periodStart,
        periodEnd,
      },
    },
    include: { lines: true },
  });
  if (existing) {
    return { payroll: existing, created: false };
  }

  const salary = await getEmployeeSalaryAtDate(params.employeeId, periodEnd);
  if (!salary) throw new Error("No salary found for employee in this period");

  // Auto-calculate workDays from the employment window if not provided.
  // Salary starts at the hire date and stops at the termination date
  // (Plan-payroll.pdf §1 "Attendance & Hiring/Termination"), so the same
  // window drives both a regular mid-period run and a final settlement.
  let workDays = params.workDays ?? 0;
  if (!workDays) {
    const employee = await db.employee.findUnique({
      where: { id: params.employeeId },
      select: { hireDate: true, terminationDate: true, quitingDate: true },
    });
    const termination = employee?.terminationDate ?? employee?.quitingDate ?? null;
    if (termination && termination < periodStart) {
      workDays = 0; // employment ended before this period
    } else if (employee?.hireDate) {
      const totalDays = new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 0).getDate();
      // Salary runs until the earlier of the period end and termination.
      const lastDay =
        termination && termination < periodEnd ? termination : periodEnd;
      const startDay =
        employee.hireDate > periodStart ? employee.hireDate.getDate() : 1;
      workDays = Math.min(lastDay.getDate() - startDay + 1, totalDays, 30);
      workDays = Math.max(workDays, 0);
    } else {
      workDays = 30; // fallback
    }
  }

  const attendance = await db.attendance.aggregate({
    where: {
      employeeId: params.employeeId,
      date: { gte: periodStart, lte: periodEnd },
      status: "PRESENT",
      approvalStatus: "APPROVED",
    },
    _count: { _all: true },
  });
  const halfDays = await db.attendance.count({
    where: {
      employeeId: params.employeeId,
      date: { gte: periodStart, lte: periodEnd },
      status: "HALF_DAY",
      approvalStatus: "APPROVED",
    },
  });
  const overtime = await db.attendance.aggregate({
    where: {
      employeeId: params.employeeId,
      date: { gte: periodStart, lte: periodEnd },
      approvalStatus: "APPROVED",
    },
    _sum: { overtimeHours: true },
  });

  const attendanceDays = attendance._count._all + halfDays * 0.5;
  const overtimeHours = overtime._sum.overtimeHours ?? 0;

  // Pro-rate base salary based on workDays (out of 30)
  const baseSalaryMinor = Math.round(salary.amountMinor * workDays / 30);
  // Overtime rate uses full monthly salary for fair calculation
  const { rate, paidDailyHours } = await employeePayrollParams(params.employeeId);
  const hourlyMinor = Math.round(salary.amountMinor / 30 / paidDailyHours);
  const overtimePayMinor = Math.round(hourlyMinor * rate * overtimeHours);

  const allowancesMinor = params.allowancesMinor ?? 0;
  const bonusesMinor = params.bonusesMinor ?? 0;
  const deductionsMinor = params.deductionsMinor ?? 0;
  // Manual payroll adjustments apply additively to this draft's gross — a
  // deduction lowers what the employee is paid, an earning raises it
  // (Plan-payroll.pdf §1 "Payroll Adjustments"). Advance-edit rows only
  // itemise previousDebt and never add to gross.
  const adj = await computeAdjustmentFigures(params.employeeId, null);
  const grossPayMinor =
    baseSalaryMinor +
    overtimePayMinor +
    allowancesMinor +
    bonusesMinor -
    deductionsMinor +
    adj.adjustmentsEarnedMinor -
    adj.adjustmentsDeductedMinor;

  // Apply the employee's outstanding advance/debt balance.
  const deductExpenses = params.deductExpenses !== false;
  const fig = await computePayrollFigures(
    params.employeeId,
    periodStart,
    periodEnd,
    grossPayMinor
  );

  // Propose the automatic loan repayment for this period (Plan-payroll.pdf
  // §1 "Loans"): capped by whatever is still payable after the advance
  // offset, stored on the draft line for HR to review — allocations only
  // happen when the payroll is approved.
  const loanCapMinor = Math.max(fig.netPayableMinor, 0);
  const loanDeductionMinor = (
    await loanService.proposeDeduction(params.employeeId, loanCapMinor)
  ).totalMinor;
  const netPayableMinor = fig.netPayableMinor - loanDeductionMinor;

  const payroll = await db.payroll.create({
    data: {
      employeeId: params.employeeId,
      periodStart,
      periodEnd,
      currency: salary.currency,
      status: "DRAFT",
      type: params.type ?? "STANDARD",
      walletId: params.walletId ?? null,
      createdById: params.createdById,
      lines: {
        create: {
          employeeId: params.employeeId,
          baseSalaryMinor,
          currency: salary.currency,
          attendanceDays,
          workDays,
          overtimeHours,
          overtimePayMinor,
          allowancesMinor,
          bonusesMinor,
          deductionsMinor,
          grossPayMinor,
          expensesPaidMinor: fig.periodExpensesMinor,
          deductExpenses,
          amountAlreadyReceivedMinor: fig.amountAlreadyReceivedMinor,
          previousDebtMinor: fig.previousDebtMinor,
          advancesDeductedMinor: fig.amountAlreadyReceivedMinor,
          adjustmentsDeductedMinor: adj.adjustmentsDeductedMinor,
          adjustmentsEarnedMinor: adj.adjustmentsEarnedMinor,
          previousAdjustmentsDeductedMinor: adj.previousAdjustmentsDeductedMinor,
          previousAdjustmentsEarnedMinor: adj.previousAdjustmentsEarnedMinor,
          loanDeductionMinor,
          netPayableMinor,
          remainingEmployeeDebtMinor: fig.remainingEmployeeDebtMinor,
          netPayMinor: Math.max(netPayableMinor, 0),
          paymentStatus: "UNPAID",
          salarySnapshotDate: salary.effectiveFrom,
        },
      },
    },
    include: { lines: true },
  });

  await logPayrollChange(db, {
    payrollId: payroll.id,
    employeeId: params.employeeId,
    action: "GENERATED",
    summary: `Draft payroll for ${periodStart.toISOString().slice(0, 10)}–${periodEnd.toISOString().slice(0, 10)}`,
    newValues: {
      status: "DRAFT",
      grossPayMinor,
      loanDeductionMinor,
      netPayMinor: Math.max(netPayableMinor, 0),
    },
    userId: params.createdById,
  });

  return { payroll, created: true };
}

/** Paid daily hours derived from the employee's work schedule (end - start - break). */
function computePaidDailyHours(emp: {
  workStartTime?: string | null;
  workEndTime?: string | null;
  breakMinutes?: number | null;
  workHoursPerDay?: number | null;
}): number {
  if (emp.workStartTime && emp.workEndTime) {
    const [sh, sm] = emp.workStartTime.split(":").map(Number);
    const [eh, em] = emp.workEndTime.split(":").map(Number);
    if (!isNaN(sh) && !isNaN(sm) && !isNaN(eh) && !isNaN(em)) {
      let diff = eh * 60 + em - (sh * 60 + sm);
      if (diff < 0) diff += 1440;
      const brk = emp.breakMinutes ?? 0;
      const paid = diff - brk;
      if (paid > 0) return paid / 60;
    }
  }
  return emp.workHoursPerDay ?? 9;
}

async function employeePayrollParams(employeeId: string): Promise<{
  rate: number;
  paidDailyHours: number;
}> {
  const emp = await db.employee.findUnique({
    where: { id: employeeId },
    select: {
      overtimeRate: true,
      workHoursPerDay: true,
      workStartTime: true,
      workEndTime: true,
      breakMinutes: true,
    },
  });
  return {
    rate: emp?.overtimeRate ?? 1.25,
    paidDailyHours: computePaidDailyHours(emp),
  };
}

/**
 * Compute worked hours and overtime from clock-in/out times.
 * If explicit overtime is supplied it is used (manual override); otherwise
 * overtime = max(0, workedHours - paidDailyHours) based on the employee schedule.
 */
export async function computeAttendanceHours(
  employeeId: string,
  checkInTime?: string | null,
  checkOutTime?: string | null,
  explicitOvertimeHours?: number | null
): Promise<{ workedHours: number; overtimeHours: number }> {
  const { paidDailyHours } = await employeePayrollParams(employeeId);
  let workedHours = 0;
  let overtimeHours = explicitOvertimeHours ?? 0;

  if (checkInTime && checkOutTime) {
    const ms = new Date(checkOutTime).getTime() - new Date(checkInTime).getTime();
    workedHours = ms > 0 ? ms / 3_600_000 : 0;
    if (explicitOvertimeHours == null) {
      overtimeHours = Math.max(0, +(workedHours - paidDailyHours).toFixed(2));
    }
  }

  return {
    workedHours: +workedHours.toFixed(2),
    overtimeHours: +overtimeHours.toFixed(2),
  };
}

/**
 * Compute advance/debt figures for a payroll period.
 *
 * The employee's outstanding balance is:
 *   received (advances + salary payments - returns) - approved payroll earnings
 * Positive => employee owes the company; negative => company owes employee.
 *
 * Employee-paid company expenses are deliberately NOT part of this: they are
 * reimbursed separately from salary (Plan-payroll.pdf §2 action 7). Their
 * period total is still returned for display.
 */
export async function computePayrollFigures(
  employeeId: string,
  periodStart: Date,
  periodEnd: Date,
  grossPayMinor: number
) {
  const priorEarnedAgg = await db.payrollLine.aggregate({
    _sum: { grossPayMinor: true },
    where: {
      employeeId,
      payroll: {
        status: { in: [...ALLOCATING_PAYROLL_STATUSES] },
        periodEnd: { lt: periodStart },
      },
    },
  });
  const priorEarnedMinor = priorEarnedAgg._sum.grossPayMinor ?? 0;

  const received = await db.cashTransaction.findMany({
    where: {
      employeeId,
      type: { in: ["ADVANCE", "SALARY_PAYMENT"] },
      approvalStatus: "APPROVED",
      createdAt: { lte: periodEnd },
    },
    select: { amount: true },
  });
  const returnedAgg = await db.cashTransaction.aggregate({
    _sum: { amount: true },
    where: {
      employeeId,
      type: "RETURN",
      approvalStatus: "APPROVED",
      createdAt: { lte: periodEnd },
    },
  });
  // Convert major-unit Float amounts to integer minor units with rounding
  // to avoid floating-point precision drift (e.g. 0.1 + 0.2 = 0.30000000000000004).
  const receivedMinor =
    Math.round(received.reduce((s, t) => s + t.amount, 0) * 100) -
    Math.round((returnedAgg._sum.amount ?? 0) * 100);

  // Period-scoped employee-paid expenses, reported for information only;
  // reimbursement happens outside salary payroll.
  const periodExpensesAgg = await db.expense.aggregate({
    _sum: { amount: true },
    where: {
      paidById: employeeId,
      approvalStatus: "APPROVED",
      expenseDate: { gte: periodStart, lte: periodEnd },
    },
  });
  const periodExpensesMinor = Math.round((periodExpensesAgg._sum.amount ?? 0) * 100);

  const previousDebtMinor = receivedMinor - priorEarnedMinor;
  const amountAlreadyReceivedMinor = Math.max(
    0,
    Math.min(grossPayMinor, previousDebtMinor)
  );
  const netPayableMinor = grossPayMinor - previousDebtMinor;
  const remainingEmployeeDebtMinor = Math.max(
    previousDebtMinor - grossPayMinor,
    0
  );

  return {
    priorEarnedMinor,
    receivedMinor,
    previousDebtMinor,
    amountAlreadyReceivedMinor,
    netPayableMinor,
    remainingEmployeeDebtMinor,
    periodExpensesMinor,
  };
}

/** Allocate an employee's approved advances to a payroll, never twice.
 *
 *  Allocation order is largest outstanding advance first (Plan-payroll.pdf
 *  §2 action 1): HR enters one total deduction amount and the system
 *  distributes it across the advances that still have an unallocated balance.
 *  Ties are broken by creation date (oldest first). Advances that are already
 *  fully allocated, or already allocated to this payroll, are skipped, so the
 *  original transactions and the remaining outstanding balances stay visible.
 *
 *  Returns the total amount allocated in minor units. */
async function allocateAdvances(
  tx: Prisma.TransactionClient,
  employeeId: string,
  periodEnd: Date,
  payrollId: string,
  amountMinor: number
): Promise<number> {
  if (amountMinor <= 0) return 0;

  const advances = await tx.cashTransaction.findMany({
    where: {
      employeeId,
      type: "ADVANCE",
      approvalStatus: "APPROVED",
      createdAt: { lte: periodEnd },
      payrollAllocations: { none: { payrollId } },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      amount: true,
      createdAt: true,
      payrollAllocations: {
        where: { payroll: { status: { in: [...ALLOCATING_PAYROLL_STATUSES] } } },
        select: { amountMinor: true },
      },
    },
  });

  const outstanding = advances
    .map((adv) => {
      const advanceMinor = Math.round(adv.amount * 100);
      const allocatedMinor = adv.payrollAllocations.reduce(
        (s, a) => s + a.amountMinor,
        0
      );
      return {
        id: adv.id,
        createdAt: adv.createdAt,
        outstandingMinor: Math.max(0, advanceMinor - allocatedMinor),
      };
    })
    .filter((adv) => adv.outstandingMinor > 0)
    .sort(
      (a, b) =>
        b.outstandingMinor - a.outstandingMinor ||
        a.createdAt.getTime() - b.createdAt.getTime()
    );

  const availableMinor = outstanding.reduce(
    (s, adv) => s + adv.outstandingMinor,
    0
  );

  // Idempotent: a payroll that already holds allocations (e.g. after a
  // recalculation) only ever tops itself up to `amountMinor`.
  const existingAgg = await tx.payrollAdvanceAllocation.aggregate({
    _sum: { amountMinor: true },
    where: { payrollId },
  });
  const alreadyAllocatedMinor = existingAgg._sum.amountMinor ?? 0;

  let toAllocate = Math.min(amountMinor - alreadyAllocatedMinor, availableMinor);
  let totalAllocated = 0;
  if (toAllocate <= 0) return 0;

  for (const adv of outstanding) {
    if (toAllocate <= 0) break;
    const amt = Math.min(adv.outstandingMinor, toAllocate);
    await tx.payrollAdvanceAllocation.create({
      data: { payrollId, cashTransactionId: adv.id, amountMinor: amt },
    });
    toAllocate -= amt;
    totalAllocated += amt;
  }

  return totalAllocated;
}

/**
 * An HR-entered loan deduction may never exceed the salary that is still
 * payable after the advance offset — the remainder stays on the loan for HR
 * to settle separately (Plan-payroll.pdf §1 "Loans": HR decides).
 */
function validateLoanDeduction(targetMinor: number, capMinor: number) {
  if (targetMinor > capMinor) {
    throw new Error(
      `Loan deduction (${fromMinor(targetMinor)} AFN) exceeds the net salary after advances ` +
        `(${fromMinor(capMinor)} AFN); lower the deduction — the rest of the loan stays outstanding`
    );
  }
}

/** Approve a payroll record. Approval finalizes and settles it: */
/**
 * Approve a payroll (Plan-payroll.pdf §2 action 6 / action 9).
 *
 * Approval no longer moves money: it freezes the figures, allocates the
 * outstanding advances and posts the salary accounting entry. Cash only leaves
 * the company when a payment is recorded with `recordPayrollPayment`, so a
 * payroll can be paid in several partial payments with different methods.
 *
 * Re-approving a reverted payroll that still has recorded payments restores
 * their total and goes straight to PARTIALLY_PAID / PAID.
 */
export async function approvePayroll(payrollId: string, approvedById: string) {
  const payroll = await db.payroll.findUnique({
    where: { id: payrollId },
    include: { lines: true },
  });
  if (!payroll) throw new Error("Payroll not found");
  if (payroll.status === "APPROVED") return payroll;
  if (payroll.status === "PARTIALLY_PAID" || payroll.status === "PAID") {
    return payroll; // already approved; payments are tracked separately
  }

  const line = payroll.lines[0];
  if (!line) throw new Error("Payroll has no line items");

  // Attendance may have been approved after this draft was generated, and
  // manual adjustments may have been created: refresh both first so
  // approval freezes the current truth (Plan-payroll.pdf §1).
  const adj = await computeAdjustmentFigures(payroll.employeeId, payrollId);
  const att = await computeAttendanceFigures(
    payroll.employeeId,
    payroll.periodStart,
    payroll.periodEnd,
    { ...line, ...adj }
  );

  // Recompute final figures at approval time (ledger may have changed).
  const fig = await computePayrollFigures(
    payroll.employeeId,
    payroll.periodStart,
    payroll.periodEnd,
    att.grossPayMinor
  );

  const employeeId = payroll.employeeId;
  // Loan repayment (§1 "Loans"): an explicit HR override wins, validated
  // against what is still payable after the advance offset; otherwise the
  // auto-deduction proposal is taken fresh — the ledger may have changed
  // since the draft was generated.
  const loanCapMinor = Math.max(fig.netPayableMinor, 0);
  let loanDeductionMinor: number;
  if (line.loanDeductionOverridden) {
    validateLoanDeduction(line.loanDeductionMinor, loanCapMinor);
    loanDeductionMinor = line.loanDeductionMinor;
  } else {
    loanDeductionMinor = (
      await loanService.proposeDeduction(employeeId, loanCapMinor, db, {
        effectivePayrollId: payrollId,
      })
    ).totalMinor;
  }
  const netPayableMinor = fig.netPayableMinor - loanDeductionMinor;
  const netPayMinor = Math.max(netPayableMinor, 0);

  // Payments recorded before a revert are preserved (PDF §1 "Payroll Editing
  // & Correction") and re-attach to the payroll when it is approved again.
  const paidAgg = await db.payrollPayment.aggregate({
    _sum: { amountMinor: true },
    where: { payrollId },
  });
  const paidMinor = Math.min(paidAgg._sum.amountMinor ?? 0, netPayMinor);
  const fullyPaid = netPayMinor > 0 && paidMinor >= netPayMinor;
  const status =
    paidMinor <= 0 ? "APPROVED" : fullyPaid ? "PAID" : "PARTIALLY_PAID";

  const [emp, approver] = await Promise.all([
    db.employee.findUnique({
      where: { id: employeeId },
      select: { fullName: true },
    }),
    db.user.findUnique({
      where: { id: approvedById },
      select: { name: true },
    }),
  ]);
  const employeeName = emp?.fullName ?? "Employee";
  const approverName = approver?.name ?? "Manager";
  const periodLabel = `${payroll.periodStart.toISOString().slice(0, 10)}–${payroll.periodEnd.toISOString().slice(0, 10)}`;

  await db.$transaction(async (tx) => {
    const allocatedMinor = await allocateAdvances(
      tx,
      employeeId,
      payroll.periodEnd,
      payrollId,
      fig.amountAlreadyReceivedMinor
    );

    // Take the loan repayment out of the outstanding balances; throws (and
    // rolls the approval back) if HR's override exceeds them.
    await loanService.allocate(tx, employeeId, payrollId, loanDeductionMinor);

    // Post the adjustments that were included in this approval's figures, so
    // they never apply to a later payroll as well (Plan-payroll.pdf §1).
    await tx.payrollAdjustment.updateMany({
      where: { employeeId, payrollId: null },
      data: { payrollId },
    });

    // Salary accounting on approval (§2 action 9): the accrued gross is
    // recognised as a company expense; every actual payment posts its own
    // PAYROLL_PAYMENT entry, and corrections reverse this entry instead of
    // rewriting it.
    await tx.accountingEntry.create({
      data: {
        type: "PAYROLL_APPROVAL",
        amountMinor: -att.grossPayMinor,
        description: `Payroll approved for ${employeeName} (${periodLabel})`,
        payrollId,
        postedById: approvedById,
      },
    });

    await tx.payroll.update({
      where: { id: payrollId },
      data: {
        status,
        approvedById,
        approvedAt: new Date(),
        totalPaidMinor: paidMinor,
        revertedAt: null,
        reversalReason: null,
        lines: {
          update: {
            where: { id: line.id },
            data: {
              attendanceDays: att.attendanceDays,
              overtimeHours: att.overtimeHours,
              overtimePayMinor: att.overtimePayMinor,
              grossPayMinor: att.grossPayMinor,
              amountAlreadyReceivedMinor: fig.amountAlreadyReceivedMinor,
              previousDebtMinor: fig.previousDebtMinor,
              advancesDeductedMinor: allocatedMinor,
              adjustmentsDeductedMinor: adj.adjustmentsDeductedMinor,
              adjustmentsEarnedMinor: adj.adjustmentsEarnedMinor,
              previousAdjustmentsDeductedMinor: adj.previousAdjustmentsDeductedMinor,
              previousAdjustmentsEarnedMinor: adj.previousAdjustmentsEarnedMinor,
              loanDeductionMinor,
              netPayableMinor,
              remainingEmployeeDebtMinor: fig.remainingEmployeeDebtMinor,
              netPayMinor,
              paymentStatus:
                paidMinor <= 0
                  ? "UNPAID"
                  : fullyPaid
                    ? "PAID"
                    : "PARTIALLY_PAID",
            },
          },
        },
      },
    });

    await tx.employeeAuditEvent.create({
      data: {
        employeeId,
        action: "PAYROLL_APPROVED",
        newValue: payrollId,
        performedById: approvedById,
      },
    });
    await logPayrollChange(tx, {
      payrollId,
      employeeId,
      action: "APPROVED",
      summary: `${periodLabel} → ${status}`,
      oldValues: { status: payroll.status, grossPayMinor: line.grossPayMinor },
      newValues: {
        status,
        grossPayMinor: att.grossPayMinor,
        netPayMinor,
        loanDeductionMinor,
        totalPaidMinor: paidMinor,
      },
      userId: approvedById,
    });
  });

  // The wallet now counts the approved earnings against the employee.
  await walletService.recomputeBalance(employeeId);

  return db.payroll.findUnique({
    where: { id: payrollId },
    include: { lines: true },
  });
}

/**
 * Record one salary payment against an approved payroll (§2 action 6).
 *
 * Each payment is an independent financial record — its own PayrollPayment row,
 * its own SALARY_PAYMENT cash transaction and its own accounting entry — so a
 * payroll can be settled in several partial payments with a different payment
 * method each time.
 */
export async function recordPayrollPayment(
  payrollId: string,
  paidById: string,
  opts: {
    amountMinor?: number;
    paymentMethod: string;
    walletId?: string;
    note?: string;
    reference?: string;
    evidenceUrl?: string;
  }
) {
  if (!isPayrollPaymentMethod(opts.paymentMethod)) {
    throw new Error("Unsupported payment method");
  }

  const payroll = await db.payroll.findUnique({
    where: { id: payrollId },
    include: { lines: true },
  });
  if (!payroll) throw new Error("Payroll not found");
  if (payroll.status === "PAID") {
    throw new Error("Payroll is already fully paid");
  }
  if (payroll.status !== "APPROVED" && payroll.status !== "PARTIALLY_PAID") {
    throw new Error("Payroll must be approved before it can be paid");
  }
  const line = payroll.lines[0];
  if (!line) throw new Error("Payroll has no line items");

  const netPayMinor = Math.max(line.netPayMinor, 0);
  const remainingMinor = netPayMinor - payroll.totalPaidMinor;
  if (remainingMinor <= 0) {
    throw new Error("Payroll is already fully paid");
  }

  const amountMinor = opts.amountMinor ?? remainingMinor;
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    throw new Error("Payment amount must be a positive amount in minor units");
  }
  if (amountMinor > remainingMinor) {
    throw new Error(
      `Payment exceeds the remaining payable of ${fromMinor(remainingMinor)} AFN`
    );
  }
  // A company-wallet payment falls back to the wallet chosen when the payroll
  // was generated, so the UI only has to ask when neither is known.
  const walletId =
    opts.paymentMethod === "COMPANY_WALLET"
      ? (opts.walletId ?? payroll.walletId ?? undefined)
      : undefined;
  if (opts.paymentMethod === "COMPANY_WALLET" && !walletId) {
    throw new Error("Paying from a company wallet requires a wallet");
  }

  const employeeId = payroll.employeeId;
  const amount = amountMinor / 100;
  const newTotal = payroll.totalPaidMinor + amountMinor;
  const fullyPaid = newTotal >= netPayMinor;

  const [emp, payer] = await Promise.all([
    db.employee.findUnique({
      where: { id: employeeId },
      select: { fullName: true },
    }),
    db.user.findUnique({
      where: { id: paidById },
      select: { name: true },
    }),
  ]);
  const employeeName = emp?.fullName ?? "Employee";
  const payerName = payer?.name ?? "Manager";
  const periodLabel = `${payroll.periodStart.toISOString().slice(0, 10)}–${payroll.periodEnd.toISOString().slice(0, 10)}`;

  await db.$transaction(async (tx) => {
    if (walletId) {
      await companyWalletService.deductForPayroll(tx, walletId, amount, payrollId, paidById);
    }

    const payment = await tx.payrollPayment.create({
      data: {
        payrollId,
        amountMinor,
        paymentMethod: opts.paymentMethod,
        walletId: walletId ?? null,
        reference: opts.reference ?? null,
        evidenceUrl: opts.evidenceUrl ?? null,
        note: opts.note ?? null,
        createdById: paidById,
      },
    });

    const txn = await tx.cashTransaction.create({
      data: {
        employeeId,
        type: "SALARY_PAYMENT",
        amount,
        note: opts.note ?? `Salary payment ${periodLabel}`,
        referenceNumber: opts.reference ?? null,
        paymentMethod: opts.paymentMethod,
        walletId: walletId ?? null,
        paidAt: new Date(),
        createdBy: paidById,
        approvalStatus: "APPROVED",
        approvedById: paidById,
        approvedAt: new Date(),
        payrollId,
      },
    });

    await tx.expense.create({
      data: {
        title: `Salary payment ${periodLabel}`,
        description: `Payroll for ${employeeName}`,
        category: "SALARY",
        amount,
        paymentMethod: opts.paymentMethod,
        paidTo: employeeName,
        paidBy: payerName,
        expenseDate: payroll.periodEnd,
        paidToId: employeeId,
        createdBy: paidById,
        approvalStatus: "APPROVED",
        approvedById: paidById,
        approvedAt: new Date(),
        payrollId,
        walletId: walletId ?? null,
      },
    });

    // Payment accounting entry (§2 action 9): negative = company paid out.
    await tx.accountingEntry.create({
      data: {
        type: "PAYROLL_PAYMENT",
        amountMinor: -amountMinor,
        description: `Salary payment ${periodLabel} via ${opts.paymentMethod}`,
        payrollId,
        cashTransactionId: txn.id,
        walletId: walletId ?? null,
        postedById: paidById,
      },
    });

    await tx.payroll.update({
      where: { id: payrollId },
      data: {
        status: fullyPaid ? "PAID" : "PARTIALLY_PAID",
        totalPaidMinor: newTotal,
        lines: {
          update: {
            where: { id: line.id },
            data: {
              paymentStatus: fullyPaid ? "PAID" : "PARTIALLY_PAID",
              paymentMethod: opts.paymentMethod,
            },
          },
        },
      },
    });

    await tx.employeeAuditEvent.create({
      data: {
        employeeId,
        action: "PAYROLL_PAID",
        newValue: payrollId,
        reason: `${fromMinor(amountMinor)} AFN via ${opts.paymentMethod} (${payment.id})`,
        performedById: paidById,
      },
    });
    await logPayrollChange(tx, {
      payrollId,
      employeeId,
      action: "PAYMENT_RECORDED",
      summary: `${fromMinor(amountMinor)} AFN via ${opts.paymentMethod}`,
      newValues: {
        paymentId: payment.id,
        amountMinor,
        paymentMethod: opts.paymentMethod,
        walletId: walletId ?? null,
        totalPaidMinor: newTotal,
        status: fullyPaid ? "PAID" : "PARTIALLY_PAID",
      },
      userId: paidById,
    });
  });

  await walletService.recomputeBalance(employeeId);

  return db.payroll.findUnique({
    where: { id: payrollId },
    include: {
      lines: true,
      payments: { orderBy: { paidAt: "asc" } },
    },
  });
}

/**
 * Reverse every still-active salary accrual of a payroll, each exactly once.
 * An approval entry is "active" until some PAYROLL_REVERSAL points at it, so
 * corrected entries (reversal + new accrual) never get double-reversed.
 */
async function reverseActiveApprovals(
  tx: Prisma.TransactionClient,
  payrollId: string,
  description: string,
  postedById: string | null
) {
  const approvals = await tx.accountingEntry.findMany({
    where: { payrollId, type: "PAYROLL_APPROVAL" },
  });
  for (const entry of approvals) {
    const alreadyReversed = await tx.accountingEntry.findFirst({
      where: { reversalOfId: entry.id },
    });
    if (alreadyReversed) continue;
    await tx.accountingEntry.create({
      data: {
        type: "PAYROLL_REVERSAL",
        amountMinor: -entry.amountMinor,
        description,
        payrollId,
        reversalOfId: entry.id,
        postedById,
      },
    });
  }
}

/**
 * Update a payroll line with inline edits. Recomputes derived figures
 * (gross, net, etc.) and returns the updated payroll with lines.
 *
 * Editing follows PDF §1 "Payroll Editing & Correction": HR can edit a
 * payroll until payment begins (DRAFT / APPROVED / NEEDS_RECALCULATION) and
 * may still modify a PARTIALLY_PAID payroll as long as recorded payments are
 * preserved — the new net pay can never dip below what has already been paid,
 * and the salary accounting posted at approval is corrected with a reversal
 * plus a new entry instead of being rewritten. PAID / CANCELLED are locked.
 */
export async function updatePayrollLine(
  lineId: string,
  updates: {
    overtimeHours?: number;
    allowancesMinor?: number;
    bonusesMinor?: number;
    deductionsMinor?: number;
    loanDeductionMinor?: number;
    netPayableMinor?: number;
    remainingEmployeeDebtMinor?: number;
    deductExpenses?: boolean;
    walletId?: string;
  },
  editedById?: string
) {
  const line = await db.payrollLine.findUnique({
    where: { id: lineId },
    include: { payroll: true },
  });
  if (!line) throw new Error("Payroll line not found");
  const payroll = line.payroll;
  if (!isPayrollEditable(payroll.status)) {
    throw new Error(
      "Paid or cancelled payroll lines cannot be edited; use a correction or adjustment"
    );
  }

  const payrollId = line.payrollId;
  const paidMinor = payroll.totalPaidMinor;
  // A live partial approval consumed its advance offsets at approval time, so
  // only the salary side is recomputed. Payment history itself is never touched.
  const frozenDebt = payroll.status === "PARTIALLY_PAID";

  const overtimeHours = updates.overtimeHours ?? line.overtimeHours;
  const allowancesMinor = updates.allowancesMinor ?? line.allowancesMinor;
  const bonusesMinor = updates.bonusesMinor ?? line.bonusesMinor;
  const deductionsMinor = updates.deductionsMinor ?? line.deductionsMinor;
  const deductExpenses = updates.deductExpenses ?? line.deductExpenses;

  // Recompute overtime pay if hours changed
  const { rate, paidDailyHours } = await employeePayrollParams(line.employeeId);
  const hourlyMinor = Math.round(line.baseSalaryMinor / 30 / paidDailyHours);
  const overtimePayMinor = Math.round(hourlyMinor * rate * overtimeHours);

  // Recompute gross — stored manual adjustments stay inside it until the
  // next full recomputation refreshes them.
  const grossPayMinor =
    line.baseSalaryMinor +
    overtimePayMinor +
    allowancesMinor +
    bonusesMinor -
    deductionsMinor +
    line.adjustmentsEarnedMinor -
    line.adjustmentsDeductedMinor;

  // Recompute debt figures (employee-paid expenses are reimbursed outside
  // payroll, so the legacy deductExpenses toggle no longer affects them)
  const fig = await computePayrollFigures(
    line.employeeId,
    payroll.periodStart,
    payroll.periodEnd,
    grossPayMinor
  );
  const previousDebtMinor = frozenDebt ? line.previousDebtMinor : fig.previousDebtMinor;
  const amountAlreadyReceivedMinor = Math.max(
    0,
    Math.min(grossPayMinor, previousDebtMinor)
  );

  // Loan repayment (§1 "Loans"): an explicit HR entry becomes the override;
  // an existing override keeps its stored value; a partially paid payroll
  // keeps the plan it was approved with; anything else is re-proposed fresh
  // from the ledger (the proposal already treats this payroll's own
  // allocations as restored — they are rebuilt inside the transaction).
  const loanCapMinor = Math.max(grossPayMinor - previousDebtMinor, 0);
  let loanDeductionMinor: number;
  let loanDeductionOverridden = line.loanDeductionOverridden;
  if (updates.loanDeductionMinor !== undefined) {
    validateLoanDeduction(updates.loanDeductionMinor, loanCapMinor);
    if (payroll.status === "DRAFT") {
      // Drafts hold no allocations, so the outstanding balances are exact.
      const outstanding = await loanService.outstandingTotalMinor(line.employeeId);
      if (updates.loanDeductionMinor > outstanding) {
        throw new Error(
          `Loan deduction (${fromMinor(updates.loanDeductionMinor)} AFN) exceeds the outstanding ` +
            `loan balances (${fromMinor(outstanding)} AFN); HR must adjust the deduction`
        );
      }
    }
    loanDeductionMinor = updates.loanDeductionMinor;
    loanDeductionOverridden = true;
  } else if (line.loanDeductionOverridden) {
    validateLoanDeduction(line.loanDeductionMinor, loanCapMinor);
    loanDeductionMinor = line.loanDeductionMinor;
  } else if (payroll.status === "PARTIALLY_PAID") {
    loanDeductionMinor = line.loanDeductionMinor;
  } else {
    loanDeductionMinor = (
      await loanService.proposeDeduction(line.employeeId, loanCapMinor, db, {
        effectivePayrollId: payroll.status === "DRAFT" ? undefined : payrollId,
      })
    ).totalMinor;
  }

  // Allow manual override of netPayableMinor / remainingEmployeeDebtMinor
  const netPayableMinor =
    updates.netPayableMinor ??
    grossPayMinor - previousDebtMinor - loanDeductionMinor;
  const remainingEmployeeDebtMinor =
    updates.remainingEmployeeDebtMinor ??
    Math.max(previousDebtMinor - grossPayMinor, 0);
  const netPayMinor = Math.max(netPayableMinor, 0);

  // A correction may never eat into money that has already been paid out
  // (reverted drafts carry their surviving payments as well).
  if (paidMinor > 0 && netPayMinor < paidMinor) {
    throw new Error(
      `Net pay (${fromMinor(netPayMinor)} AFN) cannot be lower than the ${fromMinor(paidMinor)} AFN already paid`
    );
  }

  const settledInFull = paidMinor > 0 && netPayMinor <= paidMinor;
  const paymentStatus =
    paidMinor <= 0
      ? line.paymentStatus
      : settledInFull
        ? "PAID"
        : "PARTIALLY_PAID";
  const payrollStatus =
    payroll.status === "PARTIALLY_PAID" && settledInFull
      ? "PAID"
      : payroll.status;

  // The approval accrual is posted against the gross; correcting an approved
  // payroll in place reverses it and posts the corrected entry (PDF §4:
  // corrections reverse the original and create the corrected entry).
  const needsAccountingFix =
    payroll.approvedAt != null && grossPayMinor !== line.grossPayMinor;

  await db.$transaction(async (tx) => {
    if (needsAccountingFix) {
      const employee = await tx.employee.findUnique({
        where: { id: line.employeeId },
        select: { fullName: true },
      });
      const periodLabel = `${payroll.periodStart.toISOString().slice(0, 10)}–${payroll.periodEnd.toISOString().slice(0, 10)}`;
      await reverseActiveApprovals(
        tx,
        payrollId,
        "Reversal of payroll approval (line corrected)",
        editedById ?? payroll.approvedById
      );
      await tx.accountingEntry.create({
        data: {
          type: "PAYROLL_APPROVAL",
          amountMinor: -grossPayMinor,
          description: `Payroll corrected for ${employee?.fullName ?? "Employee"} (${periodLabel})`,
          payrollId,
          postedById: editedById ?? payroll.approvedById,
        },
      });
    }

    // Unpaid approved payrolls rebuild their advance allocations so the
    // deduction plan matches the corrected figures (same as recalculation).
    let advancesDeductedMinor = line.advancesDeductedMinor;
    if (payroll.status !== "DRAFT" && paidMinor === 0) {
      await tx.payrollAdvanceAllocation.deleteMany({ where: { payrollId } });
      advancesDeductedMinor = await allocateAdvances(
        tx,
        line.employeeId,
        payroll.periodEnd,
        payrollId,
        amountAlreadyReceivedMinor
      );
    }

    // Loan deductions are rebuilt alongside: free the balances this payroll
    // held, then re-allocate the resolved target (throws if HR's override
    // exceeds the balances, rolling the edit back).
    if (payroll.status !== "DRAFT") {
      await loanService.restoreAllocations(tx, payrollId);
      await loanService.allocate(tx, line.employeeId, payrollId, loanDeductionMinor);
    }

    await tx.payrollLine.update({
      where: { id: lineId },
      data: {
        overtimeHours,
        overtimePayMinor,
        allowancesMinor,
        bonusesMinor,
        deductionsMinor,
        grossPayMinor,
        expensesPaidMinor: fig.periodExpensesMinor,
        deductExpenses,
        amountAlreadyReceivedMinor,
        previousDebtMinor,
        advancesDeductedMinor,
        loanDeductionMinor,
        loanDeductionOverridden,
        netPayableMinor,
        remainingEmployeeDebtMinor,
        netPayMinor,
        paymentStatus,
      },
    });

    if (payrollStatus !== payroll.status || updates.walletId !== undefined) {
      await tx.payroll.update({
        where: { id: payrollId },
        data: {
          ...(payrollStatus !== payroll.status && { status: payrollStatus }),
          ...(updates.walletId !== undefined && {
            walletId: updates.walletId || null,
          }),
        },
      });
    }
  });

  // Approved earnings feed the employee balance; a corrected net changes it.
  if (payroll.status !== "DRAFT") {
    await walletService.recomputeBalance(line.employeeId);
  }

  await logPayrollChange(db, {
    payrollId,
    employeeId: line.employeeId,
    action: "LINE_EDITED",
    summary: `Line figures edited (gross ${fromMinor(line.grossPayMinor)} → ${fromMinor(grossPayMinor)} AFN)`,
    oldValues: {
      overtimeHours: line.overtimeHours,
      allowancesMinor: line.allowancesMinor,
      bonusesMinor: line.bonusesMinor,
      deductionsMinor: line.deductionsMinor,
      grossPayMinor: line.grossPayMinor,
      loanDeductionMinor: line.loanDeductionMinor,
      walletId: payroll.walletId,
      payrollStatus: payroll.status,
    },
    newValues: {
      overtimeHours,
      allowancesMinor,
      bonusesMinor,
      deductionsMinor,
      grossPayMinor,
      loanDeductionMinor,
      netPayMinor,
      walletId: updates.walletId !== undefined ? updates.walletId || null : payroll.walletId,
      payrollStatus,
      ...(needsAccountingFix && { accountingCorrection: true }),
    },
    userId: editedById ?? null,
  });

  return db.payroll.findUnique({
    where: { id: payrollId },
    include: { lines: true, employee: { select: { id: true, fullName: true, employeeNumber: true } } },
  });
}

/**
 * Revert an approved payroll back to DRAFT so it can be corrected and
 * re-approved. Removes the settlement (salary payment + advance allocations)
 * and recomputes the employee wallet balance.
 */
export async function revertPayroll(
  payrollId: string,
  userId: string,
  reason?: string
) {
  const payroll = await db.payroll.findUnique({
    where: { id: payrollId },
    include: { lines: true },
  });
  if (!payroll) throw new Error("Payroll not found");
  if (
    payroll.status !== "APPROVED" &&
    payroll.status !== "PARTIALLY_PAID" &&
    payroll.status !== "NEEDS_RECALCULATION"
  ) {
    throw new Error("Only an unpaid or partially paid payroll can be reverted");
  }
  if (payroll.revertedAt) {
    throw new Error("Payroll has already been reverted");
  }

  const employeeId = payroll.employeeId;

  await db.$transaction(async (tx) => {
    // Recorded payments (cash transactions, company expenses and the
    // PayrollPayment rows behind them) are real financial history and survive
    // the correction (PDF §1 "Payroll Editing & Correction"): only the
    // approval itself is undone.
    // Free the advances allocated to this payroll so they can be re-allocated
    // when the corrected payroll is generated, and give the deducted loan
    // balances back to the loans (they are re-proposed on re-approval).
    await tx.payrollAdvanceAllocation.deleteMany({ where: { payrollId: payroll.id } });
    await loanService.restoreAllocations(tx, payroll.id);
    // Posted adjustments go back to unposted so the next approval re-applies
    // them (Plan-payroll.pdf §1 "Payroll Adjustments").
    await tx.payrollAdjustment.updateMany({
      where: { payrollId: payroll.id },
      data: { payrollId: null },
    });

    // Reverse the salary accounting posted at approval: corrections replace an
    // entry, they never rewrite it (§2 action 9). Only still-active accruals
    // are reversed — earlier corrections were already cancelled by their own
    // reversal rows.
    await reverseActiveApprovals(
      tx,
      payroll.id,
      `Reversal of payroll approval${reason ? `: ${reason}` : ""}`,
      userId
    );

    const paidAgg = await tx.payrollPayment.aggregate({
      _sum: { amountMinor: true },
      where: { payrollId: payroll.id },
    });

    await tx.payroll.update({
      where: { id: payroll.id },
      data: {
        status: "DRAFT",
        totalPaidMinor: paidAgg._sum.amountMinor ?? 0,
        approvedById: null,
        approvedAt: null,
        revertedById: userId,
        revertedAt: new Date(),
        reversalReason: reason ?? null,
      },
    });
    await tx.employeeAuditEvent.create({
      data: {
        employeeId,
        action: "PAYROLL_REVERTED",
        newValue: payroll.id,
        reason: reason ?? null,
        performedById: userId,
      },
    });
    await logPayrollChange(tx, {
      payrollId: payroll.id,
      employeeId,
      action: "REVERTED",
      summary: reason ?? null,
      oldValues: {
        status: payroll.status,
        totalPaidMinor: payroll.totalPaidMinor,
      },
      newValues: { status: "DRAFT" },
      reason: reason ?? null,
      userId,
    });
  });

  await walletService.recomputeBalance(employeeId);

  return db.payroll.findUnique({
    where: { id: payroll.id },
    include: { lines: true },
  });
}

/**
 * Recompute the attendance-derived figures (attendance days, overtime hours
 * and overtime pay) for a payroll period from approved attendance records,
 * and the gross that follows from them. Only attendance moves: the base
 * salary and HR-entered allowances/bonuses/deductions stay as stored on the
 * line (Plan-payroll.pdf §1 "Attendance & Hiring/Termination" — approved
 * attendance changes automatically recalculate payroll).
 */
/**
 * Sum the payroll adjustments that apply to one payroll
 * (Plan-payroll.pdf §1 "Payroll Adjustments"): every unposted adjustment of
 * the employee plus the ones already posted to this payroll, so repeated
 * recomputations are idempotent and each row lands on exactly one payroll.
 *
 * Manual rows (source MANUAL) are additive: they change what is earned this
 * period. Advance-edit rows (source ADVANCE_EDIT) only itemise the delta the
 * edited advance already put into previousDebt — applying them again would
 * double-count.
 */
async function computeAdjustmentFigures(
  employeeId: string,
  payrollId: string | null
): Promise<{
  adjustmentsDeductedMinor: number;
  adjustmentsEarnedMinor: number;
  previousAdjustmentsDeductedMinor: number;
  previousAdjustmentsEarnedMinor: number;
}> {
  const rows = await db.payrollAdjustment.findMany({
    where: {
      employeeId,
      OR: [{ payrollId: null }, ...(payrollId ? [{ payrollId }] : [])],
    },
    select: { source: true, direction: true, amountMinor: true },
  });
  const figures = {
    adjustmentsDeductedMinor: 0,
    adjustmentsEarnedMinor: 0,
    previousAdjustmentsDeductedMinor: 0,
    previousAdjustmentsEarnedMinor: 0,
  };
  for (const row of rows) {
    const isDeduction = row.direction !== "EARNING";
    if (row.source === "ADVANCE_EDIT") {
      if (isDeduction) figures.previousAdjustmentsDeductedMinor += row.amountMinor;
      else figures.previousAdjustmentsEarnedMinor += row.amountMinor;
    } else {
      if (isDeduction) figures.adjustmentsDeductedMinor += row.amountMinor;
      else figures.adjustmentsEarnedMinor += row.amountMinor;
    }
  }
  return figures;
}

async function computeAttendanceFigures(
  employeeId: string,
  periodStart: Date,
  periodEnd: Date,
  line: {
    baseSalaryMinor: number;
    allowancesMinor: number;
    bonusesMinor: number;
    deductionsMinor: number;
    overtimePayMinor: number;
    adjustmentsDeductedMinor: number;
    adjustmentsEarnedMinor: number;
  }
): Promise<{
  attendanceDays: number;
  overtimeHours: number;
  overtimePayMinor: number;
  grossPayMinor: number;
}> {
  const [attendance, halfDays, overtime] = await Promise.all([
    db.attendance.aggregate({
      where: {
        employeeId,
        date: { gte: periodStart, lte: periodEnd },
        status: "PRESENT",
        approvalStatus: "APPROVED",
      },
      _count: { _all: true },
    }),
    db.attendance.count({
      where: {
        employeeId,
        date: { gte: periodStart, lte: periodEnd },
        status: "HALF_DAY",
        approvalStatus: "APPROVED",
      },
    }),
    db.attendance.aggregate({
      where: {
        employeeId,
        date: { gte: periodStart, lte: periodEnd },
        approvalStatus: "APPROVED",
      },
      _sum: { overtimeHours: true },
    }),
  ]);

  const attendanceDays = attendance._count._all + halfDays * 0.5;
  const overtimeHours = overtime._sum.overtimeHours ?? 0;

  // Overtime pay uses the salary applicable at the period end — the same
  // inputs generatePayroll uses. Without a salary record the stored overtime
  // pay is kept as-is rather than zeroed.
  const salary = await getEmployeeSalaryAtDate(employeeId, periodEnd);
  let overtimePayMinor = line.overtimePayMinor;
  if (salary) {
    const { rate, paidDailyHours } = await employeePayrollParams(employeeId);
    const hourlyMinor = Math.round(salary.amountMinor / 30 / paidDailyHours);
    overtimePayMinor = Math.round(hourlyMinor * rate * overtimeHours);
  }

  const grossPayMinor =
    line.baseSalaryMinor +
    overtimePayMinor +
    line.allowancesMinor +
    line.bonusesMinor -
    line.deductionsMinor +
    line.adjustmentsEarnedMinor -
    line.adjustmentsDeductedMinor;

  return { attendanceDays, overtimeHours, overtimePayMinor, grossPayMinor };
}

/**
 * Refresh the attendance- and adjustment-derived figures of one payroll in
 * place. Used for drafts, which stay DRAFT (their debt figures are
 * recomputed at approval, but the figures HR reviews must reflect newly
 * approved attendance or newly created adjustments right away).
 * Payment-begun and terminal payrolls are never touched — changes after
 * payment are ignored for that historical payroll (Plan-payroll.pdf §1).
 */
export async function refreshPayrollAttendance(
  payrollId: string,
  userId?: string
): Promise<{ changed: boolean }> {
  const payroll = await db.payroll.findUnique({
    where: { id: payrollId },
    include: { lines: true },
  });
  if (!payroll) throw new Error("Payroll not found");
  const line = payroll.lines[0];
  if (!line) throw new Error("Payroll has no line items");

  if (
    payroll.status === "PAID" ||
    payroll.status === "CANCELLED" ||
    payroll.status === "PARTIALLY_PAID" ||
    payroll.totalPaidMinor > 0 ||
    line.paymentStatus !== "UNPAID"
  ) {
    return { changed: false };
  }

  // Attendance and manual adjustments both feed gross: recompute the
  // adjustments fresh (the hook shares this refresh) and let the attendance
  // figures follow from them.
  const adj = await computeAdjustmentFigures(payroll.employeeId, payrollId);
  const att = await computeAttendanceFigures(
    payroll.employeeId,
    payroll.periodStart,
    payroll.periodEnd,
    { ...line, ...adj }
  );
  const changed =
    att.attendanceDays !== line.attendanceDays ||
    att.overtimeHours !== line.overtimeHours ||
    att.overtimePayMinor !== line.overtimePayMinor ||
    att.grossPayMinor !== line.grossPayMinor ||
    adj.adjustmentsDeductedMinor !== line.adjustmentsDeductedMinor ||
    adj.adjustmentsEarnedMinor !== line.adjustmentsEarnedMinor ||
    adj.previousAdjustmentsDeductedMinor !== line.previousAdjustmentsDeductedMinor ||
    adj.previousAdjustmentsEarnedMinor !== line.previousAdjustmentsEarnedMinor;
  if (!changed) return { changed: false };

  await db.payrollLine.update({ where: { id: line.id }, data: { ...att, ...adj } });
  await logPayrollChange(db, {
    payrollId,
    employeeId: payroll.employeeId,
    action: "ATTENDANCE_RECALCULATED",
    summary: `Attendance figures refreshed (attendance ${line.attendanceDays} → ${att.attendanceDays} days, overtime ${line.overtimeHours} → ${att.overtimeHours}h)`,
    oldValues: {
      attendanceDays: line.attendanceDays,
      overtimeHours: line.overtimeHours,
      overtimePayMinor: line.overtimePayMinor,
      grossPayMinor: line.grossPayMinor,
      adjustmentsDeductedMinor: line.adjustmentsDeductedMinor,
      adjustmentsEarnedMinor: line.adjustmentsEarnedMinor,
    },
    newValues: { ...att, ...adj },
    userId: userId ?? null,
  });
  return { changed: true };
}

/**
 * React to attendance that was approved, edited or revoked
 * (Plan-payroll.pdf §1 "Attendance & Hiring/Termination"): every payroll of
 * that employee whose period overlaps the affected dates is brought up to
 * date — drafts are refreshed in place, approved-but-unpaid payrolls go
 * through recalculatePayroll (→ NEEDS_RECALCULATION for HR review), and
 * payment-begun or terminal payrolls are left alone.
 *
 * Never throws: attendance writes must not fail because a payroll
 * recalculation hit an unexpected state.
 */
export async function recalculatePayrollsForAttendance(opts: {
  employeeId: string;
  dates: (Date | string)[];
  userId?: string;
}): Promise<{ recalculated: string[]; refreshed: string[] }> {
  const result = { recalculated: [] as string[], refreshed: [] as string[] };
  const times = opts.dates
    .map((d) => new Date(d).getTime())
    .filter((t) => !Number.isNaN(t));
  if (times.length === 0) return result;

  // Compare on day granularity: attendance dates are day-only values while
  // payroll periods may be stored at either end of the day.
  const start = new Date(Math.min(...times));
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(Math.max(...times));
  end.setUTCHours(23, 59, 59, 999);

  const payrolls = await db.payroll.findMany({
    where: {
      employeeId: opts.employeeId,
      status: { in: ["DRAFT", "APPROVED", "NEEDS_RECALCULATION"] },
      periodStart: { lte: end },
      periodEnd: { gte: start },
    },
    select: { id: true, status: true },
    orderBy: { periodStart: "asc" },
  });

  for (const payroll of payrolls) {
    await runPayrollRefresh(payroll, opts.userId, result);
  }
  return result;
}

/**
 * Run one entry of a payroll refresh batch: drafts are refreshed in place,
 * approved-but-unpaid payrolls go through recalculatePayroll (→
 * NEEDS_RECALCULATION), and unexpected states are logged rather than thrown
 * so the originating write (attendance, adjustment, ...) always succeeds.
 */
async function runPayrollRefresh(
  payroll: { id: string; status: string },
  userId: string | undefined,
  result: { recalculated: string[]; refreshed: string[] }
): Promise<void> {
  try {
    if (payroll.status === "DRAFT") {
      const { changed } = await refreshPayrollAttendance(payroll.id, userId);
      if (changed) result.refreshed.push(payroll.id);
    } else {
      await recalculatePayroll(payroll.id, userId);
      result.recalculated.push(payroll.id);
    }
  } catch (error) {
    console.error(`Payroll recalculation failed for ${payroll.id}:`, error);
  }
}

/**
 * React to a payroll adjustment that was created or deleted
 * (Plan-payroll.pdf §1 "Payroll Adjustments"): every open payroll of that
 * employee is brought up to date — adjustments are not period-scoped, so no
 * date filter is applied. Drafts recompute their figures in place; approved
 * payrolls are flagged NEEDS_RECALCULATION for HR review. Never throws:
 * an adjustment write must not fail because a recalculation hit an
 * unexpected state.
 */
export async function recalculatePayrollsForAdjustments(opts: {
  employeeId: string;
  userId?: string;
}): Promise<{ recalculated: string[]; refreshed: string[] }> {
  const result = { recalculated: [] as string[], refreshed: [] as string[] };
  const payrolls = await db.payroll.findMany({
    where: {
      employeeId: opts.employeeId,
      status: { in: ["DRAFT", "APPROVED", "NEEDS_RECALCULATION"] },
    },
    select: { id: true, status: true },
    orderBy: { periodStart: "asc" },
  });
  for (const payroll of payrolls) {
    await runPayrollRefresh(payroll, opts.userId, result);
  }
  return result;
}

/**
 * Recalculate an approved-but-unpaid payroll after the ledger changed
 * (advance edited, attendance approved, ...): refresh the debt figures, rebuild
 * the advance allocations and flag the payroll NEEDS_RECALCULATION so HR
 * reviews it before payment.
 *
 * Paid payrolls are never rewritten here — corrections to paid history go
 * through a PayrollAdjustment (Plan-payroll.pdf §4 guardrails).
 */
export async function recalculatePayroll(payrollId: string, userId?: string) {
  const payroll = await db.payroll.findUnique({
    where: { id: payrollId },
    include: { lines: true },
  });
  if (!payroll) throw new Error("Payroll not found");
  const line = payroll.lines[0];
  if (!line) throw new Error("Payroll has no line items");

  // Drafts recompute on approval; terminal/cancelled payrolls are untouched.
  if (
    payroll.status === "DRAFT" ||
    payroll.status === "CANCELLED" ||
    payroll.status === "PAID"
  ) {
    return payroll;
  }
  if (payroll.totalPaidMinor > 0 || line.paymentStatus === "PAID") {
    throw new Error("A paid payroll cannot be recalculated; use an adjustment");
  }

  // Attendance and adjustments first: approved attendance or a new manual
  // adjustment may change gross, and the debt figures are computed against
  // the refreshed gross.
  const adj = await computeAdjustmentFigures(payroll.employeeId, payrollId);
  const att = await computeAttendanceFigures(
    payroll.employeeId,
    payroll.periodStart,
    payroll.periodEnd,
    { ...line, ...adj }
  );

  const fig = await computePayrollFigures(
    payroll.employeeId,
    payroll.periodStart,
    payroll.periodEnd,
    att.grossPayMinor
  );

  // Loan repayment: HR's override stands, otherwise re-propose fresh. The
  // proposal treats this payroll's own allocations as still available (they
  // are restored below before re-allocating).
  const loanCapMinor = Math.max(fig.netPayableMinor, 0);
  let loanDeductionMinor: number;
  if (line.loanDeductionOverridden) {
    validateLoanDeduction(line.loanDeductionMinor, loanCapMinor);
    loanDeductionMinor = line.loanDeductionMinor;
  } else {
    loanDeductionMinor = (
      await loanService.proposeDeduction(payroll.employeeId, loanCapMinor, db, {
        effectivePayrollId: payrollId,
      })
    ).totalMinor;
  }
  const netPayableMinor = fig.netPayableMinor - loanDeductionMinor;

  await db.$transaction(async (tx) => {
    // Free the loan balances this payroll held, then rebuild both deduction
    // plans against the refreshed ledger.
    await loanService.restoreAllocations(tx, payrollId);
    await tx.payrollAdvanceAllocation.deleteMany({ where: { payrollId } });
    const allocatedMinor = await allocateAdvances(
      tx,
      payroll.employeeId,
      payroll.periodEnd,
      payrollId,
      fig.amountAlreadyReceivedMinor
    );
    await loanService.allocate(tx, payroll.employeeId, payrollId, loanDeductionMinor);

    await tx.payroll.update({
      where: { id: payrollId },
      data: {
        status: "NEEDS_RECALCULATION",
        lines: {
          update: {
            where: { id: line.id },
            data: {
              attendanceDays: att.attendanceDays,
              overtimeHours: att.overtimeHours,
              overtimePayMinor: att.overtimePayMinor,
              grossPayMinor: att.grossPayMinor,
              expensesPaidMinor: fig.periodExpensesMinor,
              amountAlreadyReceivedMinor: fig.amountAlreadyReceivedMinor,
              previousDebtMinor: fig.previousDebtMinor,
              advancesDeductedMinor: allocatedMinor,
              adjustmentsDeductedMinor: adj.adjustmentsDeductedMinor,
              adjustmentsEarnedMinor: adj.adjustmentsEarnedMinor,
              previousAdjustmentsDeductedMinor: adj.previousAdjustmentsDeductedMinor,
              previousAdjustmentsEarnedMinor: adj.previousAdjustmentsEarnedMinor,
              loanDeductionMinor,
              netPayableMinor,
              remainingEmployeeDebtMinor: fig.remainingEmployeeDebtMinor,
              netPayMinor: Math.max(netPayableMinor, 0),
            },
          },
        },
      },
    });

    await tx.employeeAuditEvent.create({
      data: {
        employeeId: payroll.employeeId,
        action: "PAYROLL_RECALCULATED",
        newValue: payrollId,
        performedById: userId ?? null,
      },
    });
    await logPayrollChange(tx, {
      payrollId,
      employeeId: payroll.employeeId,
      action: "RECALCULATED",
      summary: `Attendance and debt figures refreshed (${payroll.status} → NEEDS_RECALCULATION)`,
      oldValues: {
        status: payroll.status,
        grossPayMinor: line.grossPayMinor,
        netPayMinor: line.netPayMinor,
      },
      newValues: {
        status: "NEEDS_RECALCULATION",
        grossPayMinor: att.grossPayMinor,
        netPayMinor: Math.max(netPayableMinor, 0),
        loanDeductionMinor,
      },
      userId: userId ?? null,
    });
  });

  return db.payroll.findUnique({ where: { id: payrollId }, include: { lines: true } });
}

/**
 * React to an advance whose amount changed after it was issued
 * (Plan-payroll.pdf §2 action 4):
 *  - payrolls that already had deductions applied but are not paid yet are
 *    recalculated automatically;
 *  - payrolls that are already (partially) paid keep their history and an
 *    adjustment is created for a future payroll instead.
 */
export async function applyAdvanceEditToPayrolls(opts: {
  advanceId: string;
  employeeId: string;
  oldAmountMinor: number;
  newAmountMinor: number;
  userId: string;
}) {
  const deltaMinor = opts.newAmountMinor - opts.oldAmountMinor;
  const result: { recalculated: string[]; adjustments: string[] } = {
    recalculated: [],
    adjustments: [],
  };
  if (deltaMinor === 0) return result;

  const allocations = await db.payrollAdvanceAllocation.findMany({
    where: { cashTransactionId: opts.advanceId },
    include: {
      payroll: {
        select: {
          id: true,
          status: true,
          totalPaidMinor: true,
          lines: { select: { paymentStatus: true } },
        },
      },
    },
  });

  const reason =
    `Advance amount changed from ${fromMinor(opts.oldAmountMinor)} to ` +
    `${fromMinor(opts.newAmountMinor)} AFN after it was used by payroll`;

  for (const alloc of allocations) {
    const payroll = alloc.payroll;
    const paid =
      payroll.totalPaidMinor > 0 ||
      payroll.status === "PAID" ||
      payroll.status === "PARTIALLY_PAID" ||
      payroll.lines[0]?.paymentStatus === "PAID";

    if (!paid) {
      // Open payrolls are refreshed by the shared hook below (drafts stay
      // DRAFT, approved ones are flagged NEEDS_RECALCULATION).
      continue;
    }

    // Preserve the paid history: post an adjustment for a future payroll.
    // source ADVANCE_EDIT marks it as memo-only — the edited amount is
    // already inside that payroll's previousDebt, so the row itemises the
    // delta instead of being applied on top of it a second time.
    const adjustment = await db.payrollAdjustment.create({
      data: {
        employeeId: opts.employeeId,
        kind:
          deltaMinor > 0
            ? "PREVIOUS_OVERPAYMENT_DEDUCTION"
            : "PREVIOUS_UNDERPAYMENT_EARNING",
        direction: deltaMinor > 0 ? "DEDUCTION" : "EARNING",
        source: "ADVANCE_EDIT",
        amountMinor: Math.abs(deltaMinor),
        reason,
        createdById: opts.userId,
      },
    });
    await db.employeeAuditEvent.create({
      data: {
        employeeId: opts.employeeId,
        action: "ADVANCE_EDIT_ADJUSTMENT",
        newValue: adjustment.id,
        reason,
        performedById: opts.userId,
      },
    });
    await logPayrollChange(db, {
      payrollId: payroll.id,
      employeeId: opts.employeeId,
      action: "RECALCULATED",
      summary: reason,
      newValues: { adjustmentId: adjustment.id, deltaMinor },
      reason,
      userId: opts.userId,
    });
    result.adjustments.push(adjustment.id);
  }

  // Every open payroll of the employee follows: the ones with an allocation
  // of this advance need their deduction plan rebuilt, the ones without
  // still hold a previousDebt figure that moved with the edit, and any new
  // memo rows must appear on their lines.
  const refreshed = await recalculatePayrollsForAdjustments({
    employeeId: opts.employeeId,
    userId: opts.userId,
  });
  result.recalculated = refreshed.recalculated;

  return result;
}

/**
 * Create a manual payroll adjustment (Plan-payroll.pdf §1 "Payroll
 * Adjustments"): an additive figure that enters gross on the next approval —
 * a DEDUCTION lowers this period's pay, an EARNING raises it. The row stays
 * unposted until an approval applies it to exactly one payroll; every open
 * payroll of the employee is refreshed so its figures follow right away.
 *
 * The direction is implied by the kind for the PREVIOUS_* adjustments and
 * chosen by HR for OTHER.
 */
export async function createPayrollAdjustment(input: {
  employeeId: string;
  kind: PayrollAdjustmentKind;
  direction?: PayrollAdjustmentDirection;
  amountMinor: number;
  reason: string;
  note?: string;
  createdById: string;
}) {
  const employee = await db.employee.findUnique({
    where: { id: input.employeeId },
    select: { id: true },
  });
  if (!employee) throw new Error("Employee not found");

  const direction =
    input.kind === "OTHER"
      ? (input.direction ?? "DEDUCTION")
      : adjustmentDirectionForKind(input.kind);

  const adjustment = await db.payrollAdjustment.create({
    data: {
      employeeId: input.employeeId,
      kind: input.kind,
      direction,
      source: "MANUAL",
      amountMinor: input.amountMinor,
      reason: input.reason,
      note: input.note,
      createdById: input.createdById,
    },
  });
  await db.employeeAuditEvent.create({
    data: {
      employeeId: input.employeeId,
      action: "PAYROLL_ADJUSTMENT_CREATED",
      newValue: adjustment.id,
      reason: input.reason,
      performedById: input.createdById,
    },
  });
  await logPayrollChange(db, {
    payrollId: null,
    employeeId: input.employeeId,
    action: "ADJUSTMENT_CREATED",
    summary: `${direction === "DEDUCTION" ? "Deduct" : "Earn"} ${fromMinor(input.amountMinor)} AFN — ${input.reason}`,
    newValues: {
      adjustmentId: adjustment.id,
      kind: input.kind,
      direction,
      amountMinor: input.amountMinor,
    },
    reason: input.reason,
    userId: input.createdById,
  });

  await recalculatePayrollsForAdjustments({
    employeeId: input.employeeId,
    userId: input.createdById,
  });

  return adjustment;
}

/**
 * Delete an adjustment that has not been posted to a payroll yet. Posted
 * ones are part of an approved payroll's history — revert that payroll
 * instead, which un-posts its adjustments for re-application.
 */
export async function deletePayrollAdjustment(
  adjustmentId: string,
  userId: string
) {
  const adjustment = await db.payrollAdjustment.findUnique({
    where: { id: adjustmentId },
  });
  if (!adjustment) throw new Error("Adjustment not found");
  if (adjustment.payrollId) {
    throw new Error(
      "This adjustment is already posted to a payroll; revert that payroll to release it"
    );
  }

  await db.payrollAdjustment.delete({ where: { id: adjustmentId } });
  await db.employeeAuditEvent.create({
    data: {
      employeeId: adjustment.employeeId,
      action: "PAYROLL_ADJUSTMENT_DELETED",
      newValue: adjustmentId,
      reason: adjustment.reason,
      performedById: userId,
    },
  });
  await logPayrollChange(db, {
    payrollId: null,
    employeeId: adjustment.employeeId,
    action: "ADJUSTMENT_DELETED",
    summary: `Removed adjustment of ${fromMinor(adjustment.amountMinor)} AFN — ${adjustment.reason}`,
    oldValues: {
      adjustmentId,
      kind: adjustment.kind,
      direction: adjustment.direction,
      amountMinor: adjustment.amountMinor,
    },
    reason: adjustment.reason,
    userId,
  });

  await recalculatePayrollsForAdjustments({
    employeeId: adjustment.employeeId,
    userId,
  });

  return { id: adjustmentId };
}

/**
 * Per-employee financial summary for the employee profile tab.
 *
 * - daysWorked: approved attendance (PRESENT + 0.5 x HALF_DAY) since hire
 * - totalPaid (incl. expenses): payroll salary payments + expenses paid to the
 *   employee + reimbursed employee-paid expenses
 * - totalReceived: money the employee has taken (salary + expenses paid to them
 *   + advances)
 * - outstanding: earned entitlement (days-based salary + overtime) +
 *   reimbursements owed, minus totalReceived (positive = company owes the
 *   employee, negative = employee owes the company)
 */
export async function getEmployeeFinancialSummary(employeeId: string) {
  const employee = await db.employee.findUnique({
    where: { id: employeeId },
    select: {
      id: true,
      fullName: true,
      salary: true,
      workHoursPerDay: true,
      overtimeRate: true,
      hireDate: true,
      status: true,
      quitingDate: true,
      cashAccount: { select: { currentBalance: true } },
    },
  });
  if (!employee) throw new Error("Employee not found");

  const hireDateObj = new Date(employee.hireDate);
  const now = new Date();
  const isActive = employee.status === "ACTIVE";
  const endDate = isActive
    ? now
    : employee.quitingDate
      ? new Date(employee.quitingDate)
      : now;

  const [
    attendanceRecords,
    salaryPayments,
    expensesTo,
    expensesBy,
    advances,
    otAgg,
    loansAgg,
  ] = await Promise.all([
      db.attendance.findMany({
        where: {
          employeeId,
          date: { gte: hireDateObj, lte: endDate },
          status: { in: ["PRESENT", "HALF_DAY"] },
          approvalStatus: "APPROVED",
        },
        select: { status: true, overtimeHours: true },
      }),
      db.cashTransaction.aggregate({
        where: { employeeId, type: "SALARY_PAYMENT", approvalStatus: "APPROVED" },
        _sum: { amount: true },
      }),
      db.expense.aggregate({
        where: {
          paidToId: employeeId,
          approvalStatus: "APPROVED",
          payrollId: null,
        },
        _sum: { amount: true },
      }),
      db.expense.aggregate({
        where: { paidById: employeeId, approvalStatus: "APPROVED" },
        _sum: { amount: true },
      }),
      db.cashTransaction.aggregate({
        where: { employeeId, type: "ADVANCE", approvalStatus: "APPROVED" },
        _sum: { amount: true },
      }),
      db.attendance.aggregate({
        where: {
          employeeId,
          date: { gte: hireDateObj, lte: endDate },
          approvalStatus: "APPROVED",
        },
        _sum: { overtimeHours: true },
      }),
      // Loans (Plan-payroll.pdf §1): issued principal and what is still owed.
      // Repaid history is derived from the two sums (issued − outstanding).
      db.loan.aggregate({
        where: { employeeId, approvalStatus: "APPROVED" },
        _sum: { principalMinor: true, balanceMinor: true },
      }),
    ]);

  let daysWorked = 0;
  if (attendanceRecords.length > 0) {
    let present = 0;
    let half = 0;
    for (const r of attendanceRecords) {
      if (r.status === "PRESENT") present++;
      else if (r.status === "HALF_DAY") half++;
    }
    daysWorked = present + half * 0.5;
  } else {
    // Fallback: elapsed calendar days since hire.
    daysWorked = Math.max(
      0,
      Math.floor((endDate.getTime() - hireDateObj.getTime()) / 86400000)
    );
  }

  const totalOvertimeHours = otAgg._sum.overtimeHours ?? 0;
  const dailySalary = (employee.salary ?? 0) / 30;
  const workHours =
    employee.workHoursPerDay && employee.workHoursPerDay > 0
      ? employee.workHoursPerDay
      : 9;
  const hourlySalary = dailySalary / workHours;
  const overtimePay =
    totalOvertimeHours * hourlySalary * (employee.overtimeRate ?? 1.25);
  const earnedSalary = dailySalary * daysWorked + overtimePay;

  const salaryPaid = salaryPayments._sum.amount ?? 0;
  const expensesPaidTo = expensesTo._sum.amount ?? 0;
  const reimbursements = expensesBy._sum.amount ?? 0;
  const advancesReceived = advances._sum.amount ?? 0;

  const totalPaid = salaryPaid + expensesPaidTo + reimbursements;
  const totalReceived = salaryPaid + expensesPaidTo + advancesReceived;
  const outstanding = earnedSalary + reimbursements - totalReceived;

  return {
    employeeId,
    daysWorked,
    totalOvertimeHours,
    overtimePay,
    earnedSalary,
    salaryPaid,
    expensesPaidTo,
    reimbursements,
    advancesReceived,
    // Major AFN (like advancesReceived above); derived from exact minor units.
    loansIssued: (loansAgg._sum.principalMinor ?? 0) / 100,
    loansOutstanding: (loansAgg._sum.balanceMinor ?? 0) / 100,
    totalPaid,
    totalReceived,
    outstanding,
    walletBalance: employee.cashAccount?.currentBalance ?? 0,
  };
}

/**
 * Dedicated employee financial statement (Plan-payroll.pdf §2 action 10):
 * every financial activity that touches the employee cash account — salary
 * earnings, salary payments, advances, returns, deductions, transfers,
 * expenses paid on the company's behalf, reimbursements and corrections —
 * as a dated list with debit/credit totals and the net balance.
 *
 * The debit/credit signs mirror `recalculateBalance` exactly, so
 * `totals.netMinor` over the full history equals the stored cash balance.
 * Not-yet-posted corrections (PayrollAdjustment) are listed as `memo` rows
 * and excluded from the totals.
 *
 * Loans use the `LOAN` category: the disbursed principal is a DEBIT and a
 * manual repayment a CREDIT. Payroll-deducted repayments post no cash row —
 * they only shrink the salary payment, which already appears as its own
 * entry, so the totals still reconcile with the balance.
 */
export async function getEmployeeStatement(
  employeeId: string,
  opts?: { dateFrom?: Date | string | null; dateTo?: Date | string | null }
): Promise<EmployeeStatement> {
  const employee = await db.employee.findUnique({
    where: { id: employeeId },
    select: { fullName: true, jobTitle: true, department: true },
  });
  if (!employee) throw new Error("Employee not found");

  const startOfDay = (v: Date | string | null | undefined) => {
    if (!v) return null;
    const d = new Date(v);
    d.setHours(0, 0, 0, 0);
    return d;
  };
  const endOfDay = (v: Date | string | null | undefined) => {
    if (!v) return null;
    const d = new Date(v);
    d.setHours(23, 59, 59, 999);
    return d;
  };
  const dateFrom = startOfDay(opts?.dateFrom);
  const dateTo = endOfDay(opts?.dateTo);
  const day = (d: Date | string) => new Date(d).toISOString().slice(0, 10);

  const [
    cashTxns,
    expenses,
    transfersIn,
    transfersOut,
    payrollLines,
    corrections,
    account,
  ] = await Promise.all([
    db.cashTransaction.findMany({
      where: { employeeId, approvalStatus: "APPROVED" },
    }),
    // Same guard as the balance: only expenses flagged for deduction count.
    db.expense.findMany({
      where: {
        paidById: employeeId,
        approvalStatus: "APPROVED",
        deductFromWallet: { not: false },
      },
    }),
    db.transfer.findMany({
      where: { toEmployeeId: employeeId, approvalStatus: "APPROVED" },
      include: { fromEmployee: { select: { fullName: true } } },
    }),
    db.transfer.findMany({
      where: { fromEmployeeId: employeeId, approvalStatus: "APPROVED" },
      include: { toEmployee: { select: { fullName: true } } },
    }),
    db.payrollLine.findMany({
      where: {
        employeeId,
        payroll: { status: { in: [...ALLOCATING_PAYROLL_STATUSES] } },
      },
      include: {
        payroll: {
          select: { id: true, approvedAt: true, periodStart: true, periodEnd: true },
        },
      },
    }),
    db.payrollAdjustment.findMany({ where: { employeeId } }),
    db.employeeCashAccount.findUnique({
      where: { employeeId },
      select: { currentBalance: true },
    }),
  ]);

  const toMinorRounded = (major: number) => Math.round(major * 100);
  const entries: StatementEntry[] = [];

  for (const t of cashTxns) {
    const amountMinor = toMinorRounded(t.amount);
    let entry: Omit<StatementEntry, "id" | "date" | "amountMinor">;
    switch (t.type) {
      case "ADVANCE":
        entry = {
          category: "ADVANCE",
          description: t.note ?? "Cash advance",
          direction: "DEBIT",
        };
        break;
      case "LOAN":
        entry = {
          category: "LOAN",
          description: t.note ?? "Loan issued",
          direction: "DEBIT",
        };
        break;
      case "LOAN_REPAYMENT":
        entry = {
          category: "LOAN",
          description: t.note ?? "Loan repayment",
          direction: "CREDIT",
        };
        break;
      case "SALARY_PAYMENT":
        entry = {
          category: "PAYMENT",
          description: t.note ?? "Salary payment",
          direction: "DEBIT",
        };
        break;
      case "ADJUSTMENT":
        entry = {
          category: "CORRECTION",
          description: t.note ?? "Adjustment",
          direction: "DEBIT",
        };
        break;
      case "REIMBURSEMENT":
        entry = {
          category: "REIMBURSEMENT",
          description: t.note ?? "Expense reimbursement",
          direction: "DEBIT",
        };
        break;
      case "RETURN":
        entry = {
          category: "RETURN",
          description: t.note ?? "Cash return",
          direction: "CREDIT",
        };
        break;
      case "DEBIT":
        entry = {
          category: "DEDUCTION",
          description: t.note ?? "Deduction",
          direction: "CREDIT",
        };
        break;
      default:
        continue;
    }
    entries.push({
      id: t.id,
      date: t.paidAt ?? t.createdAt,
      amountMinor,
      reference: t.referenceNumber ?? null,
      ...entry,
    });
  }

  for (const exp of expenses) {
    entries.push({
      id: exp.id,
      date: exp.expenseDate,
      category: "EXPENSE",
      description: `${exp.title} (${exp.category})`,
      direction: "CREDIT",
      amountMinor: toMinorRounded(exp.amount),
    });
  }

  for (const tr of transfersIn) {
    entries.push({
      id: tr.id,
      date: tr.createdAt,
      category: "TRANSFER",
      description: `Transfer received from ${tr.fromEmployee.fullName}`,
      direction: "DEBIT",
      amountMinor: toMinorRounded(tr.amount),
    });
  }
  for (const tr of transfersOut) {
    entries.push({
      id: tr.id,
      date: tr.createdAt,
      category: "TRANSFER",
      description: `Transfer sent to ${tr.toEmployee.fullName}`,
      direction: "CREDIT",
      amountMinor: toMinorRounded(tr.amount),
    });
  }

  for (const line of payrollLines) {
    entries.push({
      id: line.id,
      date: line.payroll.approvedAt ?? line.payroll.periodEnd,
      category: "SALARY",
      description: `Salary earned ${day(line.payroll.periodStart)}–${day(line.payroll.periodEnd)}`,
      direction: "CREDIT",
      amountMinor: line.grossPayMinor,
    });
  }

  // Corrections that will be applied by a future payroll: shown, but they do
  // not move the cash balance yet, so they never enter the debit/credit
  // totals.
  for (const adj of corrections) {
    entries.push({
      id: adj.id,
      date: adj.createdAt,
      category: "CORRECTION",
      description: `${adj.kind.replace(/_/g, " ").toLowerCase()}: ${adj.reason}`,
      direction:
        adj.kind === "PREVIOUS_OVERPAYMENT_DEDUCTION" ? "DEBIT" : "CREDIT",
      amountMinor: Math.abs(adj.amountMinor),
      memo: true,
      reference: adj.payrollId ?? null,
    });
  }

  entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const inRange = (e: StatementEntry) => {
    const d = new Date(e.date).getTime();
    if (dateFrom && d < dateFrom.getTime()) return false;
    if (dateTo && d > dateTo.getTime()) return false;
    return true;
  };
  const visible = entries.filter(inRange);
  const posted = visible.filter((e) => !e.memo);
  const debitMinor = posted
    .filter((e) => e.direction === "DEBIT")
    .reduce((s, e) => s + e.amountMinor, 0);
  const creditMinor = posted
    .filter((e) => e.direction === "CREDIT")
    .reduce((s, e) => s + e.amountMinor, 0);
  const periodNetMinor = debitMinor - creditMinor;

  const allPosted = entries.filter((e) => !e.memo);
  const allTimeNetMinor =
    allPosted
      .filter((e) => e.direction === "DEBIT")
      .reduce((s, e) => s + e.amountMinor, 0) -
    allPosted
      .filter((e) => e.direction === "CREDIT")
      .reduce((s, e) => s + e.amountMinor, 0);

  const closingMinor = account
    ? Math.round(account.currentBalance * 100)
    : allTimeNetMinor;

  return {
    employeeId,
    employee,
    dateFrom,
    dateTo,
    entries: visible,
    totals: { debitMinor, creditMinor, netMinor: periodNetMinor },
    balance: { openingMinor: closingMinor - periodNetMinor, closingMinor },
  };
}

/**
 * Delete a payroll record (Plan-payroll.pdf §2 action 14).
 *
 * - Everyone else: only untouched DRAFT payrolls (no linked expenses, no
 *   recorded payments) can be deleted — approval and payment history must be
 *   reverted through the normal workflow first.
 * - Admin: may delete a payroll in any status. Posted financial history is
 *   preserved: every still-open accounting entry gets a PAYROLL_REVERSAL
 *   counterpart, the full payroll (lines + payments) is snapshotted into the
 *   PayrollAuditLog, and cash transactions / wallet ledger rows survive with
 *   their historical payrollId.
 */
export async function deletePayroll(
  payrollId: string,
  userId: string,
  actorRole?: string
) {
  const payroll = await db.payroll.findUnique({
    where: { id: payrollId },
    include: { lines: true, expenses: true, payments: true },
  });
  if (!payroll) throw new Error("Payroll not found");

  const role =
    actorRole ??
    (await db.user.findUnique({
      where: { id: userId },
      select: { role: true },
    }))?.role;
  const isAdmin = role === "ADMIN";

  if (!isAdmin) {
    if (payroll.status !== "DRAFT") {
      throw new Error("Only a draft payroll can be deleted. Revert it first.");
    }
    // Safety: refuse if any expenses are linked (shouldn't exist for drafts).
    if (payroll.expenses.length > 0) {
      throw new Error(
        "Cannot delete a payroll with linked expenses. Revert it first."
      );
    }
    // Payments are real financial history and must never be cascade-deleted.
    if (payroll.payments.length > 0) {
      throw new Error("Cannot delete a payroll that has recorded payments.");
    }
  }

  const periodLabel = `${payroll.periodStart.toISOString().slice(0, 10)}–${payroll.periodEnd.toISOString().slice(0, 10)}`;
  const snapshot = {
    payroll: {
      id: payroll.id,
      status: payroll.status,
      periodStart: payroll.periodStart,
      periodEnd: payroll.periodEnd,
      currency: payroll.currency,
      totalPaidMinor: payroll.totalPaidMinor,
      walletId: payroll.walletId,
      createdById: payroll.createdById,
      approvedById: payroll.approvedById,
      approvedAt: payroll.approvedAt,
      lines: payroll.lines,
      payments: payroll.payments,
      linkedExpenseIds: payroll.expenses.map((e) => e.id),
    },
  };

  await db.$transaction(async (tx) => {
    if (isAdmin && payroll.status !== "DRAFT") {
      // Keep the journal balanced after the record disappears: reverse every
      // approval/payment entry that does not already have a reversal.
      const entries = await tx.accountingEntry.findMany({
        where: { payrollId, reversalOfId: null },
      });
      for (const entry of entries) {
        const alreadyReversed = await tx.accountingEntry.findFirst({
          where: { reversalOfId: entry.id },
        });
        if (alreadyReversed) continue;
        await tx.accountingEntry.create({
          data: {
            type: "PAYROLL_REVERSAL",
            amountMinor: -entry.amountMinor,
            description: `Reversal for deleted payroll ${periodLabel} (${entry.type})`,
            payrollId,
            reversalOfId: entry.id,
            postedById: userId,
          },
        });
      }
    }

    await tx.employeeAuditEvent.create({
      data: {
        employeeId: payroll.employeeId,
        action: "PAYROLL_DELETED",
        newValue: payrollId,
        performedById: userId,
      },
    });
    // Give loan balances back before the cascade removes the allocation rows,
    // and un-post this payroll's adjustments (the DB would SetNull them too).
    await loanService.restoreAllocations(tx, payrollId);
    await tx.payrollAdjustment.updateMany({
      where: { payrollId },
      data: { payrollId: null },
    });
    await logPayrollChange(tx, {
      payrollId,
      employeeId: payroll.employeeId,
      action: "DELETED",
      summary: `Deleted ${payroll.status} payroll ${periodLabel}` +
        (isAdmin && payroll.payments.length > 0
          ? ` (${payroll.payments.length} payment(s) reversed from the journal)`
          : ""),
      oldValues: snapshot,
      userId,
      actorRole: role,
    });
    await tx.payroll.delete({ where: { id: payrollId } });
  });

  // The approved earnings are gone from the ledger; refresh the balance.
  await walletService.recomputeBalance(payroll.employeeId);
}

export type ProjectAllocationInput = {
  project: string;
  mode: "PERCENT" | "AMOUNT";
  /** percentage (0-100) when mode is PERCENT, else amount in AFN */
  value: number;
};

export async function getProjectAllocations(payrollId: string) {
  return db.payrollLineProjectAllocation.findMany({
    where: { payrollId },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Split a payroll's gross pay across projects (Plan-payroll.pdf §2 action 11).
 * Accepts percentages or fixed AFN amounts, normalizes the weights to 100%,
 * and stores the resulting share so the amounts always sum to the gross pay.
 */
export async function setProjectAllocations(
  payrollId: string,
  inputs: ProjectAllocationInput[],
  userId: string
) {
  const payroll = await db.payroll.findUnique({
    where: { id: payrollId },
    include: { lines: true, projectAllocations: true },
  });
  if (!payroll) throw new Error("Payroll not found");
  if (
    payroll.totalPaidMinor > 0 ||
    payroll.status === "PAID" ||
    payroll.status === "CANCELLED"
  ) {
    throw new Error("Project allocation cannot be changed after payment");
  }
  const line = payroll.lines[0];
  if (!line) throw new Error("Payroll has no line items");

  const rows = inputs
    .map((i) => ({ ...i, project: i.project.trim() }))
    .filter((i) => i.project && Number.isFinite(i.value) && i.value > 0);

  const snapshot = payroll.projectAllocations.map((a) => ({
    project: a.project,
    mode: a.mode,
    value: a.enteredValue,
    percentage: a.percentage,
    amountMinor: a.amountMinor,
  }));

  if (rows.length === 0) {
    await db.$transaction(async (tx) => {
      await tx.payrollLineProjectAllocation.deleteMany({
        where: { payrollId },
      });
      if (snapshot.length > 0) {
        await logPayrollChange(tx, {
          payrollId,
          employeeId: payroll.employeeId,
          action: "ALLOCATIONS_SET",
          summary: "Project allocations cleared",
          oldValues: snapshot,
          newValues: [],
          userId,
        });
      }
    });
    return [];
  }

  const baseMinor = line.grossPayMinor;
  if (baseMinor <= 0) throw new Error("This payroll has no salary to allocate");

  // Raw weight per row: the entered percentage, or the fixed AFN amount
  // expressed as a share of the gross pay.
  const weights = rows.map((r) =>
    r.mode === "PERCENT" ? r.value : (toMinor(r.value) / baseMinor) * 100
  );
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  if (!(totalWeight > 0)) {
    throw new Error("Allocation values must add up to more than zero");
  }

  // Normalize to exactly 100% no matter what HR entered (§1 Project Salary
  // Allocation), then convert each share back to money.
  const percentages = weights.map((w) => (w / totalWeight) * 100);
  const amounts = percentages.map((p) => Math.round((baseMinor * p) / 100));
  const drift = baseMinor - amounts.reduce((s, a) => s + a, 0);
  if (drift !== 0) {
    let maxIdx = 0;
    for (let i = 1; i < amounts.length; i++) {
      if (amounts[i] > amounts[maxIdx]) maxIdx = i;
    }
    amounts[maxIdx] += drift;
  }

  return db.$transaction(async (tx) => {
    await tx.payrollLineProjectAllocation.deleteMany({
      where: { payrollId },
    });
    await tx.payrollLineProjectAllocation.createMany({
      data: rows.map((r, i) => ({
        payrollId,
        project: r.project,
        mode: r.mode,
        enteredValue: r.value,
        percentage: percentages[i],
        amountMinor: amounts[i],
        createdBy: userId,
      })),
    });
    await logPayrollChange(tx, {
      payrollId,
      employeeId: payroll.employeeId,
      action: "ALLOCATIONS_SET",
      summary: `${rows.length} project allocation(s) normalized to 100%`,
      oldValues: snapshot,
      newValues: rows.map((r, i) => ({
        project: r.project,
        mode: r.mode,
        value: r.value,
        percentage: percentages[i],
        amountMinor: amounts[i],
      })),
      userId,
    });
    return tx.payrollLineProjectAllocation.findMany({
      where: { payrollId },
      orderBy: { createdAt: "asc" },
    });
  });
}
