import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { seedUsers, buildRequest, type SeedResult } from "../helpers";
import { POST as createAttendance } from "@/app/api/attendance/route";
import { PUT as updateAttendance } from "@/app/api/attendance/[id]/route";

describe("PUT /api/attendance/[id] — partial updates", () => {
  let s: SeedResult;
  let empId: string;
  let recordId: string;

  beforeEach(async () => {
    s = await seedUsers();
    const emp = await db.employee.create({
      data: {
        fullName: "Partial Update Emp",
        fatherName: "F",
        phoneNumber: "0700000000",
        jobTitle: "Driver",
        department: "LABOR",
        hireDate: new Date("2026-01-01"),
        status: "ACTIVE",
        createdBy: s.admin.id,
        workStartTime: "07:00",
        workEndTime: "18:00",
        breakMinutes: 60,
      },
    });
    empId = emp.id;

    const res = await createAttendance(
      buildRequest("/api/attendance", {
        token: s.adminToken,
        method: "POST",
        body: {
          employeeId: emp.id,
          date: "2026-10-19",
          status: "PRESENT",
          checkInTime: "07:00",
          checkOutTime: "18:00",
          overtimeHours: 4,
        },
      })
    );
    recordId = (await res.json()).data.id;
  });

  const put = (body: unknown) =>
    updateAttendance(
      buildRequest(`/api/attendance/${recordId}`, {
        token: s.adminToken,
        method: "PUT",
        body,
      }),
      { params: Promise.resolve({ id: recordId }) }
    );

  it("keeps overtime and worked hours when only the status changes", async () => {
    const res = await put({ status: "HALF_DAY" });
    expect(res.status).toBe(200);

    const saved = await db.attendance.findUniqueOrThrow({ where: { id: recordId } });
    expect(saved.status).toBe("HALF_DAY");
    expect(saved.overtimeHours).toBe(4);
    expect(saved.workedHours).toBe(11);
    expect(saved.checkInTime).not.toBeNull();
  });

  it("keeps the clock times when only overtime is changed", async () => {
    const res = await put({ overtimeHours: 1.5 });
    expect(res.status).toBe(200);

    const saved = await db.attendance.findUniqueOrThrow({ where: { id: recordId } });
    expect(saved.overtimeHours).toBe(1.5);
    expect(saved.workedHours).toBe(11);
    expect(saved.checkInTime).not.toBeNull();
  });

  it("recomputes worked hours from new times but keeps manual overtime", async () => {
    const res = await put({ checkInTime: "08:00", checkOutTime: "17:00" });
    expect(res.status).toBe(200);

    const saved = await db.attendance.findUniqueOrThrow({ where: { id: recordId } });
    expect(saved.workedHours).toBe(9);
    expect(saved.overtimeHours).toBe(4);
  });

  it("clears times with null and keeps overtime", async () => {
    const res = await put({ checkInTime: null });
    expect(res.status).toBe(200);

    const saved = await db.attendance.findUniqueOrThrow({ where: { id: recordId } });
    expect(saved.checkInTime).toBeNull();
    expect(saved.overtimeHours).toBe(4);
    expect(saved.workedHours).toBe(0);
  });
});
