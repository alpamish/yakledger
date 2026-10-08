import { describe, it, expect, beforeEach } from "vitest";
import { GET, POST } from "@/app/api/employees/[id]/reimbursements/route";
import { db } from "@/lib/db";
import { seedUsers, buildRequest, TEST_ADMIN, type SeedResult } from "../helpers";
import { toMinor } from "@/lib/money";

const PARAMS = (id: string) => ({ params: Promise.resolve({ id }) });

describe("/api/employees/[id]/reimbursements", () => {
  let s: SeedResult;

  beforeEach(async () => {
    s = await seedUsers();
  });

  async function makeExpense(overrides: Record<string, unknown> = {}) {
    return db.expense.create({
      data: {
        title: "Company fuel paid by employee",
        category: "FUEL",
        amount: 500,
        paymentMethod: "CASH",
        paidTo: "Company",
        paidBy: "Employee",
        expenseDate: new Date("2026-06-10"),
        paidById: s.employee.id,
        createdBy: TEST_ADMIN.id,
        approvalStatus: "APPROVED",
        ...overrides,
      },
    });
  }

  async function list(token: string, query = "") {
    const res = await GET(
      buildRequest(`/api/employees/${s.employee.id}/reimbursements${query}`, { token }),
      PARAMS(s.employee.id)
    );
    return { status: res.status, body: await res.json() };
  }

  async function pay(body: Record<string, unknown>, token?: string) {
    const res = await POST(
      buildRequest(`/api/employees/${s.employee.id}/reimbursements`, {
        token: token ?? s.adminToken,
        method: "POST",
        body,
      }),
      PARAMS(s.employee.id)
    );
    return { status: res.status, body: await res.json() };
  }

  it("lists employee-paid expenses with reimbursement status and totals", async () => {
    await makeExpense({ title: "Approved", amount: 300 });
    await makeExpense({ title: "Pending", amount: 200, approvalStatus: "PENDING" });

    const { status, body } = await list(s.adminToken);
    expect(status).toBe(200);
    expect(body.data.records).toHaveLength(2);
    expect(body.data.totals.pendingMinor).toBe(toMinor(200));
    expect(body.data.totals.approvedUnpaidMinor).toBe(toMinor(300));
    expect(body.data.totals.reimbursedMinor).toBe(0);
  });

  it("records a reimbursement payment for an approved expense", async () => {
    const expense = await makeExpense({ amount: 400 });

    const { status, body } = await pay({
      expenseIds: [expense.id],
      paymentMethod: "CASH",
      note: "Cash reimbursement",
    });
    expect(status).toBe(200);
    expect(body.data.totalMinor).toBe(toMinor(400));

    const refreshed = await db.expense.findUnique({ where: { id: expense.id } });
    expect(refreshed!.reimbursedAt).toBeTruthy();
    expect(refreshed!.reimbursementMethod).toBe("CASH");

    const txn = await db.cashTransaction.findFirst({
      where: { employeeId: s.employee.id, type: "REIMBURSEMENT" },
    });
    expect(txn).toBeTruthy();
    expect(txn!.amount).toBe(400);

    const listed = await list(s.adminToken);
    expect(listed.body.data.records[0].status).toBe("REIMBURSED");
    expect(listed.body.data.totals.reimbursedMinor).toBe(toMinor(400));
  });

  it("filters by reimbursement status", async () => {
    const expense = await makeExpense({ amount: 100 });
    await pay({ expenseIds: [expense.id], paymentMethod: "CASH" });
    await makeExpense({ title: "Still open", amount: 250 });

    const { body } = await list(s.adminToken, "?status=REIMBURSED");
    expect(body.data.records).toHaveLength(1);
    expect(body.data.records[0].amountMinor).toBe(toMinor(100));
  });

  it("rejects payment before the expense is approved", async () => {
    const expense = await makeExpense({ approvalStatus: "PENDING" });

    const { status, body } = await pay({
      expenseIds: [expense.id],
      paymentMethod: "CASH",
    });
    expect(status).toBe(400);
    expect(body.error).toMatch(/approval/i);
  });

  it("rejects expenses that do not belong to the employee", async () => {
    const foreign = await db.expense.create({
      data: {
        title: "Not this employee",
        category: "FUEL",
        amount: 100,
        paymentMethod: "CASH",
        paidTo: "Company",
        paidBy: "Employee",
        expenseDate: new Date("2026-06-10"),
        createdBy: TEST_ADMIN.id,
        approvalStatus: "APPROVED",
      },
    });

    const { status, body } = await pay({
      expenseIds: [foreign.id],
      paymentMethod: "CASH",
    });
    expect(status).toBe(400);
    expect(body.error).toMatch(/belong/i);
  });

  it("requires a wallet when paying from the company wallet", async () => {
    const expense = await makeExpense();
    const { status, body } = await pay({
      expenseIds: [expense.id],
      paymentMethod: "COMPANY_WALLET",
    });
    expect(status).toBe(400);
    expect(body.error).toMatch(/wallet/i);
  });

  it("requires expenses:approve to record a payment", async () => {
    const expense = await makeExpense();
    const { status } = await pay(
      { expenseIds: [expense.id], paymentMethod: "CASH" },
      s.userToken
    );
    expect(status).toBe(403);

    const refreshed = await db.expense.findUnique({ where: { id: expense.id } });
    expect(refreshed!.reimbursedAt).toBeNull();
  });

  it("does not expose reimbursements of employees outside the caller's scope", async () => {
    // The seeded employee belongs to the admin; the plain user cannot read it.
    const { status, body } = await list(s.userToken);
    expect(status).toBe(404);
    expect(body.success).toBe(false);
  });
});
