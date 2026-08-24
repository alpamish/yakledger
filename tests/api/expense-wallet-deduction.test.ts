import { POST } from "@/app/api/expenses/route";
import { PUT, DELETE } from "@/app/api/expenses/[id]/route";
import { POST as APPROVE } from "@/app/api/approvals/[entity]/[id]/route";
import { db } from "@/lib/db";
import { companyWalletService } from "@/services/company-wallet.service";
import { seedUsers, TEST_ADMIN, buildRequest } from "../helpers";

let tokens: Awaited<ReturnType<typeof seedUsers>>;

beforeAll(async () => {
  tokens = await seedUsers();
});

async function createWallet(initial: number) {
  const wallet = await companyWalletService.create({
    name: `Test Wallet ${Date.now()}`,
    type: "CASH",
    currency: "AFN",
    initialBalance: initial,
    createdBy: TEST_ADMIN.id,
  });
  return wallet!;
}

function expenseBody(overrides: Record<string, unknown> = {}) {
  return {
    title: "Wallet Expense",
    category: "FUEL",
    amount: 100,
    paymentMethod: "CASH",
    paidTo: "Someone",
    paidBy: "Manager",
    expenseDate: new Date().toISOString(),
    ...overrides,
  };
}

const build = (token: string, path: string, method: string, body?: unknown) =>
  buildRequest(path, { token, method, body });

async function walletAccountBalance(employeeId: string): Promise<number | null> {
  const acc = await db.employeeCashAccount.findUnique({ where: { employeeId } });
  return acc?.currentBalance ?? null;
}

