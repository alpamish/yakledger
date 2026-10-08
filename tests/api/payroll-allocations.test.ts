import { describe, it, expect, beforeEach } from "vitest";
import {
  seedUsers,
  buildRequest,
  TEST_ADMIN,
  TEST_USER,
  TEST_MANAGER,
  type SeedResult,
} from "../helpers";
import { GET as GET_ALLOC, POST as POST_ALLOC } from "@/app/api/payroll/[id]/allocations/route";
import {
  generatePayroll,
  approvePayroll,
  recordPayrollPayment,
} from "@/services/hr.service";
import { db } from "@/lib/db";
import { toMinor } from "@/lib/money";

const PAYROLL_PARAMS = (id: string) => ({ params: Promise.resolve({ id }) });
const GROSS = toMinor(25000); // full-month June salary

describe("Project salary allocation (Plan-payroll.pdf §2 action 11)", () => {
  let s: SeedResult;
  let payrollId: string;

  beforeEach(async () => {
    s = await seedUsers();
    await db.employee.update({
      where: { id: s.employee.id },
      data: {
        hireDate: new Date("2026-01-01"),
        baseSalaryMinor: toMinor(25000),
        workStartTime: "07:00",
        workEndTime: "18:00",
        breakMinutes: 60,
      },
    });
    await db.salaryHistory.create({
      data: {
        employeeId: s.employee.id,
        amountMinor: toMinor(25000),
        currency: "AFN",
        effectiveFrom: new Date("2026-01-01"),
      },
    });
    const { payroll } = await generatePayroll({
      employeeId: s.employee.id,
      periodStart: new Date("2026-06-01"),
      periodEnd: new Date("2026-06-30"),
      createdById: TEST_ADMIN.id,
    });
    payrollId = payroll.id;
  });

  async function setAlloc(
    allocations: { project: string; mode: "PERCENT" | "AMOUNT"; value: number }[],
    token: string = s.adminToken
  ) {
    const res = await POST_ALLOC(
      buildRequest(`/api/payroll/${payrollId}/allocations`, {
        token,
        method: "POST",
        body: { allocations },
      }),
      PAYROLL_PARAMS(payrollId)
    );
    return { status: res.status, body: await res.json() };
  }

  async function getAlloc(token: string = s.adminToken) {
    const res = await GET_ALLOC(
      buildRequest(`/api/payroll/${payrollId}/allocations`, { token }),
      PAYROLL_PARAMS(payrollId)
    );
    return { status: res.status, body: await res.json() };
  }

  it("normalizes percentages that do not add up to 100", async () => {
    const { status, body } = await setAlloc([
      { project: "Highway A", mode: "PERCENT", value: 40 },
      { project: "Bridge B", mode: "PERCENT", value: 40 },
    ]);
    expect(status).toBe(200);

    const rows = body.data;
    expect(rows).toHaveLength(2);
    expect(rows[0].percentage).toBeCloseTo(50, 6);
    expect(rows[1].percentage).toBeCloseTo(50, 6);
    expect(rows[0].amountMinor).toBe(GROSS / 2);
    expect(rows[1].amountMinor).toBe(GROSS / 2);
    expect(rows[0].amountMinor + rows[1].amountMinor).toBe(GROSS);
    // The original entries are preserved for auditability.
    expect(rows[0].enteredValue).toBe(40);
  });

  it("converts fixed AFN amounts into normalized percentages", async () => {
    const { status, body } = await setAlloc([
      { project: "Yard", mode: "AMOUNT", value: 1500 },
      { project: "Clinic", mode: "AMOUNT", value: 500 },
    ]);
    expect(status).toBe(200);

    const rows = body.data;
    // 1500/25000 = 60% and 500/25000 = 20% of the gross → 75% / 25%.
    expect(rows[0].percentage).toBeCloseTo(75, 6);
    expect(rows[1].percentage).toBeCloseTo(25, 6);
    expect(rows[0].amountMinor).toBe(toMinor(18750));
    expect(rows[1].amountMinor).toBe(toMinor(6250));
    expect(rows[0].amountMinor + rows[1].amountMinor).toBe(GROSS);
  });

  it("normalizes mixed percentage and amount rows together", async () => {
    const { status, body } = await setAlloc([
      { project: "Roads", mode: "PERCENT", value: 50 },
      { project: "Water", mode: "AMOUNT", value: 2500 },
    ]);
    expect(status).toBe(200);

    const rows = body.data;
    // Weights: 50% and (2500/25000) = 10% → 50/60 and 10/60 of the total.
    expect(rows[0].percentage).toBeCloseTo((50 / 60) * 100, 6);
    expect(rows[1].percentage).toBeCloseTo((10 / 60) * 100, 6);
    expect(rows[0].amountMinor + rows[1].amountMinor).toBe(GROSS);
  });

  it("keeps the allocated amounts summing exactly to the gross pay", async () => {
    const { status, body } = await setAlloc([
      { project: "A", mode: "PERCENT", value: 1 },
      { project: "B", mode: "PERCENT", value: 1 },
      { project: "C", mode: "PERCENT", value: 1 },
    ]);
    expect(status).toBe(200);

    const rows = body.data;
    expect(rows).toHaveLength(3);
    for (const r of rows) expect(r.percentage).toBeCloseTo(100 / 3, 4);
    const sum = rows.reduce((t: number, r: any) => t + r.amountMinor, 0);
    expect(sum).toBe(GROSS);
  });

  it("returns the saved allocation on GET and clears it with an empty list", async () => {
    await setAlloc([
      { project: "Highway A", mode: "PERCENT", value: 60 },
      { project: "Bridge B", mode: "PERCENT", value: 40 },
    ]);

    const got = await getAlloc();
    expect(got.status).toBe(200);
    expect(got.body.data).toHaveLength(2);
    expect(got.body.data[0].project).toBe("Highway A");

    const cleared = await setAlloc([]);
    expect(cleared.status).toBe(200);
    expect(cleared.body.data).toEqual([]);

    const after = await getAlloc();
    expect(after.body.data).toEqual([]);
  });

  it("writes an ALLOCATIONS_SET audit entry", async () => {
    await setAlloc([{ project: "Highway A", mode: "PERCENT", value: 100 }]);

    const rows = await db.payrollAuditLog.findMany({
      where: { payrollId, action: "ALLOCATIONS_SET" },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(TEST_ADMIN.id);
    const created = JSON.parse(rows[0].newValues!);
    expect(created[0].project).toBe("Highway A");
    expect(created[0].percentage).toBeCloseTo(100, 6);
  });

  it("blocks allocation changes once a payment is recorded, but allows unpaid approved payrolls", async () => {
    await approvePayroll(payrollId, TEST_ADMIN.id);

    const approvedOk = await setAlloc(
      [{ project: "Highway A", mode: "PERCENT", value: 100 }],
      s.managerToken
    );
    expect(approvedOk.status).toBe(200);

    await recordPayrollPayment(payrollId, TEST_ADMIN.id, {
      amountMinor: toMinor(10000),
      paymentMethod: "CASH",
    });

    const blocked = await setAlloc([
      { project: "Bridge B", mode: "PERCENT", value: 100 },
    ]);
    expect(blocked.status).toBe(400);
    expect(blocked.body.error).toMatch(/after payment/i);

    const stored = await db.payrollLineProjectAllocation.findMany({
      where: { payrollId },
    });
    expect(stored).toHaveLength(1);
    expect(stored[0].project).toBe("Highway A");
  });

  it("requires payroll permissions for both directions", async () => {
    const post = await setAlloc(
      [{ project: "X", mode: "PERCENT", value: 100 }],
      s.userToken
    );
    expect(post.status).toBe(403);

    const get = await getAlloc(s.userToken);
    expect(get.status).toBe(403);
    expect(TEST_USER.role).toBe("USER");
    expect(TEST_MANAGER.role).toBe("MANAGER");
  });
});
