import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/lib/db";
import {
  generatePayroll,
  approvePayroll,
  revertPayroll,
  computeAttendanceHours,
} from "@/services/hr.service";
import { toMinor } from "@/lib/money";

async function makeUser(role: string, email: string) {
  return db.user.create({ data: { email, name: email, password: "x", role } });
}

async function makeEmployee(userId: string, extra: any = {}) {
  return db.employee.create({
    data: {
      fullName: extra.fullName ?? "Adv Emp",
      fatherName: "F",
      phoneNumber: "0700000000",
      jobTitle: "Driver",
      department: "LABOR",
      employmentType: "FULL_TIME",
      hireDate: new Date("2026-01-01"),
      status: "ACTIVE",
      createdBy: userId,
      baseSalaryMinor: extra.baseSalaryMinor ?? toMinor(25000),
      workStartTime: extra.workStartTime ?? "07:00",
      workEndTime: extra.workEndTime ?? "18:00",
      breakMinutes: extra.breakMinutes ?? 60,
      ...extra,
    },
  });
}

async function addSalary(empId: string, amount: number) {
  await db.salaryHistory.create({
    data: {
      employeeId: empId,
      amountMinor: toMinor(amount),
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

async function walletBalance(empId: string) {
  const acc = await db.employeeCashAccount.findUnique({ where: { employeeId: empId } });
  return acc?.currentBalance ?? 0;
}

describe("Payroll advance / debt allocation", () => {
  let user: any;
  let emp: any;

  beforeEach(async () => {
    user = await makeUser("MANAGER", `adv-mgr-${Date.now()}-${Math.random()}@t.co`);
    emp = await makeEmployee(user.id);
    await addSalary(emp.id, 25000);
  });

  afterEach(async () => {
    // cleanup handled by test DB reset; nothing needed here
  });

  it("employee who received more than earned owes the company (debt carried forward)", async () => {
    // Ahmed receives 30,000 advance in June
    await addAdvance(emp.id, 30000, new Date("2026-06-10T10:00:00Z"), user);

    const june = await generatePayroll({
      employeeId: emp.id,
      periodStart: new Date("2026-06-01"),
      periodEnd: new Date("2026-06-30"),
      createdById: user.id,
    });
    const juneLine = june.lines[0];

    // Gross 25,000; carried-in debt from 30,000 advance = 30,000.
    // Applied 25,000 of it => net payable -5,000, remaining debt 5,000.
    expect(juneLine.grossPayMinor).toBe(toMinor(25000));
    expect(juneLine.previousDebtMinor).toBe(toMinor(30000));
    expect(juneLine.amountAlreadyReceivedMinor).toBe(toMinor(25000));
    expect(juneLine.netPayableMinor).toBe(-toMinor(5000));
    expect(juneLine.remainingEmployeeDebtMinor).toBe(toMinor(5000));

    const approved = await approvePayroll(june.id, user.id);
    const aLine = approved.lines[0];
    expect(approved.status).toBe("APPROVED");
    // Negative net payable => nothing paid out
    expect(aLine.paymentStatus).toBe("UNPAID");

    // Wallet: +30,000 advance - 25,000 earned = +5,000 owed by employee
    expect(Math.round((await walletBalance(emp.id)) * 100)).toBe(toMinor(5000));

    // Advance allocated to June (FIFO): 25,000 of the 30,000 advance
    const alloc = await db.payrollAdvanceAllocation.aggregate({
      _sum: { amountMinor: true },
      where: { payrollId: june.id },
    });
    expect(alloc._sum.amountMinor).toBe(toMinor(25000));
  });

  it("next month automatically recovers the previous debt", async () => {
    await addAdvance(emp.id, 30000, new Date("2026-06-10T10:00:00Z"), user);

    const june = await generatePayroll({
      employeeId: emp.id,
      periodStart: new Date("2026-06-01"),
      periodEnd: new Date("2026-06-30"),
      createdById: user.id,
    });
    await approvePayroll(june.id, user.id);

    // July salary still 25,000, previous debt 5,000 => net payable 20,000
    const july = await generatePayroll({
      employeeId: emp.id,
      periodStart: new Date("2026-07-01"),
      periodEnd: new Date("2026-07-31"),
      createdById: user.id,
    });
    const julyLine = july.lines[0];
    expect(julyLine.grossPayMinor).toBe(toMinor(25000));
    expect(julyLine.previousDebtMinor).toBe(toMinor(5000));
    expect(julyLine.amountAlreadyReceivedMinor).toBe(toMinor(5000));
    expect(julyLine.netPayableMinor).toBe(toMinor(20000));

    const approvedJuly = await approvePayroll(july.id, user.id);
    expect(approvedJuly.lines[0].paymentStatus).toBe("PAID");

    // Wallet now balanced: +30,000 advance +20,000 salary payment - 50,000 earned = 0
    expect(Math.round((await walletBalance(emp.id)) * 100)).toBe(0);

    // Total advance allocation across both months = full 30,000 (never double counted)
    const totalAlloc = await db.payrollAdvanceAllocation.aggregate({
      _sum: { amountMinor: true },
      where: {
        cashTransaction: { type: "ADVANCE", employeeId: emp.id },
      },
    });
    expect(totalAlloc._sum.amountMinor).toBe(toMinor(30000));
  });

  it("does not allocate an advance twice across payrolls", async () => {
    await addAdvance(emp.id, 10000, new Date("2026-06-10T10:00:00Z"), user);

    const june = await generatePayroll({
      employeeId: emp.id,
      periodStart: new Date("2026-06-01"),
      periodEnd: new Date("2026-06-30"),
      createdById: user.id,
    });
    await approvePayroll(june.id, user.id);

    const july = await generatePayroll({
      employeeId: emp.id,
      periodStart: new Date("2026-07-01"),
      periodEnd: new Date("2026-07-31"),
      createdById: user.id,
    });
    await approvePayroll(july.id, user.id);

    const totalAlloc = await db.payrollAdvanceAllocation.aggregate({
      _sum: { amountMinor: true },
      where: { cashTransaction: { type: "ADVANCE", employeeId: emp.id } },
    });
    // Only 10,000 advance exists; must not exceed that across both payrolls
    expect(totalAlloc._sum.amountMinor).toBe(toMinor(10000));
  });
});

describe("Attendance schedule & overtime", () => {
  let user: any;
  let emp: any;

  beforeEach(async () => {
    user = await makeUser("MANAGER", `sch-mgr-${Date.now()}-${Math.random()}@t.co`);
    // 07:00 - 18:00, 60 min break => 10 paid hours
    emp = await makeEmployee(user.id, { workStartTime: "07:00", workEndTime: "18:00", breakMinutes: 60 });
    await addSalary(emp.id, 25000);
  });

  it("computes worked hours and overtime from clock times", async () => {
    const { workedHours, overtimeHours } = await computeAttendanceHours(
      emp.id,
      "2026-06-15T07:00:00Z",
      "2026-06-15T19:30:00Z"
    );
    expect(workedHours).toBeCloseTo(12.5, 1);
    expect(overtimeHours).toBeCloseTo(2.5, 1);
  });

  it("honors explicit overtime override", async () => {
    const { overtimeHours } = await computeAttendanceHours(
      emp.id,
      "2026-06-15T07:00:00Z",
      "2026-06-15T19:30:00Z",
      3
    );
    expect(overtimeHours).toBe(3);
  });

  it("uses paid daily hours (schedule) for payroll overtime rate", async () => {
    await db.attendance.create({
      data: {
        employeeId: emp.id,
        date: new Date("2026-06-15"),
        status: "PRESENT",
        approvalStatus: "APPROVED",
        createdBy: user.id,
        checkInTime: new Date("2026-06-15T07:00:00Z"),
        checkOutTime: new Date("2026-06-15T19:30:00Z"),
        workedHours: 12.5,
        overtimeHours: 2.5,
      },
    });

    const payroll = await generatePayroll({
      employeeId: emp.id,
      periodStart: new Date("2026-06-01"),
      periodEnd: new Date("2026-06-30"),
      createdById: user.id,
    });
    const line = payroll.lines[0];
    // hourly = round(2,500,000 / 30 / 10) = 8333; ot pay = round(8333 * 1.25 * 2.5) = 26042
    expect(line.overtimeHours).toBe(2.5);
    expect(line.overtimePayMinor).toBe(26041);
    expect(line.grossPayMinor).toBe(toMinor(25000) + 26041);
  });
});

describe("Payroll correction (revert)", () => {
  let user: any;
  let emp: any;

  beforeEach(async () => {
    user = await makeUser("MANAGER", `rev-mgr-${Date.now()}-${Math.random()}@t.co`);
    emp = await makeEmployee(user.id);
    await addSalary(emp.id, 25000);
  });

  it("revert returns an approved payroll to DRAFT and removes settlement", async () => {
    const payroll = await generatePayroll({
      employeeId: emp.id,
      periodStart: new Date("2026-06-01"),
      periodEnd: new Date("2026-06-30"),
      createdById: user.id,
    });
    const approved = await approvePayroll(payroll.id, user.id);
    expect(approved.status).toBe("APPROVED");

    // A salary payment was created and linked to the payroll.
    const paidBefore = await db.cashTransaction.count({
      where: { payrollId: payroll.id, type: "SALARY_PAYMENT" },
    });
    expect(paidBefore).toBe(1);

    const reverted = await revertPayroll(payroll.id, user.id, "wrong amount");
    expect(reverted.status).toBe("DRAFT");
    expect(reverted.revertedAt).toBeTruthy();
    expect(reverted.reversalReason).toBe("wrong amount");

    // Settlement removed; can be regenerated and re-approved.
    const paidAfter = await db.cashTransaction.count({
      where: { payrollId: payroll.id, type: "SALARY_PAYMENT" },
    });
    expect(paidAfter).toBe(0);

    const regen = await generatePayroll({
      employeeId: emp.id,
      periodStart: new Date("2026-06-01"),
      periodEnd: new Date("2026-06-30"),
      createdById: user.id,
    });
    const reApproved = await approvePayroll(regen.id, user.id);
    expect(reApproved.status).toBe("APPROVED");
  });

  it("cannot revert a draft payroll", async () => {
    const payroll = await generatePayroll({
      employeeId: emp.id,
      periodStart: new Date("2026-06-01"),
      periodEnd: new Date("2026-06-30"),
      createdById: user.id,
    });
    await expect(revertPayroll(payroll.id, user.id)).rejects.toThrow();
  });
});
