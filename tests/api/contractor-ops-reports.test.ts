import { GET as GET_UTILIZATION } from "@/app/api/contractor-ops-reports/utilization/route";
import { GET as GET_DOWNTIME } from "@/app/api/contractor-ops-reports/downtime/route";
import { GET as GET_PROJECT_COST } from "@/app/api/contractor-ops-reports/project-cost/route";
import { GET as GET_FUEL_VARIANCE } from "@/app/api/machinery/fuel-variance/route";
import { POST as POST_CONTRACTOR } from "@/app/api/contractors/route";
import { POST as POST_CONTRACT } from "@/app/api/contracts/route";
import { POST as POST_RATE } from "@/app/api/contracts/[id]/rates/route";
import { POST as POST_TIMESHEET } from "@/app/api/timesheets/route";
import { POST as POST_CLAIM } from "@/app/api/contractor-claims/route";
import { POST as CLAIM_ACTION } from "@/app/api/contractor-claims/[id]/route";
import { POST as POST_PAYMENT } from "@/app/api/contractor-payments/route";
import { POST as ALLOCATE } from "@/app/api/contractor-payments/[id]/allocations/route";
import { db } from "@/lib/db";
import { generateToken } from "@/lib/auth";
import { seedUsers, buildRequest, TEST_ADMIN } from "../helpers";

let tokens: Awaited<ReturnType<typeof seedUsers>>;
let contractorId: string;
let machineryId: string;
let contractId: string;
let watcherToken = "";

/**
 * Seeded ops picture (all money via the shared engine; ops reports only read):
 *
 *   Machinery Excavator X1 (consumption 10 L/h) on contractor "Ops Co",
 *   contract "Canal Project" (value 300000, retention 10%, HOUR rate 150).
 *
 *   Daily logs:  05-01 normal 6 + ot 2, idle 1 | 05-02 normal 8, breakdown 1
 *                05-03 normal 4, idle 2
 *     → worked 20, idle 3, breakdown 1, loggedDays 3.
 *   Downtime:    05-01 08:00→12:00 BREAKDOWN chargeable (4h)
 *                05-02 09:00→09:30 MAINTENANCE (0.5h)
 *                05-03 10:00→13:00 BREAKDOWN chargeable (3h)
 *                05-03 14:00→open  WEATHER (clamped to 18:00 = 4h by `to`)
 *     → total 11.5h, chargeable 7h.
 *   Fuel usage:  05-01 quantity 50 → expected 10 × 8 worked = 80 → variance −30.
 *   Claim: timesheet 05-05 (8h × 150) → net 1080 (retention 120), paid 500.
 */
async function makeTimesheet(date: string): Promise<string> {
  const res = await POST_TIMESHEET(
    buildRequest("/api/timesheets", {
      token: tokens.adminToken,
      method: "POST",
      body: { contractorId, machineryId, contractId, rateLabel: "HOUR", date, totalHours: 8 },
    })
  );
  const body = await res.json();
  expect(res.status).toBe(201);
  return body.data.id;
}

