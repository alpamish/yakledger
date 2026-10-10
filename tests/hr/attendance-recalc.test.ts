import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import {
  generatePayroll,
  approvePayroll,
  recordPayrollPayment,
  recalculatePayrollsForAttendance,
} from "@/services/hr.service";
import { toMinor } from "@/lib/money";

// Expected overtime pay for a 25,000 AFN salary with a 07:00–18:00 schedule
// minus a 60 minute break (10 paid daily hours), at the default 1.25 rate:
// hourly = round(2,500,000 / 30 / 10) = 8333 minor → 4h = 8333 * 1.25 * 4.
const HOURLY_MINOR = Math.round(toMinor(25000) / 30 / 10);
const OVERTIME_4H_MINOR = Math.round(HOURLY_MINOR * 1.25 * 4);

async function makeUser(role: string, email: string) {
  return db.user.create({ data: { email, name: email, password: "x", role } });
}

async function makeEmployee(userId: string) {
  return db.employee.create({
    data: {
      fullName: "Attendance Emp",
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

async function addAttendance(
  empId: string,
  date: string,
  opts: {
    status?: string;
    overtimeHours?: number;
    approvalStatus?: string;
    userId: string;
  }
) {
  return db.attendance.create({
    data: {
      employeeId: empId,
      date: new Date(date),
      status: opts.status ?? "PRESENT",
      overtimeHours: opts.overtimeHours ?? 0,
      createdBy: opts.userId,
      approvalStatus: opts.approvalStatus ?? "APPROVED",
      approvedById: (opts.approvalStatus ?? "APPROVED") === "APPROVED" ? opts.userId : null,
      approvedAt: (opts.approvalStatus ?? "APPROVED") === "APPROVED" ? new Date() : null,
    },
  });
}

async function juneLine(empId: string, userId: string) {
  const { payroll } = await generatePayroll({
    employeeId: empId,
    periodStart: new Date("2026-06-01"),
    periodEnd: new Date("2026-06-30"),
    createdById: userId,
  });
  return { payroll, line: payroll.lines[0] };
}

describe("Attendance changes recalculate payroll (Plan-payroll.pdf §1)", () => {
  let user: any;
  let emp: any;

  beforeEach(async () => {
    user = await makeUser("ADMIN", `att-${Date.now()}-${Math.random()}@t.co`);
    emp = await makeEmployee(user.id);
    await addSalary(emp.id);
  });

  it("refreshes a draft payroll in place when attendance is approved", async () => {
    const { payroll, line } = await juneLine(emp.id, user.id);
    expect(line.attendanceDays).toBe(0);
    expect(line.grossPayMinor).toBe(toMinor(25000));

    await addAttendance(emp.id, "2026-06-10", { userId: user.id, overtimeHours: 4 });
    await addAttendance(emp.id, "2026-06-11", { userId: user.id });
    await addAttendance(emp.id, "2026-06-12", { userId: user.id });
    await addAttendance(emp.id, "2026-06-13", { userId: user.id, status: "HALF_DAY" });

    const result = await recalculatePayrollsForAttendance({
      employeeId: emp.id,
      dates: ["2026-06-10", "2026-06-11", "2026-06-12", "2026-06-13"],
      userId: user.id,
    });
    expect(result.refreshed).toContain(payroll.id);
    expect(result.recalculated).toEqual([]);

    const updated = await db.payrollLine.findUnique({ where: { id: line.id } });
    const reloadedPayroll = await db.payroll.findUnique({ where: { id: payroll.id } });
    expect(reloadedPayroll!.status).toBe("DRAFT");
    expect(updated!.attendanceDays).toBe(3.5);
    expect(updated!.overtimeHours).toBe(4);
    expect(updated!.overtimePayMinor).toBe(OVERTIME_4H_MINOR);
    expect(updated!.grossPayMinor).toBe(toMinor(25000) + OVERTIME_4H_MINOR);

    const audit = await db.payrollAuditLog.findFirst({
      where: { payrollId: payroll.id, action: "ATTENDANCE_RECALCULATED" },
    });
    expect(audit).toBeTruthy();
    expect(audit!.userId).toBe(user.id);
  });

  it("flags an approved unpaid payroll NEEDS_RECALCULATION and refreshes its attendance", async () => {
    const { payroll, line } = await juneLine(emp.id, user.id);
    await approvePayroll(payroll.id, user.id);

    await addAttendance(emp.id, "2026-06-20", { userId: user.id, overtimeHours: 2 });
    const result = await recalculatePayrollsForAttendance({
      employeeId: emp.id,
      dates: ["2026-06-20"],
      userId: user.id,
    });

    expect(result.recalculated).toContain(payroll.id);
    const reloaded = await db.payroll.findUnique({
      where: { id: payroll.id },
      include: { lines: true },
    });
    expect(reloaded!.status).toBe("NEEDS_RECALCULATION");
    expect(reloaded!.lines[0].attendanceDays).toBe(1);
    expect(reloaded!.lines[0].overtimeHours).toBe(2);
    expect(reloaded!.lines[0].overtimePayMinor).toBe(Math.round(HOURLY_MINOR * 1.25 * 2));
    expect(reloaded!.lines[0].grossPayMinor).toBe(
      toMinor(25000) + Math.round(HOURLY_MINOR * 1.25 * 2)
    );
    expect(line.grossPayMinor).toBe(toMinor(25000));
  });

  it("leaves a fully paid payroll untouched", async () => {
    const { payroll, line } = await juneLine(emp.id, user.id);
    await approvePayroll(payroll.id, user.id);
    await recordPayrollPayment(payroll.id, user.id, {
      amountMinor: line.netPayMinor,
      paymentMethod: "CASH",
    });

    await addAttendance(emp.id, "2026-06-25", { userId: user.id, overtimeHours: 6 });
    const result = await recalculatePayrollsForAttendance({
      employeeId: emp.id,
      dates: ["2026-06-25"],
      userId: user.id,
    });

    expect(result.recalculated).toEqual([]);
    expect(result.refreshed).toEqual([]);
    const reloaded = await db.payroll.findUnique({
      where: { id: payroll.id },
      include: { lines: true },
    });
    expect(reloaded!.status).toBe("PAID");
    expect(reloaded!.lines[0].attendanceDays).toBe(0);
    expect(reloaded!.lines[0].grossPayMinor).toBe(toMinor(25000));
  });

  it("ignores attendance that is not approved", async () => {
    const { payroll, line } = await juneLine(emp.id, user.id);
    await addAttendance(emp.id, "2026-06-14", {
      userId: user.id,
      overtimeHours: 8,
      approvalStatus: "PENDING",
    });

    const result = await recalculatePayrollsForAttendance({
      employeeId: emp.id,
      dates: ["2026-06-14"],
      userId: user.id,
    });
    expect(result.refreshed).toEqual([]);
    expect(result.recalculated).toEqual([]);

    const updated = await db.payrollLine.findUnique({ where: { id: line.id } });
    expect(updated!.attendanceDays).toBe(0);
    expect(updated!.grossPayMinor).toBe(toMinor(25000));
    expect(payroll.status).toBe("DRAFT");
  });

  it("ignores attendance outside the payroll period", async () => {
    const { payroll } = await juneLine(emp.id, user.id);
    await addAttendance(emp.id, "2026-07-05", { userId: user.id, overtimeHours: 4 });

    const result = await recalculatePayrollsForAttendance({
      employeeId: emp.id,
      dates: ["2026-07-05"],
      userId: user.id,
    });
    expect(result.refreshed).toEqual([]);
    expect(result.recalculated).toEqual([]);
    expect(payroll.status).toBe("DRAFT");
  });

  it("applies attendance approved after generation when the payroll is approved", async () => {
    const { payroll, line } = await juneLine(emp.id, user.id);

    // Attendance lands after the draft was generated (hook not involved) —
    // approval must still freeze the refreshed figures.
    await addAttendance(emp.id, "2026-06-16", { userId: user.id, overtimeHours: 4 });

    const approved = await approvePayroll(payroll.id, user.id);
    const approvedLine = approved!.lines[0];
    expect(approvedLine.attendanceDays).toBe(1);
    expect(approvedLine.overtimeHours).toBe(4);
    expect(approvedLine.overtimePayMinor).toBe(OVERTIME_4H_MINOR);
    expect(approvedLine.grossPayMinor).toBe(toMinor(25000) + OVERTIME_4H_MINOR);
    expect(approvedLine.grossPayMinor).not.toBe(line.grossPayMinor);

    const entry = await db.accountingEntry.findFirst({
      where: { payrollId: payroll.id, type: "PAYROLL_APPROVAL" },
      orderBy: { createdAt: "desc" },
    });
    expect(entry!.amountMinor).toBe(-(toMinor(25000) + OVERTIME_4H_MINOR));
  });

  it("picks up attendance approved between a revert and re-approval", async () => {
    const { payroll } = await juneLine(emp.id, user.id);
    await approvePayroll(payroll.id, user.id);

    await addAttendance(emp.id, "2026-06-18", { userId: user.id, overtimeHours: 2 });
    const hook = await recalculatePayrollsForAttendance({
      employeeId: emp.id,
      dates: ["2026-06-18"],
      userId: user.id,
    });
    expect(hook.recalculated).toContain(payroll.id);

    const reloaded = await db.payroll.findUnique({
      where: { id: payroll.id },
      include: { lines: true },
    });
    expect(reloaded!.status).toBe("NEEDS_RECALCULATION");
    expect(reloaded!.lines[0].attendanceDays).toBe(1);
  });
});
