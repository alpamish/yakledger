import { walletService } from "@/services/wallet.service";
import { db } from "@/lib/db";
import { seedUsers, TEST_ADMIN } from "../helpers";

const ADMIN_ACTOR = { id: TEST_ADMIN.id, role: "ADMIN" };

let employeeId: string;

beforeAll(async () => {
  await seedUsers();
  const employee = await db.employee.create({
    data: {
      fullName: "Wallet Employee",
      fatherName: "Emp",
      phoneNumber: "0701111111",
      jobTitle: "Operator",
      department: "OPERATIONS",
      hireDate: new Date(),
      createdBy: TEST_ADMIN.id,
    },
  });
  employeeId = employee.id;
});

describe("wallet.service → createAdvance / balance", () => {
  it("advance of 1000 sets the account balance to 1000", async () => {
    await walletService.createAdvance(employeeId, 1000, ADMIN_ACTOR, "initial");
    const account = await walletService.getAccount(employeeId);
    expect(account!.currentBalance).toBe(1000);
  });

  it("creates an APPROVED CashTransaction with type ADVANCE", async () => {
    const tx = await walletService.createAdvance(employeeId, 500, ADMIN_ACTOR);
    expect(tx.type).toBe("ADVANCE");
    expect(tx.approvalStatus).toBe("APPROVED");
    expect(tx.amount).toBe(500);
    const account = await walletService.getAccount(employeeId);
    expect(account!.currentBalance).toBe(1500);
  });
});

describe("wallet.service → createReturn", () => {
  it("return decrements the balance (1500 → 1000)", async () => {
    await walletService.createReturn(employeeId, 500, ADMIN_ACTOR, "paid back");
    const account = await walletService.getAccount(employeeId);
    expect(account!.currentBalance).toBe(1000);
    const txns = await db.cashTransaction.findMany({ where: { employeeId, type: "RETURN" } });
    expect(txns[0].approvalStatus).toBe("APPROVED");
  });
});

describe("wallet.service → validation", () => {
  it("rejects non-positive advance/return amounts", async () => {
    await expect(walletService.createAdvance(employeeId, 0, ADMIN_ACTOR)).rejects.toThrow("Amount must be positive");
    await expect(walletService.createReturn(employeeId, -5, ADMIN_ACTOR)).rejects.toThrow("Amount must be positive");
  });

  it("rejects self-transfer", async () => {
    await expect(walletService.createTransfer(employeeId, employeeId, 10, ADMIN_ACTOR)).rejects.toThrow(
      "Cannot transfer to the same employee"
    );
  });

  it("rejects non-positive transfer", async () => {
    const other = await db.employee.create({
      data: {
        fullName: "Other",
        fatherName: "Emp",
        phoneNumber: "0702222222",
        jobTitle: "Op",
        department: "OPERATIONS",
        hireDate: new Date(),
        createdBy: TEST_ADMIN.id,
      },
    });
    await expect(walletService.createTransfer(employeeId, other.id, 0, ADMIN_ACTOR)).rejects.toThrow("Amount must be positive");
  });
});

describe("wallet.service → createTransfer", () => {
  it("moves balance between two employees atomically (1000/500)", async () => {
    const other = await db.employee.create({
      data: {
        fullName: "Counterparty",
        fatherName: "Emp",
        phoneNumber: "0703333333",
        jobTitle: "Op",
        department: "OPERATIONS",
        hireDate: new Date(),
        createdBy: TEST_ADMIN.id,
      },
    });

    await walletService.createTransfer(employeeId, other.id, 500, ADMIN_ACTOR);

    const from = await walletService.getAccount(employeeId);
    const to = await walletService.getAccount(other.id);
    expect(from!.currentBalance).toBe(500);
    expect(to!.currentBalance).toBe(500);

    const trf = await db.transfer.findFirst({ where: { fromEmployeeId: employeeId, toEmployeeId: other.id } });
    expect(trf).not.toBeNull();
    expect(trf!.approvalStatus).toBe("APPROVED");
  });
});

describe("wallet.service → ledger", () => {
  it("computes a correct running balance with the expected entry signs", async () => {
    // Employee starts at 1000 (advance) + 500 (advance) - 500 (return) = 1000,
    // then -500 (transfer out) = 500. Expense paid by employee: -100 → 400.
    await db.transfer.deleteMany({});
    await db.cashTransaction.deleteMany({});
    await db.expense.deleteMany({});
    await db.employeeCashAccount.update({ where: { employeeId }, data: { currentBalance: 0 } });

    await walletService.createAdvance(employeeId, 1000, ADMIN_ACTOR);
    await walletService.createReturn(employeeId, 500, ADMIN_ACTOR);
    await walletService.createAdvance(employeeId, 500, ADMIN_ACTOR);
    const other = await db.employee.create({
      data: {
        fullName: "Ledger Cpty",
        fatherName: "Emp",
        phoneNumber: "0704444444",
        jobTitle: "Op",
        department: "OPERATIONS",
        hireDate: new Date(),
        createdBy: TEST_ADMIN.id,
      },
    });
    await walletService.createTransfer(employeeId, other.id, 500, ADMIN_ACTOR);

    const account = await walletService.getAccount(employeeId);
    expect(account!.currentBalance).toBe(500);

    const ledger = await walletService.getLedger(employeeId);
    // 3 txns (2 advance, 1 return) + 1 transfer out.
    expect(ledger).toHaveLength(4);
    // Running balance must end at 500, monotonically computed.
    expect(ledger[ledger.length - 1].runningBalance).toBe(500);
    expect(ledger[0].type).toBe("ADVANCE");
    expect(ledger[0].amount).toBe(1000);
    // Return is negative on the ledger entry.
    const ret = ledger.find((e) => e.type === "RETURN");
    expect(ret).toBeDefined();
    expect(ret!.amount).toBe(-500);
  });

  it("includes an EXPENSE entry (paid by employee) with negative amount", async () => {
    await db.expense.create({
      data: {
        title: "Fuel for truck",
        category: "FUEL",
        amount: 100,
        paymentMethod: "CASH",
        paidTo: "Driver",
        paidBy: "Company",
        expenseDate: new Date(),
        createdBy: TEST_ADMIN.id,
        paidById: employeeId,
        approvalStatus: "APPROVED",
        approvedById: TEST_ADMIN.id,
        approvedAt: new Date(),
      },
    });

    const ledger = await walletService.getLedger(employeeId);
    const expenseEntry = ledger.find((e) => e.type === "EXPENSE");
    expect(expenseEntry).toBeDefined();
    expect(expenseEntry!.amount).toBe(-100);
    expect(expenseEntry!.description).toMatch(/Fuel for truck/);
  });
});

describe("wallet.service → deduct / addBack", () => {
  it("deductFromWallet reduces balance; reverseLastDeduction restores it", async () => {
    const before = (await walletService.getAccount(employeeId))!.currentBalance;
    await walletService.deductFromWallet(employeeId, 75, TEST_ADMIN.id);
    let after = (await walletService.getAccount(employeeId))!.currentBalance;
    expect(after).toBe(before - 75);

    await walletService.reverseLastDeduction(employeeId, 75, TEST_ADMIN.id);
    after = (await walletService.getAccount(employeeId))!.currentBalance;
    expect(after).toBe(before);
  });

  it("deductFromWallet ignores non-positive amounts", async () => {
    const before = (await walletService.getAccount(employeeId))!.currentBalance;
    await walletService.deductFromWallet(employeeId, 0, TEST_ADMIN.id);
    expect((await walletService.getAccount(employeeId))!.currentBalance).toBe(before);
  });
});
