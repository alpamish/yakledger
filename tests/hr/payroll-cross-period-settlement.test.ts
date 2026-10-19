import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import {
  generatePayroll,
  approvePayroll,
  revertPayroll,
  recordPayrollPayment,
  getEmployeeFinancialSummary,
} from "@/services/hr.service";
import { toMinor } from "@/lib/money";

async function makeUser(role: string, email: string) {
  return db.user.create({ data: { email, name: email, password: "x", role } });
}

async function makeEmployee(userId: string) {
  return db.employee.create({
    data: {
      fullName: "Carry Emp",
      fatherName: "F",
      phoneNumber: "0700000003",
      jobTitle: "Driver",
      department: "LABOR",
      employmentType: "FULL_TIME",
      hireDate: new Date("2026-01-01"),
      status: "ACTIVE",
      createdBy: userId,
      baseSalaryMinor: toMinor(25000),
      workStartTime: "07:00",
      workEndTime: "18:00",
      breakMinutes: 60,
    },
  });
}

async function addSalary(empId: string) {
  await db.salaryHistory.create({
    data: {
      employeeId: empId,
      amountMinor: toMinor(25000),
      currency: "AFN",
      effectiveFrom: new Date("2026-01-01"),
    },
  });
}

async function addAdvance(empId: string, amountMajor: number, createdAt: Date, user: any) {
  return db.cashTransaction.create({
    data: {
      employeeId: empId,
      type: "ADVANCE",
      amount: amountMajor,
      approvalStatus: "APPROVED",
      createdBy: user.id,
      approvedById: user.id,
      approvedAt: createdAt,
      createdAt,
    },
  });
}

const PERIODS = {
  june: { periodStart: new Date("2026-06-01"), periodEnd: new Date("2026-06-30") },
  july: { periodStart: new Date("2026-07-01"), periodEnd: new Date("2026-07-31") },
  august: { periodStart: new Date("2026-08-01"), periodEnd: new Date("2026-08-31") },
};

async function generateAndApprove(empId: string, userId: string, period: { periodStart: Date; periodEnd: Date }) {
  const { payroll } = await generatePayroll({
    employeeId: empId,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    createdById: userId,
  });
  const approved = await approvePayroll(payroll.id, userId);
  return approved!;
}

async function lineOf(payrollId: string) {
  const p = await db.payroll.findUnique({ where: { id: payrollId }, include: { lines: true } });
  return { payroll: p!, line: p!.lines[0] };
}

