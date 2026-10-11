import { POST as POST_TIMESHEET } from "@/app/api/timesheets/route";
import { POST as POST_BULK_TIMESHEETS } from "@/app/api/timesheets/bulk/route";
import { POST as POST_CONTRACTOR } from "@/app/api/contractors/route";
import { db } from "@/lib/db";
import { seedUsers, buildRequest } from "../helpers";

let tokens: Awaited<ReturnType<typeof seedUsers>>;
let contractorId: string;
// Machinery with a NON-default work day: 8 hours, not 9.
let machineryId: string;

beforeAll(async () => {
  tokens = await seedUsers();

  const res = await POST_CONTRACTOR(
    buildRequest("/api/contractors", {
      token: tokens.adminToken,
      method: "POST",
      body: {
        contractorName: "TS Test Co",
        fatherName: "Father",
        phoneNumber: "0711111111",
        contractorType: "MACHINERY_CONTRACTOR",
        machinery: [
          {
            machineryName: "Excavator E1",
            machineryType: "EXCAVATOR",
            hourlyRate: 100,
            dailyRate: 800,
            monthlyRate: 0,
            workHoursPerDay: 8,
            contractDaysPerMonth: 28,
          },
        ],
      },
    })
  );
  const body = await res.json();
  expect(res.status).toBe(201);
  contractorId = body.data.id;
  const machinery = await db.machinery.findFirst({ where: { assignedContractorId: contractorId } });
  machineryId = machinery!.id;
});

describe("timesheet hour calculation uses the machinery's workHoursPerDay", () => {
  it("bulk create derives overtime against 8h machinery, not a hard-coded 9", async () => {
    // 08:00–17:00 with a 12:00–13:00 lunch = 8 hours. On an 8-hour machine
    // that is exactly a full day (0 overtime); a hard-coded 9 would also give
    // 0, so push one hour further.
    const res = await POST_BULK_TIMESHEETS(
      buildRequest("/api/timesheets/bulk", {
        token: tokens.adminToken,
        method: "POST",
        body: {
          records: [
            {
              contractorId,
              machineryId,
              date: "2026-04-01",
              startTime: "08:00",
              lunchStart: "12:00",
              lunchEnd: "13:00",
              endTime: "18:00", // 4h morning + 5h afternoon = 9h
            },
          ],
        },
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    const record = body.data.records[0];
    expect(record.totalHours).toBe(9);
    // 9h worked on an 8h machine → 1h overtime (old code assumed 9 → 0h OT).
    expect(record.overtimeHours).toBe(1);
  });

  it("bulk create with default 9h machinery reports no overtime for an 8h day", async () => {
    const contractorRes = await POST_CONTRACTOR(
      buildRequest("/api/contractors", {
        token: tokens.adminToken,
        method: "POST",
        body: {
          contractorName: "TS Nine Co",
          fatherName: "Father",
          phoneNumber: "0722222222",
          contractorType: "MACHINERY_CONTRACTOR",
          machinery: [
            {
              machineryName: "Grader G1",
              machineryType: "GRADER",
              hourlyRate: 50,
              dailyRate: 450,
              monthlyRate: 0,
              workHoursPerDay: 9,
            },
          ],
        },
      })
    );
    const contractorBody = await contractorRes.json();
    const nineMachinery = await db.machinery.findFirst({
      where: { assignedContractorId: contractorBody.data.id },
    });

    const res = await POST_BULK_TIMESHEETS(
      buildRequest("/api/timesheets/bulk", {
        token: tokens.adminToken,
        method: "POST",
        body: {
          records: [
            {
              contractorId: contractorBody.data.id,
              machineryId: nineMachinery!.id,
              date: "2026-04-02",
              startTime: "08:00",
              lunchStart: "12:00",
              lunchEnd: "13:00",
              endTime: "17:00", // 4h + 4h = 8h on a 9h machine
            },
          ],
        },
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.records[0].totalHours).toBe(8);
    expect(body.data.records[0].overtimeHours).toBe(0);
  });

  it("single create computes total hours from time fields", async () => {
    const res = await POST_TIMESHEET(
      buildRequest("/api/timesheets", {
        token: tokens.adminToken,
        method: "POST",
        body: {
          contractorId,
          machineryId,
          date: "2026-04-03",
          startTime: "08:00",
          lunchStart: "12:00",
          lunchEnd: "13:00",
          endTime: "17:00",
        },
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.totalHours).toBe(8);
  });
});