beforeAll(async () => {
  tokens = await seedUsers();

  const conRes = await POST_CONTRACTOR(
    buildRequest("/api/contractors", {
      token: tokens.adminToken,
      method: "POST",
      body: {
        contractorName: "Ops Co",
        fatherName: "Father",
        phoneNumber: "0777111111",
        contractorType: "MACHINERY_CONTRACTOR",
        machinery: [
          {
            machineryName: "Excavator X1",
            machineryType: "EXCAVATOR",
            hourlyRate: 150,
            dailyRate: 0,
            monthlyRate: 0,
            hourlyConsumptionRate: 10,
          },
        ],
      },
    })
  );
  const conBody = await conRes.json();
  expect(conRes.status).toBe(201);
  contractorId = conBody.data.id;
  const machinery = await db.machinery.findFirst({ where: { assignedContractorId: contractorId } });
  machineryId = machinery!.id;

  const contractRes = await POST_CONTRACT(
    buildRequest("/api/contracts", {
      token: tokens.adminToken,
      method: "POST",
      body: {
        contractorId,
        title: "Canal contract",
        projectName: "Canal Project",
        contractType: "MACHINERY_HIRE",
        value: 300000,
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        retentionPercent: 10,
        workHoursPerDay: 8,
      },
    })
  );
  expect(contractRes.status).toBe(201);
  contractId = (await contractRes.json()).data.id;

  const rateRes = await POST_RATE(
    buildRequest(`/api/contracts/${contractId}/rates`, {
      token: tokens.adminToken,
      method: "POST",
      body: { label: "HOUR", rateType: "HOURLY", amount: 150, effectiveFrom: "2026-01-01", isDefault: true },
    }),
    { params: Promise.resolve({ id: contractId }) }
  );
  expect(rateRes.status).toBe(201);

  // Daily logs / downtime / fuel usage are plain ops rows (no derived money),
  // so fixtures are written directly — the routes under test only read them.
  await db.machineryDailyLog.createMany({
    data: [
      { date: "2026-05-01T00:00:00.000Z", machineryId, openingMeter: 0, closingMeter: 0, normalHours: 6, overtimeHours: 2, idleHours: 1, breakdownHours: 0, loggedBy: "Ops", createdBy: TEST_ADMIN.id },
      { date: "2026-05-02T00:00:00.000Z", machineryId, openingMeter: 0, closingMeter: 0, normalHours: 8, overtimeHours: 0, idleHours: 0, breakdownHours: 1, loggedBy: "Ops", createdBy: TEST_ADMIN.id },
      { date: "2026-05-03T00:00:00.000Z", machineryId, openingMeter: 0, closingMeter: 0, normalHours: 4, overtimeHours: 0, idleHours: 2, breakdownHours: 0, loggedBy: "Ops", createdBy: TEST_ADMIN.id },
    ],
  });

  await db.downtimeRecord.createMany({
    data: [
      { machineryId, start: "2026-05-01T08:00:00.000Z", end: "2026-05-01T12:00:00.000Z", reason: "BREAKDOWN", chargeable: true, loggedBy: "Ops", createdBy: TEST_ADMIN.id },
      { machineryId, start: "2026-05-02T09:00:00.000Z", end: "2026-05-02T09:30:00.000Z", reason: "MAINTENANCE", chargeable: false, loggedBy: "Ops", createdBy: TEST_ADMIN.id },
      { machineryId, start: "2026-05-03T10:00:00.000Z", end: "2026-05-03T13:00:00.000Z", reason: "BREAKDOWN", chargeable: true, loggedBy: "Ops", createdBy: TEST_ADMIN.id },
      { machineryId, start: "2026-05-03T14:00:00.000Z", end: null, reason: "WEATHER", chargeable: false, loggedBy: "Ops", createdBy: TEST_ADMIN.id },
    ],
  });

  await db.fuelUsage.create({
    data: {
      contractorId,
      machineryId,
      fuelType: "DIESEL",
      quantity: 50,
      unitPrice: 60,
      totalCost: 3000,
      date: "2026-05-01T00:00:00.000Z",
      createdBy: TEST_ADMIN.id,
    },
  });

  // Money path: claim from an approved timesheet, then a partial payment.
  const claimRes = await POST_CLAIM(
    buildRequest("/api/contractor-claims", {
      token: tokens.adminToken,
      method: "POST",
      body: { contractId, timesheetIds: [await makeTimesheet("2026-05-05")], title: "Ops claim" },
    })
  );
  expect(claimRes.status).toBe(201);
  const claim = (await claimRes.json()).data;
  const submit = await CLAIM_ACTION(
    buildRequest(`/api/contractor-claims/${claim.id}`, { token: tokens.adminToken, method: "POST", body: { action: "submit" } }),
    { params: Promise.resolve({ id: claim.id }) }
  );
  expect(submit.status).toBe(200);
  const approve = await CLAIM_ACTION(
    buildRequest(`/api/contractor-claims/${claim.id}`, { token: tokens.adminToken, method: "POST", body: { action: "approve" } }),
    { params: Promise.resolve({ id: claim.id }) }
  );
  expect(approve.status).toBe(200);

  const payRes = await POST_PAYMENT(
    buildRequest("/api/contractor-payments", {
      token: tokens.adminToken,
      method: "POST",
      body: { contractorId, amount: 500, paymentDate: "2026-05-10", method: "BANK_TRANSFER" },
    })
  );
  expect(payRes.status).toBe(201);
  const payment = (await payRes.json()).data;
  const alloc = await ALLOCATE(
    buildRequest(`/api/contractor-payments/${payment.id}/allocations`, {
      token: tokens.adminToken,
      method: "POST",
      body: { allocations: [{ claimId: claim.id, amount: 500 }] },
    }),
    { params: Promise.resolve({ id: payment.id }) }
  );
  expect(alloc.status).toBe(201);

  // WATCHER holds reports:view but no content:machinery / content:contractors.
  const watcher = await db.user.create({
    data: {
      id: "u_watcher_ops",
      email: "watcher@ops.test",
      name: "Watcher Ops",
      password: "x",
      role: "WATCHER",
    },
  });
  watcherToken = generateToken({ userId: watcher.id, email: watcher.email, role: watcher.role });
});

