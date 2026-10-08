import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import {
  generatePayroll,
  approvePayroll,
  revertPayroll,
  recordPayrollPayment,
} from "@/services/hr.service";
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

describe("Paying payroll from a company wallet", () => {
  let user: any;
  let emp: any;

  beforeEach(async () => {
    user = await makeUser("MANAGER", `wallet-mgr-${Date.now()}-${Math.random()}@t.co`);
    emp = await makeEmployee(user.id);
    await addSalary(emp.id);
  });

  it("approval moves no money; the payment deducts the wallet and records the expense", async () => {
    const wallet = await companyWalletService.create({
      name: "Main Bank",
      type: "BANK",
      currency: "AFN",
      initialBalance: 100000,
      createdBy: user.id,
    });

    const { payroll } = await generatePayroll({
      employeeId: emp.id,
      periodStart: new Date("2026-06-01"),
      periodEnd: new Date("2026-06-30"),
      createdById: user.id,
      walletId: wallet.id,
    });
    expect(payroll.walletId).toBe(wallet.id);

    await approvePayroll(payroll.id, user.id);
    // Approval only accrues the salary: nothing left the wallet yet.
    expect((await companyWalletService.get(wallet.id))!.balance).toBe(100000);
    expect(
      await db.accountingEntry.findFirst({
        where: { payrollId: payroll.id, type: "PAYROLL_APPROVAL" },
      })
    ).toBeTruthy();

    await recordPayrollPayment(payroll.id, user.id, {
      paymentMethod: "COMPANY_WALLET",
      walletId: wallet.id,
    });

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

    // Payment accounting entry (§2 action 9).
    const entry = await db.accountingEntry.findFirst({
      where: { payrollId: payroll.id, type: "PAYROLL_PAYMENT" },
    });
    expect(entry).toBeTruthy();
    expect(entry!.amountMinor).toBe(-toMinor(25000));
  });

  it("falls back to the wallet stored on the payroll when the payment omits one", async () => {
    const wallet = await companyWalletService.create({
      name: "Main Bank",
      currency: "AFN",
      initialBalance: 100000,
      createdBy: user.id,
    });

    const { payroll } = await generatePayroll({
      employeeId: emp.id,
      periodStart: new Date("2026-06-01"),
      periodEnd: new Date("2026-06-30"),
      createdById: user.id,
      walletId: wallet.id,
    });

    await approvePayroll(payroll.id, user.id);
    await recordPayrollPayment(payroll.id, user.id, {
      paymentMethod: "COMPANY_WALLET",
    });

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

    const { payroll } = await generatePayroll({
      employeeId: emp.id,
      periodStart: new Date("2026-06-01"),
      periodEnd: new Date("2026-06-30"),
      createdById: user.id,
      walletId: wallet.id,
    });

    await approvePayroll(payroll.id, user.id);

    await expect(
      recordPayrollPayment(payroll.id, user.id, {
        paymentMethod: "COMPANY_WALLET",
        walletId: wallet.id,
      })
    ).rejects.toThrow(/Insufficient balance/);

    const after = await companyWalletService.get(wallet.id);
    expect(after!.balance).toBe(10000);
    const unchanged = await db.payroll.findUnique({ where: { id: payroll.id } });
    expect(unchanged!.status).toBe("APPROVED");
    expect(unchanged!.totalPaidMinor).toBe(0);
    const expense = await db.expense.findFirst({ where: { payrollId: payroll.id } });
    expect(expense).toBeNull();
    const payment = await db.payrollPayment.count({ where: { payrollId: payroll.id } });
    expect(payment).toBe(0);
  });

  it("revert preserves the payment, the wallet deduction and the expense", async () => {
    const wallet = await companyWalletService.create({
      name: "Main Bank",
      currency: "AFN",
      initialBalance: 100000,
      createdBy: user.id,
    });

    const { payroll } = await generatePayroll({
      employeeId: emp.id,
      periodStart: new Date("2026-06-01"),
      periodEnd: new Date("2026-06-30"),
      createdById: user.id,
      walletId: wallet.id,
    });
    await approvePayroll(payroll.id, user.id);
    await recordPayrollPayment(payroll.id, user.id, {
      amountMinor: toMinor(15000),
      paymentMethod: "COMPANY_WALLET",
      walletId: wallet.id,
    });
    expect((await companyWalletService.get(wallet.id))!.balance).toBe(85000);

    const reverted = await revertPayroll(payroll.id, user.id, "Correction");
    expect(reverted!.status).toBe("DRAFT");

    // The recorded payment is history: wallet keeps the deduction, the expense
    // and the cash transaction stay, only the approval is undone.
    const after = await companyWalletService.get(wallet.id);
    expect(after!.balance).toBe(85000);
    const reversal = await db.walletTransaction.findFirst({
      where: { walletId: wallet.id, type: "REVERSAL", payrollId: payroll.id },
    });
    expect(reversal).toBeNull();
    const expense = await db.expense.findFirst({ where: { payrollId: payroll.id } });
    expect(expense).toBeTruthy();

    const accountingReversal = await db.accountingEntry.findFirst({
      where: { payrollId: payroll.id, type: "PAYROLL_REVERSAL" },
    });
    expect(accountingReversal).toBeTruthy();
  });

  it("still works without a wallet (no deduction, no walletId on records)", async () => {
    const { payroll } = await generatePayroll({
      employeeId: emp.id,
      periodStart: new Date("2026-06-01"),
      periodEnd: new Date("2026-06-30"),
      createdById: user.id,
    });

    await approvePayroll(payroll.id, user.id);
    await recordPayrollPayment(payroll.id, user.id, { paymentMethod: "CASH" });

    const expense = await db.expense.findFirst({ where: { payrollId: payroll.id } });
    expect(expense).toBeTruthy();
    expect(expense!.walletId).toBeNull();
    const walletTxCount = await db.walletTransaction.count({
      where: { payrollId: payroll.id },
    });
    expect(walletTxCount).toBe(0);
  });
});