describe("Expense wallet deduction", () => {
  it("deducts from the company wallet on approved create and sets expense.walletId", async () => {
    const wallet = await createWallet(1000);
    const res = await POST(
      build(tokens.adminToken, "/api/expenses", "POST", expenseBody({ walletId: wallet.id, deductFromWallet: false }))
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.walletId).toBe(wallet.id);

    const refreshed = await db.wallet.findUnique({ where: { id: wallet.id } });
    expect(refreshed!.balance).toBe(900);

    const txns = await db.walletTransaction.findMany({ where: { walletId: wallet.id, type: "EXPENSE" } });
    expect(txns).toHaveLength(1);
    expect(txns[0].amount).toBe(-100);
    expect(txns[0].expenseId).toBe(body.data.id);
  });

  it("fails the create when the company wallet cannot cover the expense", async () => {
    const wallet = await createWallet(50);
    const res = await POST(
      build(tokens.adminToken, "/api/expenses", "POST", expenseBody({ walletId: wallet.id, deductFromWallet: false }))
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);

    const refreshed = await db.wallet.findUnique({ where: { id: wallet.id } });
    expect(refreshed!.balance).toBe(50);
    const expense = await db.expense.findFirst({
      where: { title: "Wallet Expense", walletId: wallet.id },
    });
    expect(expense).toBeNull();
  });

  it("deducts from the paying employee wallet by default (deductFromWallet true)", async () => {
    // Ensure the employee has an account with a known starting balance.
    await db.employeeCashAccount.upsert({
      where: { employeeId: tokens.employee.id },
      update: {},
      create: { employeeId: tokens.employee.id },
    });
    const before = (await walletAccountBalance(tokens.employee.id)) ?? 0;
    const res = await POST(
      build(tokens.adminToken, "/api/expenses", "POST", expenseBody({ paidById: tokens.employee.id }))
    );
    expect(res.status).toBe(201);
    // Balance drops by the expense amount (derived from the expense, not a DEBIT).
    const after = (await walletAccountBalance(tokens.employee.id)) ?? 0;
    expect(after).toBe(before - 100);
    // No DEBIT cash transaction is created anymore.
    const debits = await db.cashTransaction.count({
      where: { employeeId: tokens.employee.id, type: "DEBIT" },
    });
    expect(debits).toBe(0);
  });

  it("skips the employee wallet deduction when deductFromWallet is false", async () => {
    await db.employeeCashAccount.upsert({
      where: { employeeId: tokens.employee.id },
      update: {},
      create: { employeeId: tokens.employee.id },
    });
    const before = (await walletAccountBalance(tokens.employee.id)) ?? 0;
    const res = await POST(
      build(tokens.adminToken, "/api/expenses", "POST", expenseBody({
        paidById: tokens.employee.id,
        deductFromWallet: false,
      }))
    );
    expect(res.status).toBe(201);
    const after = (await walletAccountBalance(tokens.employee.id)) ?? 0;
    expect(after).toBe(before);
  });

  it("adjusts the company wallet when an approved expense amount is updated", async () => {
    const wallet = await createWallet(1000);
    const created = await POST(
      build(tokens.adminToken, "/api/expenses", "POST", expenseBody({
        walletId: wallet.id,
        deductFromWallet: false,
        title: "Wallet Update",
        amount: 100,
      }))
    );
    const expense = (await created.json()).data as { id: string };

    const res = await PUT(
      build(tokens.adminToken, `/api/expenses/${expense.id}`, "PUT", { amount: 150 }),
      { params: Promise.resolve({ id: expense.id }) }
    );
    expect(res.status).toBe(200);

    const refreshed = await db.wallet.findUnique({ where: { id: wallet.id } });
    expect(refreshed!.balance).toBe(850);
  });

  it("credits the company wallet back when an approved expense is deleted", async () => {
    const wallet = await createWallet(1000);
    const created = await POST(
      build(tokens.adminToken, "/api/expenses", "POST", expenseBody({
        walletId: wallet.id,
        deductFromWallet: false,
        title: "Wallet Delete",
      }))
    );
    const expense = (await created.json()).data as { id: string };

    const res = await DELETE(
      build(tokens.adminToken, `/api/expenses/${expense.id}`, "DELETE"),
      { params: Promise.resolve({ id: expense.id }) }
    );
    expect(res.status).toBe(200);

    const refreshed = await db.wallet.findUnique({ where: { id: wallet.id } });
    expect(refreshed!.balance).toBe(1000);
  });

  it("deducts from the company wallet when a pending expense is approved", async () => {
    const wallet = await createWallet(1000);
    // A non-admin creates the expense → PENDING.
    const created = await POST(
      build(tokens.managerToken, "/api/expenses", "POST", expenseBody({
        walletId: wallet.id,
        deductFromWallet: false,
        title: "Wallet Approve",
      }))
    );
    expect(created.status).toBe(201);
    const expense = (await created.json()).data as { id: string; approvalStatus: string };
    expect(expense.approvalStatus).toBe("PENDING");

    const res = await APPROVE(
      build(tokens.adminToken, "/api/approvals/expense/approve", "POST", { action: "approve" }),
      { params: Promise.resolve({ entity: "expense", id: expense.id }) }
    );
    expect(res.status).toBe(200);

    const refreshed = await db.wallet.findUnique({ where: { id: wallet.id } });
    expect(refreshed!.balance).toBe(900);
    const txns = await db.walletTransaction.findMany({ where: { walletId: wallet.id, type: "EXPENSE" } });
    expect(txns).toHaveLength(1);
    expect(txns[0].expenseId).toBe(expense.id);
  });

  it("rejects creating an expense with both a company wallet and employee wallet deduction", async () => {
    const wallet = await createWallet(1000);
    const res = await POST(
      build(tokens.adminToken, "/api/expenses", "POST", expenseBody({
        walletId: wallet.id,
        paidById: tokens.employee.id,
        deductFromWallet: true,
      }))
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/not both/);
  });

  it("rejects updating an expense to set both a company wallet and employee wallet deduction", async () => {
    const wallet = await createWallet(1000);
    const created = await POST(
      build(tokens.adminToken, "/api/expenses", "POST", expenseBody({
        walletId: wallet.id,
        title: "Mutual Exclusive",
        deductFromWallet: false,
      }))
    );
    expect(created.status).toBe(201);
    const expense = (await created.json()).data as { id: string };

    // Try to enable the employee deduction while a company wallet is set.
    const res = await PUT(
      build(tokens.adminToken, `/api/expenses/${expense.id}`, "PUT", { deductFromWallet: true }),
      { params: Promise.resolve({ id: expense.id }) }
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/not both/);
  });
});