const WIN = "from=2026-05-01&to=2026-05-03T18:00:00.000Z";

describe("Utilization report", () => {
  it("aggregates log hours, downtime, and utilization per machine", async () => {
    const res = await GET_UTILIZATION(
      buildRequest(`/api/contractor-ops-reports/utilization?${WIN}`, { token: tokens.adminToken })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()).data;

    expect(body.rows).toHaveLength(1);
    const row = body.rows[0];
    expect(row.machineryId).toBe(machineryId);
    expect(row.assignedContractorName).toBe("Ops Co");
    expect(row.loggedDays).toBe(3);
    expect(row.workedHours).toBe(20);
    expect(row.idleHours).toBe(3);
    expect(row.breakdownHours).toBe(1);
    // 4 + 0.5 + 3 + 4 (open record clamped to `to`)
    expect(row.downtimeHours).toBe(11.5);
    expect(row.chargeableDowntimeHours).toBe(7);
    // 20 / (20 + 3 + 11.5) = 57.97% → 58
    expect(row.utilizationPercent).toBe(58);

    expect(body.totals.workedHours).toBe(20);
    expect(body.totals.downtimeHours).toBe(11.5);
    expect(body.totals.utilizationPercent).toBe(58);
  });

  it("clamps an open downtime record to the window end", async () => {
    // Same window without the open record's hours: cut `to` before it starts.
    const res = await GET_UTILIZATION(
      buildRequest(`/api/contractor-ops-reports/utilization?from=2026-05-01&to=2026-05-03T13:30:00.000Z`, {
        token: tokens.adminToken,
      })
    );
    const row = (await res.json()).data.rows[0];
    // 4 + 0.5 + 3 = 7.5 (WEATHER record starts 14:00 → zero hours, dropped)
    expect(row.downtimeHours).toBe(7.5);
    expect(row.chargeableDowntimeHours).toBe(7);
  });
});

describe("Downtime report", () => {
  it("groups downtime by machine and reason with the chargeable split", async () => {
    const res = await GET_DOWNTIME(
      buildRequest(`/api/contractor-ops-reports/downtime?${WIN}`, { token: tokens.adminToken })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()).data;

    expect(body.totalHours).toBe(11.5);
    expect(body.chargeableHours).toBe(7);

    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].recordCount).toBe(4);

    const breakdown = body.byReason.find((r: { reason: string }) => r.reason === "BREAKDOWN");
    expect(breakdown.recordCount).toBe(2);
    expect(breakdown.hours).toBe(7);
    expect(breakdown.chargeableHours).toBe(7);

    const weather = body.byReason.find((r: { reason: string }) => r.reason === "WEATHER");
    expect(weather.hours).toBe(4); // open record clamped to window end
    expect(weather.chargeableHours).toBe(0);
  });
});

