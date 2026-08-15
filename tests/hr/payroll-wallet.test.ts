import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { generatePayroll, approvePayroll, revertPayroll } from "@/services/hr.service";
import { companyWalletService } from "@/services/company-wallet.service";
import { toMinor } from "@/lib/money";

async function makeUser(role: string, email: string) {
  return db.user.create({ data: { email, name: email, password: "x", role } });
}

async function makeEmployee(userId: string) {
  return db.employee.create({
    data: {
      fullName: "Wallet Emp",
      fatherName: "F",
      phoneNumber: "0700000001",
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

describe("Payroll from company wallet", () => {
  let user: any;
  let emp: any;

  beforeEach(async () => {
    user = await makeUser("MANAGER", `wallet-mgr-${Date.now()}-${Math.random()}@t.co`);
    emp = await makeEmployee(user.id);
    await addSalary(emp.id);
  });

  it("deducts the payout from the selected wallet and records the salary expense", async () => {
    const wallet = await companyWalletService.create({
      name: "Main Bank",
      type: "BANK",
      currency: "AFN",
      initialBalance: 100000,
      createdBy: user.id,
    });

    const payroll = await generatePayroll({
      employeeId: emp.id,
      periodStart: new Date("2026-06-01"),
      periodEnd: new Date("2026-06-30"),
      createdById: user.id,
      walletId: wallet.id,
    });
    expect(payroll.walletId).toBe(wallet.id);

    await approvePayroll(payroll.id, user.id, { walletId: wallet.id });

    const after = await companyWalletService.get(wallet.id);
    // 100,000 - 25,000 salary
    expect(after!.balance).toBe(75000);

    const tx = await db.walletTransaction.findFirst({
      where: { walletId: wallet.id, type: "PAYROLL", payrollId: payroll.id },
    });
    expect(tx).toBeTruthy();
    expect(tx!.amount).toBe(-25000);

    const payment = await db.cashTransaction.findFirst({
      where: { payrollId: payroll.id, type: "SALARY_PAYMENT" },
    });
    expect(payment!.walletId).toBe(wallet.id);

    const expense = await db.expense.findFirst({ where: { payrollId: payroll.id } });
    expect(expense).toBeTruthy();
    expect(expense!.category).toBe("SALARY");
    expect(expense!.amount).toBe(25000);
    expect(expense!.approvalStatus).toBe("APPROVED");
    expect(expense!.walletId).toBe(wallet.id);
    expect(expense!.paidToId).toBe(emp.id);
  });

  it("uses the wallet stored on the payroll draft when approval omits one", async () => {
    const wallet = await companyWalletService.create({
      name: "Main Bank",
      currency: "AFN",
      initialBalance: 100000,
      createdBy: user.id,
    });

    const payroll = await generatePayroll({
      employeeId: emp.id,
      periodStart: new Date("2026-06-01"),
      periodEnd: new Date("2026-06-30"),
      createdById: user.id,
      walletId: wallet.id,
    });

    await approvePayroll(payroll.id, user.id);

    const after = await companyWalletService.get(wallet.id);
    expect(after!.balance).toBe(75000);
  });

  it("throws when the selected wallet has insufficient balance", async () => {
    const wallet = await companyWalletService.create({
      name: "Thin Wallet",
      currency: "AFN",
      initialBalance: 10000,
      createdBy: user.id,
    });

    const payroll = await generatePayroll({
      employeeId: emp.id,
      periodStart: new Date("2026-06-01"),
      periodEnd: new Date("2026-06-30"),
      createdById: user.id,
      walletId: wallet.id,
    });

    await expect(approvePayroll(payroll.id, user.id)).rejects.toThrow(
      /Insufficient balance/
    );

    const after = await companyWalletService.get(wallet.id);
    expect(after!.balance).toBe(10000);
    const unchanged = await db.payroll.findUnique({ where: { id: payroll.id } });
    expect(unchanged!.status).toBe("DRAFT");
    const expense = await db.expense.findFirst({ where: { payrollId: payroll.id } });
    expect(expense).toBeNull();
  });

  it("revert restores the wallet balance and removes the expense", async () => {
    const wallet = await companyWalletService.create({
      name: "Main Bank",
      currency: "AFN",
      initialBalance: 100000,
      createdBy: user.id,
    });

    const payroll = await generatePayroll({
      employeeId: emp.id,
      periodStart: new Date("2026-06-01"),
      periodEnd: new Date("2026-06-30"),
      createdById: user.id,
      walletId: wallet.id,
    });
    await approvePayroll(payroll.id, user.id, { walletId: wallet.id });
    expect((await companyWalletService.get(wallet.id))!.balance).toBe(75000);

    await revertPayroll(payroll.id, user.id, "Correction");

    const after = await companyWalletService.get(wallet.id);
    expect(after!.balance).toBe(100000);
    const reversal = await db.walletTransaction.findFirst({
      where: { walletId: wallet.id, type: "REVERSAL", payrollId: payroll.id },
    });
    expect(reversal).toBeTruthy();
    expect(reversal!.amount).toBe(25000);
    const expense = await db.expense.findFirst({ where: { payrollId: payroll.id } });
    expect(expense).toBeNull();
  });

  it("still works without a wallet (no deduction, no walletId on records)", async () => {
    const payroll = await generatePayroll({
      employeeId: emp.id,
      periodStart: new Date("2026-06-01"),
      periodEnd: new Date("2026-06-30"),
      createdById: user.id,
    });

    await approvePayroll(payroll.id, user.id);

    const expense = await db.expense.findFirst({ where: { payrollId: payroll.id } });
    expect(expense).toBeTruthy();
    expect(expense!.walletId).toBeNull();
    const walletTxCount = await db.walletTransaction.count({
      where: { payrollId: payroll.id },
    });
    expect(walletTxCount).toBe(0);
  });
});