import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { seedUsers, buildRequest, type SeedResult } from "../helpers";
import {
  GET as listAdjustments,
  POST as createAdjustment,
} from "@/app/api/payroll/adjustments/route";
import { DELETE as deleteAdjustment } from "@/app/api/payroll/adjustments/[id]/route";
import { generatePayroll, approvePayroll } from "@/services/hr.service";
import { toMinor } from "@/lib/money";

async function makeEmployee(userId: string) {
  return db.employee.create({
    data: {
      fullName: "API Adjustment Emp",
      fatherName: "F",
      phoneNumber: "0700000000",
      jobTitle: "Driver",
      department: "LABOR",
      employmentType: "FULL_TIME",
      hireDate: new Date("2026-01-01"),
      status: "ACTIVE",
      createdBy: userId,
      baseSalaryMinor: toMinor(25000),
      workStartTime: "07:00",
      workEndTime: "18:00",
      breakMinutes: 60,
    },
  });
}

describe("Payroll adjustment routes (Plan-payroll.pdf §1)", () => {
  let s: SeedResult;
  let emp: any;

  beforeEach(async () => {
    s = await seedUsers();
    emp = await makeEmployee(s.admin.id);
    await db.salaryHistory.create({
      data: {
        employeeId: emp.id,
        amountMinor: toMinor(25000),
        currency: "AFN",
        effectiveFrom: new Date("2026-01-01"),
      },
    });
  });

  async function juneDraft() {
    const { payroll } = await generatePayroll({
      employeeId: emp.id,
      periodStart: new Date("2026-06-01"),
      periodEnd: new Date("2026-06-30"),
      createdById: s.admin.id,
    });
    return payroll;
  }

  const draftLine = async (payrollId: string) =>
    (await db.payroll.findUnique({
      where: { id: payrollId },
      include: { lines: true },
    }))!.lines[0];

  const post = (token: string, body: Record<string, unknown>) =>
    createAdjustment(
      buildRequest("/api/payroll/adjustments", { token, method: "POST", body })
    );

  it("rejects a missing reason and a non-positive amount", async () => {
    const noReason = await post(s.adminToken, {
      employeeId: emp.id,
      kind: "OTHER",
      direction: "DEDUCTION",
      amount: 500,
      reason: "   ",
    });
    expect(noReason.status).toBe(400);
    expect((await noReason.json()).error).toContain("reason");

    const badAmount = await post(s.adminToken, {
      employeeId: emp.id,
      kind: "OTHER",
      direction: "DEDUCTION",
      amount: 0,
      reason: "Zero",
    });
    expect(badAmount.status).toBe(400);
  });

  it("enforces employees:payroll permissions on create and list", async () => {
    const forbiddenCreate = await post(s.userToken, {
      employeeId: emp.id,
      kind: "OTHER",
      direction: "DEDUCTION",
      amount: 500,
      reason: "No permission",
    });
    expect(forbiddenCreate.status).toBe(403);

    const forbiddenList = await listAdjustments(
      buildRequest("/api/payroll/adjustments", { token: s.userToken })
    );
    expect(forbiddenList.status).toBe(403);

    const allowedList = await listAdjustments(
      buildRequest("/api/payroll/adjustments", { token: s.adminToken })
    );
    expect(allowedList.status).toBe(200);
    expect((await allowedList.json()).data).toEqual([]);
  });

  it("creates an adjustment, refreshes the draft, and lists it", async () => {
    const june = await juneDraft();
    expect((await draftLine(june.id)).grossPayMinor).toBe(toMinor(25000));

    const res = await post(s.adminToken, {
      employeeId: emp.id,
      kind: "OTHER",
      direction: "DEDUCTION",
      amount: 500,
      reason: "Damaged drill",
      note: "From workshop report",
    });
    expect(res.status).toBe(200);
    const created = (await res.json()).data;
    expect(created.source).toBe("MANUAL");
    expect(created.direction).toBe("DEDUCTION");
    expect(created.amountMinor).toBe(toMinor(500));
    expect(created.payrollId).toBeNull();

    // The existing draft followed immediately.
    expect((await draftLine(june.id)).grossPayMinor).toBe(toMinor(24500));

    const list = await listAdjustments(
      buildRequest(`/api/payroll/adjustments?employeeId=${emp.id}`, {
        token: s.adminToken,
      })
    );
    expect(list.status).toBe(200);
    const rows = (await list.json()).data;
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(created.id);
    expect(rows[0].employee.fullName).toBe("API Adjustment Emp");
  });

  it("MANAGER can create; the direction is implied by the kind", async () => {
    const res = await post(s.managerToken, {
      employeeId: emp.id,
      kind: "PREVIOUS_UNDERPAYMENT_EARNING",
      amount: 250,
      reason: "Underpaid last month",
    });
    expect(res.status).toBe(200);
    expect((await res.json()).data.direction).toBe("EARNING");

    const june = await juneDraft();
    expect((await draftLine(june.id)).grossPayMinor).toBe(toMinor(25250));
  });

  it("deletes an unposted adjustment but refuses a posted one", async () => {
    const created = (
      await (
        await post(s.adminToken, {
          employeeId: emp.id,
          kind: "OTHER",
          direction: "DEDUCTION",
          amount: 500,
          reason: "Removable",
        })
      ).json()
    ).data;

    const removed = await deleteAdjustment(
      buildRequest(`/api/payroll/adjustments/${created.id}`, {
        token: s.adminToken,
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: created.id }) }
    );
    expect(removed.status).toBe(200);
    expect(
      await db.payrollAdjustment.findUnique({ where: { id: created.id } })
    ).toBeNull();

    const posted = (
      await (
        await post(s.adminToken, {
          employeeId: emp.id,
          kind: "OTHER",
          direction: "DEDUCTION",
          amount: 500,
          reason: "Stays",
        })
      ).json()
    ).data;
    const june = await juneDraft();
    await approvePayroll(june.id, s.admin.id);

    const refused = await deleteAdjustment(
      buildRequest(`/api/payroll/adjustments/${posted.id}`, {
        token: s.adminToken,
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: posted.id }) }
    );
    expect(refused.status).toBe(400);
    expect((await refused.json()).error).toMatch(/already posted/);
  });
});
