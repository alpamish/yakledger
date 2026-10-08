import { describe, it, expect, beforeEach } from "vitest";
import { seedUsers, buildRequest, type SeedResult } from "../helpers";
import { POST as createTransaction, GET as listTransactions } from "@/app/api/cash-transactions/route";
import { GET as getAlerts } from "@/app/api/employees/alerts/route";
import { db } from "@/lib/db";

async function issueAdvance(
  token: string,
  employeeId: string,
  body: Record<string, unknown>
) {
  const res = await createTransaction(
    buildRequest("/api/cash-transactions", {
      token,
      method: "POST",
      body: { employeeId, type: "ADVANCE", amount: 5000, ...body },
    })
  );
  expect(res.status).toBe(201);
  return (await res.json()).data as { id: string; dueDate?: string | null };
}

async function overdueAlerts(token: string, employeeId: string) {
  const res = await getAlerts(
    buildRequest("/api/employees/alerts", { token })
  );
  expect(res.status).toBe(200);
  const body = await res.json();
  return body.data.alerts.filter(
    (a: any) => a.type === "ADVANCE_OVERDUE" && a.employeeId === employeeId
  );
}

describe("Advance due dates (Plan-payroll.pdf §2 action 2)", () => {
  let s: SeedResult;

  beforeEach(async () => {
    s = await seedUsers();
  });

  it("stores the due date and reports the allocated amount on the list", async () => {
    const advance = await issueAdvance(s.adminToken, s.employee.id, {
      dueDate: "2026-06-30",
      note: "site cash",
    });
    expect(advance.dueDate).toBeTruthy();
    expect(new Date(advance.dueDate!).toISOString().slice(0, 10)).toBe("2026-06-30");

    const list = await listTransactions(
      buildRequest("/api/cash-transactions", { token: s.adminToken })
    );
    const body = await list.json();
    const row = body.data.find((t: { id: string }) => t.id === advance.id);
    expect(row.dueDate).toBeTruthy();
    expect(row.allocatedAmount).toBe(0);
  });

  it("warns about an overdue outstanding advance but not one still in the future", async () => {
    const overdue = await issueAdvance(s.adminToken, s.employee.id, {
      dueDate: "2020-01-01",
    });
    await issueAdvance(s.adminToken, s.employee.id, { dueDate: "2099-01-01" });

    const alerts = await overdueAlerts(s.adminToken, s.employee.id);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].employeeId).toBe(s.employee.id);
    expect(alerts[0].severity).toBe("warning");
    expect(alerts[0].dueDate).toBeTruthy();

    // A fully allocated advance is settled and stops warning.
    await db.payroll.create({
      data: {
        employeeId: s.employee.id,
        periodStart: new Date("2026-01-01"),
        periodEnd: new Date("2026-01-31"),
        status: "APPROVED",
      },
    });
    const payroll = await db.payroll.findFirst({
      where: { employeeId: s.employee.id },
      orderBy: { createdAt: "desc" },
    });
    await db.payrollAdvanceAllocation.create({
      data: {
        payrollId: payroll!.id,
        cashTransactionId: overdue.id,
        amountMinor: 500000,
      },
    });

    expect(await overdueAlerts(s.adminToken, s.employee.id)).toHaveLength(0);
  });

  it("rejects a non-date due date", async () => {
    const res = await createTransaction(
      buildRequest("/api/cash-transactions", {
        token: s.adminToken,
        method: "POST",
        body: { employeeId: s.employee.id, type: "ADVANCE", amount: 100, dueDate: "not-a-date" },
      })
    );
    expect(res.status).toBe(400);
  });
});
