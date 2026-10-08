import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import {
  generatePayroll,
  approvePayroll,
  deletePayroll,
  computePayrollFigures,
  updatePayrollLine,
} from "@/services/hr.service";
import { toMinor } from "@/lib/money";

async function makeUser(role: string, email: string) {
  return db.user.create({ data: { email, name: email, password: "x", role } });
}

async function makeEmployee(userId: string, extra: any = {}) {
  return db.employee.create({
    data: {
      fullName: "Fig Emp",
      fatherName: "F",
      phoneNumber: "0700000000",
      jobTitle: "Driver",
      department: "LABOR",
      employmentType: "FULL_TIME",
      hireDate: new Date("2026-01-01"),
      status: "ACTIVE",
      createdBy: userId,
      baseSalaryMinor: extra.baseSalaryMinor ?? toMinor(25000),
      workStartTime: "07:00",
      workEndTime: "18:00",
      breakMinutes: 60,
      ...extra,
    },
  });
}

async function addSalary(empId: string, amountMinor: number, effectiveFrom: Date) {
  await db.salaryHistory.create({
    data: {
      employeeId: empId,
      amountMinor,
      currency: "AFN",
      effectiveFrom,
    },
  });
}

async function addAdvance(empId: string, amountMajor: number, createdAt: Date, userId: string) {
  return db.cashTransaction.create({
    data: {
      employeeId: empId,
      type: "ADVANCE",
      amount: amountMajor,
      approvalStatus: "APPROVED",
      createdBy: userId,
      approvedById: userId,
      approvedAt: createdAt,
      createdAt,
    },
  });
}

async function addReturn(empId: string, amountMajor: number, createdAt: Date, userId: string) {
  return db.cashTransaction.create({
    data: {
      employeeId: empId,
      type: "RETURN",
      amount: amountMajor,
      approvalStatus: "APPROVED",
      createdBy: userId,
      approvedById: userId,
      approvedAt: createdAt,
      createdAt,
    },
  });
}

async function addEmployeeExpense(
  empId: string,
  amountMajor: number,
  userId: string,
  opts?: { deductFromWallet?: boolean; expenseDate?: Date }
) {
  return db.expense.create({
    data: {
      title: "Employee paid expense",
      amount: amountMajor,
      category: "OTHER",
      paymentMethod: "CASH",
      paidTo: "Company",
      paidBy: "Employee",
      expenseDate: opts?.expenseDate ?? new Date("2026-06-15"),
      paidById: empId,
      createdBy: userId,
      approvalStatus: "APPROVED",
      approvedById: userId,
      approvedAt: new Date(),
      deductFromWallet: opts?.deductFromWallet ?? true,
    },
  });
}

