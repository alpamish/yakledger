// Phase 3: machinery assignments (transfer history), daily operating logs,
// downtime records, and fuel variance.
import { POST as POST_MACHINERY } from "@/app/api/machinery/route";
import { GET as GET_MACHINERY, PUT as PUT_MACHINERY } from "@/app/api/machinery/[id]/route";
import {
  GET as GET_ASSIGNMENTS,
  POST as POST_ASSIGNMENT,
} from "@/app/api/machinery/[id]/assignments/route";
import { PUT as PUT_ASSIGNMENT } from "@/app/api/machinery/[id]/assignments/[assignmentId]/route";
import {
  GET as GET_LOGS,
  POST as POST_LOG,
} from "@/app/api/machinery/[id]/daily-logs/route";
import {
  PUT as PUT_LOG,
  DELETE as DELETE_LOG,
} from "@/app/api/machinery/[id]/daily-logs/[logId]/route";
import {
  GET as GET_DOWNTIME,
  POST as POST_DOWNTIME,
} from "@/app/api/machinery/[id]/downtime/route";
import {
  PUT as PUT_DOWNTIME,
  DELETE as DELETE_DOWNTIME,
} from "@/app/api/machinery/[id]/downtime/[recordId]/route";
import { GET as GET_VARIANCE } from "@/app/api/machinery/fuel-variance/route";
import { POST as POST_CONTRACT } from "@/app/api/contracts/route";
import { db } from "@/lib/db";
import { hashPassword, generateToken } from "@/lib/auth";
import { seedUsers, buildRequest } from "../helpers";

let tokens: Awaited<ReturnType<typeof seedUsers>>;

beforeAll(async () => {
  tokens = await seedUsers();
});

function params<T extends Record<string, string>>(obj: T) {
  return { params: Promise.resolve(obj) };
}

async function createContractor(name: string) {
  const { POST: POST_C } = await import("@/app/api/contractors/route");
  const res = await POST_C(
    buildRequest("/api/contractors", {
      token: tokens.adminToken,
      method: "POST",
      body: {
        contractorName: name,
        fatherName: "Abdullah",
        phoneNumber: "0701000000",
        contractorType: "MACHINERY_CONTRACTOR",
      },
    })
  );
  const body = await res.json();
  expect(res.status).toBe(201);
  return body.data.id as string;
}

async function createMachinery(overrides: Record<string, unknown> = {}) {
  const contractorId =
    (overrides.assignedContractorId as string) ?? (await createContractor("Ops Co"));
  const res = await POST_MACHINERY(
    buildRequest("/api/machinery", {
      token: tokens.adminToken,
      method: "POST",
      body: {
        machineryName: "Komatsu PC200",
        machineryType: "Excavator",
        assignedContractorId: contractorId,
        fuelType: "DIESEL",
        hourlyConsumptionRate: 10,
        monthlyRate: 30000,
        contractStartDate: "2026-09-01",
        ...overrides,
      },
    })
  );
  expect(res.status).toBe(201);
  const body = await res.json();
  return { id: body.data.id as string, contractorId, data: body.data };
}

function postAssignment(machineryId: string, body: unknown, token?: string) {
  return POST_ASSIGNMENT(
    buildRequest(`/api/machinery/${machineryId}/assignments`, {
      token: token ?? tokens.adminToken,
      method: "POST",
      body,
    }),
    params({ id: machineryId })
  );
}

function getAssignments(machineryId: string, token?: string) {
  return GET_ASSIGNMENTS(
    buildRequest(`/api/machinery/${machineryId}/assignments`, { token: token ?? tokens.adminToken }),
    params({ id: machineryId })
  );
}

function postLog(machineryId: string, body: unknown, token?: string) {
  return POST_LOG(
    buildRequest(`/api/machinery/${machineryId}/daily-logs`, {
      token: token ?? tokens.adminToken,
      method: "POST",
      body,
    }),
    params({ id: machineryId })
  );
}

function postDowntime(machineryId: string, body: unknown, token?: string) {
  return POST_DOWNTIME(
    buildRequest(`/api/machinery/${machineryId}/downtime`, {
      token: token ?? tokens.adminToken,
      method: "POST",
      body,
    }),
    params({ id: machineryId })
  );
}

