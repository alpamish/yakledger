import { POST } from "@/app/api/expenses/bulk/route";
import { db } from "@/lib/db";
import { companyWalletService } from "@/services/company-wallet.service";
import { seedUsers, TEST_ADMIN, buildRequest } from "../helpers";

let tokens: Awaited<ReturnType<typeof seedUsers>>;

beforeAll(async () => {
  tokens = await seedUsers();
});

function record(overrides: Record<string, unknown> = {}) {
  return {
    title: "Bulk Expense",
    category: "FUEL",
    amount: 100,
    paymentMethod: "CASH",
    paidTo: "Someone",
    paidBy: "Manager",
    expenseDate: new Date().toISOString(),
    ...overrides,
  };
}

const B = (body: unknown) =>
  buildRequest("/api/expenses/bulk", { token: tokens.adminToken, method: "POST", body });

describe("/api/expenses/bulk — auth & validation", () => {
  it("POST without token → 401", async () => {
    const res = await POST(buildRequest("/api/expenses/bulk", { method: "POST", body: { records: [] } }));
    expect(res.status).toBe(401);
  });

  it("empty records → 400", async () => {
    const res = await POST(B({ records: [] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/At least one record/);
  });

  it("invalid record → 400 with field messages", async () => {
    const res = await POST(B({ records: [{ title: "missing-fields" }] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBeTruthy();
  });

  it("non-positive amount → 400", async () => {
    const res = await POST(B({ records: [record({ amount: 0 })] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/Amount must be positive/);
  });
});

describe("/api/expenses/bulk — create", () => {
  it("admin bulk creates multiple APPROVED expenses", async () => {
    const res = await POST(
      B({
        records: [
          record({ title: "Bulk One", amount: 50, category: "FOOD", paidById: tokens.employee.id }),
          record({ title: "Bulk Two", amount: 75, category: "MATERIALS", paidById: tokens.employee.id }),
        ],
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.created).toBe(2);
    expect(body.data.records).toHaveLength(2);
    for (const r of body.data.records) {
      expect(r.approvalStatus).toBe("APPROVED");
      expect(r.paidBy).toBe("Manager");
    }
  });

  it("deducts from the employee wallet per record when paidById is set", async () => {
    const res = await POST(
      B({
        records: [
          record({ title: "Emp Wallet 1", amount: 100, paidById: tokens.employee.id }),
          record({ title: "Emp Wallet 2", amount: 50, paidById: tokens.employee.id }),
        ],
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.created).toBe(2);

    const account = await db.employeeCashAccount.findUnique({
      where: { employeeId: tokens.employee.id },
    });
    // Previous tests created 125 in expenses, this adds 150 = -275 total.
    expect(account!.currentBalance).toBe(-275);

    // No DEBIT cash transactions are created; the balance derives from expenses.
    const txns = await db.cashTransaction.count({
      where: { employeeId: tokens.employee.id, type: "DEBIT" },
    });
    expect(txns).toBe(0);
  });

  it("skips employee wallet deduction when deductFromWallet is false", async () => {
    const before = await db.cashTransaction.count({
      where: { employeeId: tokens.employee.id, type: "DEBIT" },
    });
    const res = await POST(
      B({
        records: [
          record({ title: "No Deduct", amount: 100, paidById: tokens.employee.id, deductFromWallet: false }),
        ],
      })
    );
    expect(res.status).toBe(201);
    const after = await db.cashTransaction.count({
      where: { employeeId: tokens.employee.id, type: "DEBIT" },
    });
    expect(after).toBe(before);
    // Balance unchanged (deductFromWallet=false skips the derived deduction).
    const account = await db.employeeCashAccount.findUnique({
      where: { employeeId: tokens.employee.id },
    });
    expect(account!.currentBalance).toBe(-275);
  });

  it("deducts from the company wallet per record", async () => {
    const wallet = await companyWalletService.create({
      name: `Bulk Wallet ${Date.now()}`,
      type: "CASH",
      currency: "AFN",
      initialBalance: 1000,
      createdBy: TEST_ADMIN.id,
    });
    const res = await POST(
      B({
        records: [
          record({ title: "Wallet Rec 1", amount: 100, walletId: wallet!.id, deductFromWallet: false }),
          record({ title: "Wallet Rec 2", amount: 200, walletId: wallet!.id, deductFromWallet: false }),
        ],
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.created).toBe(2);

    const refreshed = await db.wallet.findUnique({ where: { id: wallet!.id } });
    expect(refreshed!.balance).toBe(700);

    const txns = await db.walletTransaction.findMany({ where: { walletId: wallet!.id, type: "EXPENSE" } });
    expect(txns).toHaveLength(2);
  });

  it("rejects a record with both company wallet and employee wallet deduction", async () => {
    const wallet = await companyWalletService.create({
      name: `Conflict Wallet ${Date.now()}`,
      type: "CASH",
      currency: "AFN",
      initialBalance: 1000,
      createdBy: TEST_ADMIN.id,
    });
    const res = await POST(
      B({
        records: [
          record({ title: "Ok", amount: 10, paidById: tokens.employee.id }),
          record({
            title: "Conflict",
            amount: 10,
            walletId: wallet!.id,
            paidById: tokens.employee.id,
            deductFromWallet: true,
          }),
        ],
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/not both/);
  });

  it("records audit logs for each created expense", async () => {
    const res = await POST(
      B({
        records: [
          record({ title: "Audit One", amount: 10, paidById: tokens.employee.id }),
          record({ title: "Audit Two", amount: 20, paidById: tokens.employee.id }),
        ],
      })
    );
    expect(res.status).toBe(201);
    const logs = await db.auditLog.findMany({
      where: { entity: "Expense", details: { in: ["Created expense: Audit One ($10)", "Created expense: Audit Two ($20)"] } },
    });
    expect(logs).toHaveLength(2);
  });
});