describe("computePayrollFigures edge cases", () => {
  let user: any;
  let emp: any;

  beforeEach(async () => {
    user = await makeUser("MANAGER", `fig-mgr-${Date.now()}-${Math.random()}@t.co`);
    emp = await makeEmployee(user.id);
    await addSalary(emp.id, toMinor(25000), new Date("2026-01-01"));
  });

  it("handles employee with no attendance (0 days worked)", async () => {
    // No attendance records created — salary is still the full monthly amount
    const fig = await computePayrollFigures(
      emp.id,
      new Date("2026-06-01"),
      new Date("2026-06-30"),
      toMinor(25000)
    );

    expect(fig.priorEarnedMinor).toBe(0);
    expect(fig.receivedMinor).toBe(0);
    expect(fig.previousDebtMinor).toBe(0);
    expect(fig.amountAlreadyReceivedMinor).toBe(0);
    expect(fig.netPayableMinor).toBe(toMinor(25000));
    expect(fig.remainingEmployeeDebtMinor).toBe(0);
  });

  it("RETURN transactions reduce received amount", async () => {
    // Employee received 10,000 advance, then returned 3,000
    await addAdvance(emp.id, 10000, new Date("2026-06-05T10:00:00Z"), user.id);
    await addReturn(emp.id, 3000, new Date("2026-06-10T10:00:00Z"), user.id);

    const fig = await computePayrollFigures(
      emp.id,
      new Date("2026-06-01"),
      new Date("2026-06-30"),
      toMinor(25000)
    );

    // Received = 10,000 - 3,000 = 7,000
    expect(fig.receivedMinor).toBe(toMinor(7000));
    // previousDebt = received - priorEarned - expenses = 7000 - 0 - 0 = 7000
    expect(fig.previousDebtMinor).toBe(toMinor(7000));
    // netPayable = gross - previousDebt = 25000 - 7000 = 18000
    expect(fig.netPayableMinor).toBe(toMinor(18000));
  });

  it("employee-paid expenses never change payroll debt (reimbursement is separate)", async () => {
    await addAdvance(emp.id, 5000, new Date("2026-06-05T10:00:00Z"), user.id);
    // Reported for information only; reimbursed outside salary payroll.
    await addEmployeeExpense(emp.id, 2000, user.id, {
      deductFromWallet: false,
      expenseDate: new Date("2026-06-10"),
    });
    await addEmployeeExpense(emp.id, 3000, user.id, {
      deductFromWallet: true,
      expenseDate: new Date("2026-06-20"),
    });

    const fig = await computePayrollFigures(
      emp.id,
      new Date("2026-06-01"),
      new Date("2026-06-30"),
      toMinor(25000)
    );

    // received = 5000 advance, priorEarned = 0; expenses are not netted in.
    expect(fig.previousDebtMinor).toBe(toMinor(5000));
    expect(fig.netPayableMinor).toBe(toMinor(20000));
    // Period total still reported for display.
    expect(fig.periodExpensesMinor).toBe(toMinor(5000));
  });

  it("only reports expenses inside the period", async () => {
    await addAdvance(emp.id, 5000, new Date("2026-06-05T10:00:00Z"), user.id);
    // This expense is AFTER the period — not part of this period's report.
    await addEmployeeExpense(emp.id, 2000, user.id, {
      deductFromWallet: true,
      expenseDate: new Date("2026-07-10"),
    });

    const fig = await computePayrollFigures(
      emp.id,
      new Date("2026-06-01"),
      new Date("2026-06-30"),
      toMinor(25000)
    );

    // received = 5000, priorEarned = 0
    expect(fig.previousDebtMinor).toBe(toMinor(5000));
    expect(fig.periodExpensesMinor).toBe(0);
  });

  it("correctly tracks prior earned from approved payrolls", async () => {
    // Generate and approve May payroll first
    const { payroll: may } = await generatePayroll({
      employeeId: emp.id,
      periodStart: new Date("2026-05-01"),
      periodEnd: new Date("2026-05-31"),
      createdById: user.id,
    });
    await approvePayroll(may.id, user.id);

    // Now compute figures for June — priorEarned should include May
    const fig = await computePayrollFigures(
      emp.id,
      new Date("2026-06-01"),
      new Date("2026-06-30"),
      toMinor(25000)
    );

    expect(fig.priorEarnedMinor).toBe(toMinor(25000));
  });
});

