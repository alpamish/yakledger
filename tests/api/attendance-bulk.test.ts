import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { generateToken } from "@/lib/auth";
import { seedUsers, buildRequest, type SeedResult } from "../helpers";
import { POST as bulkAttendance } from "@/app/api/attendance/bulk/route";
import { POST as createAttendance } from "@/app/api/attendance/route";

async function makeEmployee(userId: string) {
  return db.employee.create({
    data: {
      fullName: "Bulk Attendance Emp",
      fatherName: "F",
      phoneNumber: "0700000000",
      jobTitle: "Driver",
      department: "LABOR",
      employmentType: "FULL_TIME",
      hireDate: new Date("2026-01-01"),
      status: "ACTIVE",
      createdBy: userId,
      workStartTime: "07:00",
      workEndTime: "18:00",
      breakMinutes: 60,
    },
  });
}

const post = (token: string, records: unknown[]) =>
  bulkAttendance(
    buildRequest("/api/attendance/bulk", {
      token,
      method: "POST",
      body: { records },
    })
  );

describe("/api/attendance/bulk", () => {
  let s: SeedResult;
  let emp: Awaited<ReturnType<typeof makeEmployee>>;

  beforeEach(async () => {
    s = await seedUsers();
    emp = await makeEmployee(s.admin.id);
  });

  it("marks a past date (the old today-only rule is gone)", async () => {
    const res = await post(s.adminToken, [
      {
        employeeId: emp.id,
        date: "2026-09-10",
        status: "PRESENT",
        checkInTime: "07:00",
        checkOutTime: "18:00",
      },
    ]);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.created).toBe(1);
    expect(body.data.updated).toBe(0);

    const saved = await db.attendance.findUniqueOrThrow({
      where: { employeeId_date: { employeeId: emp.id, date: new Date("2026-09-10") } },
    });
    expect(saved.approvalStatus).toBe("APPROVED");
    expect(saved.checkInTime).not.toBeNull();
    expect(saved.checkOutTime).not.toBeNull();
    // 11 worked hours minus the 60 minute break → 1h overtime.
    expect(saved.workedHours).toBe(11);
    expect(saved.overtimeHours).toBe(1);
  });

  it("honours an explicit overtime override", async () => {
    await post(s.adminToken, [
      {
        employeeId: emp.id,
        date: "2026-09-11",
        status: "PRESENT",
        checkInTime: "07:00",
        checkOutTime: "18:00",
        overtimeHours: 2.5,
      },
    ]);

    const saved = await db.attendance.findUniqueOrThrow({
      where: { employeeId_date: { employeeId: emp.id, date: new Date("2026-09-11") } },
    });
    expect(saved.overtimeHours).toBe(2.5);
  });

  it("upserts instead of creating a duplicate for the same employee/day", async () => {
    await post(s.adminToken, [{ employeeId: emp.id, date: "2026-09-12", status: "PRESENT" }]);
    const res = await post(s.adminToken, [
      { employeeId: emp.id, date: "2026-09-12", status: "LEAVE" },
    ]);
    const body = await res.json();
    expect(body.data.updated).toBe(1);
    expect(await db.attendance.count({ where: { employeeId: emp.id } })).toBe(1);

    const saved = await db.attendance.findFirstOrThrow({ where: { employeeId: emp.id } });
    expect(saved.status).toBe("LEAVE");
  });

  it("dedupes repeated employee/day rows, last one wins", async () => {
    const res = await post(s.adminToken, [
      { employeeId: emp.id, date: "2026-09-13", status: "PRESENT" },
      { employeeId: emp.id, date: "2026-09-13", status: "ABSENT" },
    ]);
    const body = await res.json();
    expect(body.data.created).toBe(1);
    expect(body.data.duplicates).toBe(1);

    const saved = await db.attendance.findFirstOrThrow({ where: { employeeId: emp.id } });
    expect(saved.status).toBe("ABSENT");
  });

  it("rejects invalid dates without writing anything", async () => {
    const res = await post(s.adminToken, [
      { employeeId: emp.id, date: "2026-02-31", status: "PRESENT" },
      { employeeId: emp.id, date: "not-a-date", status: "PRESENT" },
    ]);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.details).toHaveLength(2);
    expect(await db.attendance.count({ where: { employeeId: emp.id } })).toBe(0);
  });

  it("rejects unknown statuses", async () => {
    const res = await post(s.adminToken, [
      { employeeId: emp.id, date: "2026-09-14", status: "SICK" },
    ]);
    expect(res.status).toBe(400);
    expect(await db.attendance.count({ where: { employeeId: emp.id } })).toBe(0);
  });

  it("lets a DATA_ENTRY user mark attendance (employees:attendance:manage)", async () => {
    const dataEntry = await db.user.create({
      data: {
        id: "u_data_entry_attendance",
        email: "data-entry@attendance.test",
        name: "Data Entry",
        password: "x",
        role: "DATA_ENTRY",
      },
    });
    const token = generateToken({
      userId: dataEntry.id,
      email: dataEntry.email,
      role: dataEntry.role,
    });

    const res = await post(token, [
      { employeeId: emp.id, date: "2026-09-15", status: "PRESENT" },
    ]);
    expect(res.status).toBe(200);

    const saved = await db.attendance.findFirstOrThrow({ where: { employeeId: emp.id } });
    expect(saved.approvalStatus).toBe("PENDING");
    expect(saved.createdBy).toBe(dataEntry.id);
  });

  it("refuses to overwrite a record outside the user's scope", async () => {
    await createAttendance(
      buildRequest("/api/attendance", {
        token: s.adminToken,
        method: "POST",
        body: { employeeId: emp.id, date: "2026-09-16", status: "PRESENT" },
      })
    );

    // USER can create attendance but cannot see/edit admin-owned records.
    const res = await post(s.userToken, [
      { employeeId: emp.id, date: "2026-09-16", status: "ABSENT" },
    ]);
    expect(res.status).toBe(403);

    const saved = await db.attendance.findFirstOrThrow({ where: { employeeId: emp.id } });
    expect(saved.status).toBe("PRESENT");
  });

  it("returns 400 for an empty record set", async () => {
    const res = await post(s.adminToken, []);
    expect(res.status).toBe(400);
  });
});
