import { describe, it, expect, beforeEach } from "vitest";
import {
  seedUsers,
  buildRequest,
  TEST_ADMIN,
  TEST_MANAGER,
  type SeedResult,
} from "../helpers";
import { DELETE as DELETE_PAYROLL, PATCH } from "@/app/api/payroll/[id]/route";
import { GET as GET_PAYROLL_AUDIT } from "@/app/api/payroll/[id]/audit/route";
import {
  generatePayroll,
  approvePayroll,
  revertPayroll,
} from "@/services/hr.service";
import { recordPayrollPayment } from "@/services/hr.service";
import { db } from "@/lib/db";
import { toMinor } from "@/lib/money";

const PAYROLL_PARAMS = (id: string) => ({ params: Promise.resolve({ id }) });

describe("Payroll audit trail and admin controls (Plan-payroll.pdf §2 actions 13–14)", () => {
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

  async function junePayroll(createdById: string = TEST_ADMIN.id) {
    const { payroll } = await generatePayroll({
      employeeId: s.employee.id,
      periodStart: new Date("2026-06-01"),
      periodEnd: new Date("2026-06-30"),
      createdById,
    });
    return payroll;
  }

  async function del(payrollId: string, token: string) {
    const res = await DELETE_PAYROLL(
      buildRequest(`/api/payroll/${payrollId}`, { token, method: "DELETE" }),
      PAYROLL_PARAMS(payrollId)
    );
    return { status: res.status, body: await res.json() };
  }

  async function audit(payrollId: string, token: string) {
    const res = await GET_PAYROLL_AUDIT(
      buildRequest(`/api/payroll/${payrollId}/audit`, { token }),
      PAYROLL_PARAMS(payrollId)
    );
    return { status: res.status, body: await res.json() };
  }

  it("records who changed a payroll and when, from generation to revert", async () => {
    const payroll = await junePayroll();
    await approvePayroll(payroll.id, TEST_ADMIN.id);
    await recordPayrollPayment(payroll.id, TEST_ADMIN.id, {
      amountMinor: toMinor(10000),
      paymentMethod: "CASH",
    });
    await revertPayroll(payroll.id, TEST_MANAGER.id, "wrong overtime hours");

    const rows = await db.payrollAuditLog.findMany({
      where: { payrollId: payroll.id },
      orderBy: { createdAt: "asc" },
    });

    expect(rows.map((r) => r.action)).toEqual([
      "GENERATED",
      "APPROVED",
      "PAYMENT_RECORDED",
      "REVERTED",
    ]);
    for (const row of rows) {
      expect(row.userId).toBeTruthy();
      expect(row.createdAt).toBeInstanceOf(Date);
    }

    const paymentRow = rows.find((r) => r.action === "PAYMENT_RECORDED")!;
    expect(JSON.parse(paymentRow.newValues!).amountMinor).toBe(toMinor(10000));
    expect(JSON.parse(paymentRow.newValues!).status).toBe("PARTIALLY_PAID");

    const revertRow = rows.find((r) => r.action === "REVERTED")!;
    expect(revertRow.reason).toBe("wrong overtime hours");
    expect(revertRow.summary).toBe("wrong overtime hours");
  });

  it("retains old values only for Admin changes", async () => {
    // Admin edits/approvals keep the previous state.
    const adminPayroll = await junePayroll();
    const adminLine = (await db.payrollLine.findFirst({
      where: { payrollId: adminPayroll.id },
    }))!;
    const editRes = await PATCH(
      buildRequest(`/api/payroll/${adminPayroll.id}`, {
        token: s.adminToken,
        method: "PATCH",
        body: { lineId: adminLine.id, allowancesMinor: 500 },
      }),
      PAYROLL_PARAMS(adminPayroll.id)
    );
    expect(editRes.status).toBe(200);
    const editRow = await db.payrollAuditLog.findFirst({
      where: { payrollId: adminPayroll.id, action: "LINE_EDITED" },
      orderBy: { createdAt: "desc" },
    });
    expect(editRow).toBeTruthy();
    expect(editRow!.oldValues).toBeTruthy();
    expect(JSON.parse(editRow!.oldValues!).allowancesMinor).toBe(0);

    await approvePayroll(adminPayroll.id, TEST_ADMIN.id);
    const adminRow = await db.payrollAuditLog.findFirst({
      where: { payrollId: adminPayroll.id, action: "APPROVED" },
    });
    expect(adminRow).toBeTruthy();
    expect(adminRow!.oldValues).toBeTruthy();
    expect(JSON.parse(adminRow!.oldValues!).status).toBe("DRAFT");

    // A manager's edits and approvals log the action without old values.
    const { payroll: mgrPayroll } = await generatePayroll({
      employeeId: s.employee.id,
      periodStart: new Date("2026-07-01"),
      periodEnd: new Date("2026-07-31"),
      createdById: TEST_MANAGER.id,
    });
    const mgrLine = (await db.payrollLine.findFirst({
      where: { payrollId: mgrPayroll.id },
    }))!;
    const mgrEditRes = await PATCH(
      buildRequest(`/api/payroll/${mgrPayroll.id}`, {
        token: s.managerToken,
        method: "PATCH",
        body: { lineId: mgrLine.id, allowancesMinor: 750 },
      }),
      PAYROLL_PARAMS(mgrPayroll.id)
    );
    expect(mgrEditRes.status).toBe(200);
    const mgrEditRow = await db.payrollAuditLog.findFirst({
      where: { payrollId: mgrPayroll.id, action: "LINE_EDITED" },
    });
    expect(mgrEditRow).toBeTruthy();
    expect(mgrEditRow!.oldValues).toBeNull();

    await approvePayroll(mgrPayroll.id, TEST_MANAGER.id);
    const mgrRow = await db.payrollAuditLog.findFirst({
      where: { payrollId: mgrPayroll.id, action: "APPROVED" },
    });
    expect(mgrRow).toBeTruthy();
    expect(mgrRow!.oldValues).toBeNull();
  });

  it("admin deletion of a paid payroll reverses the journal and preserves history", async () => {
    const payroll = await junePayroll();
    await approvePayroll(payroll.id, TEST_ADMIN.id);
    await recordPayrollPayment(payroll.id, TEST_ADMIN.id, {
      paymentMethod: "CASH",
      note: "full settlement",
    });

    const { status, body } = await del(payroll.id, s.adminToken);
    expect(status, JSON.stringify(body)).toBe(200);

    // The payroll record (and its cascade children) are gone...
    expect(await db.payroll.findUnique({ where: { id: payroll.id } })).toBeNull();
    expect(await db.payrollLine.count({ where: { payrollId: payroll.id } })).toBe(0);
    expect(await db.payrollPayment.count({ where: { payrollId: payroll.id } })).toBe(0);

    // ...but the cash history survives with its historical payrollId.
    const cash = await db.cashTransaction.findFirst({
      where: { type: "SALARY_PAYMENT", payrollId: payroll.id },
    });
    expect(cash).toBeTruthy();

    // Every approval/payment entry got a reversal, so the journal stays balanced.
    const reversals = await db.accountingEntry.findMany({
      where: {
        type: "PAYROLL_REVERSAL",
        description: { contains: "deleted payroll 2026-06-01" },
      },
    });
    expect(reversals).toHaveLength(2);
    const reversedTypes: string[] = [];
    for (const rev of reversals) {
      expect(rev.reversalOfId).toBeTruthy();
      const original = await db.accountingEntry.findUnique({
        where: { id: rev.reversalOfId! },
      });
      expect(original).toBeTruthy();
      expect(rev.amountMinor).toBe(-original!.amountMinor);
      reversedTypes.push(original!.type);
    }
    expect(reversedTypes.sort()).toEqual(["PAYROLL_APPROVAL", "PAYROLL_PAYMENT"]);

    // The DELETED audit row survives the deletion with its snapshot.
    const delRow = await db.payrollAuditLog.findFirst({
      where: { payrollId: payroll.id, action: "DELETED" },
    });
    expect(delRow).toBeTruthy();
    expect(delRow!.userId).toBe(TEST_ADMIN.id);
    const snapshot = JSON.parse(delRow!.oldValues!).payroll;
    expect(snapshot.status).toBe("PAID");
    expect(snapshot.payments).toHaveLength(1);
    expect(snapshot.payments[0].paymentMethod).toBe("CASH");
    expect(snapshot.lines).toHaveLength(1);
  });

  it("non-admins still cannot delete an approved payroll", async () => {
    const payroll = await junePayroll();
    await approvePayroll(payroll.id, TEST_MANAGER.id);

    const { status, body } = await del(payroll.id, s.managerToken);
    expect(status).toBe(400);
    expect(body.error).toMatch(/Only a draft payroll can be deleted/);
    expect(await db.payroll.findUnique({ where: { id: payroll.id } })).toBeTruthy();
  });

  it("requires payroll manage permission to delete a payroll", async () => {
    const payroll = await junePayroll();

    const { status } = await del(payroll.id, s.userToken);
    expect(status).toBe(403);
    expect(await db.payroll.findUnique({ where: { id: payroll.id } })).toBeTruthy();
  });

  it("exposes the trail through the audit endpoint with actor details", async () => {
    const payroll = await junePayroll();
    await approvePayroll(payroll.id, TEST_ADMIN.id);

    const { status, body } = await audit(payroll.id, s.adminToken);
    expect(status).toBe(200);
    const actions = body.data.map((r: any) => r.action);
    expect(actions).toContain("GENERATED");
    expect(actions).toContain("APPROVED");

    const approved = body.data.find((r: any) => r.action === "APPROVED");
    expect(approved.user.id).toBe(TEST_ADMIN.id);
    expect(approved.user.role).toBe("ADMIN");

    // Without employees:payroll:view the trail is not exposed.
    const forbidden = await audit(payroll.id, s.userToken);
    expect(forbidden.status).toBe(403);
  });
});