describe("Payroll with allowances, bonuses, deductions", () => {
  let user: any;
  let emp: any;

  beforeEach(async () => {
    user = await makeUser("MANAGER", `abde-mgr-${Date.now()}-${Math.random()}@t.co`);
    emp = await makeEmployee(user.id);
    await addSalary(emp.id, toMinor(25000), new Date("2026-01-01"));
  });

  it("applies allowances, bonuses, and deductions to gross pay", async () => {
    const { payroll } = await generatePayroll({
      employeeId: emp.id,
      periodStart: new Date("2026-06-01"),
      periodEnd: new Date("2026-06-30"),
      createdById: user.id,
      allowancesMinor: toMinor(2000),
      bonusesMinor: toMinor(1000),
      deductionsMinor: toMinor(500),
    });

    const line = payroll.lines[0];
    // gross = baseSalary + overtime + allowances + bonuses - deductions
    // = 25000 + 0 + 2000 + 1000 - 500 = 27500
    expect(line.allowancesMinor).toBe(toMinor(2000));
    expect(line.bonusesMinor).toBe(toMinor(1000));
    expect(line.deductionsMinor).toBe(toMinor(500));
    expect(line.grossPayMinor).toBe(toMinor(27500));
  });

  it("generates payroll for multiple employees in batch", async () => {
    const emp2 = await makeEmployee(user.id, { fullName: "Batch Emp 2" });
    await addSalary(emp2.id, toMinor(30000), new Date("2026-01-01"));

    const emp3 = await makeEmployee(user.id, { fullName: "Batch Emp 3" });
    await addSalary(emp3.id, toMinor(20000), new Date("2026-01-01"));

    // Import the API route's batch logic pattern
    const results: any[] = [];
    const errors: string[] = [];
    const settled = await Promise.allSettled(
      [emp.id, emp2.id, emp3.id].map((empId) =>
        generatePayroll({
          employeeId: empId,
          periodStart: new Date("2026-06-01"),
          periodEnd: new Date("2026-06-30"),
          createdById: user.id,
        })
      )
    );

    for (let i = 0; i < settled.length; i++) {
      const r = settled[i];
      if (r.status === "fulfilled") {
        results.push(r.value);
      } else {
        errors.push(`error`);
      }
    }

    expect(results.length).toBe(3);
    expect(errors.length).toBe(0);
  });

  it("batch generation collects errors for employees without salary", async () => {
    const noSalary = await makeEmployee(user.id, { fullName: "No Salary Emp" });
    // No salary history added for noSalary

    const settled = await Promise.allSettled(
      [emp.id, noSalary.id].map((empId) =>
        generatePayroll({
          employeeId: empId,
          periodStart: new Date("2026-06-01"),
          periodEnd: new Date("2026-06-30"),
          createdById: user.id,
        })
      )
    );

    const results: any[] = [];
    const errors: string[] = [];
    const empIds = [emp.id, noSalary.id];

    for (let i = 0; i < settled.length; i++) {
      const r = settled[i];
      if (r.status === "fulfilled") {
        results.push(r.value);
      } else {
        errors.push(`${empIds[i]}: ${r.reason?.message || "error"}`);
      }
    }

    expect(results.length).toBe(1);
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain(noSalary.id);
    expect(errors[0]).toContain("No salary found");
  });
});

describe("computePaidDailyHours edge cases", () => {
  let user: any;

  beforeEach(async () => {
    user = await makeUser("MANAGER", `pdh-mgr-${Date.now()}-${Math.random()}@t.co`);
  });

  it("handles midnight-crossing schedule (22:00 → 06:00)", async () => {
    const emp = await makeEmployee(user.id, {
      fullName: "Night Shift",
      workStartTime: "22:00",
      workEndTime: "06:00",
      breakMinutes: 0,
    });
    await addSalary(emp.id, toMinor(25000), new Date("2026-01-01"));

    const { payroll } = await generatePayroll({
      employeeId: emp.id,
      periodStart: new Date("2026-06-01"),
      periodEnd: new Date("2026-06-30"),
      createdById: user.id,
    });

    const line = payroll.lines[0];
    // 22:00 → 06:00 = 8 hours (crosses midnight, adds 1440 min)
    // hourly = round(2500000 / 30 / 8) = 10417
    // No overtime in this case (just 8 hours worked = paid daily hours)
    expect(line.overtimePayMinor).toBe(0);
  });

  it("handles zero break minutes", async () => {
    const emp = await makeEmployee(user.id, {
      fullName: "No Break",
      workStartTime: "08:00",
      workEndTime: "17:00",
      breakMinutes: 0,
    });
    await addSalary(emp.id, toMinor(25000), new Date("2026-01-01"));

    // Add attendance with overtime
    await db.attendance.create({
      data: {
        employeeId: emp.id,
        date: new Date("2026-06-15"),
        status: "PRESENT",
        approvalStatus: "APPROVED",
        createdBy: user.id,
        checkInTime: new Date("2026-06-15T08:00:00Z"),
        checkOutTime: new Date("2026-06-15T19:00:00Z"),
        workedHours: 11,
        overtimeHours: 2,
      },
    });

    const { payroll } = await generatePayroll({
      employeeId: emp.id,
      periodStart: new Date("2026-06-01"),
      periodEnd: new Date("2026-06-30"),
      createdById: user.id,
    });

    const line = payroll.lines[0];
    // 08:00 → 17:00 = 9 hours, no break = 9 paid hours
    // Overtime = 2 hours (explicit)
    expect(line.overtimeHours).toBe(2);
    // hourly = round(2500000 / 30 / 9) = 9259
    // ot pay = round(9259 * 1.25 * 2) = 23148
    expect(line.overtimePayMinor).toBe(23148);
  });
});

