import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import {
  getEmployeeSalaryAtDate,
  getCurrentEmployeeSalary,
  createSalaryChange,
  generatePayroll,
  approvePayroll,
} from "@/services/hr.service";
import { checkUserPermission } from "@/lib/permissions";
import { toMinor } from "@/lib/money";

async function makeUser(role: string, email: string) {
  return db.user.create({
    data: { email, name: email, password: "x", role },
  });
}

async function makeEmployee(userId: string, overrides: any = {}) {
  return db.employee.create({
    data: {
      fullName: overrides.fullName ?? "Test Emp",
      fatherName: overrides.fatherName ?? "Father",
      phoneNumber: overrides.phoneNumber ?? "0700000000",
      jobTitle: overrides.jobTitle ?? "Driver",
      department: overrides.department ?? "LABOR",
      employmentType: overrides.employmentType ?? "FULL_TIME",
      hireDate: overrides.hireDate ?? new Date("2026-01-01"),
      status: overrides.status ?? "ACTIVE",
      createdBy: userId,
      ...overrides.extra,
    },
  });
}

describe("HR Salary History", () => {
  let user: any;
  let emp: any;

  beforeEach(async () => {
    user = await makeUser("MANAGER", `mgr-${Date.now()}-${Math.random()}@t.co`);
    emp = await makeEmployee(user.id);
    // Initial salary 25,000 AFN effective 2026-01-01
    await db.salaryHistory.create({
      data: {
        employeeId: emp.id,
        amountMinor: toMinor(25000),
        currency: "AFN",
        effectiveFrom: new Date("2026-01-01"),
        reason: "Initial",
      },
    });
    await db.employee.update({
      where: { id: emp.id },
      data: { baseSalaryMinor: toMinor(25000) },
    });
  });

  it("returns the salary applicable on a historical date", async () => {
    const april = await getEmployeeSalaryAtDate(emp.id, new Date("2026-04-15"));
    expect(april?.amountMinor).toBe(toMinor(25000));
  });

  it("applies a future salary increase only from its effective date", async () => {
    // Increase to 30,000 effective 2026-05-01
    await createSalaryChange({
      employeeId: emp.id,
      amount: 30000,
      effectiveFrom: new Date("2026-05-01"),
      reason: "Raise",
      performedById: user.id,
    });

    const april = await getEmployeeSalaryAtDate(emp.id, new Date("2026-04-15"));
    const may = await getEmployeeSalaryAtDate(emp.id, new Date("2026-05-15"));
    expect(april?.amountMinor).toBe(toMinor(25000));
    expect(may?.amountMinor).toBe(toMinor(30000));

    // Current (today, well after) should be 30,000
    const current = await getCurrentEmployeeSalary(emp.id);
    expect(current?.amountMinor).toBe(toMinor(30000));
  });

  it("prevents two salary records for the same effective date", async () => {
    await expect(
      createSalaryChange({
        employeeId: emp.id,
        amount: 40000,
        effectiveFrom: new Date("2026-01-01"),
        performedById: user.id,
      })
    ).rejects.toThrow();
  });

  it("writes an audit event on salary change", async () => {
    await createSalaryChange({
      employeeId: emp.id,
      amount: 35000,
      effectiveFrom: new Date("2026-06-01"),
      performedById: user.id,
    });
    const audit = await db.employeeAuditEvent.findFirst({
      where: { employeeId: emp.id, action: "SALARY_CHANGE" },
    });
    expect(audit).toBeTruthy();
    expect(audit?.newValue).toBe(String(toMinor(35000)));
  });
});

describe("HR Payroll Immutability", () => {
  let user: any;
  let emp: any;

  beforeEach(async () => {
    user = await makeUser("MANAGER", `mgr2-${Date.now()}-${Math.random()}@t.co`);
    emp = await makeEmployee(user.id, {
      hireDate: new Date("2026-01-01"),
    });
    await db.salaryHistory.create({
      data: {
        employeeId: emp.id,
        amountMinor: toMinor(30000),
        currency: "AFN",
        effectiveFrom: new Date("2026-01-01"),
      },
    });
    await db.employee.update({
      where: { id: emp.id },
      data: { baseSalaryMinor: toMinor(30000) },
    });
    // approved attendance in August
    await db.attendance.create({
      data: {
        employeeId: emp.id,
        date: new Date("2026-08-15"),
        status: "PRESENT",
        approvalStatus: "APPROVED",
        createdBy: user.id,
      },
    });
  });

  it("snapshots salary and does not change after a later salary update", async () => {
    const { payroll } = await generatePayroll({
      employeeId: emp.id,
      periodStart: new Date("2026-08-01"),
      periodEnd: new Date("2026-08-31"),
      createdById: user.id,
    });
    const line = payroll.lines[0];
    expect(line.baseSalaryMinor).toBe(toMinor(30000));

    // Later salary change to 40,000 — must NOT affect August payroll
    await createSalaryChange({
      employeeId: emp.id,
      amount: 40000,
      effectiveFrom: new Date("2026-09-01"),
      performedById: user.id,
    });

    const reFetched = await db.payroll.findUnique({
      where: { id: payroll.id },
      include: { lines: true },
    });
    expect(reFetched?.lines[0].baseSalaryMinor).toBe(toMinor(30000));
  });

  it("makes payroll immutable once approved", async () => {
    const { payroll } = await generatePayroll({
      employeeId: emp.id,
      periodStart: new Date("2026-08-01"),
      periodEnd: new Date("2026-08-31"),
      createdById: user.id,
    });
    const approved = await approvePayroll(payroll.id, user.id);
    expect(approved.status).toBe("APPROVED");

    // Regenerating returns the same (approved) immutable record
    const { payroll: regen } = await generatePayroll({
      employeeId: emp.id,
      periodStart: new Date("2026-08-01"),
      periodEnd: new Date("2026-08-31"),
      createdById: user.id,
    });
    expect(regen.status).toBe("APPROVED");
    expect(regen.id).toBe(payroll.id);
  });
});

describe("HR Permissions", () => {
  it("grants salary:view to MANAGER but not USER", async () => {
    const mgr = await makeUser("MANAGER", `p-mgr-${Date.now()}@t.co`);
    const usr = await makeUser("USER", `p-usr-${Date.now()}@t.co`);
    expect(
      await checkUserPermission(mgr.id, "MANAGER", "employees:salary:view")
    ).toBe(true);
    expect(
      await checkUserPermission(usr.id, "USER", "employees:salary:view")
    ).toBe(false);
  });

  it("ADMIN always has all permissions", async () => {
    const admin = await makeUser("ADMIN", `p-adm-${Date.now()}@t.co`);
    expect(
      await checkUserPermission(admin.id, "ADMIN", "employees:payroll:manage")
    ).toBe(true);
  });
});
