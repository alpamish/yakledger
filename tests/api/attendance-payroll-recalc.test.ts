import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { seedUsers, buildRequest, type SeedResult } from "../helpers";
import { POST as createAttendance } from "@/app/api/attendance/route";
import {
  PUT as updateAttendance,
  DELETE as deleteAttendance,
} from "@/app/api/attendance/[id]/route";
import { POST as approvalAction } from "@/app/api/approvals/[entity]/[id]/route";
import { generatePayroll, approvePayroll } from "@/services/hr.service";
import { toMinor } from "@/lib/money";

async function makeEmployee(userId: string) {
  return db.employee.create({
    data: {
      fullName: "Route Attendance Emp",
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

describe("Attendance routes recalculate affected payrolls (Plan-payroll.pdf §1)", () => {
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
    return { payroll, lineId: payroll.lines[0].id };
  }

  const lineOf = (lineId: string) =>
    db.payrollLine.findUnique({ where: { id: lineId } });

  it("refreshes the draft when attendance is created approved, but not when created pending", async () => {
    const { lineId } = await juneDraft();

    // Admin creates attendance → immediately APPROVED → draft refreshed.
    const approvedRes = await createAttendance(
      buildRequest("/api/attendance", {
        token: s.adminToken,
        method: "POST",
        body: {
          employeeId: emp.id,
          date: "2026-06-10",
          status: "PRESENT",
          overtimeHours: 4,
        },
      })
    );
    expect(approvedRes.status).toBe(200);
    const approvedBody = await approvedRes.json();
    expect(approvedBody.data.approvalStatus).toBe("APPROVED");

    let line = await lineOf(lineId);
    expect(line!.attendanceDays).toBe(1);
    expect(line!.overtimeHours).toBe(4);
    expect(line!.grossPayMinor).toBeGreaterThan(toMinor(25000));

    // A non-admin creates attendance → PENDING → nothing moves.
    const pendingRes = await createAttendance(
      buildRequest("/api/attendance", {
        token: s.userToken,
        method: "POST",
        body: { employeeId: emp.id, date: "2026-06-11", status: "PRESENT" },
      })
    );
    expect(pendingRes.status).toBe(200);
    const pendingBody = await pendingRes.json();
    expect(pendingBody.data.approvalStatus).toBe("PENDING");

    line = await lineOf(lineId);
    expect(line!.attendanceDays).toBe(1);
    expect(line!.overtimeHours).toBe(4);
  });

  it("refreshes the draft when pending attendance is approved via PUT", async () => {
    const { lineId } = await juneDraft();

    const createdRes = await createAttendance(
      buildRequest("/api/attendance", {
        token: s.userToken,
        method: "POST",
        body: { employeeId: emp.id, date: "2026-06-12", status: "PRESENT" },
      })
    );
    const created = (await createdRes.json()).data;
    expect(created.approvalStatus).toBe("PENDING");
    expect((await lineOf(lineId))!.attendanceDays).toBe(0);

    const putRes = await updateAttendance(
      buildRequest(`/api/attendance/${created.id}`, {
        token: s.adminToken,
        method: "PUT",
        body: { status: "PRESENT", overtimeHours: 3 },
      }),
      { params: Promise.resolve({ id: created.id }) }
    );
    expect(putRes.status).toBe(200);
    const putBody = await putRes.json();
    expect(putBody.data.approvalStatus).toBe("APPROVED");

    const line = await lineOf(lineId);
    expect(line!.attendanceDays).toBe(1);
    expect(line!.overtimeHours).toBe(3);
  });

  it("refreshes the draft back when approved attendance is deleted", async () => {
    const { lineId } = await juneDraft();

    const createdRes = await createAttendance(
      buildRequest("/api/attendance", {
        token: s.adminToken,
        method: "POST",
        body: { employeeId: emp.id, date: "2026-06-14", status: "PRESENT" },
      })
    );
    const created = (await createdRes.json()).data;
    expect((await lineOf(lineId))!.attendanceDays).toBe(1);

    const deleteRes = await deleteAttendance(
      buildRequest(`/api/attendance/${created.id}`, {
        token: s.adminToken,
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: created.id }) }
    );
    expect(deleteRes.status).toBe(200);

    expect((await lineOf(lineId))!.attendanceDays).toBe(0);
  });

  it("flags an approved payroll NEEDS_RECALCULATION when attendance is approved from the queue", async () => {
    const { payroll, lineId } = await juneDraft();
    await approvePayroll(payroll.id, s.admin.id);

    const createdRes = await createAttendance(
      buildRequest("/api/attendance", {
        token: s.userToken,
        method: "POST",
        body: {
          employeeId: emp.id,
          date: "2026-06-20",
          status: "PRESENT",
          overtimeHours: 2,
        },
      })
    );
    const created = (await createdRes.json()).data;
    expect((await db.payroll.findUnique({ where: { id: payroll.id } }))!.status).toBe(
      "APPROVED"
    );

    const approveRes = await approvalAction(
      buildRequest(`/api/approvals/attendance/${created.id}`, {
        token: s.managerToken,
        method: "POST",
        body: { action: "approve" },
      }),
      { params: Promise.resolve({ entity: "attendance", id: created.id }) }
    );
    expect(approveRes.status).toBe(200);

    const reloaded = await db.payroll.findUnique({ where: { id: payroll.id } });
    expect(reloaded!.status).toBe("NEEDS_RECALCULATION");
    const line = await lineOf(lineId);
    expect(line!.attendanceDays).toBe(1);
    expect(line!.overtimeHours).toBe(2);
  });
});
