import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { generatePayroll, approvePayroll, recordPayrollPayment } from "@/services/hr.service";
import {
  listReimbursements,
  recordReimbursement,
} from "@/services/reimbursement.service";
import { walletService } from "@/services/wallet.service";
import { companyWalletService } from "@/services/company-wallet.service";
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

async function addEmployeePaidExpense(
  empId: string,
  user: any,
  amount: number,
  createdAt: Date,
  approvalStatus = "APPROVED"
) {
  return db.expense.create({
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
      approvalStatus,
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

async function cashAccountBalance(empId: string) {
  const acc = await db.employeeCashAccount.findUnique({ where: { employeeId: empId } });
  return acc?.currentBalance ?? null;
}

describe("Reimbursements stay outside salary payroll (§2 action 7)", () => {
  let user: any;
  let emp: any;

  beforeEach(async () => {
    user = await makeUser("MANAGER", `reimb-mgr-${Date.now()}-${Math.random()}@t.co`);
    emp = await makeEmployee(user.id);
    await addSalary(emp.id);
    await db.employeeCashAccount.create({ data: { employeeId: emp.id } });
  });

  it("does not change payroll figures; salary pays net salary only", async () => {
    await addEmployeePaidExpense(emp.id, user, 1000, new Date("2026-06-10"));

    const { payroll } = await generatePayroll({
      employeeId: emp.id,
      periodStart: new Date("2026-06-01"),
      periodEnd: new Date("2026-06-30"),
      createdById: user.id,
    });
    const line = payroll.lines[0];
    // Reimbursement is a separate liability: payroll debt is unaffected.
    expect(line.previousDebtMinor).toBe(0);
    expect(line.netPayableMinor).toBe(toMinor(25000));
    expect(line.netPayMinor).toBe(toMinor(25000));
    // The period total is still reported, for information only.
    expect(line.expensesPaidMinor).toBe(toMinor(1000));

    await approvePayroll(payroll.id, user.id);
    const paid = await recordPayrollPayment(payroll.id, user.id, {
      paymentMethod: "CASH",
    });
    expect(paid!.lines[0].paymentStatus).toBe("PAID");
    const pay = await db.cashTransaction.findFirst({
      where: { payrollId: payroll.id, type: "SALARY_PAYMENT" },
    });
    expect(pay!.amount).toBe(25000);
  });

  it("keeps an advance-only payroll figure untouched by employee expenses", async () => {
    await addAdvance(emp.id, 30000, new Date("2026-06-10T10:00:00Z"), user);
    await addEmployeePaidExpense(emp.id, user, 1000, new Date("2026-06-12"));

    const { payroll } = await generatePayroll({
      employeeId: emp.id,
      periodStart: new Date("2026-06-01"),
      periodEnd: new Date("2026-06-30"),
      createdById: user.id,
    });
    const line = payroll.lines[0];
    // 30,000 advance debt — the 1,000 expense is not netted in.
    expect(line.previousDebtMinor).toBe(toMinor(30000));
    expect(line.netPayableMinor).toBe(-toMinor(5000));
    expect(line.remainingEmployeeDebtMinor).toBe(toMinor(5000));
    expect(line.netPayMinor).toBe(0);
  });

  it("requires approval before the reimbursement can be paid", async () => {
    const expense = await addEmployeePaidExpense(
      emp.id,
      user,
      1000,
      new Date("2026-06-10"),
      "PENDING"
    );

    await expect(
      recordReimbursement({
        employeeId: emp.id,
        expenseIds: [expense.id],
        paymentMethod: "CASH",
        paidById: user.id,
      })
    ).rejects.toThrow(/approval/i);

    const refreshed = await db.expense.findUnique({ where: { id: expense.id } });
    expect(refreshed!.reimbursedAt).toBeNull();
  });

  it("pays an approved expense as its own transaction with accounting and audit", async () => {
    const expense = await addEmployeePaidExpense(emp.id, user, 1000, new Date("2026-06-10"));

    const result = await recordReimbursement({
      employeeId: emp.id,
      expenseIds: [expense.id],
      paymentMethod: "CASH",
      paidById: user.id,
      note: "Fuel reimbursement",
    });
    expect(result.totalMinor).toBe(toMinor(1000));

    const txn = await db.cashTransaction.findUnique({
      where: { id: result.transaction.id },
    });
    expect(txn!.type).toBe("REIMBURSEMENT");
    expect(txn!.amount).toBe(1000);
    expect(txn!.paymentMethod).toBe("CASH");
    expect(txn!.approvalStatus).toBe("APPROVED");

    const refreshed = await db.expense.findUnique({ where: { id: expense.id } });
    expect(refreshed!.reimbursedAt).toBeTruthy();
    expect(refreshed!.reimbursedById).toBe(user.id);
    expect(refreshed!.reimbursementMethod).toBe("CASH");
    expect(refreshed!.reimbursementTransactionId).toBe(txn!.id);

    const entry = await db.accountingEntry.findFirst({
      where: { expenseId: expense.id, type: "EXPENSE_REIMBURSEMENT" },
    });
    expect(entry).toBeTruthy();
    expect(entry!.amountMinor).toBe(-toMinor(1000));
    expect(entry!.postedById).toBe(user.id);

    const audit = await db.auditLog.findFirst({
      where: { action: "EXPENSE_REIMBURSED", entityId: expense.id },
    });
    expect(audit).toBeTruthy();
    expect(audit!.userId).toBe(user.id);

    const list = await listReimbursements(emp.id);
    expect(list.records[0].status).toBe("REIMBURSED");
    expect(list.totals.reimbursedMinor).toBe(toMinor(1000));
    expect(list.totals.approvedUnpaidMinor).toBe(0);
  });

  it("refuses to reimburse the same expense twice", async () => {
    const expense = await addEmployeePaidExpense(emp.id, user, 500, new Date("2026-06-10"));

    await recordReimbursement({
      employeeId: emp.id,
      expenseIds: [expense.id],
      paymentMethod: "CASH",
      paidById: user.id,
    });

    await expect(
      recordReimbursement({
        employeeId: emp.id,
        expenseIds: [expense.id],
        paymentMethod: "CASH",
        paidById: user.id,
      })
    ).rejects.toThrow(/already reimbursed/i);
  });

  it("pays from a company wallet and deducts its balance", async () => {
    const wallet = await companyWalletService.create({
      name: `Reimb Wallet ${Date.now()}`,
      type: "CASH",
      currency: "AFN",
      initialBalance: 5000,
      createdBy: user.id,
    });
    const expense = await addEmployeePaidExpense(emp.id, user, 1000, new Date("2026-06-10"));

    await recordReimbursement({
      employeeId: emp.id,
      expenseIds: [expense.id],
      paymentMethod: "COMPANY_WALLET",
      walletId: wallet!.id,
      paidById: user.id,
    });

    const refreshed = await db.wallet.findUnique({ where: { id: wallet!.id } });
    expect(refreshed!.balance).toBe(4000);

    const walletTxn = await db.walletTransaction.findFirst({
      where: { walletId: wallet!.id, expenseId: expense.id },
    });
    expect(walletTxn).toBeTruthy();
    expect(walletTxn!.amount).toBe(-1000);

    const entry = await db.accountingEntry.findFirst({
      where: { expenseId: expense.id, type: "EXPENSE_REIMBURSEMENT" },
    });
    expect(entry!.walletId).toBe(wallet!.id);
  });

  it("rejects a company wallet payment the wallet cannot cover", async () => {
    const wallet = await companyWalletService.create({
      name: `Reimb Wallet ${Date.now()}`,
      type: "CASH",
      currency: "AFN",
      initialBalance: 500,
      createdBy: user.id,
    });
    const expense = await addEmployeePaidExpense(emp.id, user, 1000, new Date("2026-06-10"));

    await expect(
      recordReimbursement({
        employeeId: emp.id,
        expenseIds: [expense.id],
        paymentMethod: "COMPANY_WALLET",
        walletId: wallet!.id,
        paidById: user.id,
      })
    ).rejects.toThrow(/insufficient/i);

    const refreshed = await db.wallet.findUnique({ where: { id: wallet!.id } });
    expect(refreshed!.balance).toBe(500);
    const expenseAfter = await db.expense.findUnique({ where: { id: expense.id } });
    expect(expenseAfter!.reimbursedAt).toBeNull();
  });

  it("requires a wallet for company wallet payments", async () => {
    const expense = await addEmployeePaidExpense(emp.id, user, 1000, new Date("2026-06-10"));
    await expect(
      recordReimbursement({
        employeeId: emp.id,
        expenseIds: [expense.id],
        paymentMethod: "COMPANY_WALLET",
        paidById: user.id,
      })
    ).rejects.toThrow(/wallet/i);
  });

  it("nets the expense and its reimbursement to zero in the cash account", async () => {
    const expense = await addEmployeePaidExpense(emp.id, user, 1000, new Date("2026-06-10"));
    await walletService.recomputeBalance(emp.id);
    // Company owes the employee for the money they fronted.
    expect(await cashAccountBalance(emp.id)).toBe(-1000);

    await recordReimbursement({
      employeeId: emp.id,
      expenseIds: [expense.id],
      paymentMethod: "CASH",
      paidById: user.id,
    });
    // Paid back: the pair nets out.
    expect(await cashAccountBalance(emp.id)).toBe(0);
  });
});
