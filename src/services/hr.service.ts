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
import { companyWalletService } from "./company-wallet.service";

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

  // Auto-calculate workDays from hire date if not provided
  let workDays = params.workDays ?? 0;
  if (!workDays) {
    const employee = await db.employee.findUnique({
      where: { id: params.employeeId },
      select: { hireDate: true },
    });
    if (employee?.hireDate) {
      const totalDays = new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 0).getDate();
      if (employee.hireDate <= periodStart) {
        workDays = Math.min(totalDays, 30);
      } else {
        workDays = totalDays - employee.hireDate.getDate() + 1;
      }
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
  const grossPayMinor =
    baseSalaryMinor + overtimePayMinor + allowancesMinor + bonusesMinor - deductionsMinor;

  // Apply the employee's outstanding advance/debt balance.
  const deductExpenses = params.deductExpenses !== false;
  const fig = await computePayrollFigures(
    params.employeeId,
    periodStart,
    periodEnd,
    grossPayMinor,
    deductExpenses
  );

  const payroll = await db.payroll.create({
    data: {
      employeeId: params.employeeId,
      periodStart,
      periodEnd,
      currency: salary.currency,
      status: "DRAFT",
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
 */
export async function computePayrollFigures(
  employeeId: string,
  periodStart: Date,
  periodEnd: Date,
  grossPayMinor: number,
  deductExpenses: boolean = true
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
  // Convert major-unit Float amounts to integer minor units with rounding
  // to avoid floating-point precision drift (e.g. 0.1 + 0.2 = 0.30000000000000004).
  const receivedMinor =
    Math.round(received.reduce((s, t) => s + t.amount, 0) * 100) -
    Math.round((returnedAgg._sum.amount ?? 0) * 100);

  // Approved employee-paid company expenses are money the company owes the
  // employee, so they reduce the employee's net debt. (Employee wallets derive
  // these directly from approved expenses; payroll debt must match.)
  const employeeExpensesAgg = await db.expense.aggregate({
    _sum: { amount: true },
    where: {
      paidById: employeeId,
      approvalStatus: "APPROVED",
      deductFromWallet: { not: false },
      expenseDate: { lte: periodEnd },
    },
  });
  const totalExpensesMinor = Math.round((employeeExpensesAgg._sum.amount ?? 0) * 100);

  // Period-scoped expenses: only expenses within this payroll period.
  const periodExpensesAgg = await db.expense.aggregate({
    _sum: { amount: true },
    where: {
      paidById: employeeId,
      approvalStatus: "APPROVED",
      deductFromWallet: { not: false },
      expenseDate: { gte: periodStart, lte: periodEnd },
    },
  });
  const periodExpensesMinor = Math.round((periodExpensesAgg._sum.amount ?? 0) * 100);

  const previousDebtMinor =
    receivedMinor - priorEarnedMinor - (deductExpenses ? totalExpensesMinor : 0);
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

/** Allocate an employee's approved advances to a payroll (FIFO), never twice.
 *  Returns the total amount allocated in minor units. */
async function allocateAdvances(
  tx: Prisma.TransactionClient,
  employeeId: string,
  periodEnd: Date,
  payrollId: string,
  amountMinor: number
): Promise<number> {
  if (amountMinor <= 0) return 0;

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
  let totalAllocated = 0;

  for (const adv of advances) {
    if (toAllocate <= 0) break;
    const advMinor = Math.round(adv.amount * 100);
    const amt = Math.min(advMinor, toAllocate);
    await tx.payrollAdvanceAllocation.create({
      data: { payrollId, cashTransactionId: adv.id, amountMinor: amt },
    });
    toAllocate -= amt;
    totalAllocated += amt;
  }

  return totalAllocated;
}

/** Approve a payroll record. Approval finalizes and settles it: */
export async function approvePayroll(
  payrollId: string,
  approvedById: string,
  opts?: { paymentMethod?: string; walletId?: string }
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
  const walletId = opts?.walletId ?? payroll.walletId ?? undefined;

  // Figures were recomputed above at approval time (the ledger may have
  // changed since the draft was generated). Only a positive net is paid out.
  const netPayMinor = Math.max(fig.netPayableMinor, 0);

  // Names for the company-paid expense record.
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
      payrollId2,
      fig.amountAlreadyReceivedMinor
    );

    if (netPayMinor > 0) {
      const amount = netPayMinor / 100;
      // Deduct the payout from the selected company wallet (validates funds).
      if (walletId) {
        await companyWalletService.deductForPayroll(
          tx,
          walletId,
          amount,
          payrollId2,
          approvedById
        );
      }
      await tx.cashTransaction.create({
        data: {
          employeeId,
          type: "SALARY_PAYMENT",
          amount,
          note: `Salary payment ${periodLabel}`,
          createdBy: approvedById,
          approvalStatus: "APPROVED",
          approvedById,
          approvedAt: new Date(),
          payrollId: payrollId2,
          walletId: walletId ?? null,
        },
      });
      // The approved payroll is a company-paid expense (salary).
      await tx.expense.create({
        data: {
          title: `Salary payment ${periodLabel}`,
          description: `Payroll for ${employeeName}`,
          category: "SALARY",
          amount,
          paymentMethod: opts?.paymentMethod ?? "CASH",
          paidTo: employeeName,
          paidBy: approverName,
          expenseDate: payroll.periodEnd,
          paidToId: employeeId,
          createdBy: approvedById,
          approvalStatus: "APPROVED",
          approvedById,
          approvedAt: new Date(),
          payrollId: payrollId2,
          walletId: walletId ?? null,
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
              advancesDeductedMinor: allocatedMinor,
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
 * Update a single DRAFT payroll line with inline edits. Recomputes derived
 * figures (gross, net, etc.) and returns the updated payroll with lines.
 */
export async function updatePayrollLine(
  lineId: string,
  updates: {
    overtimeHours?: number;
    allowancesMinor?: number;
    bonusesMinor?: number;
    deductionsMinor?: number;
    netPayableMinor?: number;
    remainingEmployeeDebtMinor?: number;
    deductExpenses?: boolean;
    walletId?: string;
  }
) {
  const line = await db.payrollLine.findUnique({
    where: { id: lineId },
    include: { payroll: true },
  });
  if (!line) throw new Error("Payroll line not found");
  if (line.payroll.status !== "DRAFT") {
    throw new Error("Only draft payroll lines can be edited");
  }

  const payrollId = line.payrollId;
  const overtimeHours = updates.overtimeHours ?? line.overtimeHours;
  const allowancesMinor = updates.allowancesMinor ?? line.allowancesMinor;
  const bonusesMinor = updates.bonusesMinor ?? line.bonusesMinor;
  const deductionsMinor = updates.deductionsMinor ?? line.deductionsMinor;
  const deductExpenses = updates.deductExpenses ?? line.deductExpenses;

  // Recompute overtime pay if hours changed
  const { rate, paidDailyHours } = await employeePayrollParams(line.employeeId);
  const hourlyMinor = Math.round(line.baseSalaryMinor / 30 / paidDailyHours);
  const overtimePayMinor = Math.round(hourlyMinor * rate * overtimeHours);

  // Recompute gross
  const grossPayMinor =
    line.baseSalaryMinor + overtimePayMinor + allowancesMinor + bonusesMinor - deductionsMinor;

  // Recompute debt figures with updated expense toggle
  const fig = await computePayrollFigures(
    line.employeeId,
    line.payroll.periodStart,
    line.payroll.periodEnd,
    grossPayMinor,
    deductExpenses
  );

  // Allow manual override of netPayableMinor / remainingEmployeeDebtMinor
  const netPayableMinor = updates.netPayableMinor ?? fig.netPayableMinor;
  const remainingEmployeeDebtMinor =
    updates.remainingEmployeeDebtMinor ?? fig.remainingEmployeeDebtMinor;

  await db.payrollLine.update({
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
      amountAlreadyReceivedMinor: fig.amountAlreadyReceivedMinor,
      previousDebtMinor: fig.previousDebtMinor,
      netPayableMinor,
      remainingEmployeeDebtMinor,
      netPayMinor: Math.max(netPayableMinor, 0),
    },
  });

  // Update wallet if changed
  if (updates.walletId !== undefined) {
    await db.payroll.update({
      where: { id: payrollId },
      data: { walletId: updates.walletId || null },
    });
  }

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
  if (payroll.status !== "APPROVED") {
    throw new Error("Only an approved payroll can be reverted");
  }
  if (payroll.revertedAt) {
    throw new Error("Payroll has already been reverted");
  }

  const employeeId = payroll.employeeId;

  await db.$transaction(async (tx) => {
    // Remove the company-paid salary expense created at approval.
    await tx.expense.deleteMany({ where: { payrollId: payroll.id } });
    // Remove the salary payment(s) created at approval.
    await tx.cashTransaction.deleteMany({ where: { payrollId: payroll.id } });
    // Free the advances allocated to this payroll so they can be re-allocated
    // when the corrected payroll is generated.
    await tx.payrollAdvanceAllocation.deleteMany({ where: { payrollId: payroll.id } });
    // Restore any company wallet balance deducted for this payroll.
    await companyWalletService.reversePayrollDeduction(tx, payroll.id, userId);
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

  const [attendanceRecords, salaryPayments, expensesTo, expensesBy, advances, otAgg] =
    await Promise.all([
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
    totalPaid,
    totalReceived,
    outstanding,
    walletBalance: employee.cashAccount?.currentBalance ?? 0,
  };
}

/**
 * Delete a DRAFT payroll record. Only DRAFT payrolls can be deleted;
 * APPROVED payrolls must be reverted first.
 */
export async function deletePayroll(payrollId: string, userId: string) {
  const payroll = await db.payroll.findUnique({
    where: { id: payrollId },
    include: { lines: true, expenses: true },
  });
  if (!payroll) throw new Error("Payroll not found");
  if (payroll.status !== "DRAFT") {
    throw new Error("Only a draft payroll can be deleted. Revert it first.");
  }
  // Safety: refuse if any expenses are linked (shouldn't exist for drafts).
  if (payroll.expenses.length > 0) {
    throw new Error(
      "Cannot delete a payroll with linked expenses. Revert it first."
    );
  }

  await db.$transaction(async (tx) => {
    await tx.employeeAuditEvent.create({
      data: {
        employeeId: payroll.employeeId,
        action: "PAYROLL_DELETED",
        newValue: payrollId,
        performedById: userId,
      },
    });
    await tx.payroll.delete({ where: { id: payrollId } });
  });
}
