import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { seedUsers, type SeedResult } from "../helpers";
import { reconcilePayrollPaymentsFromExpenses } from "@/services/payroll-reconcile.service";

interface PayrollOptions {
  status?: string;
  netMinor?: number;
  totalPaidMinor?: number;
  lineStatus?: string;
  periodStart?: string;
  periodEnd?: string;
}

describe("reconcilePayrollPaymentsFromExpenses", () => {
  let s: SeedResult;
  let employeeId: string;

  beforeEach(async () => {
    s = await seedUsers();
    const employee = await db.employee.create({
      data: {
        fullName: `Reconcile Emp ${randomUUID().slice(0, 8)}`,
        fatherName: "F",
        phoneNumber: "0700000000",
        jobTitle: "Driver",
        department: "LABOR",
        hireDate: new Date("2026-01-01"),
        createdBy: s.admin.id,
      },
    });
    employeeId = employee.id;
  });

  async function makePayroll(opts: PayrollOptions = {}) {
    const netMinor = opts.netMinor ?? 1_000_000; // 10,000 AFN
    return db.payroll.create({
      data: {
        employeeId,
        periodStart: new Date(opts.periodStart ?? "2026-09-01"),
        periodEnd: new Date(opts.periodEnd ?? "2026-09-30"),
        status: opts.status ?? "APPROVED",
        totalPaidMinor: opts.totalPaidMinor ?? 0,
        createdById: s.admin.id,
        lines: {
          create: {
            employeeId,
            baseSalaryMinor: netMinor,
            grossPayMinor: netMinor,
            netPayableMinor: netMinor,
            netPayMinor: netMinor,
            paymentStatus: opts.lineStatus ?? "UNPAID",
          },
        },
      },
      include: { lines: true },
    });
  }

  async function addExpense(
    payrollId: string,
    amount: number,
    overrides: Partial<{
      category: string;
      approvalStatus: string;
      paymentMethod: string;
    }> = {}
  ) {
    return db.expense.create({
      data: {
        title: "Salary payment test",
        category: overrides.category ?? "SALARY",
        amount,
        paymentMethod: overrides.paymentMethod ?? "CASH",
        paidTo: "Employee",
        paidBy: "Admin",
        expenseDate: new Date("2026-09-30"),
        createdBy: s.admin.id,
        approvalStatus: overrides.approvalStatus ?? "APPROVED",
        payrollId,
      },
    });
  }

  it("marks a payroll fully paid from one linked salary expense", async () => {
    const payroll = await makePayroll();
    await addExpense(payroll.id, 10_000); // 1,000,000 minor

    const result = await reconcilePayrollPaymentsFromExpenses({
      payrollIds: [payroll.id],
    });

    expect(result.updated).toBe(1);
    expect(result.paid).toBe(1);
    expect(result.partiallyPaid).toBe(0);

    const saved = await db.payroll.findUniqueOrThrow({
      where: { id: payroll.id },
      include: { lines: true },
    });
    expect(saved.status).toBe("PAID");
    expect(saved.totalPaidMinor).toBe(1_000_000);
    expect(saved.lines[0].paymentStatus).toBe("PAID");
    expect(saved.lines[0].paymentMethod).toBe("CASH");
  });

  it("marks a payroll partially paid when the expense is less than net pay", async () => {
    const payroll = await makePayroll();
    await addExpense(payroll.id, 4_000); // 400,000 minor

    const result = await reconcilePayrollPaymentsFromExpenses({
      payrollIds: [payroll.id],
    });
    expect(result.updated).toBe(1);
    expect(result.partiallyPaid).toBe(1);

    const saved = await db.payroll.findUniqueOrThrow({
      where: { id: payroll.id },
      include: { lines: true },
    });
    expect(saved.status).toBe("PARTIALLY_PAID");
    expect(saved.totalPaidMinor).toBe(400_000);
    expect(saved.lines[0].paymentStatus).toBe("PARTIALLY_PAID");
  });

  it("sums multiple partial salary expenses", async () => {
    const payroll = await makePayroll();
    await addExpense(payroll.id, 4_000);
    await addExpense(payroll.id, 6_000);

    const result = await reconcilePayrollPaymentsFromExpenses({
      payrollIds: [payroll.id],
    });
    expect(result.paid).toBe(1);

    const saved = await db.payroll.findUniqueOrThrow({ where: { id: payroll.id } });
    expect(saved.status).toBe("PAID");
    expect(saved.totalPaidMinor).toBe(1_000_000);
  });

  it("does not double-count a payroll that already has a recorded payment", async () => {
    // 1,000,000 already recorded AND a matching 10,000 AFN expense linked to it.
    const payroll = await makePayroll({
      status: "APPROVED",
      totalPaidMinor: 1_000_000,
      lineStatus: "PAID",
    });
    await addExpense(payroll.id, 10_000);

    const result = await reconcilePayrollPaymentsFromExpenses({
      payrollIds: [payroll.id],
    });

    const saved = await db.payroll.findUniqueOrThrow({ where: { id: payroll.id } });
    expect(saved.totalPaidMinor).toBe(1_000_000); // not 2,000,000
    expect(saved.status).toBe("PAID");
    // Nothing to rewrite in the paid total/line marker.
    expect(result.changes[0]?.nextPaidMinor).toBe(1_000_000);
  });

  it("ignores unapproved and non-salary expenses", async () => {
    const payroll = await makePayroll();
    await addExpense(payroll.id, 10_000, { approvalStatus: "PENDING" });
    await addExpense(payroll.id, 10_000, { category: "MISCELLANEOUS" });

    const result = await reconcilePayrollPaymentsFromExpenses({
      payrollIds: [payroll.id],
    });
    expect(result.updated).toBe(0);

    const saved = await db.payroll.findUniqueOrThrow({ where: { id: payroll.id } });
    expect(saved.status).toBe("APPROVED");
    expect(saved.totalPaidMinor).toBe(0);
  });

  it("skips drafts, cancelled and already-paid payrolls", async () => {
    const draft = await makePayroll({ status: "DRAFT" });
    await addExpense(draft.id, 10_000);
    const cancelled = await makePayroll({
      status: "CANCELLED",
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
    });
    await addExpense(cancelled.id, 10_000);
    const paid = await makePayroll({
      status: "PAID",
      totalPaidMinor: 1_000_000,
      lineStatus: "PAID",
      periodStart: "2026-07-01",
      periodEnd: "2026-07-31",
    });
    await addExpense(paid.id, 10_000);

    const result = await reconcilePayrollPaymentsFromExpenses({
      payrollIds: [draft.id, cancelled.id, paid.id],
    });
    expect(result.updated).toBe(0);
    expect(result.examined).toBe(0); // none are in a reconcilable status
  });

  it("is idempotent", async () => {
    const payroll = await makePayroll();
    await addExpense(payroll.id, 10_000);

    const first = await reconcilePayrollPaymentsFromExpenses({
      payrollIds: [payroll.id],
    });
    expect(first.updated).toBe(1);

    const second = await reconcilePayrollPaymentsFromExpenses({
      payrollIds: [payroll.id],
    });
    expect(second.updated).toBe(0);
    expect(second.totalPaidMinorDelta).toBe(0);
  });

  it("supports a dry run without writing", async () => {
    const payroll = await makePayroll();
    await addExpense(payroll.id, 10_000);

    const result = await reconcilePayrollPaymentsFromExpenses({
      payrollIds: [payroll.id],
      dryRun: true,
    });
    expect(result.dryRun).toBe(true);
    expect(result.updated).toBe(1);

    const saved = await db.payroll.findUniqueOrThrow({ where: { id: payroll.id } });
    expect(saved.status).toBe("APPROVED");
    expect(saved.totalPaidMinor).toBe(0);
  });

  it("creates no payment, cash, expense or accounting transactions", async () => {
    const payroll = await makePayroll();
    await addExpense(payroll.id, 10_000);

    const counts = async () => ({
      payments: await db.payrollPayment.count(),
      cash: await db.cashTransaction.count(),
      expenses: await db.expense.count(),
      accounting: await db.accountingEntry.count(),
    });

    const before = await counts();
    await reconcilePayrollPaymentsFromExpenses({ payrollIds: [payroll.id] });
    const after = await counts();

    expect(after).toEqual(before);
  });
});