describe("Fuel variance report", () => {
  it("compares expected (rate × worked hours) vs actual fuel", async () => {
    const res = await GET_FUEL_VARIANCE(
      buildRequest("/api/machinery/fuel-variance?from=2026-05-01&to=2026-05-01", { token: tokens.adminToken })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()).data;

    expect(body.summary).toHaveLength(1);
    const s = body.summary[0];
    expect(s.machineryId).toBe(machineryId);
    expect(s.consumptionRate).toBe(10);
    expect(s.expectedLiters).toBe(80); // 10 L/h × 8 worked hours (6 normal + 2 ot)
    expect(s.actualLiters).toBe(50);
    expect(s.variance).toBe(-30); // under consumption
    expect(s.coveragePercent).toBe(100); // log + rate present

    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].workedHours).toBe(8);
  });
});

describe("Project cost report", () => {
  it("compares contract value vs approved vs paid vs outstanding", async () => {
    const res = await GET_PROJECT_COST(
      buildRequest("/api/contractor-ops-reports/project-cost?from=2026-05-01&to=2026-05-31", {
        token: tokens.adminToken,
      })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()).data;

    expect(body.rows).toHaveLength(1);
    const row = body.rows[0];
    expect(row.contractId).toBe(contractId);
    expect(row.projectName).toBe("Canal Project");
    expect(row.contractorName).toBe("Ops Co");
    expect(row.contractValue).toBe(300000);
    expect(row.claimCount).toBe(1);
    expect(row.approvedNet).toBe(1080); // 1200 − 120 retention
    expect(row.retentionHeld).toBe(120);
    expect(row.paidAmount).toBe(500);
    expect(row.outstanding).toBe(580); // 1080 − 0 − 500

    expect(body.totals.approvedNet).toBe(1080);
    expect(body.totals.outstanding).toBe(580);

    // The same claim's outstanding must agree with the finance reports engine.
    const financeRes = await GET_PROJECT_COST(
      buildRequest("/api/contractor-ops-reports/project-cost?from=2026-05-01&to=2026-05-31", {
        token: tokens.adminToken,
      })
    );
    expect((await financeRes.json()).data.totals.outstanding).toBe(row.outstanding);
  });

  it("excludes claims outside the window", async () => {
    const res = await GET_PROJECT_COST(
      buildRequest("/api/contractor-ops-reports/project-cost?from=2026-06-01&to=2026-06-30", {
        token: tokens.adminToken,
      })
    );
    const row = (await res.json()).data.rows[0];
    expect(row.claimCount).toBe(0);
    expect(row.approvedNet).toBe(0);
    expect(row.outstanding).toBe(0);
    expect(row.contractValue).toBe(300000); // contracts aren't windowed
  });
});

describe("Access control", () => {
  it("rejects unauthenticated requests", async () => {
    expect((await GET_UTILIZATION(buildRequest("/api/contractor-ops-reports/utilization"))).status).toBe(401);
    expect((await GET_DOWNTIME(buildRequest("/api/contractor-ops-reports/downtime"))).status).toBe(401);
    expect((await GET_PROJECT_COST(buildRequest("/api/contractor-ops-reports/project-cost"))).status).toBe(401);
    expect((await GET_FUEL_VARIANCE(buildRequest("/api/machinery/fuel-variance"))).status).toBe(401);
  });

  it("scopes a restricted WATCHER out of machinery and contracts", async () => {
    const utilization = await GET_UTILIZATION(
      buildRequest(`/api/contractor-ops-reports/utilization?${WIN}`, { token: watcherToken })
    );
    expect(utilization.status).toBe(200);
    expect((await utilization.json()).data.rows).toHaveLength(0);

    const downtime = await GET_DOWNTIME(
      buildRequest(`/api/contractor-ops-reports/downtime?${WIN}`, { token: watcherToken })
    );
    expect((await downtime.json()).data.rows).toHaveLength(0);

    const projectCost = await GET_PROJECT_COST(
      buildRequest("/api/contractor-ops-reports/project-cost", { token: watcherToken })
    );
    expect((await projectCost.json()).data.rows).toHaveLength(0);

    const fuel = await GET_FUEL_VARIANCE(
      buildRequest("/api/machinery/fuel-variance?from=2026-05-01&to=2026-05-01", { token: watcherToken })
    );
    expect((await fuel.json()).data.summary).toHaveLength(0);
  });
});
