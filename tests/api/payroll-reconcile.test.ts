import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { seedUsers, buildRequest, type SeedResult } from "../helpers";
import { POST } from "@/app/api/payroll/reconcile-payments/route";

async function makeApprovedPayroll(adminId: string) {
  const employee = await db.employee.create({
    data: {
      fullName: `Reconcile Route ${randomUUID().slice(0, 8)}`,
      fatherName: "F",
      phoneNumber: "0700000001",
      jobTitle: "Driver",
      department: "LABOR",
      hireDate: new Date("2026-01-01"),
      createdBy: adminId,
    },
  });

  const payroll = await db.payroll.create({
    data: {
      employeeId: employee.id,
      periodStart: new Date("2026-09-01"),
      periodEnd: new Date("2026-09-30"),
      status: "APPROVED",
      totalPaidMinor: 0,
      createdById: adminId,
      lines: {
        create: {
          employeeId: employee.id,
          baseSalaryMinor: 1_000_000,
          grossPayMinor: 1_000_000,
          netPayableMinor: 1_000_000,
          netPayMinor: 1_000_000,
          paymentStatus: "UNPAID",
        },
      },
    },
  });

  await db.expense.create({
    data: {
      title: "Salary payment",
      category: "SALARY",
      amount: 10_000,
      paymentMethod: "CASH",
      paidTo: employee.fullName,
      paidBy: "Admin",
      expenseDate: new Date("2026-09-30"),
      createdBy: adminId,
      approvalStatus: "APPROVED",
      payrollId: payroll.id,
    },
  });

  return payroll;
}

describe("POST /api/payroll/reconcile-payments", () => {
  let s: SeedResult;

  beforeEach(async () => {
    s = await seedUsers();
  });

  it("requires authentication", async () => {
    const res = await POST(buildRequest("/api/payroll/reconcile-payments", { method: "POST" }));
    expect(res.status).toBe(401);
  });

  it("reconciles a payroll from its linked salary expense", async () => {
    const payroll = await makeApprovedPayroll(s.admin.id);

    const res = await POST(
      buildRequest("/api/payroll/reconcile-payments", {
        method: "POST",
        token: s.adminToken,
        body: { payrollIds: [payroll.id] },
      })
    );
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.updated).toBe(1);
    expect(json.data.paid).toBe(1);

    const saved = await db.payroll.findUniqueOrThrow({ where: { id: payroll.id } });
    expect(saved.status).toBe("PAID");
    expect(saved.totalPaidMinor).toBe(1_000_000);
  });

  it("does not write in dry-run mode", async () => {
    const payroll = await makeApprovedPayroll(s.admin.id);

    const res = await POST(
      buildRequest("/api/payroll/reconcile-payments", {
        method: "POST",
        token: s.adminToken,
        body: { payrollIds: [payroll.id], dryRun: true },
      })
    );
    const json = await res.json();
    expect(json.data.updated).toBe(1);
    expect(json.data.dryRun).toBe(true);

    const saved = await db.payroll.findUniqueOrThrow({ where: { id: payroll.id } });
    expect(saved.status).toBe("APPROVED");
    expect(saved.totalPaidMinor).toBe(0);
  });
});
