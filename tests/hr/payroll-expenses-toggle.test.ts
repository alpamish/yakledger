import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import {
  generatePayroll,
  approvePayroll,
  updatePayrollLine,
  getPeriodExpensesMinor,
} from "@/services/hr.service";
import { toMinor } from "@/lib/money";

async function makeUser(role: string, email: string) {
  return db.user.create({ data: { email, name: email, password: "x", role } });
}

async function makeEmployee(userId: string) {
  return db.employee.create({
    data: {
      fullName: "Expense Emp",
      fatherName: "F",
      phoneNumber: "0700000002",
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

async function addEmployeePaidExpense(
  empId: string,
  user: any,
  amount: number,
  expenseDate: Date,
  opts?: { approvalStatus?: string; reimbursedAt?: Date }
) {
  return db.expense.create({
    data: {
      title: "Employee paid",
      category: "FUEL",
      amount,
      paymentMethod: "CASH",
      paidTo: "Company",
      paidBy: "Employee",
      expenseDate,
      paidById: empId,
      createdBy: user.id,
      approvalStatus: opts?.approvalStatus ?? "APPROVED",
      ...(opts?.reimbursedAt ? { reimbursedAt: opts.reimbursedAt } : {}),
    },
  });
}

describe("Including employee-paid expenses in payroll (deductExpenses)", () => {
  let user: any;
  let emp: any;
  const periodStart = new Date("2026-06-01");
  const periodEnd = new Date("2026-06-30");

  beforeEach(async () => {
    user = await makeUser("MANAGER", `exp-mgr-${Date.now()}-${Math.random()}@t.co`);
    emp = await makeEmployee(user.id);
    await addSalary(emp.id);
    // Real advance flow creates the account before ledger activity; approve's
    // balance recompute expects it to exist.
    await db.employeeCashAccount.create({ data: { employeeId: emp.id } });
    // Carried-in debt: 10,000 AFN received before/at mid-June.
    await addAdvance(emp.id, 10000, new Date("2026-06-10T10:00:00Z"), user);
  });

  it("when opted in, outstanding expenses offset the employee's debt", async () => {
    await addEmployeePaidExpense(emp.id, user, 3000, new Date("2026-06-15"));

    const { payroll } = await generatePayroll({
      employeeId: emp.id,
      periodStart,
      periodEnd,
      createdById: user.id,
      deductExpenses: true,
    });
    const line = payroll.lines[0];

    // Gross 25,000; debt 10,000; expenses 3,000 net against the debt:
    // net = 25,000 - (10,000 - 3,000) = 18,000.
    expect(line.deductExpenses).toBe(true);
    expect(line.expensesPaidMinor).toBe(toMinor(3000));
    expect(line.previousDebtMinor).toBe(toMinor(10000));
    expect(line.netPayableMinor).toBe(toMinor(18000));
    expect(line.amountAlreadyReceivedMinor).toBe(toMinor(7000));
    expect(line.remainingEmployeeDebtMinor).toBe(0);
  });

  it("deductExpenses: false keeps debt untouched but still reports the total", async () => {
    await addEmployeePaidExpense(emp.id, user, 3000, new Date("2026-06-15"));

    const { payroll } = await generatePayroll({
      employeeId: emp.id,
      periodStart,
      periodEnd,
      createdById: user.id,
      deductExpenses: false,
    });
    const line = payroll.lines[0];

    expect(line.deductExpenses).toBe(false);
    expect(line.expensesPaidMinor).toBe(toMinor(3000));
    // Net = 25,000 - 10,000, no expense offset.
    expect(line.netPayableMinor).toBe(toMinor(15000));
    expect(line.amountAlreadyReceivedMinor).toBe(toMinor(10000));
  });

  it("caps the offset at what the employee actually owes", async () => {
    // Expense larger than the outstanding debt: offset stops at the debt so
    // the payroll can never pay out more than gross; the rest is reimbursed
    // outside payroll.
    await addEmployeePaidExpense(emp.id, user, 15000, new Date("2026-06-15"));

    const { payroll } = await generatePayroll({
      employeeId: emp.id,
      periodStart,
      periodEnd,
      createdById: user.id,
      deductExpenses: true,
    });
    const line = payroll.lines[0];

    expect(line.grossPayMinor).toBe(toMinor(25000));
    expect(line.netPayableMinor).toBe(toMinor(25000)); // debt fully offset
    expect(line.expensesPaidMinor).toBe(toMinor(15000)); // uncapped, informational
    expect(line.amountAlreadyReceivedMinor).toBe(0);
    expect(line.remainingEmployeeDebtMinor).toBe(0);
  });

  it("excludes non-approved and already-reimbursed expenses", async () => {
    await addEmployeePaidExpense(emp.id, user, 3000, new Date("2026-06-05"), {
      reimbursedAt: new Date("2026-06-20"),
    });
    await addEmployeePaidExpense(emp.id, user, 1000, new Date("2026-06-06"), {
      approvalStatus: "PENDING",
    });
    await addEmployeePaidExpense(emp.id, user, 2000, new Date("2026-06-07"));

    const { payroll } = await generatePayroll({
      employeeId: emp.id,
      periodStart,
      periodEnd,
      createdById: user.id,
      deductExpenses: true,
    });
    const line = payroll.lines[0];

    // Only the 2,000 approved and unreimbursed expense counts.
    expect(line.expensesPaidMinor).toBe(toMinor(2000));
    expect(line.netPayableMinor).toBe(toMinor(17000)); // 25,000 - (10,000 - 2,000)

    const { totalMinor, count } = await getPeriodExpensesMinor(
      emp.id,
      periodStart,
      periodEnd
    );
    expect(totalMinor).toBe(toMinor(2000));
    expect(count).toBe(1);
  });

  it("approval recomputes with the stored toggle and allocates advances accordingly", async () => {
    await addEmployeePaidExpense(emp.id, user, 3000, new Date("2026-06-15"));

    const { payroll } = await generatePayroll({
      employeeId: emp.id,
      periodStart,
      periodEnd,
      createdById: user.id,
      deductExpenses: true,
    });
    const approved = await approvePayroll(payroll.id, user.id);
    const line = approved.lines[0];

    expect(approved.status).toBe("APPROVED");
    expect(line.netPayableMinor).toBe(toMinor(18000));
    // Advances allocated only up to the adjusted debt (10,000 - 3,000).
    expect(line.amountAlreadyReceivedMinor).toBe(toMinor(7000));
    expect(line.advancesDeductedMinor).toBe(toMinor(7000));
    expect(line.expensesPaidMinor).toBe(toMinor(3000));
  });

  it("toggling the flag on a draft recomputes the figures", async () => {
    await addEmployeePaidExpense(emp.id, user, 3000, new Date("2026-06-15"));

    const { payroll } = await generatePayroll({
      employeeId: emp.id,
      periodStart,
      periodEnd,
      createdById: user.id,
      deductExpenses: false,
    });
    expect(payroll.lines[0].netPayableMinor).toBe(toMinor(15000));

    const updated = await updatePayrollLine(
      payroll.lines[0].id,
      { deductExpenses: true },
      user.id
    );
    expect(updated!.lines[0].deductExpenses).toBe(true);
    expect(updated!.lines[0].netPayableMinor).toBe(toMinor(18000));
  });
});
