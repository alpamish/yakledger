import { PUT, DELETE } from "@/app/api/expenses/[id]/route";
import { POST as bulkDelete } from "@/app/api/expenses/bulk-delete/route";
import { db } from "@/lib/db";
import { seedUsers, TEST_ADMIN } from "../helpers";

let tokens: Awaited<ReturnType<typeof seedUsers>>;
let payrollId: string;

beforeAll(async () => {
  tokens = await seedUsers();
  const payroll = await db.payroll.create({
    data: {
      employeeId: tokens.employee.id,
      periodStart: new Date("2026-06-01"),
      periodEnd: new Date("2026-06-30"),
      currency: "AFN",
      status: "APPROVED",
      createdById: TEST_ADMIN.id,
    },
  });
  payrollId = payroll.id;
});

async function seedExpense(id: string, payrollLinked: boolean) {
  await db.expense.create({
    data: {
      id,
      title: `Payroll Guard Expense ${id}`,
      category: "SALARY",
      amount: 100,
      paymentMethod: "CASH",
      paidTo: "Test Employee",
      paidBy: "Manager",
      expenseDate: new Date(),
      createdBy: TEST_ADMIN.id,
      approvalStatus: "APPROVED",
      ...(payrollLinked ? { payrollId } : {}),
    },
  });
}

function buildRequest(token: string, path: string, method: string, body?: unknown) {
  const headers = new Headers();
  headers.set("Content-Type", "application/json");
  headers.set("Authorization", `Bearer ${token}`);
  const init: RequestInit = { method, headers };
  if (body !== undefined) init.body = JSON.stringify(body);
  return new Request(`http://localhost:3000${path}`, init) as never;
}

describe("Payroll-generated expense protection", () => {
  it("rejects editing a payroll-generated salary expense", async () => {
    await seedExpense("guard_patch_1", true);
    const res = await PUT(
      buildRequest(tokens.adminToken, "/api/expenses/guard_patch_1", "PUT", {
        title: "Should not change",
      }),
      { params: Promise.resolve({ id: "guard_patch_1" }) }
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Revert the payroll/);
  });

  it("rejects deleting a payroll-generated salary expense", async () => {
    await seedExpense("guard_delete_1", true);
    const res = await DELETE(
      buildRequest(tokens.adminToken, "/api/expenses/guard_delete_1", "DELETE"),
      { params: Promise.resolve({ id: "guard_delete_1" }) }
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Revert the payroll/);
    const stillThere = await db.expense.findUnique({ where: { id: "guard_delete_1" } });
    expect(stillThere).not.toBeNull();
  });

  it("bulk delete skips payroll-generated records and deletes normal ones", async () => {
    await seedExpense("guard_skip_1", true);
    await seedExpense("guard_ok_1", false);

    const res = await bulkDelete(
      buildRequest(tokens.adminToken, "/api/expenses/bulk-delete", "POST", {
        ids: ["guard_skip_1", "guard_ok_1"],
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.deletedCount).toBe(1);
    expect(body.data.skipped).toBe(1);
    expect(body.message).toMatch(/1 payroll-generated/);
    expect(await db.expense.findUnique({ where: { id: "guard_skip_1" } })).not.toBeNull();
    expect(await db.expense.findUnique({ where: { id: "guard_ok_1" } })).toBeNull();
  });

  it("bulk delete rejects when every selected expense is payroll-generated", async () => {
    await seedExpense("guard_all_1", true);
    await seedExpense("guard_all_2", true);

    const res = await bulkDelete(
      buildRequest(tokens.adminToken, "/api/expenses/bulk-delete", "POST", {
        ids: ["guard_all_1", "guard_all_2"],
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/cannot be deleted/);
  });

  it("still deletes a normal expense", async () => {
    await seedExpense("guard_normal_1", false);
    const res = await DELETE(
      buildRequest(tokens.adminToken, "/api/expenses/guard_normal_1", "DELETE"),
      { params: Promise.resolve({ id: "guard_normal_1" }) }
    );
    expect(res.status).toBe(200);
    expect(await db.expense.findUnique({ where: { id: "guard_normal_1" } })).toBeNull();
  });
});