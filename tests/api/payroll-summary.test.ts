import { describe, it, expect, beforeEach } from "vitest";
import {
  seedUsers,
  buildRequest,
  TEST_ADMIN,
  type SeedResult,
} from "../helpers";
import { GET as PAYROLL_SUMMARY } from "@/app/api/payroll/summary/route";
import {
  generatePayroll,
  approvePayroll,
  recordPayrollPayment,
} from "@/services/hr.service";
import { db } from "@/lib/db";
import { toMinor } from "@/lib/money";

async function summary(token: string) {
  const res = await PAYROLL_SUMMARY(buildRequest("/api/payroll/summary", { token }));
  return { status: res.status, body: await res.json() };
}

describe("Outstanding unpaid salary liability (Plan-payroll.pdf §1 dashboard)", () => {
  let s: SeedResult;

  beforeEach(async () => {
    s = await seedUsers();
    // Tests in this file share one database; start from a clean payroll slate.
    await db.payroll.deleteMany();
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
  });

  async function junePayroll() {
    const { payroll } = await generatePayroll({
      employeeId: s.employee.id,
      periodStart: new Date("2026-06-01"),
      periodEnd: new Date("2026-06-30"),
      createdById: TEST_ADMIN.id,
    });
    return payroll;
  }

  it("counts the remaining pay of approved payrolls and shrinks after partial payment", async () => {
    const payroll = await junePayroll();
    await approvePayroll(payroll.id, TEST_ADMIN.id);

    let res = await summary(s.adminToken);
    expect(res.status).toBe(200);
    expect(res.body.data.unpaidPayrolls).toBe(1);
    expect(res.body.data.outstandingSalaryMinor).toBe(toMinor(25000));

    await recordPayrollPayment(payroll.id, TEST_ADMIN.id, {
      amountMinor: toMinor(10000),
      paymentMethod: "CASH",
    });

    res = await summary(s.adminToken);
    expect(res.body.data.unpaidPayrolls).toBe(1);
    expect(res.body.data.outstandingSalaryMinor).toBe(toMinor(15000));
  });

  it("excludes drafts, fully paid and cancelled payrolls", async () => {
    const draft = await junePayroll();

    let res = await summary(s.adminToken);
    expect(res.body.data).toEqual({
      outstandingSalaryMinor: 0,
      unpaidPayrolls: 0,
    });

    await approvePayroll(draft.id, TEST_ADMIN.id);
    await recordPayrollPayment(draft.id, TEST_ADMIN.id, {
      paymentMethod: "CASH",
    });

    const paid = await db.payroll.findUnique({ where: { id: draft.id } });
    expect(paid!.status).toBe("PAID");
    expect(paid!.totalPaidMinor).toBe(toMinor(25000));

    // A draft payroll for another period is not a payable liability yet.
    await generatePayroll({
      employeeId: s.employee.id,
      periodStart: new Date("2026-07-01"),
      periodEnd: new Date("2026-07-31"),
      createdById: TEST_ADMIN.id,
    });

    res = await summary(s.adminToken);
    expect(res.body.data).toEqual({
      outstandingSalaryMinor: 0,
      unpaidPayrolls: 0,
    });
  });

  it("requires payroll view permission", async () => {
    const res = await summary(s.userToken);
    expect(res.status).toBe(403);
  });
});