describe("Cross-period payroll settlement", () => {
  let user: any;
  let emp: any;

  beforeEach(async () => {
    user = await makeUser("MANAGER", `carry-mgr-${Date.now()}-${Math.random()}@t.co`);
    emp = await makeEmployee(user.id);
    await addSalary(emp.id);
    await db.employeeCashAccount.create({ data: { employeeId: emp.id } });
  });

  it("paying a later payroll's full net settles the earlier periods it carried", async () => {
    const june = await generateAndApprove(emp.id, user.id, PERIODS.june);
    const july = await generateAndApprove(emp.id, user.id, PERIODS.july);
    const august = await generateAndApprove(emp.id, user.id, PERIODS.august);

    // June 25,000; July 25,000 + June's open 25,000; August 25,000 + July's 50,000.
    expect(june.lines[0].netPayMinor).toBe(toMinor(25000));
    expect(july.lines[0].netPayMinor).toBe(toMinor(50000));
    expect(august.lines[0].netPayMinor).toBe(toMinor(75000));

    // Pay "August" fully: the money settles June, then July, then August,
    // because each later payroll's net embedded the earlier open balance.
    const paid = await recordPayrollPayment(august.id, user.id, { paymentMethod: "CASH" });

    expect(paid!.settledPeriods.map((s: any) => s.amountMinor)).toEqual([
      toMinor(25000),
      toMinor(25000),
      toMinor(25000),
    ]);

    for (const p of [june, july, august]) {
      const { payroll } = await lineOf(p.id);
      expect(payroll.status).toBe("PAID");
      expect(payroll.totalPaidMinor).toBe(toMinor(25000));
    }

    // The employee's total open payroll is now zero.
    const summary = await getEmployeeFinancialSummary(emp.id);
    expect(summary.payrollEarned).toBe(75000);
    expect(summary.payrollPaid).toBe(75000);
    expect(summary.payrollOutstanding).toBe(0);

    // Nothing left to pay anywhere.
    await expect(
      recordPayrollPayment(june.id, user.id, { paymentMethod: "CASH" })
    ).rejects.toThrow(/already fully paid|approved/);
  });

  it("paying the earliest period first reprices every later period", async () => {
    const june = await generateAndApprove(emp.id, user.id, PERIODS.june);
    const july = await generateAndApprove(emp.id, user.id, PERIODS.july);
    const august = await generateAndApprove(emp.id, user.id, PERIODS.august);

    // Pay June's own 25,000 (clicking June).
    await recordPayrollPayment(june.id, user.id, { paymentMethod: "CASH" });

    expect((await lineOf(june.id)).payroll.status).toBe("PAID");
    // July drops its June carry-forward (own 25,000 only); August still
    // carries July's open 25,000 plus its own month.
    expect((await lineOf(july.id)).line.netPayMinor).toBe(toMinor(25000));
    expect((await lineOf(august.id)).line.netPayMinor).toBe(toMinor(50000));

    // Each month then pays exactly its own 25,000.
    await recordPayrollPayment(july.id, user.id, { paymentMethod: "CASH" });
    // July settling reprices August down to its own month.
    expect((await lineOf(august.id)).line.netPayMinor).toBe(toMinor(25000));
    await recordPayrollPayment(august.id, user.id, { paymentMethod: "CASH" });

    for (const p of [june, july, august]) {
      const { payroll } = await lineOf(p.id);
      expect(payroll.status).toBe("PAID");
      expect(payroll.totalPaidMinor).toBe(toMinor(25000));
    }

    // Cash actually paid out equals the entitlement, no more and no less.
    const paidOut = await db.cashTransaction.aggregate({
      _sum: { amount: true },
      where: { employeeId: emp.id, type: "SALARY_PAYMENT" },
    });
    expect(Math.round((paidOut._sum.amount ?? 0) * 100)).toBe(toMinor(75000));
  });

  it("partial payments cascade and leave the correct open balance", async () => {
    const june = await generateAndApprove(emp.id, user.id, PERIODS.june);
    const july = await generateAndApprove(emp.id, user.id, PERIODS.july);

    // 30,000 against July: 25,000 clears June, 5,000 lands on July.
    const paid = await recordPayrollPayment(july.id, user.id, {
      paymentMethod: "CASH",
      amountMinor: toMinor(30000),
    });
    expect(paid!.settledPeriods.map((s: any) => s.amountMinor)).toEqual([
      toMinor(25000),
      toMinor(5000),
    ]);

    expect((await lineOf(june.id)).payroll.status).toBe("PAID");
    const { payroll: julyAfter, line: julyLine } = await lineOf(july.id);
    expect(julyAfter.status).toBe("PARTIALLY_PAID");
    expect(julyAfter.totalPaidMinor).toBe(toMinor(5000));
    // July reprice: own net 25,000 with 5,000 already on it.
    expect(julyLine.netPayMinor).toBe(toMinor(25000));
    expect(julyLine.netPayMinor - julyAfter.totalPaidMinor).toBe(toMinor(20000));

    // The remaining 20,000 settles July.
    await recordPayrollPayment(july.id, user.id, { paymentMethod: "CASH" });
    const { payroll: julyFinal } = await lineOf(july.id);
    expect(julyFinal.status).toBe("PAID");
    expect(julyFinal.totalPaidMinor).toBe(toMinor(25000));

    const summary = await getEmployeeFinancialSummary(emp.id);
    expect(summary.payrollPaid).toBe(50000);
    expect(summary.payrollOutstanding).toBe(0);
  });

  it("rejects a payment above what is actually allocatable", async () => {
    await generateAndApprove(emp.id, user.id, PERIODS.june);
    const july = await generateAndApprove(emp.id, user.id, PERIODS.july);

    // June (25,000) + July's own 25,000 = 50,000 allocatable, even though
    // July's stored net payable is 50,000 and a naive sum would allow 75,000.
    await expect(
      recordPayrollPayment(july.id, user.id, {
        paymentMethod: "CASH",
        amountMinor: toMinor(60000),
      })
    ).rejects.toThrow(/exceeds the remaining payable of 50000/);
  });

  it("carries an advance into the chain exactly once", async () => {
    await addAdvance(emp.id, 5000, new Date("2026-06-10T10:00:00Z"), user);
    const june = await generateAndApprove(emp.id, user.id, PERIODS.june);
    const july = await generateAndApprove(emp.id, user.id, PERIODS.july);

    // June: 25,000 gross less the 5,000 advance => 20,000.
    expect(june.lines[0].netPayMinor).toBe(toMinor(20000));
    // July: own 25,000 + June's open 20,000.
    expect(july.lines[0].netPayMinor).toBe(toMinor(45000));

    await recordPayrollPayment(july.id, user.id, { paymentMethod: "CASH" });

    // 5,000 advance + 20,000 June + 25,000 July = the 50,000 entitlement.
    expect((await lineOf(june.id)).payroll.totalPaidMinor).toBe(toMinor(20000));
    expect((await lineOf(july.id)).payroll.totalPaidMinor).toBe(toMinor(25000));

    const summary = await getEmployeeFinancialSummary(emp.id);
    expect(summary.payrollPaid).toBe(45000);
    expect(summary.payrollOutstanding).toBe(0);
  });

  it("works for non-contiguous periods (a skipped month)", async () => {
    // May and August are approved — nothing in between.
    const may = await generateAndApprove(emp.id, user.id, {
      periodStart: new Date("2026-05-01"),
      periodEnd: new Date("2026-05-31"),
    });
    const august = await generateAndApprove(emp.id, user.id, PERIODS.august);
    expect(august.lines[0].netPayMinor).toBe(toMinor(50000));

    await recordPayrollPayment(august.id, user.id, { paymentMethod: "CASH" });
    expect((await lineOf(may.id)).payroll.status).toBe("PAID");
    expect((await lineOf(august.id)).payroll.totalPaidMinor).toBe(toMinor(25000));
  });

  it("reverting then re-approving an earlier payroll keeps later carry-forward consistent", async () => {
    const june = await generateAndApprove(emp.id, user.id, PERIODS.june);
    const july = await generateAndApprove(emp.id, user.id, PERIODS.july);
    expect((await lineOf(july.id)).line.netPayMinor).toBe(toMinor(50000));

    await revertPayroll(june.id, user.id, "correction");
    expect((await lineOf(june.id)).payroll.status).toBe("DRAFT");
    // June no longer earns an approved balance, so July carries nothing —
    // and stays payable (not demoted to NEEDS_RECALCULATION).
    expect((await lineOf(july.id)).line.netPayMinor).toBe(toMinor(25000));
    expect((await lineOf(july.id)).payroll.status).toBe("APPROVED");

    await approvePayroll(june.id, user.id);
    // June is open again: July carries it exactly once more.
    expect((await lineOf(july.id)).line.netPayMinor).toBe(toMinor(50000));
    expect((await lineOf(july.id)).payroll.status).toBe("APPROVED");
  });
});