describe("Skip duplicate drafts on generation", () => {
  let user: any;
  let emp: any;

  beforeEach(async () => {
    user = await makeUser("MANAGER", `skip-mgr-${Date.now()}-${Math.random()}@t.co`);
    emp = await makeEmployee(user.id);
    await addSalary(emp.id, toMinor(25000), new Date("2026-01-01"));
  });

  it("returns existing DRAFT without creating a new one", async () => {
    const first = await generatePayroll({
      employeeId: emp.id,
      periodStart: new Date("2026-06-01"),
      periodEnd: new Date("2026-06-30"),
      createdById: user.id,
    });
    expect(first.created).toBe(true);

    const second = await generatePayroll({
      employeeId: emp.id,
      periodStart: new Date("2026-06-01"),
      periodEnd: new Date("2026-06-30"),
      createdById: user.id,
    });
    expect(second.created).toBe(false);
    expect(second.payroll.id).toBe(first.payroll.id);

    // Only one payroll should exist
    const count = await db.payroll.count({
      where: { employeeId: emp.id },
    });
    expect(count).toBe(1);
  });

  it("returns existing APPROVED as immutable (not created)", async () => {
    const first = await generatePayroll({
      employeeId: emp.id,
      periodStart: new Date("2026-06-01"),
      periodEnd: new Date("2026-06-30"),
      createdById: user.id,
    });
    await approvePayroll(first.payroll.id, user.id);

    const second = await generatePayroll({
      employeeId: emp.id,
      periodStart: new Date("2026-06-01"),
      periodEnd: new Date("2026-06-30"),
      createdById: user.id,
    });
    expect(second.created).toBe(false);
    expect(second.payroll.status).toBe("APPROVED");
  });

  it("can still generate for a different period", async () => {
    await generatePayroll({
      employeeId: emp.id,
      periodStart: new Date("2026-06-01"),
      periodEnd: new Date("2026-06-30"),
      createdById: user.id,
    });

    const july = await generatePayroll({
      employeeId: emp.id,
      periodStart: new Date("2026-07-01"),
      periodEnd: new Date("2026-07-31"),
      createdById: user.id,
    });
    expect(july.created).toBe(true);

    const count = await db.payroll.count({
      where: { employeeId: emp.id },
    });
    expect(count).toBe(2);
  });
});

