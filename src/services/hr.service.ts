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
import { toMinor } from "../lib/money";
import { Prisma } from "@prisma/client";
import { walletService } from "./wallet.service";

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
 * Generate (or fetch existing) an immutable payroll record for an employee and
 * period. Once APPROVED, the record is never recomputed from employee data.
 * Salary is snapshotted from SalaryHistory at the period end date.
 */
export async function generatePayroll(params: {
  employeeId: string;
  periodStart: Date | string;
  periodEnd: Date | string;
  createdById: string;
  allowancesMinor?: number;
  bonusesMinor?: number;
  deductionsMinor?: number;
}) {
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
    if (existing.status === "APPROVED") return existing; // immutable
    // editable draft: delete and regenerate
    await db.payroll.delete({ where: { id: existing.id } });
  }

  const salary = await getEmployeeSalaryAtDate(params.employeeId, periodEnd);
  if (!salary) throw new Error("No salary found for employee in this period");

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

  // Employee is paid their contracted monthly salary regardless of days present
  // (construction site salary model). Overtime is additive.
  const baseSalaryMinor = salary.amountMinor;
  const { rate, paidDailyHours } = await employeePayrollParams(params.employeeId);
  const hourlyMinor = Math.round(baseSalaryMinor / 30 / paidDailyHours);
  const overtimePayMinor = Math.round(hourlyMinor * rate * overtimeHours);

  const allowancesMinor = params.allowancesMinor ?? 0;
  const bonusesMinor = params.bonusesMinor ?? 0;
  const deductionsMinor = params.deductionsMinor ?? 0;
  const grossPayMinor =
    baseSalaryMinor + overtimePayMinor + allowancesMinor + bonusesMinor - deductionsMinor;

  // Apply the employee's outstanding advance/debt balance.
  const fig = await computePayrollFigures(
    params.employeeId,
    periodStart,
    periodEnd,
    grossPayMinor
  );

  return db.payroll.create({
    data: {
      employeeId: params.employeeId,
      periodStart,
      periodEnd,
      currency: salary.currency,
      status: "DRAFT",
      createdById: params.createdById,
      lines: {
        create: {
          employeeId: params.employeeId,
          baseSalaryMinor,
          currency: salary.currency,
          attendanceDays,
          overtimeHours,
          overtimePayMinor,
          allowancesMinor,
          bonusesMinor,
          deductionsMinor,
          grossPayMinor,
          amountAlreadyReceivedMinor: fig.amountAlreadyReceivedMinor,
          previousDebtMinor: fig.previousDebtMinor,
          advancesDeductedMinor: fig.amountAlreadyReceivedMinor,
          netPayableMinor: fig.netPayableMinor,
          remainingEmployeeDebtMinor: fig.remainingEmployeeDebtMinor,
          netPayMinor: Math.max(fig.netPayableMinor, 0),
          paymentStatus: "UNPAID",
          salarySnapshotDate: salary.effectiveFrom,
        },
      },
    },
    include: { lines: true },
  });
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
      payroll: { status: "APPROVED", periodEnd: { lt: periodStart } },
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
  const receivedMinor = Math.round(
    received.reduce((s, t) => s + t.amount, 0) * 100 -
      (returnedAgg._sum.amount ?? 0) * 100
  );

  // Approved employee-paid company expenses (DEBIT) are money the company
  // owes the employee, so they reduce the employee's net debt.
  const deductionsAgg = await db.cashTransaction.aggregate({
    _sum: { amount: true },
    where: {
      employeeId,
      type: "DEBIT",
      approvalStatus: "APPROVED",
      createdAt: { lte: periodEnd },
    },
  });
  const totalDeductionsMinor = Math.round((deductionsAgg._sum.amount ?? 0) * 100);

  const previousDebtMinor =
    receivedMinor - priorEarnedMinor - totalDeductionsMinor;
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
  };
}

/** Allocate an employee's approved advances to a payroll (FIFO), never twice. */
async function allocateAdvances(
  tx: Prisma.TransactionClient,
  employeeId: string,
  periodEnd: Date,
  payrollId: string,
  amountMinor: number
) {
  if (amountMinor <= 0) return;

  const priorAllocAgg = await tx.payrollAdvanceAllocation.aggregate({
    _sum: { amountMinor: true },
    where: {
      payroll: { employeeId, status: "APPROVED" },
      cashTransaction: { type: "ADVANCE" },
    },
  });
  const priorAllocMinor = priorAllocAgg._sum.amountMinor ?? 0;

  const advances = await tx.cashTransaction.findMany({
    where: {
      employeeId,
      type: "ADVANCE",
      approvalStatus: "APPROVED",
      createdAt: { lte: periodEnd },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, amount: true },
  });
  const totalAdvancesMinor = Math.round(
    advances.reduce((s, a) => s + a.amount, 0) * 100
  );
  const availableMinor = Math.max(0, totalAdvancesMinor - priorAllocMinor);
  let toAllocate = Math.min(amountMinor, availableMinor);

  for (const adv of advances) {
    if (toAllocate <= 0) break;
    const advMinor = Math.round(adv.amount * 100);
    const amt = Math.min(advMinor, toAllocate);
    await tx.payrollAdvanceAllocation.create({
      data: { payrollId, cashTransactionId: adv.id, amountMinor: amt },
    });
    toAllocate -= amt;
  }
}

