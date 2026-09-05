import { POST } from "@/app/api/employee-wallet/transfer-to-wallet/route";
import { db } from "@/lib/db";
import { seedUsers, buildRequest } from "../helpers";
import { companyWalletService } from "@/services/company-wallet.service";
import { walletService } from "@/services/wallet.service";

let tokens: Awaited<ReturnType<typeof seedUsers>>;
let walletId: string;

beforeAll(async () => {
  tokens = await seedUsers();
  const wallet = await companyWalletService.create({
    name: "Route Test Wallet",
    createdBy: tokens.admin.id,
  });
  walletId = wallet.id;
  // Seed balance via the real flow: account + approved advance.
  await db.employeeCashAccount.create({ data: { employeeId: tokens.employee.id } });
  await db.cashTransaction.create({
    data: {
      employeeId: tokens.employee.id,
      type: "ADVANCE",
      amount: 10000,
      approvalStatus: "APPROVED",
      createdBy: tokens.admin.id,
      approvedById: tokens.admin.id,
      approvedAt: new Date(),
    },
  });
  await walletService.recomputeBalance(tokens.employee.id);
});

describe("POST /api/employee-wallet/transfer-to-wallet", () => {
  it("transfers cash from an employee wallet to a company wallet", async () => {
    const res = await POST(
      buildRequest("/api/employee-wallet/transfer-to-wallet", {
        token: tokens.adminToken,
        method: "POST",
        body: { employeeId: tokens.employee.id, walletId, amount: 2500, note: "test transfer" },
      })
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.type).toBe("RETURN");
    expect(json.data.walletId).toBe(walletId);

    const account = await db.employeeCashAccount.findUnique({
      where: { employeeId: tokens.employee.id },
    });
    expect(account!.currentBalance).toBe(7500);

    const wallet = await db.wallet.findUnique({ where: { id: walletId } });
    expect(wallet!.balance).toBe(2500);
  });

  it("rejects invalid amount", async () => {
    const res = await POST(
      buildRequest("/api/employee-wallet/transfer-to-wallet", {
        token: tokens.adminToken,
        method: "POST",
        body: { employeeId: tokens.employee.id, walletId, amount: 0 },
      })
    );
    expect(res.status).toBe(400);
  });

  it("denies a user without wallets:manage permission", async () => {
    const res = await POST(
      buildRequest("/api/employee-wallet/transfer-to-wallet", {
        token: tokens.userToken,
        method: "POST",
        body: { employeeId: tokens.employee.id, walletId, amount: 100 },
      })
    );
    expect(res.status).toBe(403);
  });

  it("rejects transfer when employee has insufficient balance", async () => {
    const res = await POST(
      buildRequest("/api/employee-wallet/transfer-to-wallet", {
        token: tokens.adminToken,
        method: "POST",
        body: { employeeId: tokens.employee.id, walletId, amount: 999999 },
      })
    );
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toContain("Insufficient employee wallet balance");
  });

  it("force-receives cash even when employee balance is insufficient", async () => {
    const balanceBefore = await db.employeeCashAccount.findUnique({
      where: { employeeId: tokens.employee.id },
    });
    const employeeBalance = balanceBefore!.currentBalance;

    const res = await POST(
      buildRequest("/api/employee-wallet/transfer-to-wallet", {
        token: tokens.adminToken,
        method: "POST",
        body: {
          employeeId: tokens.employee.id,
          walletId,
          amount: employeeBalance + 500,
          note: "forced receive",
          force: true,
        },
      })
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.type).toBe("RETURN");

    const account = await db.employeeCashAccount.findUnique({
      where: { employeeId: tokens.employee.id },
    });
    expect(account!.currentBalance).toBe(-500);

    const wallet = await db.wallet.findUnique({ where: { id: walletId } });
    expect(wallet!.balance).toBe(employeeBalance + 500 + 2500);
  });
});
