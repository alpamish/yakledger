import { GET as GET_CONTRACTS, POST as POST_CONTRACT } from "@/app/api/contracts/route";
import { GET as GET_CONTRACT, PUT as PUT_CONTRACT, DELETE as DELETE_CONTRACT } from "@/app/api/contracts/[id]/route";
import { GET as GET_RATES, POST as POST_RATE } from "@/app/api/contracts/[id]/rates/route";
import { PUT as PUT_RATE, DELETE as DELETE_RATE } from "@/app/api/contracts/[id]/rates/[rateId]/route";
import { POST as APPROVE_RATE } from "@/app/api/contracts/[id]/rates/[rateId]/approve/route";
import { POST as POST_VARIATION } from "@/app/api/contracts/[id]/variations/route";
import { POST as DECIDE_VARIATION } from "@/app/api/contracts/[id]/variations/[variationId]/route";
import { POST as POST_CONTRACTOR } from "@/app/api/contractors/route";
import { POST as POST_TIMESHEET } from "@/app/api/timesheets/route";
import { db } from "@/lib/db";
import { seedUsers, buildRequest } from "../helpers";

let tokens: Awaited<ReturnType<typeof seedUsers>>;
let contractorId: string;
let machineryId: string;

beforeAll(async () => {
  tokens = await seedUsers();
  const res = await POST_CONTRACTOR(
    buildRequest("/api/contractors", {
      token: tokens.adminToken,
      method: "POST",
      body: {
        contractorName: "Contract Test Co",
        fatherName: "Father",
        phoneNumber: "0755555555",
        contractorType: "MACHINERY_CONTRACTOR",
        machinery: [
          {
            machineryName: "Bulldozer B1",
            machineryType: "DOZER",
            hourlyRate: 50,
            dailyRate: 400,
            monthlyRate: 0,
            workHoursPerDay: 8,
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

async function createContract(
  overrides: Record<string, unknown> = {}
): Promise<{ id: string; contractNumber: string; contractorId: string; projectName?: string | null }> {
  const res = await POST_CONTRACT(
    buildRequest("/api/contracts", {
      token: tokens.adminToken,
      method: "POST",
      body: {
        contractorId,
        title: "Dozer hire Q2",
        contractType: "MACHINERY_HIRE",
        value: 100000,
        startDate: "2026-04-01",
        endDate: "2026-06-30",
        workHoursPerDay: 8,
        contractDaysPerMonth: 26,
        ...overrides,
      },
    })
  );
  expect(res.status).toBe(201);
  const body = await res.json();
  return body.data;
}

describe("POST /api/contracts — creation", () => {
  it("creates a contract with a sequential CON- number", async () => {
    const contract = await createContract();
    expect(contract.contractNumber).toMatch(/^CON-\d{5}$/);
  });

  it("issues strictly increasing unique numbers across a contractor's projects", async () => {
    const first = await createContract({ title: "Bridge works", projectName: "Bridge Project" });
    const second = await createContract({ title: "Canal works", projectName: "Canal Project" });

    // Same contractor, several contracts across multiple projects (§9 gate).
    expect(first.contractorId).toBe(second.contractorId);
    expect(first.projectName).toBe("Bridge Project");
    expect(second.projectName).toBe("Canal Project");

    const seq = (c: { contractNumber: string }) => Number(c.contractNumber.replace("CON-", ""));
    expect(first.contractNumber).toMatch(/^CON-\d{5}$/);
    expect(second.contractNumber).toMatch(/^CON-\d{5}$/);
    expect(second.contractNumber).not.toBe(first.contractNumber);
    expect(seq(second)).toBeGreaterThan(seq(first));
  });

  it("rejects an end date before the start date", async () => {
    const res = await POST_CONTRACT(
      buildRequest("/api/contracts", {
        token: tokens.adminToken,
        method: "POST",
        body: {
          contractorId,
          title: "Bad dates",
          startDate: "2026-06-30",
          endDate: "2026-04-01",
        },
      })
    );
    expect(res.status).toBe(400);
  });

  it("404s for an unknown contractor", async () => {
    const res = await POST_CONTRACT(
      buildRequest("/api/contracts", {
        token: tokens.adminToken,
        method: "POST",
        body: { contractorId: "missing", title: "X", startDate: "2026-04-01" },
      })
    );
    expect(res.status).toBe(404);
  });

  it("rejects an unknown contract type", async () => {
    const res = await POST_CONTRACT(
      buildRequest("/api/contracts", {
        token: tokens.adminToken,
        method: "POST",
        body: {
          contractorId,
          title: "Bad type",
          contractType: "SPACE_TRAVEL",
          startDate: "2026-04-01",
        },
      })
    );
    expect(res.status).toBe(400);
  });

  it("requires contracts:create (WATCHER gets 403)", async () => {
    const watcher = await db.user.create({
      data: { id: "u_watcher_con", email: "watcher@con.test", name: "W", password: "x", role: "WATCHER" },
    });
    const { generateToken } = await import("@/lib/auth");
    const token = generateToken({ userId: watcher.id, email: watcher.email, role: watcher.role });
    const res = await POST_CONTRACT(
      buildRequest("/api/contracts", {
        token,
        method: "POST",
        body: { contractorId, title: "Nope", startDate: "2026-04-01" },
      })
    );
    expect(res.status).toBe(403);
  });
});

describe("GET /api/contracts — listing and detail", () => {
  it("lists contracts with counts", async () => {
    const res = await GET_CONTRACTS(buildRequest("/api/contracts", { token: tokens.adminToken }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.data.length).toBeGreaterThan(0);
    expect(body.data.data[0].contractor.contractorName).toBe("Contract Test Co");
  });

  it("filters by contractorId", async () => {
    const res = await GET_CONTRACTS(
      buildRequest(`/api/contracts?contractorId=${contractorId}`, { token: tokens.adminToken })
    );
    const body = await res.json();
    for (const c of body.data.data) expect(c.contractorId).toBe(contractorId);
  });

  it("returns full detail with rates and variations arrays", async () => {
    const contract = await createContract({ title: "Detail target" });
    const res = await GET_CONTRACT(
      buildRequest(`/api/contracts/${contract.id}`, { token: tokens.adminToken }),
      { params: Promise.resolve({ id: contract.id }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.contractNumber).toBe(contract.contractNumber);
    expect(Array.isArray(body.data.rates)).toBe(true);
    expect(Array.isArray(body.data.variations)).toBe(true);
  });
});

describe("Contract rates — effective-dated tiers", () => {
  it("admin-created rates are approved immediately", async () => {
    const contract = await createContract({ title: "Rate test" });
    const res = await POST_RATE(
      buildRequest(`/api/contracts/${contract.id}/rates`, {
        token: tokens.adminToken,
        method: "POST",
        body: {
          label: "EXCAVATOR_HOUR",
          rateType: "HOURLY",
          amount: 120,
          effectiveFrom: "2026-04-01",
          isDefault: true,
        },
      }),
      { params: Promise.resolve({ id: contract.id }) }
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.approvedAt).toBeTruthy();
  });

  it("a later effectiveFrom supersedes an earlier rate for later dates", async () => {
    const contract = await createContract({ title: "Tier test" });
    const mk = (amount: number, from: string) =>
      POST_RATE(
        buildRequest(`/api/contracts/${contract.id}/rates`, {
          token: tokens.adminToken,
          method: "POST",
          body: { label: "HOUR", rateType: "HOURLY", amount, effectiveFrom: from, isDefault: true },
        }),
        { params: Promise.resolve({ id: contract.id }) }
      );
    expect((await mk(100, "2026-04-01")).status).toBe(201);
    expect((await mk(150, "2026-05-01")).status).toBe(201);

    const rates = await db.contractRate.findMany({
      where: { contractId: contract.id, label: "HOUR" },
      orderBy: { effectiveFrom: "asc" },
    });
    expect(rates.map((r) => r.amount)).toEqual([100, 150]);
    // The first rate is untouched — changes are prospective only.
    expect(rates[0].amount).toBe(100);
  });

  it("non-approvers create pending rates that resolveRateForWork ignores", async () => {
    const contract = await createContract({ title: "Pending rate" });
    const res = await POST_RATE(
      buildRequest(`/api/contracts/${contract.id}/rates`, {
        token: tokens.userToken, // USER has contracts:edit but not contracts:approve
        method: "POST",
        body: { label: "HOUR", rateType: "HOURLY", amount: 99, effectiveFrom: "2026-04-01" },
      }),
      { params: Promise.resolve({ id: contract.id }) }
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.approvedAt).toBeNull();

    // A timesheet on this contract snapshots nothing from the pending rate.
    const tsRes = await POST_TIMESHEET(
      buildRequest("/api/timesheets", {
        token: tokens.adminToken,
        method: "POST",
        body: {
          contractorId,
          machineryId,
          contractId: contract.id,
          date: "2026-04-10",
          startTime: "08:00",
          lunchStart: "12:00",
          lunchEnd: "13:00",
          endTime: "17:00",
        },
      })
    );
    expect(tsRes.status).toBe(201);
    const ts = await db.timesheet.findFirst({ orderBy: { createdAt: "desc" } });
    expect(ts?.contractRateId).toBeNull();
    expect(ts?.rateAmount).toBe(50); // falls back to the machinery hourly rate
  });

  it("an approver approves a pending rate", async () => {
    const contract = await createContract({ title: "Approve rate" });
    const created = await POST_RATE(
      buildRequest(`/api/contracts/${contract.id}/rates`, {
        token: tokens.userToken,
        method: "POST",
        body: { label: "HOUR", rateType: "HOURLY", amount: 110, effectiveFrom: "2026-04-01" },
      }),
      { params: Promise.resolve({ id: contract.id }) }
    );
    const rate = (await created.json()).data;

    const res = await APPROVE_RATE(
      buildRequest(`/api/contracts/${contract.id}/rates/${rate.id}/approve`, {
        token: tokens.adminToken,
        method: "POST",
      }),
      { params: Promise.resolve({ id: contract.id, rateId: rate.id }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.approvedAt).toBeTruthy();
    expect(body.data.approvedById).toBe(tokens.admin.id);
  });

  it("deleting a rate used by timesheets is blocked", async () => {
    const contract = await createContract({ title: "Rate delete guard" });
    const created = await POST_RATE(
      buildRequest(`/api/contracts/${contract.id}/rates`, {
        token: tokens.adminToken,
        method: "POST",
        body: { label: "HOUR", rateType: "HOURLY", amount: 130, effectiveFrom: "2026-04-01", isDefault: true },
      }),
      { params: Promise.resolve({ id: contract.id }) }
    );
    const rate = (await created.json()).data;

    await POST_TIMESHEET(
      buildRequest("/api/timesheets", {
        token: tokens.adminToken,
        method: "POST",
        body: {
          contractorId,
          machineryId,
          contractId: contract.id,
          rateLabel: "HOUR",
          date: "2026-04-15",
          totalHours: 8,
        },
      })
    );

    const res = await DELETE_RATE(
      buildRequest(`/api/contracts/${contract.id}/rates/${rate.id}`, {
        token: tokens.adminToken,
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: contract.id, rateId: rate.id }) }
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("referenced by recorded timesheets");
  });

  it("editing a rate amount as a non-approver resets approval", async () => {
    const contract = await createContract({ title: "Re-approval" });
    const created = await POST_RATE(
      buildRequest(`/api/contracts/${contract.id}/rates`, {
        token: tokens.adminToken,
        method: "POST",
        body: { label: "HOUR", rateType: "HOURLY", amount: 100, effectiveFrom: "2026-04-01" },
      }),
      { params: Promise.resolve({ id: contract.id }) }
    );
    const rate = (await created.json()).data;
    expect(rate.approvedAt).toBeTruthy();

    const res = await PUT_RATE(
      buildRequest(`/api/contracts/${contract.id}/rates/${rate.id}`, {
        token: tokens.userToken,
        method: "PUT",
        body: { amount: 140 },
      }),
      { params: Promise.resolve({ id: contract.id, rateId: rate.id }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.amount).toBe(140);
    expect(body.data.approvedAt).toBeNull(); // must be re-approved
  });
});

describe("Timesheet rate snapshots", () => {
  it("snapshots the contract rate effective on the work date", async () => {
    const contract = await createContract({ title: "Snapshot test" });
    await POST_RATE(
      buildRequest(`/api/contracts/${contract.id}/rates`, {
        token: tokens.adminToken,
        method: "POST",
        body: { label: "HOUR", rateType: "HOURLY", amount: 200, effectiveFrom: "2026-04-01", isDefault: true },
      }),
      { params: Promise.resolve({ id: contract.id }) }
    );
    await POST_RATE(
      buildRequest(`/api/contracts/${contract.id}/rates`, {
        token: tokens.adminToken,
        method: "POST",
        body: { label: "HOUR", rateType: "HOURLY", amount: 250, effectiveFrom: "2026-05-01" },
      }),
      { params: Promise.resolve({ id: contract.id }) }
    );

    const mkTimesheet = (date: string) =>
      POST_TIMESHEET(
        buildRequest("/api/timesheets", {
          token: tokens.adminToken,
          method: "POST",
          body: {
            contractorId,
            machineryId,
            contractId: contract.id,
            rateLabel: "HOUR",
            date,
            totalHours: 8,
          },
        })
      );

    expect((await mkTimesheet("2026-04-20")).status).toBe(201);
    expect((await mkTimesheet("2026-05-20")).status).toBe(201);

    const apr = await db.timesheet.findFirst({ where: { date: new Date("2026-04-20"), contractId: contract.id } });
    const may = await db.timesheet.findFirst({ where: { date: new Date("2026-05-20"), contractId: contract.id } });
    expect(apr?.rateAmount).toBe(200);
    expect(apr?.contractId).toBe(contract.id);
    expect(apr?.contractRateId).toBeTruthy();
    expect(may?.rateAmount).toBe(250);
  });

  it("the snapshot survives a later rate change (history is immutable)", async () => {
    const contract = await createContract({ title: "Immutable snapshot" });
    const created = await POST_RATE(
      buildRequest(`/api/contracts/${contract.id}/rates`, {
        token: tokens.adminToken,
        method: "POST",
        body: { label: "HOUR", rateType: "HOURLY", amount: 300, effectiveFrom: "2026-04-01", isDefault: true },
      }),
      { params: Promise.resolve({ id: contract.id }) }
    );
    const rate = (await created.json()).data;

    await POST_TIMESHEET(
      buildRequest("/api/timesheets", {
        token: tokens.adminToken,
        method: "POST",
        body: { contractorId, machineryId, contractId: contract.id, rateLabel: "HOUR", date: "2026-04-25", totalHours: 8 },
      })
    );

    // Close the old rate and add a new one at a higher amount.
    await PUT_RATE(
      buildRequest(`/api/contracts/${contract.id}/rates/${rate.id}`, {
        token: tokens.adminToken,
        method: "PUT",
        body: { effectiveTo: "2026-04-26" },
      }),
      { params: Promise.resolve({ id: contract.id, rateId: rate.id }) }
    );
    await POST_RATE(
      buildRequest(`/api/contracts/${contract.id}/rates`, {
        token: tokens.adminToken,
        method: "POST",
        body: { label: "HOUR", rateType: "HOURLY", amount: 500, effectiveFrom: "2026-04-27", isDefault: true },
      }),
      { params: Promise.resolve({ id: contract.id }) }
    );

    const ts = await db.timesheet.findFirst({ where: { date: new Date("2026-04-25"), contractId: contract.id } });
    expect(ts?.rateAmount).toBe(300); // unchanged
  });

  it("discovers the contractor's active contract automatically", async () => {
    // Dedicated contractor so the discovery is unambiguous.
    const conRes = await POST_CONTRACTOR(
      buildRequest("/api/contractors", {
        token: tokens.adminToken,
        method: "POST",
        body: {
          contractorName: "Auto Discover Co",
          fatherName: "Father",
          phoneNumber: "0766666666",
          contractorType: "MACHINERY_CONTRACTOR",
          machinery: [
            { machineryName: "Crane C1", machineryType: "CRANE", hourlyRate: 45, dailyRate: 0, monthlyRate: 0 },
          ],
        },
      })
    );
    const conBody = await conRes.json();
    const loneContractorId = conBody.data.id;
    const loneMachinery = await db.machinery.findFirst({ where: { assignedContractorId: loneContractorId } });

    const contract = await createContract({ title: "Auto-discovery", contractorId: loneContractorId });
    await POST_RATE(
      buildRequest(`/api/contracts/${contract.id}/rates`, {
        token: tokens.adminToken,
        method: "POST",
        body: { label: "HOUR", rateType: "HOURLY", amount: 175, effectiveFrom: "2026-04-01", isDefault: true },
      }),
      { params: Promise.resolve({ id: contract.id }) }
    );

    // No contractId in the payload — the route finds the ACTIVE contract.
    const res = await POST_TIMESHEET(
      buildRequest("/api/timesheets", {
        token: tokens.adminToken,
        method: "POST",
        body: { contractorId: loneContractorId, machineryId: loneMachinery!.id, rateLabel: "HOUR", date: "2026-05-10", totalHours: 8 },
      })
    );
    expect(res.status).toBe(201);
    const ts = await db.timesheet.findFirst({
      where: { date: new Date("2026-05-10"), contractorId: loneContractorId },
    });
    expect(ts?.contractId).toBe(contract.id);
    expect(ts?.rateAmount).toBe(175);
  });
});

describe("Contract variations", () => {
  it("approval applies the value change and the rate change", async () => {
    const contract = await createContract({ title: "Variation test", value: 100000 });
    const rateRes = await POST_RATE(
      buildRequest(`/api/contracts/${contract.id}/rates`, {
        token: tokens.adminToken,
        method: "POST",
        body: { label: "HOUR", rateType: "HOURLY", amount: 120, effectiveFrom: "2026-04-01", isDefault: true },
      }),
      { params: Promise.resolve({ id: contract.id }) }
    );
    const originalRate = (await rateRes.json()).data;

    const varRes = await POST_VARIATION(
      buildRequest(`/api/contracts/${contract.id}/variations`, {
        token: tokens.userToken,
        method: "POST",
        body: {
          description: "Extend scope, raise hourly rate",
          valueChange: 25000,
          rateLabel: "HOUR",
          newAmount: 180,
          effectiveFrom: "2026-05-15",
        },
      }),
      { params: Promise.resolve({ id: contract.id }) }
    );
    expect(varRes.status).toBe(201);
    const variation = (await varRes.json()).data;
    expect(variation.status).toBe("PENDING");

    const decideRes = await DECIDE_VARIATION(
      buildRequest(`/api/contracts/${contract.id}/variations/${variation.id}`, {
        token: tokens.adminToken,
        method: "POST",
        body: { action: "approve" },
      }),
      { params: Promise.resolve({ id: contract.id, variationId: variation.id }) }
    );
    expect(decideRes.status).toBe(200);

    // Contract value increased.
    const after = await GET_CONTRACT(
      buildRequest(`/api/contracts/${contract.id}`, { token: tokens.adminToken }),
      { params: Promise.resolve({ id: contract.id }) }
    );
    const contractBody = (await after.json()).data;
    expect(contractBody.value).toBe(125000);

    // A new effective-dated rate tier was created; the original is untouched.
    const rates = await db.contractRate.findMany({
      where: { contractId: contract.id, label: "HOUR" },
      orderBy: { effectiveFrom: "asc" },
    });
    expect(rates.map((r) => r.amount)).toEqual([120, 180]);
    expect(rates[1].effectiveFrom).toEqual(new Date("2026-05-15"));
    expect(rates[0].id).toBe(originalRate.id);

    // A timesheet after the variation bills at the new rate.
    await POST_TIMESHEET(
      buildRequest("/api/timesheets", {
        token: tokens.adminToken,
        method: "POST",
        body: { contractorId, machineryId, contractId: contract.id, rateLabel: "HOUR", date: "2026-05-20", totalHours: 8 },
      })
    );
    const ts = await db.timesheet.findFirst({ where: { date: new Date("2026-05-20"), contractId: contract.id } });
    expect(ts?.rateAmount).toBe(180);

    // And before the variation still bills the old rate.
    await POST_TIMESHEET(
      buildRequest("/api/timesheets", {
        token: tokens.adminToken,
        method: "POST",
        body: { contractorId, machineryId, contractId: contract.id, rateLabel: "HOUR", date: "2026-05-01", totalHours: 8 },
      })
    );
    const tsBefore = await db.timesheet.findFirst({ where: { date: new Date("2026-05-01"), contractId: contract.id } });
    expect(tsBefore?.rateAmount).toBe(120);
  });

  it("rejection leaves the contract untouched", async () => {
    const contract = await createContract({ title: "Reject variation", value: 50000 });
    const varRes = await POST_VARIATION(
      buildRequest(`/api/contracts/${contract.id}/variations`, {
        token: tokens.userToken,
        method: "POST",
        body: { description: "Nope", valueChange: 10000, effectiveFrom: "2026-05-01" },
      }),
      { params: Promise.resolve({ id: contract.id }) }
    );
    const variation = (await varRes.json()).data;

    const decideRes = await DECIDE_VARIATION(
      buildRequest(`/api/contracts/${contract.id}/variations/${variation.id}`, {
        token: tokens.adminToken,
        method: "POST",
        body: { action: "reject", note: "budget" },
      }),
      { params: Promise.resolve({ id: contract.id, variationId: variation.id }) }
    );
    expect(decideRes.status).toBe(200);

    const after = await db.contractorContract.findUnique({ where: { id: contract.id } });
    expect(after?.value).toBe(50000);
  });

  it("only approvers may decide variations (USER gets 403)", async () => {
    const contract = await createContract({ title: "Approve gate" });
    const varRes = await POST_VARIATION(
      buildRequest(`/api/contracts/${contract.id}/variations`, {
        token: tokens.userToken,
        method: "POST",
        body: { description: "x", effectiveFrom: "2026-05-01" },
      }),
      { params: Promise.resolve({ id: contract.id }) }
    );
    const variation = (await varRes.json()).data;

    const res = await DECIDE_VARIATION(
      buildRequest(`/api/contracts/${contract.id}/variations/${variation.id}`, {
        token: tokens.userToken, // has contracts:edit but not contracts:approve
        method: "POST",
        body: { action: "approve" },
      }),
      { params: Promise.resolve({ id: contract.id, variationId: variation.id }) }
    );
    expect(res.status).toBe(403);
  });

  it("rateLabel without newAmount is rejected", async () => {
    const contract = await createContract({ title: "Var validation" });
    const res = await POST_VARIATION(
      buildRequest(`/api/contracts/${contract.id}/variations`, {
        token: tokens.adminToken,
        method: "POST",
        body: { description: "x", rateLabel: "HOUR", effectiveFrom: "2026-05-01" },
      }),
      { params: Promise.resolve({ id: contract.id }) }
    );
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/contracts/[id]", () => {
  it("deletes a draft contract with no work attached", async () => {
    const contract = await createContract({ title: "Deletable draft" });
    const res = await DELETE_CONTRACT(
      buildRequest(`/api/contracts/${contract.id}`, { token: tokens.adminToken, method: "DELETE" }),
      { params: Promise.resolve({ id: contract.id }) }
    );
    expect(res.status).toBe(200);
    expect(await db.contractorContract.findUnique({ where: { id: contract.id } })).toBeNull();
  });

  it("refuses to delete a contract with recorded timesheets", async () => {
    const contract = await createContract({ title: "Guarded" });
    await POST_TIMESHEET(
      buildRequest("/api/timesheets", {
        token: tokens.adminToken,
        method: "POST",
        body: { contractorId, machineryId, contractId: contract.id, date: "2026-06-01", totalHours: 8 },
      })
    );
    const res = await DELETE_CONTRACT(
      buildRequest(`/api/contracts/${contract.id}`, { token: tokens.adminToken, method: "DELETE" }),
      { params: Promise.resolve({ id: contract.id }) }
    );
    expect(res.status).toBe(400);
    expect(await db.contractorContract.findUnique({ where: { id: contract.id } })).not.toBeNull();
  });
});

describe("PUT /api/contracts/[id]", () => {
  it("updates contract fields and returns the updated record", async () => {
    const contract = await createContract({ title: "Edit me" });
    const res = await PUT_CONTRACT(
      buildRequest(`/api/contracts/${contract.id}`, {
        token: tokens.adminToken,
        method: "PUT",
        body: { title: "Edited title", paymentTerms: "Net 30" },
      }),
      { params: Promise.resolve({ id: contract.id }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.title).toBe("Edited title");
    expect(body.data.paymentTerms).toBe("Net 30");
  });

  it("rejects an end date before the start date", async () => {
    const contract = await createContract({ title: "Bad edit dates" });
    const res = await PUT_CONTRACT(
      buildRequest(`/api/contracts/${contract.id}`, {
        token: tokens.adminToken,
        method: "PUT",
        body: { endDate: "2020-01-01" },
      }),
      { params: Promise.resolve({ id: contract.id }) }
    );
    expect(res.status).toBe(400);
  });
});