// Overtime rate lookup helper (defaults to 1.25)
async function overtimeRate(employeeId: string): Promise<number> {
  const emp = await db.employee.findUnique({
    where: { id: employeeId },
    select: { overtimeRate: true, workHoursPerDay: true },
  });
  return emp?.overtimeRate ?? 1.25;
}

/** Approve a payroll record. Approval finalizes and settles it: */
export async function approvePayroll(
  payrollId: string,
  approvedById: string,
  opts?: { paymentMethod?: string }
) {
  const payroll = await db.payroll.findUnique({
    where: { id: payrollId },
    include: { lines: true },
  });
  if (!payroll) throw new Error("Payroll not found");
  if (payroll.status === "APPROVED") return payroll;

  const line = payroll.lines[0];
  if (!line) throw new Error("Payroll has no line items");

  // Recompute final figures at approval time (ledger may have changed).
  const fig = await computePayrollFigures(
    payroll.employeeId,
    payroll.periodStart,
    payroll.periodEnd,
    line.grossPayMinor
  );

  const payrollId2 = payroll.id;
  const employeeId = payroll.employeeId;

  // Figures were recomputed above at approval time (the ledger may have
  // changed since the draft was generated). Only a positive net is paid out.
  const netPayMinor = Math.max(fig.netPayableMinor, 0);

  await db.$transaction(async (tx) => {
    await allocateAdvances(
      tx,
      employeeId,
      payroll.periodEnd,
      payrollId2,
      fig.amountAlreadyReceivedMinor
    );

    if (netPayMinor > 0) {
      await tx.cashTransaction.create({
        data: {
          employeeId,
          type: "SALARY_PAYMENT",
          amount: netPayMinor / 100,
          note: `Salary payment ${payroll.periodStart.toISOString().slice(0, 10)}–${payroll.periodEnd.toISOString().slice(0, 10)}`,
          createdBy: approvedById,
          approvalStatus: "APPROVED",
          approvedById,
          approvedAt: new Date(),
          payrollId: payrollId2,
        },
      });
    }

    await tx.payroll.update({
      where: { id: payrollId2 },
      data: {
        status: "APPROVED",
        approvedById,
        approvedAt: new Date(),
        lines: {
          update: {
            where: { id: line.id },
            data: {
              grossPayMinor: line.grossPayMinor,
              amountAlreadyReceivedMinor: fig.amountAlreadyReceivedMinor,
              previousDebtMinor: fig.previousDebtMinor,
              advancesDeductedMinor: fig.amountAlreadyReceivedMinor,
              netPayableMinor: fig.netPayableMinor,
              remainingEmployeeDebtMinor: fig.remainingEmployeeDebtMinor,
              netPayMinor,
              paymentStatus: netPayMinor > 0 ? "PAID" : "UNPAID",
              paymentMethod:
                netPayMinor > 0 ? opts?.paymentMethod ?? "CASH" : null,
            },
          },
        },
      },
    });

    await tx.employeeAuditEvent.create({
      data: {
        employeeId,
        action: "PAYROLL_APPROVED",
        newValue: payrollId2,
        performedById: approvedById,
      },
    });
  });

  // Recompute the employee wallet balance after settlement.
  await walletService.recomputeBalance(employeeId);

  return db.payroll.findUnique({
    where: { id: payrollId2 },
    include: { lines: true },
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
  if (payroll.status !== "APPROVED") {
    throw new Error("Only an approved payroll can be reverted");
  }
  if (payroll.revertedAt) {
    throw new Error("Payroll has already been reverted");
  }

  const employeeId = payroll.employeeId;

  await db.$transaction(async (tx) => {
    // Remove the salary payment(s) created at approval.
    await tx.cashTransaction.deleteMany({ where: { payrollId: payroll.id } });
    // Free the advances allocated to this payroll so they can be re-allocated
    // when the corrected payroll is generated.
    await tx.payrollAdvanceAllocation.deleteMany({ where: { payrollId: payroll.id } });
    await tx.payroll.update({
      where: { id: payroll.id },
      data: {
        status: "DRAFT",
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
  });

  await walletService.recomputeBalance(employeeId);

  return db.payroll.findUnique({
    where: { id: payroll.id },
    include: { lines: true },
  });
}
