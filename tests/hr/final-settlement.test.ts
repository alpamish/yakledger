import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { generatePayroll } from "@/services/hr.service";
import { POST as GENERATE } from "@/app/api/payroll/route";
import { seedUsers, buildRequest, TEST_ADMIN, type SeedResult } from "../helpers";
import { toMinor } from "@/lib/money";

async function makeUser(role: string, email: string) {
  return db.user.create({ data: { email, name: email, password: "x", role } });
}

async function makeEmployee(userId: string, extra: any = {}) {
  return db.employee.create({
    data: {
      fullName: "Settlement Emp",
      fatherName: "F",
      phoneNumber: "0700000000",
      jobTitle: "Driver",
      department: "LABOR",
      employmentType: "FULL_TIME",
      hireDate: new Date("2026-01-01"),
      status: "ACTIVE",
      createdBy: userId,
      baseSalaryMinor: toMinor(25000),
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

describe("Final settlement payroll type (Plan-payroll.pdf §2 action 12)", () => {
  let user: any;
  let emp: any;

  beforeEach(async () => {
    user = await makeUser("ADMIN", `settle-${Date.now()}-${Math.random()}@t.co`);
    emp = await makeEmployee(user.id);
    await addSalary(emp.id, toMinor(25000));
  });

  it("stops salary at the termination date", async () => {
    await db.employee.update({
      where: { id: emp.id },
      data: { terminationDate: new Date("2026-06-20"), status: "TERMINATED" },
    });

    const { payroll } = await generatePayroll({
      employeeId: emp.id,
      periodStart: new Date("2026-06-01"),
      periodEnd: new Date("2026-06-30"),
      createdById: user.id,
    });

    const line = payroll.lines[0];
    // June 1 → June 20 inclusive = 20 of 30 days.
    expect(line.baseSalaryMinor).toBe(Math.round((toMinor(25000) * 20) / 30));
    expect(line.grossPayMinor).toBe(line.baseSalaryMinor);
  });

  it("starts mid-period salaries at the hire date and stops at termination", async () => {
    await db.employee.update({
      where: { id: emp.id },
      data: {
        hireDate: new Date("2026-06-10"),
        terminationDate: new Date("2026-06-20"),
        status: "TERMINATED",
      },
    });

    const { payroll } = await generatePayroll({
      employeeId: emp.id,
      periodStart: new Date("2026-06-01"),
      periodEnd: new Date("2026-06-30"),
      createdById: user.id,
    });

    // June 10 → June 20 inclusive = 11 of 30 days.
    expect(payroll.lines[0].baseSalaryMinor).toBe(
      Math.round((toMinor(25000) * 11) / 30)
    );
  });

  it("yields no salary for a period entirely after termination", async () => {
    await db.employee.update({
      where: { id: emp.id },
      data: { terminationDate: new Date("2026-05-31"), status: "TERMINATED" },
    });

    const { payroll } = await generatePayroll({
      employeeId: emp.id,
      periodStart: new Date("2026-06-01"),
      periodEnd: new Date("2026-06-30"),
      createdById: user.id,
    });

    expect(payroll.lines[0].baseSalaryMinor).toBe(0);
    expect(payroll.lines[0].grossPayMinor).toBe(0);
  });

  it("stores the final-settlement type and defaults to STANDARD", async () => {
    const { payroll: settlement } = await generatePayroll({
      employeeId: emp.id,
      periodStart: new Date("2026-06-01"),
      periodEnd: new Date("2026-06-30"),
      createdById: user.id,
      type: "FINAL_SETTLEMENT",
    });
    expect(settlement.type).toBe("FINAL_SETTLEMENT");

    const { payroll: regular } = await generatePayroll({
      employeeId: emp.id,
      periodStart: new Date("2026-07-01"),
      periodEnd: new Date("2026-07-31"),
      createdById: user.id,
    });
    expect(regular.type).toBe("STANDARD");
  });

  it("accepts the type through the generate API", async () => {
    const s: SeedResult = await seedUsers();
    await db.employee.update({
      where: { id: s.employee.id },
      data: {
        hireDate: new Date("2026-01-01"),
        baseSalaryMinor: toMinor(25000),
        terminationDate: new Date("2026-06-15"),
        status: "TERMINATED",
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

    const res = await GENERATE(
      buildRequest("/api/payroll", {
        token: s.adminToken,
        method: "POST",
        body: {
          periodStart: "2026-06-01",
          periodEnd: "2026-06-30",
          employeeIds: [s.employee.id],
          type: "FINAL_SETTLEMENT",
        },
      })
    );
    expect(res.status).toBe(200);

    const payroll = await db.payroll.findFirst({
      where: { employeeId: s.employee.id, periodStart: new Date("2026-06-01") },
      include: { lines: true },
    });
    expect(payroll).toBeTruthy();
    expect(payroll!.type).toBe("FINAL_SETTLEMENT");
    // Salary stops at June 15.
    expect(payroll!.lines[0].baseSalaryMinor).toBe(
      Math.round((toMinor(25000) * 15) / 30)
    );
  });
});
