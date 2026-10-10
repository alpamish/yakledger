import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import {
  generatePayroll,
  approvePayroll,
  recordPayrollPayment,
  revertPayroll,
  createPayrollAdjustment,
  deletePayrollAdjustment,
} from "@/services/hr.service";
import { walletService } from "@/services/wallet.service";
import { toMinor } from "@/lib/money";

async function makeUser(role: string, email: string) {
  return db.user.create({ data: { email, name: email, password: "x", role } });
}

async function makeEmployee(userId: string) {
  return db.employee.create({
    data: {
      fullName: "Adjustment Emp",
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

async function addSalary(empId: string) {
  await db.salaryHistory.create({
    data: {
      employeeId: empId,
      amountMinor: toMinor(25000),
      currency: "AFN",
      effectiveFrom: new Date("2026-01-01"),
    },
  });
}

async function juneDraft(empId: string, userId: string) {
  const { payroll } = await generatePayroll({
    employeeId: empId,
    periodStart: new Date("2026-06-01"),
    periodEnd: new Date("2026-06-30"),
    createdById: userId,
  });
  return payroll;
}

const lineOf = (payrollId: string) =>
  db.payroll.findUnique({ where: { id: payrollId }, include: { lines: true } });

describe("Manual payroll adjustments (Plan-payroll.pdf §1)", () => {
  let user: any;
  let emp: any;

  beforeEach(async () => {
    user = await makeUser("ADMIN", `adj-${Date.now()}-${Math.random()}@t.co`);
    emp = await makeEmployee(user.id);
    await addSalary(emp.id);
    await db.employeeCashAccount.create({ data: { employeeId: emp.id } });
  });

  it("applies a deduction and an earning additively to open drafts", async () => {
    const june = await juneDraft(emp.id, user.id);
    expect(june.lines[0].grossPayMinor).toBe(toMinor(25000));

    // Existing draft follows the new adjustment immediately (hook).
    await createPayrollAdjustment({
      employeeId: emp.id,
      kind: "OTHER",
      direction: "DEDUCTION",
      amountMinor: toMinor(500),
      reason: "Damaged uniform not returned",
      createdById: user.id,
    });
    let line = (await lineOf(june.id))!.lines[0];
    expect(line.grossPayMinor).toBe(toMinor(24500));
    expect(line.adjustmentsDeductedMinor).toBe(toMinor(500));
    expect(line.adjustmentsEarnedMinor).toBe(0);

    // A newly generated draft includes it as well.
    const july = await generatePayroll({
      employeeId: emp.id,
      periodStart: new Date("2026-07-01"),
      periodEnd: new Date("2026-07-31"),
      createdById: user.id,
    });
    expect(july.payroll.lines[0].grossPayMinor).toBe(toMinor(24500));

    // An earning pushes gross up instead.
    await createPayrollAdjustment({
      employeeId: emp.id,
      kind: "OTHER",
      direction: "EARNING",
      amountMinor: toMinor(300),
      reason: "Bonus for night shift coverage",
      createdById: user.id,
    });
    line = (await lineOf(june.id))!.lines[0];
    expect(line.grossPayMinor).toBe(toMinor(24800));
    expect(line.adjustmentsDeductedMinor).toBe(toMinor(500));
    expect(line.adjustmentsEarnedMinor).toBe(toMinor(300));
  });

  it("posts the adjustment to exactly one payroll at approval", async () => {
    await createPayrollAdjustment({
      employeeId: emp.id,
      kind: "OTHER",
      direction: "DEDUCTION",
      amountMinor: toMinor(500),
      reason: "Tool loss deduction",
      createdById: user.id,
    });
    const june = await juneDraft(emp.id, user.id);
    const approved = await approvePayroll(june.id, user.id);
    expect(approved.lines[0].grossPayMinor).toBe(toMinor(24500));

    const adjustment = await db.payrollAdjustment.findFirst({
      where: { employeeId: emp.id, reason: "Tool loss deduction" },
    });
    expect(adjustment!.payrollId).toBe(june.id);

    // The accounting entry recognises the adjusted gross.
    const entry = await db.accountingEntry.findFirst({
      where: { payrollId: june.id, type: "PAYROLL_APPROVAL" },
    });
    expect(entry!.amountMinor).toBe(-toMinor(24500));

    // A later draft must not pick the posted adjustment up again.
    const july = await generatePayroll({
      employeeId: emp.id,
      periodStart: new Date("2026-07-01"),
      periodEnd: new Date("2026-07-31"),
      createdById: user.id,
    });
    expect(july.payroll.lines[0].grossPayMinor).toBe(toMinor(25000));
    expect(july.payroll.lines[0].adjustmentsDeductedMinor).toBe(0);
  });

  it("an adjustment created after approval flags the payroll for recalculation", async () => {
    const june = await juneDraft(emp.id, user.id);
    await approvePayroll(june.id, user.id);

    await createPayrollAdjustment({
      employeeId: emp.id,
      kind: "OTHER",
      direction: "DEDUCTION",
      amountMinor: toMinor(1000),
      reason: "Late correction",
      createdById: user.id,
    });

    const after = await lineOf(june.id);
    expect(after!.status).toBe("NEEDS_RECALCULATION");
    expect(after!.lines[0].grossPayMinor).toBe(toMinor(24000));
    // Repeated recomputation stays idempotent and keeps it unposted until
    // the next approval applies it.
    expect(
      (await db.payrollAdjustment.findFirst({ where: { employeeId: emp.id } }))!
        .payrollId
    ).toBeNull();
  });

  it("revert releases posted adjustments so the next approval re-applies them", async () => {
    await createPayrollAdjustment({
      employeeId: emp.id,
      kind: "OTHER",
      direction: "DEDUCTION",
      amountMinor: toMinor(500),
      reason: "Release test",
      createdById: user.id,
    });
    const june = await juneDraft(emp.id, user.id);
    await approvePayroll(june.id, user.id);
    expect(
      (
        await db.payrollAdjustment.findFirst({
          where: { employeeId: emp.id, reason: "Release test" },
        })
      )!.payrollId
    ).toBe(june.id);

    await revertPayroll(june.id, user.id, "Wrong period");
    expect(
      (
        await db.payrollAdjustment.findFirst({
          where: { employeeId: emp.id, reason: "Release test" },
        })
      )!.payrollId
    ).toBeNull();

    const again = await approvePayroll(june.id, user.id);
    expect(again.lines[0].grossPayMinor).toBe(toMinor(24500));
    expect(
      (
        await db.payrollAdjustment.findFirst({
          where: { employeeId: emp.id, reason: "Release test" },
        })
      )!.payrollId
    ).toBe(june.id);
  });

  it("advance-edit adjustments only itemise previous debt, never enter gross", async () => {
    // Simulated ADVANCE_EDIT row (the paid-advance edit path creates these).
    await db.payrollAdjustment.create({
      data: {
        employeeId: emp.id,
        kind: "PREVIOUS_OVERPAYMENT_DEDUCTION",
        direction: "DEDUCTION",
        source: "ADVANCE_EDIT",
        amountMinor: toMinor(1000),
        reason: "Advance amount changed from 9,000 to 10,000 AFN",
        createdById: user.id,
      },
    });

    const june = await juneDraft(emp.id, user.id);
    expect(june.lines[0].grossPayMinor).toBe(toMinor(25000));
    expect(june.lines[0].previousAdjustmentsDeductedMinor).toBe(toMinor(1000));
    expect(june.lines[0].adjustmentsDeductedMinor).toBe(0);

    const approved = await approvePayroll(june.id, user.id);
    expect(approved.lines[0].grossPayMinor).toBe(toMinor(25000));
    expect(approved.lines[0].previousAdjustmentsDeductedMinor).toBe(toMinor(1000));
  });

  it("deletes only while unposted", async () => {
    const created = await createPayrollAdjustment({
      employeeId: emp.id,
      kind: "OTHER",
      direction: "DEDUCTION",
      amountMinor: toMinor(500),
      reason: "Deletable",
      createdById: user.id,
    });
    await deletePayrollAdjustment(created.id, user.id);
    expect(
      await db.payrollAdjustment.findUnique({ where: { id: created.id } })
    ).toBeNull();

    const posted = await createPayrollAdjustment({
      employeeId: emp.id,
      kind: "OTHER",
      direction: "DEDUCTION",
      amountMinor: toMinor(500),
      reason: "Posted one",
      createdById: user.id,
    });
    const june = await juneDraft(emp.id, user.id);
    await approvePayroll(june.id, user.id);
    await expect(
      deletePayrollAdjustment(posted.id, user.id)
    ).rejects.toThrow(/already posted/);
  });

  it("approve + full payment settles the employee balance to zero", async () => {
    await createPayrollAdjustment({
      employeeId: emp.id,
      kind: "OTHER",
      direction: "DEDUCTION",
      amountMinor: toMinor(500),
      reason: "Settlement path test",
      createdById: user.id,
    });
    const june = await juneDraft(emp.id, user.id);
    const approved = await approvePayroll(june.id, user.id);
    expect(approved.lines[0].netPayableMinor).toBe(toMinor(24500));

    await recordPayrollPayment(june.id, user.id, { paymentMethod: "CASH" });
    await walletService.recomputeBalance(emp.id);

    const account = await db.employeeCashAccount.findUnique({
      where: { employeeId: emp.id },
    });
    expect(Math.round((account?.currentBalance ?? 0) * 100)).toBe(0);
  });
});
