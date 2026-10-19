import { db } from "@/lib/db";
import { fromMinor } from "@/lib/money";
import { logPayrollChange } from "@/services/hr.service";

/**
 * Payrolls settled through the normal "Record payment" flow get a
 * `PayrollPayment` row and the payroll's `totalPaidMinor` is bumped in the
 * same transaction. Some historical data (and any payment recorded some other
 * way) only left an approved SALARY `Expense` linked through `payrollId`:
 * the money is in the ledger, but `Payroll.totalPaidMinor` / `Payroll.status`
 * still say the salary is unpaid.
 *
 * This service reconciles the settlement counters from those expenses. It is
 * deliberately non-destructive:
 *
 *   - only APPROVED / PARTIALLY_PAID payrolls are considered;
 *   - only APPROVED, category=SALARY expenses linked to the payroll count;
 *   - `totalPaidMinor` never goes down (`max` of the stored counter and the
 *     expense total, so a payroll that has both a PayrollPayment and its
 *     matching expense is not counted twice);
 *   - no PayrollPayment, CashTransaction, Expense or AccountingEntry rows are
 *     created — the financial history stays exactly as it is.
 */

export interface PayrollReconcileChange {
  payrollId: string;
  employeeId: string;
  employeeName: string;
  periodStart: string;
  periodEnd: string;
  previousStatus: string;
  nextStatus: string;
  previousPaidMinor: number;
  expensePaidMinor: number;
  nextPaidMinor: number;
  netPayMinor: number;
  expenseCount: number;
}

export interface PayrollReconcileResult {
  dryRun: boolean;
  examined: number;
  updated: number;
  paid: number;
  partiallyPaid: number;
  skipped: number;
  /** Sum of the increases applied to `Payroll.totalPaidMinor`. */
  totalPaidMinorDelta: number;
  changes: PayrollReconcileChange[];
}

const RECONCILABLE_STATUSES = ["APPROVED", "PARTIALLY_PAID"] as const;

