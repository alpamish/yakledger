import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import {
  generatePayroll,
  approvePayroll,
  recordPayrollPayment,
  updatePayrollLine,
} from "@/services/hr.service";
import { toMinor } from "@/lib/money";

async function makeUser(role: string, email: string) {
  return db.user.create({ data: { email, name: email, password: "x", role } });
}

async function makeEmployee(userId: string, extra: any = {}) {
  return db.employee.create({
    data: {
      fullName: "Edit Emp",
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
      ...extra,
    },
  });
}

async function addSalary(empId: string, amountMinor: number) {
  await db.salaryHistory.create({
    data: {
      employeeId: empId,
      amountMinor,
      currency: "AFN",
      effectiveFrom: new Date("2026-01-01"),
    },
  });
}

async function addAdvance(empId: string, amountMajor: number, createdAt: Date, userId: string) {
  return db.cashTransaction.create({
    data: {
      employeeId: empId,
      type: "ADVANCE",
      amount: amountMajor,
      approvalStatus: "APPROVED",
      createdBy: userId,
      approvedById: userId,
      approvedAt: createdAt,
      createdAt,
    },
  });
}

describe("Payroll editing until and through payment (Plan-payroll.pdf §1)", () => {
  let user: any;
  let emp: any;
  let payrollId: string;
  let lineId: string;

  beforeEach(async () => {
    user = await makeUser("ADMIN", `edit-${Date.now()}-${Math.random()}@t.co`);
    emp = await makeEmployee(user.id);
    await addSalary(emp.id, toMinor(25000));
  });

  async function junePayroll() {
    const { payroll } = await generatePayroll({
      employeeId: emp.id,
      periodStart: new Date("2026-06-01"),
      periodEnd: new Date("2026-06-30"),
      createdById: user.id,
    });
    payrollId = payroll.id;
    lineId = payroll.lines[0].id;
    return payroll;
  }

  it("lets HR edit an approved unpaid payroll and corrects the approval entry", async () => {
    const payroll = await junePayroll();
    await approvePayroll(payroll.id, user.id);

    const originalApproval = await db.accountingEntry.findFirst({
      where: { payrollId, type: "PAYROLL_APPROVAL", reversalOfId: null },
    });
    expect(originalApproval).toBeTruthy();
    expect(originalApproval!.amountMinor).toBe(-toMinor(25000));

    const updated = await updatePayrollLine(
      lineId,
      { allowancesMinor: toMinor(500) },
      user.id
    );

    // Payment has not begun: the payroll stays approved and editable.
    expect(updated!.status).toBe("APPROVED");
    const line = updated!.lines[0];
    expect(line.grossPayMinor).toBe(toMinor(25500));
    expect(line.netPayableMinor).toBe(toMinor(25500));

    // Accounting correction: the original entry survives untouched, a reversal
    // cancels it and a corrected accrual replaces it.
    const original = await db.accountingEntry.findUnique({
      where: { id: originalApproval!.id },
    });
    expect(original!.amountMinor).toBe(-toMinor(25000));

    const reversal = await db.accountingEntry.findFirst({
      where: { payrollId, type: "PAYROLL_REVERSAL", reversalOfId: originalApproval!.id },
    });
    expect(reversal).toBeTruthy();
    expect(reversal!.amountMinor).toBe(toMinor(25000));

    // Both approval rows survive (history), but only the corrected one is
    // still active — the original has a reversal pointing at it.
    const approvals = await db.accountingEntry.findMany({
      where: { payrollId, type: "PAYROLL_APPROVAL" },
    });
    expect(approvals).toHaveLength(2);
    const reversedIds = new Set(
      (
        await db.accountingEntry.findMany({
          where: { payrollId, type: "PAYROLL_REVERSAL", reversalOfId: { not: null } },
          select: { reversalOfId: true },
        })
      ).map((r) => r.reversalOfId)
    );
    const active = approvals.filter((a) => !reversedIds.has(a.id));
    expect(active).toHaveLength(1);
    expect(active[0].id).not.toBe(originalApproval!.id);
    expect(active[0].amountMinor).toBe(-toMinor(25500));

    const audit = await db.payrollAuditLog.findFirst({
      where: { payrollId, action: "LINE_EDITED" },
    });
    expect(audit).toBeTruthy();
    expect(audit!.userId).toBe(user.id);
  });

  it("modifies a partially paid payroll while preserving payments and advance offsets", async () => {
    await addAdvance(emp.id, 5000, new Date("2026-03-01"), user.id);
    const payroll = await junePayroll();
    await approvePayroll(payroll.id, user.id);

    const approvedLine = (await db.payrollLine.findFirst({ where: { payrollId } }))!;
    expect(approvedLine.previousDebtMinor).toBe(toMinor(5000));

    await recordPayrollPayment(payroll.id, user.id, {
      amountMinor: toMinor(10000),
      paymentMethod: "CASH",
    });

    const before = await db.payroll.findUnique({
      where: { id: payrollId },
      include: { payments: true },
    });
    expect(before!.status).toBe("PARTIALLY_PAID");

    // A new advance appears after approval; a partially paid edit must not
    // silently rewrite the frozen offset taken at approval time.
    await addAdvance(emp.id, 7000, new Date("2026-04-01"), user.id);

    const updated = await updatePayrollLine(
      lineId,
      { bonusesMinor: toMinor(500) },
      user.id
    );

    expect(updated!.status).toBe("PARTIALLY_PAID");
    const line = updated!.lines[0];
    expect(line.grossPayMinor).toBe(toMinor(25500));
    expect(line.previousDebtMinor).toBe(toMinor(5000)); // frozen, not 12000
    expect(line.amountAlreadyReceivedMinor).toBe(toMinor(5000));
    expect(line.netPayMinor).toBe(toMinor(20500));
    expect(line.paymentStatus).toBe("PARTIALLY_PAID");

    // Financial history: payments and the paid total are untouched.
    expect(updated!.totalPaidMinor).toBe(toMinor(10000));
    const payments = await db.payrollPayment.findMany({ where: { payrollId } });
    expect(payments).toHaveLength(1);
    expect(payments[0].amountMinor).toBe(toMinor(10000));
    const cash = await db.cashTransaction.findMany({
      where: { employeeId: emp.id, type: "SALARY_PAYMENT" },
    });
    expect(cash).toHaveLength(1);
  });

  it("rejects an edit that would drop net pay below what was already paid", async () => {
    const payroll = await junePayroll();
    await approvePayroll(payroll.id, user.id);
    await recordPayrollPayment(payroll.id, user.id, {
      amountMinor: toMinor(10000),
      paymentMethod: "CASH",
    });

    await expect(
      updatePayrollLine(lineId, { deductionsMinor: toMinor(25000) }, user.id)
    ).rejects.toThrow(/cannot be lower than .* already paid/);

    // The payroll and its figures are unchanged after the rejected edit.
    const line = (await db.payrollLine.findFirst({ where: { payrollId } }))!;
    expect(line.grossPayMinor).toBe(toMinor(25000));
    expect(line.netPayMinor).toBe(toMinor(25000));
  });

  it("settles a partially paid payroll as PAID when the edit removes the remainder", async () => {
    const payroll = await junePayroll();
    await approvePayroll(payroll.id, user.id);
    await recordPayrollPayment(payroll.id, user.id, {
      amountMinor: toMinor(10000),
      paymentMethod: "CASH",
    });

    // Reduce the remaining payable to exactly what has been paid.
    const updated = await updatePayrollLine(
      lineId,
      { deductionsMinor: toMinor(15000) },
      user.id
    );

    expect(updated!.status).toBe("PAID");
    expect(updated!.lines[0].paymentStatus).toBe("PAID");
    expect(updated!.lines[0].netPayMinor).toBe(toMinor(10000));
    expect(updated!.totalPaidMinor).toBe(toMinor(10000));
  });

  it("locks a fully paid payroll", async () => {
    const payroll = await junePayroll();
    await approvePayroll(payroll.id, user.id);
    await recordPayrollPayment(payroll.id, user.id, { paymentMethod: "CASH" });

    const settled = await db.payroll.findUnique({ where: { id: payrollId } });
    expect(settled!.status).toBe("PAID");

    await expect(
      updatePayrollLine(lineId, { bonusesMinor: toMinor(100) }, user.id)
    ).rejects.toThrow(/Paid or cancelled payroll lines cannot be edited/);
  });

  it("rebuilds advance allocations when an unpaid approved payroll is edited", async () => {
    await addAdvance(emp.id, 3000, new Date("2026-03-01"), user.id);
    const payroll = await junePayroll();
    await approvePayroll(payroll.id, user.id);

    const allocatedBefore = await db.payrollAdvanceAllocation.aggregate({
      _sum: { amountMinor: true },
      where: { payrollId },
    });
    expect(allocatedBefore._sum.amountMinor).toBe(toMinor(3000));

    // A larger advance balance now exists; the rebuild picks it up to the
    // figure's amountAlreadyReceived cap.
    await addAdvance(emp.id, 8000, new Date("2026-04-01"), user.id);

    const updated = await updatePayrollLine(
      lineId,
      { allowancesMinor: toMinor(1000) },
      user.id
    );
    expect(updated!.lines[0].amountAlreadyReceivedMinor).toBe(toMinor(11000));

    const allocatedAfter = await db.payrollAdvanceAllocation.aggregate({
      _sum: { amountMinor: true },
      where: { payrollId },
    });
    expect(allocatedAfter._sum.amountMinor).toBe(toMinor(11000));
  });
});