describe("Delete draft payroll", () => {
  let user: any;
  let emp: any;

  beforeEach(async () => {
    user = await makeUser("MANAGER", `del-mgr-${Date.now()}-${Math.random()}@t.co`);
    emp = await makeEmployee(user.id);
    await addSalary(emp.id, toMinor(25000), new Date("2026-01-01"));
  });

  it("deletes a DRAFT payroll", async () => {
    const { payroll } = await generatePayroll({
      employeeId: emp.id,
      periodStart: new Date("2026-06-01"),
      periodEnd: new Date("2026-06-30"),
      createdById: user.id,
    });

    await deletePayroll(payroll.id, user.id);

    const found = await db.payroll.findUnique({ where: { id: payroll.id } });
    expect(found).toBeNull();

    // PayrollLine should also be gone (cascade)
    const lines = await db.payrollLine.findMany({
      where: { payrollId: payroll.id },
    });
    expect(lines.length).toBe(0);
  });

  it("cannot delete an APPROVED payroll", async () => {
    const { payroll } = await generatePayroll({
      employeeId: emp.id,
      periodStart: new Date("2026-06-01"),
      periodEnd: new Date("2026-06-30"),
      createdById: user.id,
    });
    await approvePayroll(payroll.id, user.id);

    await expect(deletePayroll(payroll.id, user.id)).rejects.toThrow(
      /Only a draft payroll can be deleted/
    );
  });

  it("cannot delete a non-existent payroll", async () => {
    await expect(deletePayroll("nonexistent-id", user.id)).rejects.toThrow(
      /Payroll not found/
    );
  });

  it("allows re-generation after deletion", async () => {
    const { payroll } = await generatePayroll({
      employeeId: emp.id,
      periodStart: new Date("2026-06-01"),
      periodEnd: new Date("2026-06-30"),
      createdById: user.id,
    });

    await deletePayroll(payroll.id, user.id);

    // Should be able to generate again
    const { payroll: newPayroll, created } = await generatePayroll({
      employeeId: emp.id,
      periodStart: new Date("2026-06-01"),
      periodEnd: new Date("2026-06-30"),
      createdById: user.id,
    });
    expect(created).toBe(true);
    expect(newPayroll.id).not.toBe(payroll.id);
  });

  it("creates an audit event on deletion", async () => {
    const { payroll } = await generatePayroll({
      employeeId: emp.id,
      periodStart: new Date("2026-06-01"),
      periodEnd: new Date("2026-06-30"),
      createdById: user.id,
    });

    await deletePayroll(payroll.id, user.id);

    const audit = await db.employeeAuditEvent.findFirst({
      where: { employeeId: emp.id, action: "PAYROLL_DELETED" },
    });
    expect(audit).toBeTruthy();
    expect(audit!.newValue).toBe(payroll.id);
  });
});

describe("Expense deduction toggle", () => {
  let user: any;
  let emp: any;

  beforeEach(async () => {
    user = await makeUser("MANAGER", `exp-mgr-${Date.now()}-${Math.random()}@t.co`);
    emp = await makeEmployee(user.id);
    await addSalary(emp.id, toMinor(25000), new Date("2026-01-01"));
  });

  it("never nets employee-paid expenses into payroll debt", async () => {
    await addEmployeeExpense(emp.id, 5000, user.id);

    const fig = await computePayrollFigures(
      emp.id,
      new Date("2026-06-01"),
      new Date("2026-06-30"),
      toMinor(25000)
    );

    expect(fig.previousDebtMinor).toBe(0);
    expect(fig.netPayableMinor).toBe(toMinor(25000));
    // Reported for display; paid back through the reimbursement flow.
    expect(fig.periodExpensesMinor).toBe(toMinor(5000));
  });

  it("generatePayroll stores deductExpenses=false on PayrollLine", async () => {
    await addEmployeeExpense(emp.id, 5000, user.id);

    const { payroll } = await generatePayroll({
      employeeId: emp.id,
      periodStart: new Date("2026-06-01"),
      periodEnd: new Date("2026-06-30"),
      createdById: user.id,
      deductExpenses: false,
    });

    const line = payroll.lines[0];
    expect(line.deductExpenses).toBe(false);
  });

  it("generatePayroll stores period-scoped expensesPaidMinor", async () => {
    // Expense IN the period
    await addEmployeeExpense(emp.id, 3000, user.id, {
      expenseDate: new Date("2026-06-15"),
    });
    // Expense OUTSIDE the period (before)
    await addEmployeeExpense(emp.id, 2000, user.id, {
      expenseDate: new Date("2026-05-15"),
    });

    const { payroll } = await generatePayroll({
      employeeId: emp.id,
      periodStart: new Date("2026-06-01"),
      periodEnd: new Date("2026-06-30"),
      createdById: user.id,
    });

    const line = payroll.lines[0];
    // Should only count the June expense (3000 AFN = 300000 minor)
    expect(line.expensesPaidMinor).toBe(toMinor(3000));
  });

  it("approvePayroll respects deductExpenses toggle", async () => {
    await addEmployeeExpense(emp.id, 5000, user.id);

    const { payroll } = await generatePayroll({
      employeeId: emp.id,
      periodStart: new Date("2026-06-01"),
      periodEnd: new Date("2026-06-30"),
      createdById: user.id,
      deductExpenses: false,
    });

    const approved = await approvePayroll(payroll.id, user.id);
    const line = approved!.lines[0];
    expect(line.deductExpenses).toBe(false);
  });
});

