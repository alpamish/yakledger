import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { getEmployeeFinancialSummary } from "@/services/hr.service";
import { toMinor } from "@/lib/money";

async function makeUser(role: string, email: string) {
  return db.user.create({ data: { email, name: email, password: "x", role } });
}

async function makeEmployee(userId: string) {
  return db.employee.create({
    data: {
      fullName: "Summary Emp",
      fatherName: "F",
      phoneNumber: "0700000002",
      jobTitle: "Driver",
      department: "LABOR",
      employmentType: "FULL_TIME",
      hireDate: new Date("2026-01-01"),
      status: "ACTIVE",
      createdBy: userId,
      salary: 25000,
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

async function addAttendance(empId: string, date: string, status: string, userId: string) {
  await db.attendance.create({
    data: {
      employeeId: empId,
      date: new Date(date),
      status,
      overtimeHours: 0,
      createdBy: userId,
      approvalStatus: "APPROVED",
    },
  });
}

describe("Employee financial summary", () => {
  let user: any;
  let emp: any;

  beforeEach(async () => {
    user = await makeUser("MANAGER", `summary-mgr-${Date.now()}-${Math.random()}@t.co`);
    emp = await makeEmployee(user.id);
    await addSalary(emp.id);
  });

  it("counts approved attendance and reports salary + advances", async () => {
    await addAttendance(emp.id, "2026-08-03", "PRESENT", user.id);
    await addAttendance(emp.id, "2026-08-04", "PRESENT", user.id);
    await addAttendance(emp.id, "2026-08-05", "PRESENT", user.id);
    await addAttendance(emp.id, "2026-08-06", "HALF_DAY", user.id);

    await db.cashTransaction.create({
      data: {
        employeeId: emp.id,
        type: "SALARY_PAYMENT",
        amount: 2500,
        note: "Salary",
        approvalStatus: "APPROVED",
        createdBy: user.id,
        approvedById: user.id,
        approvedAt: new Date("2026-08-07"),
      },
    });
    await db.cashTransaction.create({
      data: {
        employeeId: emp.id,
        type: "ADVANCE",
        amount: 500,
        approvalStatus: "APPROVED",
        createdBy: user.id,
        approvedById: user.id,
        approvedAt: new Date("2026-08-02"),
      },
    });

    const s = await getEmployeeFinancialSummary(emp.id);

    expect(s.daysWorked).toBe(3.5);
    // (25,000 / 30) * 3.5
    expect(s.earnedSalary).toBeCloseTo(2916.67, 1);
    expect(s.salaryPaid).toBe(2500);
    expect(s.advancesReceived).toBe(500);
    expect(s.expensesPaidTo).toBe(0);
    expect(s.totalReceived).toBe(3000);
    expect(s.totalPaid).toBe(2500);
    // 2916.67 + 0 - 3000 = -83.33 => employee owes the company.
    expect(s.outstanding).toBeCloseTo(-83.33, 1);
  });

  it("includes approved expenses paid to the employee and ignores payroll-generated ones", async () => {
    await addAttendance(emp.id, "2026-08-03", "PRESENT", user.id);

    // A manually approved expense paid to the employee (e.g. a reward).
    await db.expense.create({
      data: {
        title: "Reward",
        category: "REWARD",
        amount: 1000,
        paymentMethod: "CASH",
        paidTo: emp.fullName,
        paidBy: "Manager",
        expenseDate: new Date("2026-08-04"),
        paidToId: emp.id,
        createdBy: user.id,
        approvalStatus: "APPROVED",
      },
    });
    // A payroll-generated salary expense must NOT double count salary.
    const payroll = await db.payroll.create({
      data: {
        employeeId: emp.id,
        periodStart: new Date("2026-08-01"),
        periodEnd: new Date("2026-08-31"),
        currency: "AFN",
        status: "APPROVED",
        createdById: user.id,
      },
    });
    await db.expense.create({
      data: {
        title: "Salary payment",
        category: "SALARY",
        amount: 2500,
        paymentMethod: "CASH",
        paidTo: emp.fullName,
        paidBy: "Manager",
        expenseDate: new Date("2026-08-05"),
        paidToId: emp.id,
        createdBy: user.id,
        approvalStatus: "APPROVED",
        payrollId: payroll.id,
      },
    });

    const s = await getEmployeeFinancialSummary(emp.id);

    expect(s.expensesPaidTo).toBe(1000);
    expect(s.salaryPaid).toBe(0);
    // Only the reward is counted; the payroll-linked salary expense is excluded.
    expect(s.totalPaid).toBe(1000);
    expect(s.totalReceived).toBe(1000);
  });

  it("counts overtime hours and pay", async () => {
    await db.attendance.create({
      data: {
        employeeId: emp.id,
        date: new Date("2026-08-03"),
        status: "PRESENT",
        overtimeHours: 2,
        createdBy: user.id,
        approvalStatus: "APPROVED",
      },
    });
    await addAttendance(emp.id, "2026-08-04", "PRESENT", user.id);

    const s = await getEmployeeFinancialSummary(emp.id);

    expect(s.totalOvertimeHours).toBe(2);
    // hourly = (25000/30)/9 = 92.59; pay = 2 * 92.59 * 1.25 = 231.48
    expect(s.overtimePay).toBeCloseTo(231.48, 1);
  });
});