describe("Machinery assignments — transfer history", () => {
  it("creating machinery records an initial assignment", async () => {
    const { id, contractorId } = await createMachinery();
    const res = await getAssignments(id);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].contractorId).toBe(contractorId);
    expect(body.data[0].endDate).toBeNull();
    expect(body.data[0].notes).toBe("Initial assignment");
    expect(body.data[0].transferredBy).toBe("Admin API");
  });

  it("a transfer repoints the machine and closes the previous assignment", async () => {
    const { id, contractorId: contractorA } = await createMachinery();
    const contractorB = await createContractor("Ops Co B");

    const res = await postAssignment(id, {
      contractorId: contractorB,
      startDate: "2026-10-01",
      transferredBy: "Site Supervisor",
      notes: "Rotated to new crew",
    });
    expect(res.status).toBe(201);

    // Pointer follows the active assignment.
    const detail = await GET_MACHINERY(
      buildRequest(`/api/machinery/${id}`, { token: tokens.adminToken }),
      params({ id })
    );
    const detailBody = await detail.json();
    expect(detailBody.data.assignedContractorId).toBe(contractorB);

    // History: newest first; old row closed on the transfer date, new row open.
    const list = await (await getAssignments(id)).json();
    expect(list.data).toHaveLength(2);
    expect(list.data[0].contractorId).toBe(contractorB);
    expect(list.data[0].endDate).toBeNull();
    expect(list.data[0].transferredBy).toBe("Site Supervisor");
    expect(list.data[1].contractorId).toBe(contractorA);
    expect(new Date(list.data[1].endDate).toISOString().slice(0, 10)).toBe("2026-10-01");
  });

  it("rejects a transfer that starts before the latest assignment", async () => {
    const { id } = await createMachinery();
    const contractorB = await createContractor("Ops Co B2");
    const res = await postAssignment(id, {
      contractorId: contractorB,
      startDate: "2000-01-01",
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/precedes the latest assignment/i);
  });

  it("rejects a contract that does not belong to the target contractor", async () => {
    const { id } = await createMachinery();
    const contractorB = await createContractor("Ops Co B3");
    const res = await postAssignment(id, {
      contractorId: contractorB,
      startDate: "2026-10-05",
      contractId: "nonexistent-contract",
    });
    expect(res.status).toBe(400);
  });

  it("closing the active assignment keeps the last-known pointer", async () => {
    const { id } = await createMachinery();
    const contractorB = await createContractor("Ops Co B4");
    const created = await (
      await postAssignment(id, {
        contractorId: contractorB,
        startDate: "2026-10-02",
      })
    ).json();
    const assignmentId = created.data.assignment.id as string;

    const put = await PUT_ASSIGNMENT(
      buildRequest(`/api/machinery/${id}/assignments/${assignmentId}`, {
        token: tokens.adminToken,
        method: "PUT",
        body: { endDate: "2026-11-30" },
      }),
      params({ id, assignmentId })
    );
    expect(put.status).toBe(200);
    expect((await put.json()).data.endDate).not.toBeNull();

    const detail = await GET_MACHINERY(
      buildRequest(`/api/machinery/${id}`, { token: tokens.adminToken }),
      params({ id })
    );
    const body = await detail.json();
    // No active assignment remains → pointer falls back to the most recent.
    expect(body.data.assignedContractorId).toBe(contractorB);
  });

  it("transfers a legacy machine (no history) and backfills the initial row", async () => {
    const { id, contractorId: contractorA } = await createMachinery();
    // Simulate a machine created before Phase 3: contractor set, no history.
    await db.machineryAssignment.deleteMany({ where: { machineryId: id } });
    const contractorB = await createContractor("Ops Co B5");

    const res = await postAssignment(id, {
      contractorId: contractorB,
      startDate: "2026-10-03",
    });
    expect(res.status).toBe(201);

    const list = await (await getAssignments(id)).json();
    expect(list.data).toHaveLength(2);
    const backfill = list.data.find((a: any) => a.contractorId === contractorA);
    expect(backfill).toBeTruthy();
    expect(backfill.notes).toMatch(/Backfilled/i);
    expect(backfill.endDate).not.toBeNull();
    expect(list.data[0].contractorId).toBe(contractorB);
  });

  it("changing the contractor through PUT /api/machinery records a transfer", async () => {
    const { id } = await createMachinery();
    const contractorB = await createContractor("Ops Co B6");

    const res = await PUT_MACHINERY(
      buildRequest(`/api/machinery/${id}`, {
        token: tokens.adminToken,
        method: "PUT",
        body: { assignedContractorId: contractorB },
      }),
      params({ id })
    );
    expect(res.status).toBe(200);

    const detail = await GET_MACHINERY(
      buildRequest(`/api/machinery/${id}`, { token: tokens.adminToken }),
      params({ id })
    );
    expect((await detail.json()).data.assignedContractorId).toBe(contractorB);

    const list = await (await getAssignments(id)).json();
    expect(list.data).toHaveLength(2);
    expect(list.data[0].contractorId).toBe(contractorB);
    expect(list.data[0].endDate).toBeNull();
  });

  it("returns 404 for an unknown machinery id", async () => {
    const res = await getAssignments("no-such-machinery");
    expect(res.status).toBe(404);
  });
});

