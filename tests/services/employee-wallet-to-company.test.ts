import { describe, it, expect, beforeAll } from "vitest";
import { db } from "@/lib/db";
import { walletService } from "@/services/wallet.service";
import { companyWalletService } from "@/services/company-wallet.service";

let user: any;
let employeeId: string;

beforeAll(async () => {
  user = await db.user.create({
    data: { email: `wallet-tr-${Date.now()}-${Math.random()}@t.co`, name: "W", password: "x", role: "MANAGER" },
  });
  const emp = await db.employee.create({
    data: {
      fullName: "Tr Emp",
      fatherName: "F",
      phoneNumber: "0700000000",
      jobTitle: "Driver",
      department: "LABOR",
      employmentType: "FULL_TIME",
      hireDate: new Date("2026-01-01"),
      status: "ACTIVE",
      createdBy: user.id,
    },
  });
  employeeId = emp.id;
});

async function makeEmp(name: string, phone: string) {
  return db.employee.create({
    data: {
      fullName: name,
      fatherName: "F",
      phoneNumber: phone,
      jobTitle: "Driver",
      department: "LABOR",
      employmentType: "FULL_TIME",
      hireDate: new Date("2026-01-01"),
      status: "ACTIVE",
      createdBy: user.id,
    },
  });
}

// Seed a wallet balance the way the real flow does: an account plus an
// approved advance (the derived balance is computed from the ledger).
async function seedBalance(empId: string, amount: number) {
  await db.employeeCashAccount.create({ data: { employeeId: empId } });
  await db.cashTransaction.create({
    data: {
      employeeId: empId,
      type: "ADVANCE",
      amount,
      approvalStatus: "APPROVED",
      createdBy: user.id,
      approvedById: user.id,
      approvedAt: new Date(),
    },
  });
  await walletService.recomputeBalance(empId);
}

describe("walletService.transferToCompanyWallet", () => {
  it("transfers cash from the employee wallet to a company wallet", async () => {
    await seedBalance(employeeId, 5000);
    const wallet = await companyWalletService.create({
      name: `Main ${Date.now()}`,
      type: "CASH",
      createdBy: user.id,
    });

    const txn = await walletService.transferToCompanyWallet(employeeId, wallet.id, 2000, user);

    expect(txn.type).toBe("RETURN");
    expect(txn.walletId).toBe(wallet.id);

    const account = await db.employeeCashAccount.findUnique({ where: { employeeId } });
    expect(account!.currentBalance).toBe(3000);

    const updated = await db.wallet.findUnique({ where: { id: wallet.id } });
    expect(updated!.balance).toBe(2000);

    const wt = await db.walletTransaction.findFirst({
      where: { walletId: wallet.id, type: "TRANSFER_IN" },
    });
    expect(wt).toBeTruthy();
    expect(wt!.amount).toBe(2000);
  });

  it("throws when the employee has no wallet", async () => {
    const clean = await makeEmp("NoAcct Emp", "0700000001");
    const wallet = await companyWalletService.create({ name: `W ${Date.now()}`, createdBy: user.id });
    await expect(
      walletService.transferToCompanyWallet(clean.id, wallet.id, 100, user)
    ).rejects.toThrow("Employee does not have a wallet");
  });

  it("throws when the employee balance is insufficient", async () => {
    const emp = await makeEmp("Low Emp", "0700000002");
    await seedBalance(emp.id, 100);
    const wallet = await companyWalletService.create({ name: `W2 ${Date.now()}`, createdBy: user.id });

    await expect(
      walletService.transferToCompanyWallet(emp.id, wallet.id, 500, user)
    ).rejects.toThrow("Insufficient employee wallet balance");
  });

  it("throws for a non-positive amount", async () => {
    const wallet = await companyWalletService.create({ name: `W3 ${Date.now()}`, createdBy: user.id });
    await expect(
      walletService.transferToCompanyWallet(employeeId, wallet.id, 0, user)
    ).rejects.toThrow("Amount must be positive");
  });

  it("rolls back when the target wallet is inactive", async () => {
    const emp = await makeEmp("Rollback Emp", "0700000003");
    await seedBalance(emp.id, 1000);
    const wallet = await companyWalletService.create({ name: `W4 ${Date.now()}`, createdBy: user.id });
    await companyWalletService.setActive(wallet.id, false);

    await expect(
      walletService.transferToCompanyWallet(emp.id, wallet.id, 500, user)
    ).rejects.toThrow("inactive");

    // Atomic: no RETURN recorded and employee balance unchanged.
    const returns = await db.cashTransaction.count({ where: { employeeId: emp.id, type: "RETURN" } });
    expect(returns).toBe(0);
    const account = await db.employeeCashAccount.findUnique({ where: { employeeId: emp.id } });
    expect(account!.currentBalance).toBe(1000);
  });
});
