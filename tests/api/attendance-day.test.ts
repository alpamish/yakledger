import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { seedUsers, buildRequest, type SeedResult } from "../helpers";
import { GET as getDay } from "@/app/api/attendance/day/route";
import { POST as createAttendance } from "@/app/api/attendance/route";

async function makeEmployee(
  userId: string,
  name: string,
  status = "ACTIVE"
) {
  return db.employee.create({
    data: {
      fullName: name,
      fatherName: "F",
      phoneNumber: "0700000000",
      jobTitle: "Operator",
      department: "OPERATIONS",
      hireDate: new Date("2026-01-01"),
      status,
      createdBy: userId,
    },
  });
}

const roster = (token: string, query: string) =>
  getDay(buildRequest(`/api/attendance/day?${query}`, { token }));

describe("/api/attendance/day", () => {
  let s: SeedResult;

  beforeEach(async () => {
    s = await seedUsers();
  });

  it("requires a valid date", async () => {
    const res = await roster(s.adminToken, "date=2026-02-31");
    expect(res.status).toBe(400);
  });

  it("returns active employees with no record for an unmarked day", async () => {
    const emp = await makeEmployee(s.admin.id, "Roster Unmarked");
    const res = await roster(s.adminToken, "date=2026-10-19&search=Roster+Unmarked");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.date).toBe("2026-10-19");
    expect(body.data.rows).toHaveLength(1);
    expect(body.data.rows[0].employee.id).toBe(emp.id);
    expect(body.data.rows[0].record).toBeNull();
    expect(body.data.summary.unmarked).toBe(1);
  });

  it("returns the day's record and summary counts", async () => {
    const emp = await makeEmployee(s.admin.id, "Roster Marked");
    await createAttendance(
      buildRequest("/api/attendance", {
        token: s.adminToken,
        method: "POST",
        body: {
          employeeId: emp.id,
          date: "2026-10-19",
          status: "PRESENT",
          overtimeHours: 2,
        },
      })
    );

    const res = await roster(
      s.adminToken,
      "date=2026-10-19&search=Roster+Marked"
    );
    const body = await res.json();
    expect(body.data.rows[0].record.status).toBe("PRESENT");
    expect(body.data.rows[0].record.overtimeHours).toBe(2);
    expect(body.data.summary.present).toBe(1);
    expect(body.data.summary.totalOvertimeHours).toBe(2);
  });

  it("excludes inactive employees by default and includes them on request", async () => {
    await makeEmployee(s.admin.id, "Roster Inactive", "INACTIVE");

    const defaultRes = await roster(
      s.adminToken,
      "date=2026-10-19&search=Roster+Inactive"
    );
    expect((await defaultRes.json()).data.rows).toHaveLength(0);

    const allRes = await roster(
      s.adminToken,
      "date=2026-10-19&search=Roster+Inactive&includeInactive=1"
    );
    expect((await allRes.json()).data.rows).toHaveLength(1);
  });

  it("lets an admin see a pending record created by a non-admin", async () => {
    const emp = await makeEmployee(s.admin.id, "Roster Pending");
    await createAttendance(
      buildRequest("/api/attendance", {
        token: s.userToken,
        method: "POST",
        body: { employeeId: emp.id, date: "2026-10-19", status: "PRESENT" },
      })
    );

    const res = await roster(
      s.adminToken,
      "date=2026-10-19&search=Roster+Pending"
    );
    const body = await res.json();
    expect(body.data.rows[0].record).not.toBeNull();
    expect(body.data.rows[0].record.approvalStatus).toBe("PENDING");
  });

  it("rejects unauthenticated requests", async () => {
    const res = await getDay(buildRequest("/api/attendance/day?date=2026-10-19"));
    expect(res.status).toBe(401);
  });
});
