import { GET as GET_EXPENSE } from "@/app/api/expenses/[id]/route";
import { db } from "@/lib/db";
import { seedUsers, buildRequest } from "../helpers";
import { hashPassword, generateToken } from "@/lib/auth";

let tokens: Awaited<ReturnType<typeof seedUsers>>;

beforeAll(async () => {
  tokens = await seedUsers();
});

describe("/api/expenses/[id] GET", () => {
  it("returns a full expense with creator for a viewer", async () => {
    const expense = await db.expense.create({
      data: {
        title: "Fuel purchase expense",
        category: "FUEL",
        amount: 12000,
        paymentMethod: "CASH",
        paidTo: "Linked Exp Co",
        paidBy: "Manager",
        expenseDate: new Date(),
        currency: "AFN",
        approvalStatus: "APPROVED",
        createdBy: tokens.admin.id,
      },
    });

    const res = await GET_EXPENSE(
      buildRequest(`/api/expenses/${expense.id}`, { token: tokens.adminToken }),
      { params: Promise.resolve({ id: expense.id }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(expense.id);
    expect(body.data.title).toBe("Fuel purchase expense");
    expect(body.data.category).toBe("FUEL");
    expect(body.data.amount).toBe(12000);
    expect(body.data.creator).toBeDefined();
  });

  it("returns 404 for a missing expense", async () => {
    const res = await GET_EXPENSE(
      buildRequest("/api/expenses/does-not-exist", { token: tokens.adminToken }),
      { params: Promise.resolve({ id: "does-not-exist" }) }
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 for a role without expenses:view", async () => {
    const tsUser = await db.user.create({
      data: {
        id: "u_ts_api",
        email: "timesheet@api.test",
        name: "Timesheet User",
        password: await hashPassword("ts-pw"),
        role: "TIMESHEET_USER",
      },
    });
    const token = generateToken({ userId: tsUser.id, email: tsUser.email, role: tsUser.role });

    const expense = await db.expense.create({
      data: {
        title: "Hidden expense",
        category: "MISCELLANEOUS",
        amount: 100,
        paymentMethod: "CASH",
        paidTo: "Someone",
        paidBy: "Someone",
        expenseDate: new Date(),
        currency: "AFN",
        createdBy: tokens.admin.id,
      },
    });

    const res = await GET_EXPENSE(
      buildRequest(`/api/expenses/${expense.id}`, { token }),
      { params: Promise.resolve({ id: expense.id }) }
    );
    expect(res.status).toBe(403);
  });
});