describe("updatePayrollLine", () => {
  let user: any;
  let emp: any;

  beforeEach(async () => {
    user = await makeUser("MANAGER", `upd-mgr-${Date.now()}-${Math.random()}@t.co`);
    emp = await makeEmployee(user.id);
    await addSalary(emp.id, toMinor(25000), new Date("2026-01-01"));
  });

  it("updates allowances and recalculates gross", async () => {
    const { payroll } = await generatePayroll({
      employeeId: emp.id,
      periodStart: new Date("2026-06-01"),
      periodEnd: new Date("2026-06-30"),
      createdById: user.id,
    });

    const line = payroll.lines[0];
    const originalGross = line.grossPayMinor;

    const updated = await updatePayrollLine(line.id, {
      allowancesMinor: toMinor(5000),
    });

    const updatedLine = updated!.lines[0];
    expect(updatedLine.allowancesMinor).toBe(toMinor(5000));
    expect(updatedLine.grossPayMinor).toBe(originalGross + toMinor(5000));
  });

  it("updates bonuses and recalculates gross", async () => {
    const { payroll } = await generatePayroll({
      employeeId: emp.id,
      periodStart: new Date("2026-06-01"),
      periodEnd: new Date("2026-06-30"),
      createdById: user.id,
    });

    const line = payroll.lines[0];
    const updated = await updatePayrollLine(line.id, {
      bonusesMinor: toMinor(3000),
    });

    const updatedLine = updated!.lines[0];
    expect(updatedLine.bonusesMinor).toBe(toMinor(3000));
    expect(updatedLine.grossPayMinor).toBe(line.grossPayMinor + toMinor(3000));
  });

  it("flips deductExpenses without changing debt", async () => {
    await addEmployeeExpense(emp.id, 5000, user.id);

    const { payroll } = await generatePayroll({
      employeeId: emp.id,
      periodStart: new Date("2026-06-01"),
      periodEnd: new Date("2026-06-30"),
      createdById: user.id,
      deductExpenses: true,
    });

    const line = payroll.lines[0];
    expect(line.deductExpenses).toBe(true);

    const updated = await updatePayrollLine(line.id, {
      deductExpenses: false,
    });

    const updatedLine = updated!.lines[0];
    expect(updatedLine.deductExpenses).toBe(false);
    // Employee-paid expenses are reimbursed outside payroll, so the legacy
    // flag no longer changes debt figures.
    expect(updatedLine.previousDebtMinor).toBe(line.previousDebtMinor);
  });

  it("rejects editing a non-DRAFT payroll line", async () => {
    const { payroll } = await generatePayroll({
      employeeId: emp.id,
      periodStart: new Date("2026-06-01"),
      periodEnd: new Date("2026-06-30"),
      createdById: user.id,
    });

    await approvePayroll(payroll.id, user.id);
    const line = payroll.lines[0];

    await expect(
      updatePayrollLine(line.id, { allowancesMinor: toMinor(1000) })
    ).rejects.toThrow(/Only draft payroll lines can be edited/);
  });

  it("updates overtime hours and recalculates overtime pay", async () => {
    const { payroll } = await generatePayroll({
      employeeId: emp.id,
      periodStart: new Date("2026-06-01"),
      periodEnd: new Date("2026-06-30"),
      createdById: user.id,
    });

    const line = payroll.lines[0];
    const originalOTPay = line.overtimePayMinor;

    const updated = await updatePayrollLine(line.id, {
      overtimeHours: 10,
    });

    const updatedLine = updated!.lines[0];
    expect(updatedLine.overtimeHours).toBe(10);
    expect(updatedLine.overtimePayMinor).toBeGreaterThan(originalOTPay);
  });
});