describe("Machinery daily logs", () => {
  it("records a valid log with defaults", async () => {
    const { id } = await createMachinery();
    const res = await postLog(id, {
      date: "2026-09-01",
      openingMeter: 1000,
      closingMeter: 1040,
      normalHours: 8,
      overtimeHours: 1,
      operator: "Karim",
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.closingMeter).toBe(1040);
    expect(body.data.flagged).toBe(false);
    expect(body.data.flagReason).toBeNull();
    expect(body.data.loggedBy).toBe("Admin API");
    expect(body.data.createdBy).toBe(tokens.admin.id);
  });

  it("rejects closing meter <= opening meter", async () => {
    const { id } = await createMachinery();
    const res = await postLog(id, {
      date: "2026-09-02",
      openingMeter: 1000,
      closingMeter: 1000,
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/greater than opening/i);
  });

  it("rejects a duplicate log for the same machine and date (409)", async () => {
    const { id } = await createMachinery();
    const first = await postLog(id, {
      date: "2026-09-03",
      openingMeter: 0,
      closingMeter: 10,
    });
    expect(first.status).toBe(201);
    const second = await postLog(id, {
      date: "2026-09-03",
      openingMeter: 10,
      closingMeter: 20,
    });
    expect(second.status).toBe(409);
  });

  it("rejects hours above 24", async () => {
    const { id } = await createMachinery();
    const res = await postLog(id, {
      date: "2026-09-04",
      openingMeter: 0,
      closingMeter: 10,
      normalHours: 25,
    });
    expect(res.status).toBe(400);
  });

  it("flags a meter jump above the machine's threshold", async () => {
    const { id } = await createMachinery({ meterJumpThreshold: 50 });
    const res = await postLog(id, {
      date: "2026-09-05",
      openingMeter: 100,
      closingMeter: 300, // jump 200 > 50
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.flagged).toBe(true);
    expect(body.data.flagReason).toMatch(/exceeds threshold 50/);
  });

  it("does not flag a jump under the threshold, nor without a threshold", async () => {
    const under = await createMachinery({ meterJumpThreshold: 50 });
    const res = await postLog(under.id, {
      date: "2026-09-06",
      openingMeter: 100,
      closingMeter: 140, // jump 40 <= 50
    });
    expect(res.status).toBe(201);
    expect((await res.json()).data.flagged).toBe(false);

    const noThreshold = await createMachinery();
    const res2 = await postLog(noThreshold.id, {
      date: "2026-09-06",
      openingMeter: 100,
      closingMeter: 5000, // huge jump, but flagging disabled
    });
    expect(res2.status).toBe(201);
    expect((await res2.json()).data.flagged).toBe(false);
  });

  it("recomputes the flag when readings are corrected", async () => {
    const { id } = await createMachinery({ meterJumpThreshold: 50 });
    const created = await (
      await postLog(id, { date: "2026-09-07", openingMeter: 100, closingMeter: 400 })
    ).json();
    expect(created.data.flagged).toBe(true);

    const put = await PUT_LOG(
      buildRequest(`/api/machinery/${id}/daily-logs/${created.data.id}`, {
        token: tokens.adminToken,
        method: "PUT",
        body: { openingMeter: 300, closingMeter: 340 },
      }),
      params({ id, logId: created.data.id })
    );
    expect(put.status).toBe(200);
    const putBody = await put.json();
    expect(putBody.data.flagged).toBe(false);
    expect(putBody.data.flagReason).toBeNull();
  });

  it("rejects invalid readings on update", async () => {
    const { id } = await createMachinery();
    const created = await (
      await postLog(id, { date: "2026-09-08", openingMeter: 100, closingMeter: 200 })
    ).json();
    const put = await PUT_LOG(
      buildRequest(`/api/machinery/${id}/daily-logs/${created.data.id}`, {
        token: tokens.adminToken,
        method: "PUT",
        body: { openingMeter: 200, closingMeter: 150 },
      }),
      params({ id, logId: created.data.id })
    );
    expect(put.status).toBe(400);
  });

  it("lists logs and filters by flagged status", async () => {
    const { id } = await createMachinery({ meterJumpThreshold: 50 });
    await postLog(id, { date: "2026-09-09", openingMeter: 0, closingMeter: 10 }); // ok
    await postLog(id, { date: "2026-09-10", openingMeter: 10, closingMeter: 500 }); // flagged

    const all = await GET_LOGS(
      buildRequest(`/api/machinery/${id}/daily-logs`, { token: tokens.adminToken }),
      params({ id })
    );
    const allBody = await all.json();
    expect(all.status).toBe(200);
    expect(allBody.data.total).toBeGreaterThanOrEqual(2);

    const flagged = await GET_LOGS(
      buildRequest(`/api/machinery/${id}/daily-logs?flagged=true`, {
        token: tokens.adminToken,
      }),
      params({ id })
    );
    const flaggedBody = await flagged.json();
    expect(flaggedBody.data.data.every((l: any) => l.flagged)).toBe(true);
    expect(flaggedBody.data.data.length).toBeGreaterThanOrEqual(1);
  });

  it("deletes a log", async () => {
    const { id } = await createMachinery();
    const created = await (
      await postLog(id, { date: "2026-09-11", openingMeter: 0, closingMeter: 5 })
    ).json();

    const del = await DELETE_LOG(
      buildRequest(`/api/machinery/${id}/daily-logs/${created.data.id}`, {
        token: tokens.adminToken,
        method: "DELETE",
      }),
      params({ id, logId: created.data.id })
    );
    expect(del.status).toBe(200);
    expect(
      await db.machineryDailyLog.findUnique({ where: { id: created.data.id } })
    ).toBeNull();
  });
});

describe("Downtime records", () => {
  it("records downtime with chargeable defaulting to true (no contract)", async () => {
    const { id } = await createMachinery();
    const res = await postDowntime(id, {
      start: "2026-09-01T08:00:00.000Z",
      end: "2026-09-01T12:00:00.000Z",
      reason: "Hydraulic failure",
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.chargeable).toBe(true);
    expect(body.data.loggedBy).toBe("Admin API");
  });

  it("rejects end time <= start time", async () => {
    const { id } = await createMachinery();
    const res = await postDowntime(id, {
      start: "2026-09-02T10:00:00.000Z",
      end: "2026-09-02T09:00:00.000Z",
      reason: "Wrong order",
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/after start/i);
  });

  it("derives the chargeable default from the active contract's responsibility", async () => {
    const contractorId = await createContractor("Charge Co");
    const { id } = await createMachinery({
      assignedContractorId: contractorId,
      contractStartDate: "2026-01-01",
    });

    const contractRes = await POST_CONTRACT(
      buildRequest("/api/contracts", {
        token: tokens.adminToken,
        method: "POST",
        body: {
          contractorId,
          title: "Excavator hire",
          startDate: "2026-01-01",
          downtimeChargeable: false,
        },
      })
    );
    expect(contractRes.status).toBe(201);
    const contractId = (await contractRes.json()).data.id as string;

    const transfer = await postAssignment(id, {
      contractorId,
      startDate: "2026-01-01",
      contractId,
    });
    expect(transfer.status).toBe(201);

    const res = await postDowntime(id, {
      start: "2026-09-03T08:00:00.000Z",
      reason: "Breakdown",
    });
    expect(res.status).toBe(201);
    expect((await res.json()).data.chargeable).toBe(false);
  });

  it("lists downtime with computed durationHours and supports edit/delete", async () => {
    const { id } = await createMachinery();
    const created = await (
      await postDowntime(id, {
        start: "2026-09-04T06:00:00.000Z",
        end: "2026-09-04T09:30:00.000Z",
        reason: "Tire change",
        chargeable: false,
      })
    ).json();
    expect(created.data.chargeable).toBe(false);

    const list = await GET_DOWNTIME(
      buildRequest(`/api/machinery/${id}/downtime`, { token: tokens.adminToken }),
      params({ id })
    );
    const listBody = await list.json();
    expect(list.status).toBe(200);
    const row = listBody.data.data.find((r: any) => r.id === created.data.id);
    expect(row.durationHours).toBe(3.5);

    const put = await PUT_DOWNTIME(
      buildRequest(`/api/machinery/${id}/downtime/${created.data.id}`, {
        token: tokens.adminToken,
        method: "PUT",
        body: { chargeable: true, reason: "Tire change (chargeable)" },
      }),
      params({ id, recordId: created.data.id })
    );
    expect(put.status).toBe(200);
    expect((await put.json()).data.chargeable).toBe(true);

    const del = await DELETE_DOWNTIME(
      buildRequest(`/api/machinery/${id}/downtime/${created.data.id}`, {
        token: tokens.adminToken,
        method: "DELETE",
      }),
      params({ id, recordId: created.data.id })
    );
    expect(del.status).toBe(200);
    expect(await db.downtimeRecord.findUnique({ where: { id: created.data.id } })).toBeNull();
  });
});

describe("Fuel variance", () => {
  async function seedFuelUsage(
    machineryId: string,
    contractorId: string,
    date: string,
    quantity: number
  ) {
    return db.fuelUsage.create({
      data: {
        contractorId,
        machineryId,
        fuelType: "DIESEL",
        quantity,
        unitPrice: 2,
        totalCost: quantity * 2,
        date: new Date(date),
        createdBy: tokens.admin.id,
      },
    });
  }

  it("computes expected vs actual per machinery/day", async () => {
    const { id, contractorId } = await createMachinery({ hourlyConsumptionRate: 10 });
    // Daily log: 8 worked hours → expected 8 L.
    const log = await postLog(id, {
      date: "2026-09-01",
      openingMeter: 0,
      closingMeter: 80,
      normalHours: 8,
    });
    expect(log.status).toBe(201);
    await seedFuelUsage(id, contractorId, "2026-09-01", 90);

    const res = await GET_VARIANCE(
      buildRequest(`/api/machinery/fuel-variance?machineryId=${id}`, {
        token: tokens.adminToken,
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    const row = body.data.rows.find(
      (r: any) => r.machineryId === id && r.date === "2026-09-01"
    );
    expect(row).toBeTruthy();
    // 10 L/hr × 8 worked hours = 80 L expected, 90 L actual → +10 variance.
    expect(row.expectedLiters).toBe(80);
    expect(row.actualLiters).toBe(90);
    expect(row.variance).toBe(10);

    const summary = body.data.summary.find((s: any) => s.machineryId === id);
    expect(summary.expectedLiters).toBe(80);
    expect(summary.actualLiters).toBe(90);
    expect(summary.variance).toBe(10);
    expect(summary.coveragePercent).toBe(100);
  });

  it("returns null expectation without a daily log (coverage gap)", async () => {
    const { id, contractorId } = await createMachinery({ hourlyConsumptionRate: 10 });
    await seedFuelUsage(id, contractorId, "2026-09-02", 50);

    const res = await GET_VARIANCE(
      buildRequest(`/api/machinery/fuel-variance?machineryId=${id}`, {
        token: tokens.adminToken,
      })
    );
    const body = await res.json();
    const row = body.data.rows.find(
      (r: any) => r.machineryId === id && r.date === "2026-09-02"
    );
    expect(row.expectedLiters).toBeNull();
    expect(row.variance).toBeNull();
    const summary = body.data.summary.find((s: any) => s.machineryId === id);
    expect(summary.coveragePercent).toBe(0);
  });

  it("requires machinery:view", async () => {
    const res = await GET_VARIANCE(buildRequest("/api/machinery/fuel-variance"));
    expect(res.status).toBe(401);
  });
});

describe("Permissions and out-of-scope access", () => {
  let watcherToken: string;

  beforeAll(async () => {
    const watcher = await db.user.upsert({
      where: { email: "watcher@ops.test" },
      update: {},
      create: {
        id: "u_watch_ops",
        email: "watcher@ops.test",
        name: "Watcher Ops",
        password: await hashPassword("watcher-ops-pw"),
        role: "WATCHER",
      },
    });
    watcherToken = generateToken({
      userId: watcher.id,
      email: watcher.email,
      role: watcher.role,
    });
  });

  it("a watcher can view (scoped) but cannot create or edit", async () => {
    const { id } = await createMachinery();

    // No content:machinery grant → admin-created machinery is out of scope.
    const view = await getAssignments(id, watcherToken);
    expect(view.status).toBe(404);

    const logView = await GET_LOGS(
      buildRequest(`/api/machinery/${id}/daily-logs`, { token: watcherToken }),
      params({ id })
    );
    expect(logView.status).toBe(404);

    // Watcher lacks machinery:create / machinery:edit outright → 403.
    const transfer = await postAssignment(
      id,
      { contractorId: "whatever", startDate: "2026-10-01" },
      watcherToken
    );
    expect(transfer.status).toBe(403);

    const logCreate = await postLog(
      id,
      { date: "2026-09-20", openingMeter: 0, closingMeter: 10 },
      watcherToken
    );
    expect(logCreate.status).toBe(403);

    const dtCreate = await postDowntime(
      id,
      { start: "2026-09-20T08:00:00.000Z", reason: "x" },
      watcherToken
    );
    expect(dtCreate.status).toBe(403);

    const variance = await GET_VARIANCE(
      buildRequest("/api/machinery/fuel-variance", { token: watcherToken })
    );
    expect(variance.status).toBe(200);
    expect((await variance.json()).data.rows).toHaveLength(0);
  });

  it("requests without a token are rejected", async () => {
    const { id } = await createMachinery();
    expect(
      (await GET_ASSIGNMENTS(buildRequest(`/api/machinery/${id}/assignments`), params({ id })))
        .status
    ).toBe(401);
    expect(
      (await POST_LOG(
        buildRequest(`/api/machinery/${id}/daily-logs`, { method: "POST", body: {} }),
        params({ id })
      )).status
    ).toBe(401);
  });
});

describe("Rate consolidation (Phase 3): machinery rates feed the contract-rate path", () => {
  it("a contract-less timesheet snapshots the machinery's own rate tier", async () => {
    const { id, contractorId } = await createMachinery({
      hourlyRate: 125,
      dailyRate: 1000,
      monthlyRate: 28000,
      contractDaysPerMonth: 28,
      workHoursPerDay: 8,
    });
    const { POST: POST_TIMESHEET } = await import("@/app/api/timesheets/route");
    const res = await POST_TIMESHEET(
      buildRequest("/api/timesheets", {
        token: tokens.adminToken,
        method: "POST",
        body: {
          contractorId,
          machineryId: id,
          contractId: null, // explicit: legacy machinery-rate billing
          date: "2026-09-15",
          startTime: "08:00",
          lunchStart: "12:00",
          lunchEnd: "13:00",
          endTime: "17:00",
        },
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    // Falls back through the machinery default tier → machinery columns, and
    // snapshots that rate onto the timesheet (no contract rate involved).
    expect(body.data.contractRateId).toBeNull();
    expect(body.data.rateAmount).toBe(125);
    expect(body.data.rateLabel).toBe("Default");
  });
});