export async function reconcilePayrollPaymentsFromExpenses(
  opts: { dryRun?: boolean; payrollIds?: string[] } = {}
): Promise<PayrollReconcileResult> {
  const dryRun = opts.dryRun ?? false;
  const payrollIds = opts.payrollIds?.filter((id) => typeof id === "string" && id.length > 0);

  const payrolls = await db.payroll.findMany({
    where: {
      ...(payrollIds && payrollIds.length > 0 ? { id: { in: payrollIds } } : {}),
      status: { in: [...RECONCILABLE_STATUSES] },
    },
    select: {
      id: true,
      employeeId: true,
      status: true,
      totalPaidMinor: true,
      periodStart: true,
      periodEnd: true,
      employee: { select: { fullName: true } },
      lines: {
        select: {
          id: true,
          netPayMinor: true,
          paymentStatus: true,
          paymentMethod: true,
        },
      },
    },
    orderBy: [{ periodStart: "asc" }, { createdAt: "asc" }],
  });

  const empty: PayrollReconcileResult = {
    dryRun,
    examined: payrolls.length,
    updated: 0,
    paid: 0,
    partiallyPaid: 0,
    skipped: payrolls.length,
    totalPaidMinorDelta: 0,
    changes: [],
  };
  if (payrolls.length === 0) return empty;

  // One query for every linked salary expense: aggregate in memory so the
  // latest payment method is available too.
  const expenses = await db.expense.findMany({
    where: {
      payrollId: { in: payrolls.map((p) => p.id) },
      category: "SALARY",
      approvalStatus: "APPROVED",
    },
    select: {
      payrollId: true,
      amount: true,
      paymentMethod: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const expenseByPayroll = new Map<
    string,
    { totalMinor: number; count: number; latestMethod: string | null }
  >();
  for (const expense of expenses) {
    if (!expense.payrollId) continue;
    const current = expenseByPayroll.get(expense.payrollId) ?? {
      totalMinor: 0,
      count: 0,
      latestMethod: null,
    };
    current.totalMinor += Math.round(expense.amount * 100);
    current.count += 1;
    current.latestMethod = expense.paymentMethod ?? current.latestMethod;
    expenseByPayroll.set(expense.payrollId, current);
  }

  const changes: PayrollReconcileChange[] = [];
  const writes: Array<{
    change: PayrollReconcileChange;
    lineId: string | null;
    lineStatus: string;
    paymentMethod: string | null;
    setPaymentMethod: boolean;
  }> = [];

  for (const payroll of payrolls) {
    const expense = expenseByPayroll.get(payroll.id);
    const expensePaidMinor = expense?.totalMinor ?? 0;
    // MAX keeps the reconciliation idempotent and avoids double-counting a
    // payment that already produced both a PayrollPayment and an Expense.
    const nextPaidMinor = Math.max(payroll.totalPaidMinor, expensePaidMinor);
    if (nextPaidMinor <= 0) continue;

    const line = payroll.lines[0] ?? null;
    const netPayMinor = Math.max(line?.netPayMinor ?? 0, 0);
    const fullyPaid = nextPaidMinor >= netPayMinor;
    const nextStatus = fullyPaid ? "PAID" : "PARTIALLY_PAID";
    const nextLineStatus = fullyPaid ? "PAID" : "PARTIALLY_PAID";

    // `fullyPaid` with netPay 0 is only reachable when something was paid;
    // treat it as settled rather than leaving a zero-payroll open.

    const setPaymentMethod =
      !!line && !line.paymentMethod && !!expense?.latestMethod;
    const lineStatusChanged = !!line && line.paymentStatus !== nextLineStatus;
    const changed =
      payroll.totalPaidMinor !== nextPaidMinor ||
      payroll.status !== nextStatus ||
      lineStatusChanged ||
      setPaymentMethod;

    if (!changed) continue;

    const change: PayrollReconcileChange = {
      payrollId: payroll.id,
      employeeId: payroll.employeeId,
      employeeName: payroll.employee?.fullName ?? "Employee",
      periodStart: payroll.periodStart.toISOString().slice(0, 10),
      periodEnd: payroll.periodEnd.toISOString().slice(0, 10),
      previousStatus: payroll.status,
      nextStatus,
      previousPaidMinor: payroll.totalPaidMinor,
      expensePaidMinor,
      nextPaidMinor,
      netPayMinor,
      expenseCount: expense?.count ?? 0,
    };
    changes.push(change);
    writes.push({
      change,
      lineId: line?.id ?? null,
      lineStatus: nextLineStatus,
      paymentMethod: expense?.latestMethod ?? null,
      setPaymentMethod,
    });
  }

  if (!dryRun && writes.length > 0) {
    await db.$transaction(async (tx) => {
      for (const write of writes) {
        const { change } = write;
        await tx.payroll.update({
          where: { id: change.payrollId },
          data: {
            status: change.nextStatus,
            totalPaidMinor: change.nextPaidMinor,
          },
        });

        if (write.lineId) {
          await tx.payrollLine.update({
            where: { id: write.lineId },
            data: {
              paymentStatus: write.lineStatus,
              ...(write.setPaymentMethod
                ? { paymentMethod: write.paymentMethod }
                : {}),
            },
          });
        }

        await logPayrollChange(tx, {
          payrollId: change.payrollId,
          employeeId: change.employeeId,
          action: "PAYMENT_RECONCILED",
          summary: `Settlement reconciled from ${change.expenseCount} salary expense(s): ${fromMinor(
            change.previousPaidMinor
          )} → ${fromMinor(change.nextPaidMinor)} AFN (${change.nextStatus})`,
          oldValues: {
            status: change.previousStatus,
            totalPaidMinor: change.previousPaidMinor,
          },
          newValues: {
            status: change.nextStatus,
            totalPaidMinor: change.nextPaidMinor,
            expensePaidMinor: change.expensePaidMinor,
            expenseCount: change.expenseCount,
          },
          userId: null,
        });
      }
    });
  }

  const paid = changes.filter((c) => c.nextStatus === "PAID").length;
  const partiallyPaid = changes.filter((c) => c.nextStatus === "PARTIALLY_PAID").length;
  const totalPaidMinorDelta = changes.reduce(
    (sum, c) => sum + Math.max(c.nextPaidMinor - c.previousPaidMinor, 0),
    0
  );

  return {
    dryRun,
    examined: payrolls.length,
    updated: changes.length,
    paid,
    partiallyPaid,
    skipped: payrolls.length - changes.length,
    totalPaidMinorDelta,
    changes,
  };
}
