import { describe, it, expect, beforeEach } from "vitest";
import { seedUsers, buildRequest, TEST_ADMIN, type SeedResult } from "../helpers";
import { POST as APPROVE } from "@/app/api/employees/[id]/payroll/route";
import { POST as PAY, GET as GET_PAYMENTS } from "@/app/api/payroll/[id]/payments/route";
import { generatePayroll } from "@/services/hr.service";
import { db } from "@/lib/db";
import { toMinor } from "@/lib/money";

const PAYROLL_PARAMS = (id: string) => ({ params: Promise.resolve({ id }) });

describe("Payroll approval is separate from payment (Plan-payroll.pdf §2 action 6)", () => {
  let s: SeedResult;

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

  async function approve(payrollId: string) {
    const res = await APPROVE(
      buildRequest(`/api/employees/${s.employee.id}/payroll`, {
        token: s.adminToken,
        method: "POST",
        body: { action: "approve", payrollId },
      }),
      { params: Promise.resolve({ id: s.employee.id }) }
    );
    return { status: res.status, body: await res.json() };
  }

  async function pay(payrollId: string, body: Record<string, unknown>, token?: string) {
    const res = await PAY(
      buildRequest(`/api/payroll/${payrollId}/payments`, {
        token: token ?? s.adminToken,
        method: "POST",
        body,
      }),
      PAYROLL_PARAMS(payrollId)
    );
    return { status: res.status, body: await res.json() };
  }

  it("approval posts the salary accounting entry without moving any cash", async () => {
    const payroll = await junePayroll();
    const { status, body } = await approve(payroll.id);
    expect(status).toBe(200);
    expect(body.data.status).toBe("APPROVED");
    expect(body.data.totalPaidMinor).toBe(0);
    expect(body.data.lines[0].paymentStatus).toBe("UNPAID");

    const salaryTxns = await db.cashTransaction.count({
      where: { payrollId: payroll.id, type: "SALARY_PAYMENT" },
    });
    expect(salaryTxns).toBe(0);

    const entry = await db.accountingEntry.findFirst({
      where: { payrollId: payroll.id, type: "PAYROLL_APPROVAL" },
    });
    expect(entry).toBeTruthy();
    expect(entry!.amountMinor).toBe(-toMinor(25000));
    expect(entry!.postedById).toBe(TEST_ADMIN.id);
  });

  it("settles a payroll in partial payments with different methods", async () => {
    const payroll = await junePayroll();
    await approve(payroll.id);

    const first = await pay(payroll.id, {
      amountMinor: toMinor(10000),
      paymentMethod: "CASH",
      note: "first installment",
    });
    expect(first.status).toBe(200);
    expect(first.body.data.status).toBe("PARTIALLY_PAID");
    expect(first.body.data.totalPaidMinor).toBe(toMinor(10000));
    expect(first.body.data.lines[0].paymentStatus).toBe("PARTIALLY_PAID");

    const second = await pay(payroll.id, {
      amountMinor: toMinor(15000),
      paymentMethod: "BANK_TRANSFER",
      reference: "TRF-1",
    });
    expect(second.status).toBe(200);
    expect(second.body.data.status).toBe("PAID");
    expect(second.body.data.totalPaidMinor).toBe(toMinor(25000));
    expect(second.body.data.lines[0].paymentStatus).toBe("PAID");

    // Each payment is its own transaction, ledger row and accounting entry.
    const payments = await db.payrollPayment.findMany({
      where: { payrollId: payroll.id },
      orderBy: { paidAt: "asc" },
    });
    expect(payments.map((p) => p.paymentMethod)).toEqual(["CASH", "BANK_TRANSFER"]);
    expect(payments.map((p) => p.amountMinor)).toEqual([toMinor(10000), toMinor(15000)]);

    const salaryTxns = await db.cashTransaction.findMany({
      where: { payrollId: payroll.id, type: "SALARY_PAYMENT" },
    });
    expect(salaryTxns).toHaveLength(2);
    expect(salaryTxns.reduce((sum, t) => sum + t.amount, 0)).toBe(25000);

    const entries = await db.accountingEntry.findMany({
      where: { payrollId: payroll.id, type: "PAYROLL_PAYMENT" },
    });
    expect(entries).toHaveLength(2);
    expect(entries.reduce((sum, e) => sum + e.amountMinor, 0)).toBe(-toMinor(25000));

    // Paying an already settled payroll is rejected.
    const third = await pay(payroll.id, { amountMinor: toMinor(1000), paymentMethod: "CASH" });
    expect(third.status).toBe(400);
    expect(third.body.error).toMatch(/fully paid/i);
  });

  it("rejects a payment larger than the remaining payable", async () => {
    const payroll = await junePayroll();
    await approve(payroll.id);
    await pay(payroll.id, { amountMinor: toMinor(10000), paymentMethod: "CASH" });

    const res = await pay(payroll.id, {
      amountMinor: toMinor(20000),
      paymentMethod: "CASH",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/exceeds/i);
    expect(res.body.data?.totalPaidMinor ?? toMinor(10000)).toBe(toMinor(10000));
  });

  it("rejects a payment on a draft payroll", async () => {
    const payroll = await junePayroll();
    const res = await pay(payroll.id, { paymentMethod: "CASH" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/approved/i);
  });

  it("exposes the payment history through the endpoint", async () => {
    const payroll = await junePayroll();
    await approve(payroll.id);
    await pay(payroll.id, { amountMinor: toMinor(9000), paymentMethod: "CASH" });

    const res = await GET_PAYMENTS(
      buildRequest(`/api/payroll/${payroll.id}/payments`, { token: s.adminToken }),
      PAYROLL_PARAMS(payroll.id)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.payments).toHaveLength(1);
    expect(body.data.paidMinor).toBe(toMinor(9000));
    expect(body.data.payments[0].amountMinor).toBe(toMinor(9000));
  });

  it("requires employees:payroll:manage to record a payment", async () => {
    const payroll = await junePayroll();
    await approve(payroll.id);
    const res = await pay(
      payroll.id,
      { amountMinor: toMinor(1000), paymentMethod: "CASH" },
      s.userToken
    );
    expect(res.status).toBe(403);
  });
});
