import { POST as FINANCIAL_REPORT } from "@/app/api/contractors/financial-report/route";
import { POST as POST_CONTRACTOR } from "@/app/api/contractors/route";
import { db } from "@/lib/db";
import { seedUsers, buildRequest } from "../helpers";

let tokens: Awaited<ReturnType<typeof seedUsers>>;

beforeAll(async () => {
  tokens = await seedUsers();
});

describe("POST /api/contractors/financial-report — rate resolution", () => {
  it("derives the hourly rate from dailyRate using machinery.workHoursPerDay (was hard-coded /9)", async () => {
    // Daily rate 900 on an 8-hour machine → 112.5/h. The old hard-coded /9
    // produced 100/h.
    const res = await POST_CONTRACTOR(
      buildRequest("/api/contractors", {
        token: tokens.adminToken,
        method: "POST",
        body: {
          contractorName: "FinRep Co",
          fatherName: "Father",
          phoneNumber: "0733333333",
          contractorType: "MACHINERY_CONTRACTOR",
          machinery: [
            {
              machineryName: "Loader L1",
              machineryType: "LOADER",
              hourlyRate: 0,
              dailyRate: 900,
              monthlyRate: 0,
              workHoursPerDay: 8,
              contractDaysPerMonth: 28,
            },
          ],
        },
      })
    );
    expect(res.status).toBe(201);

    // Remove the default rate tier so the machinery's own fields are the source.
    await db.machineryRate.deleteMany({});
    await db.machinery.updateMany({ data: { hourlyRate: 0, dailyRate: 900, monthlyRate: 0 } });

    const reportRes = await FINANCIAL_REPORT(
      buildRequest("/api/contractors/financial-report", {
        token: tokens.adminToken,
        method: "POST",
        body: {},
      })
    );
    expect(reportRes.status).toBe(200);
    const body = await reportRes.json();
    const row = body.data.find((r: { machineryName: string }) => r.machineryName === "Loader L1");
    expect(row).toBeTruthy();
    expect(row.hourlyRate).toBeCloseTo(112.5, 5);
  });

  it("prefers the default rate tier's hourly rate when present", async () => {
    const reportRes = await FINANCIAL_REPORT(
      buildRequest("/api/contractors/financial-report", {
        token: tokens.adminToken,
        method: "POST",
        body: {},
      })
    );
    expect(reportRes.status).toBe(200);
    const body = await reportRes.json();
    for (const row of body.data as { hourlyRate: number }[]) {
      // No rate tiers exist anymore (deleted above) and machinery dailyRate
      // 900 / 8h = 112.5 — every row must reflect the machinery-derived rate.
      expect(row.hourlyRate).toBeCloseTo(112.5, 5);
    }
  });
});
