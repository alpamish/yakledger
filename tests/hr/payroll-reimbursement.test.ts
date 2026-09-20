import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { generatePayroll, approvePayroll } from "@/services/hr.service";
import { toMinor } from "@/lib/money";

async function makeUser(role: string, email: string) {
  return db.user.create({ data: { email, name: email, password: "x", role } });
}

async function makeEmployee(userId: string) {
  return db.employee.create({
    data: {
      fullName: "Reimb Emp",
      fatherName: "F",
      phoneNumber: "0700000000",
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

// An approved employee-paid company expense reduces the employee's wallet
// debt directly (derived from the approved expense); no DEBIT record is needed.
async function addEmployeePaidExpense(empId: string, user: any, amount: number, createdAt: Date) {
  await db.expense.create({
    data: {
      title: "Employee paid",
      category: "FUEL",
      amount,
      paymentMethod: "CASH",
      paidTo: "Company",
      paidBy: "Employee",
      expenseDate: createdAt,
      paidById: empId,
      createdBy: user.id,
      approvalStatus: "APPROVED",
    },
  });
}

async function addAdvance(empId: string, amount: number, createdAt: Date, user: any) {
  return db.cashTransaction.create({
    data: {
      employeeId: empId,
      type: "ADVANCE",
      amount,
      approvalStatus: "APPROVED",
      createdBy: user.id,
      approvedById: user.id,
      approvedAt: createdAt,
      createdAt,
    },
  });
}

async function walletBalance(empId: string) {
  const acc = await db.employeeCashAccount.findUnique({ where: { employeeId: empId } });
  return acc?.currentBalance ?? 0;
}

describe("Payroll reimbursements (approved employee-paid expenses)", () => {
  let user: any;
  let emp: any;

  beforeEach(async () => {
    user = await makeUser("MANAGER", `reimb-mgr-${Date.now()}-${Math.random()}@t.co`);
    emp = await makeEmployee(user.id);
    await addSalary(emp.id);
    // Real flows create the account before ledger activity (via
    // getOrCreateAccount); seed here so approve's recompute updates it.
    await db.employeeCashAccount.create({ data: { employeeId: emp.id } });
  });

  it("settles an approved employee-paid expense through net payable", async () => {
    await addEmployeePaidExpense(emp.id, user, 1000, new Date("2026-06-10"));

    const { payroll } = await generatePayroll({
      employeeId: emp.id,
      periodStart: new Date("2026-06-01"),
      periodEnd: new Date("2026-06-30"),
      createdById: user.id,
    });
    const line = payroll.lines[0];
    // Company owes employee 1000 => previous debt is -1000.
    expect(line.previousDebtMinor).toBe(-toMinor(1000));
    // Salary 25,000 + reimbursement 1,000.
    expect(line.netPayableMinor).toBe(toMinor(26000));
    expect(line.netPayMinor).toBe(toMinor(26000));

    const approved = await approvePayroll(payroll.id, user.id);
    expect(approved.lines[0].paymentStatus).toBe("PAID");
    const pay = await db.cashTransaction.findFirst({
      where: { payrollId: payroll.id, type: "SALARY_PAYMENT" },
    });
    expect(pay!.amount).toBe(26000);
    // +26,000 payment - 1,000 debit - 25,000 earned = 0
    expect(Math.round((await walletBalance(emp.id)) * 100)).toBe(0);
  });

  it("does not reimburse the same expense twice across payrolls", async () => {
    await addEmployeePaidExpense(emp.id, user, 1000, new Date("2026-06-10"));

    const { payroll: june } = await generatePayroll({
      employeeId: emp.id,
      periodStart: new Date("2026-06-01"),
      periodEnd: new Date("2026-06-30"),
      createdById: user.id,
    });
    await approvePayroll(june.id, user.id);
    // Stamp the salary payment inside the June period so the July debt
    // calculation counts it as received.
    await db.cashTransaction.updateMany({
      where: { payrollId: june.id, type: "SALARY_PAYMENT" },
      data: { createdAt: new Date("2026-06-30T12:00:00Z") },
    });

    // July: previous debt = 26,000 received - 25,000 earned - 1,000 debit = 0.
    const { payroll: july } = await generatePayroll({
      employeeId: emp.id,
      periodStart: new Date("2026-07-01"),
      periodEnd: new Date("2026-07-31"),
      createdById: user.id,
    });
    const julyLine = july.lines[0];
    expect(julyLine.previousDebtMinor).toBe(0);
    expect(julyLine.netPayableMinor).toBe(toMinor(25000));

    const approvedJuly = await approvePayroll(july.id, user.id);
    const pay = await db.cashTransaction.findFirst({
      where: { payrollId: july.id, type: "SALARY_PAYMENT" },
    });
    // Plain salary, no double reimbursement.
    expect(pay!.amount).toBe(25000);
    expect(Math.round((await walletBalance(emp.id)) * 100)).toBe(0);
  });

  it("reimbursement is still settled when an advance debt consumes the salary", async () => {
    await addAdvance(emp.id, 30000, new Date("2026-06-10T10:00:00Z"), user);
    await addEmployeePaidExpense(emp.id, user, 1000, new Date("2026-06-12"));

    const { payroll } = await generatePayroll({
      employeeId: emp.id,
      periodStart: new Date("2026-06-01"),
      periodEnd: new Date("2026-06-30"),
      createdById: user.id,
    });
    const line = payroll.lines[0];
    // 30,000 advance - 1,000 reimbursement owed to employee = 29,000 debt.
    expect(line.previousDebtMinor).toBe(toMinor(29000));
    // Salary 25,000 is fully consumed by debt; employee still owes 4,000.
    expect(line.netPayableMinor).toBe(-toMinor(4000));
    expect(line.remainingEmployeeDebtMinor).toBe(toMinor(4000));
    expect(line.netPayMinor).toBe(0);

    const approved = await approvePayroll(payroll.id, user.id);
    expect(approved.lines[0].paymentStatus).toBe("UNPAID");
    // Wallet: +30,000 advance - 1,000 debit - 25,000 earned = +4,000 owed.
    expect(Math.round((await walletBalance(emp.id)) * 100)).toBe(toMinor(4000));
  });

  it("pays out a large employee-paid expense above the salary in full", async () => {
    await addEmployeePaidExpense(emp.id, user, 50000, new Date("2026-06-10"));

    const { payroll } = await generatePayroll({
      employeeId: emp.id,
      periodStart: new Date("2026-06-01"),
      periodEnd: new Date("2026-06-30"),
      createdById: user.id,
    });
    const line = payroll.lines[0];
    expect(line.previousDebtMinor).toBe(-toMinor(50000));
    expect(line.netPayableMinor).toBe(toMinor(75000));

    const approved = await approvePayroll(payroll.id, user.id);
    const pay = await db.cashTransaction.findFirst({
      where: { payrollId: payroll.id, type: "SALARY_PAYMENT" },
    });
    expect(pay!.amount).toBe(75000);
    expect(Math.round((await walletBalance(emp.id)) * 100)).toBe(0);
  });
});