import { PUT as PUT_CONTRACTOR, DELETE as DELETE_CONTRACTOR } from "@/app/api/contractors/[id]/route";
import { GET as GET_CONTRACTORS_LIST, POST as POST_CONTRACTOR } from "@/app/api/contractors/route";
import { POST as BULK_ACTION } from "@/app/api/contractors/bulk-action/route";
import { db } from "@/lib/db";
import { seedUsers, buildRequest } from "../helpers";

let tokens: Awaited<ReturnType<typeof seedUsers>>;

beforeAll(async () => {
  tokens = await seedUsers();
});

async function createContractor(name: string): Promise<string> {
  const res = await POST_CONTRACTOR(
    buildRequest("/api/contractors", {
      token: tokens.adminToken,
      method: "POST",
      body: {
        contractorName: name,
        fatherName: "Father",
        phoneNumber: `07${Math.floor(Math.random() * 100000000)}`,
        contractorType: "LABOR_CONTRACTOR",
      },
    })
  );
  const body = await res.json();
  expect(res.status).toBe(201);
  return body.data.id;
}

describe("PUT /api/contractors/[id]", () => {
  it("returns the full updated contractor (was returning only { id })", async () => {
    const id = await createContractor("PUT Target");
    const res = await PUT_CONTRACTOR(
      buildRequest(`/api/contractors/${id}`, {
        token: tokens.adminToken,
        method: "PUT",
        body: { contractorName: "PUT Target Updated", address: "Kabul" },
      }),
      { params: Promise.resolve({ id }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // The response must be the updated record, not the stale pre-update lookup.
    expect(body.data.id).toBe(id);
    expect(body.data.contractorName).toBe("PUT Target Updated");
    expect(body.data.address).toBe("Kabul");
    expect(body.data.contractorNumber).toBeTruthy();
    expect(body.data.updatedAt).toBeTruthy();

    const inDb = await db.contractor.findUnique({ where: { id } });
    expect(inDb?.contractorName).toBe("PUT Target Updated");
  });

  it("404s for an unknown contractor", async () => {
    const res = await PUT_CONTRACTOR(
      buildRequest("/api/contractors/nope", {
        token: tokens.adminToken,
        method: "PUT",
        body: { contractorName: "X" },
      }),
      { params: Promise.resolve({ id: "nope" }) }
    );
    expect(res.status).toBe(404);
  });

  it("rejects an invalid contractor type", async () => {
    const id = await createContractor("PUT Bad Type");
    const res = await PUT_CONTRACTOR(
      buildRequest(`/api/contractors/${id}`, {
        token: tokens.adminToken,
        method: "PUT",
        body: { contractorType: "Nonsense" },
      }),
      { params: Promise.resolve({ id }) }
    );
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/contractors/[id] — archive instead of destroying history", () => {
  it("hard-deletes a contractor with no history", async () => {
    const id = await createContractor("Clean Contractor");
    const res = await DELETE_CONTRACTOR(
      buildRequest(`/api/contractors/${id}`, { token: tokens.adminToken, method: "DELETE" }),
      { params: Promise.resolve({ id }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.archived).toBe(false);
    const inDb = await db.contractor.findUnique({ where: { id } });
    expect(inDb).toBeNull();
  });

  it("archives (does not delete) a contractor with timesheets; history is preserved", async () => {
    const id = await createContractor("History Contractor");
    await db.timesheet.create({
      data: {
        contractorId: id,
        date: new Date("2026-01-15"),
        totalHours: 8,
        overtimeHours: 0,
        approvalStatus: "APPROVED",
        createdBy: tokens.admin.id,
      },
    });

    const res = await DELETE_CONTRACTOR(
      buildRequest(`/api/contractors/${id}`, { token: tokens.adminToken, method: "DELETE" }),
      { params: Promise.resolve({ id }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.archived).toBe(true);
    expect(body.data.history.timesheets).toBe(1);
    expect(body.message).toContain("archived");

    const inDb = await db.contractor.findUnique({ where: { id } });
    expect(inDb).not.toBeNull();
    expect(inDb?.status).toBe("ARCHIVED");

    const timesheets = await db.timesheet.count({ where: { contractorId: id } });
    expect(timesheets).toBe(1);
  });

  it("archives a contractor with machinery instead of cascade-deleting it", async () => {
    const id = await createContractor("Machinery Contractor Co");
    await db.machinery.create({
      data: {
        machineryName: "Dozer D6",
        machineryType: "DOZER",
        assignedContractorId: id,
        createdBy: tokens.admin.id,
      },
    });

    const res = await DELETE_CONTRACTOR(
      buildRequest(`/api/contractors/${id}`, { token: tokens.adminToken, method: "DELETE" }),
      { params: Promise.resolve({ id }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.archived).toBe(true);

    const machinery = await db.machinery.count({ where: { assignedContractorId: id } });
    expect(machinery).toBe(1);
  });

  it("404s for an unknown contractor", async () => {
    const res = await DELETE_CONTRACTOR(
      buildRequest("/api/contractors/missing", { token: tokens.adminToken, method: "DELETE" }),
      { params: Promise.resolve({ id: "missing" }) }
    );
    expect(res.status).toBe(404);
  });
});

describe("POST /api/contractors/bulk-action — delete archives dirty, deletes clean", () => {
  it("deletes clean contractors and archives ones with history in a single run", async () => {
    const cleanId = await createContractor("Bulk Clean");
    const dirtyId = await createContractor("Bulk Dirty");
    await db.fuelUsage.create({
      data: {
        contractorId: dirtyId,
        fuelType: "DIESEL",
        quantity: 100,
        unitPrice: 1.5,
        totalCost: 150,
        date: new Date("2026-02-01"),
        createdBy: tokens.admin.id,
      },
    });

    const res = await BULK_ACTION(
      buildRequest("/api/contractors/bulk-action", {
        token: tokens.adminToken,
        method: "POST",
        body: { ids: [cleanId, dirtyId], action: "delete" },
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.deleted).toBe(1);
    expect(body.data.archived).toBe(1);

    expect(await db.contractor.findUnique({ where: { id: cleanId } })).toBeNull();
    const dirty = await db.contractor.findUnique({ where: { id: dirtyId } });
    expect(dirty?.status).toBe("ARCHIVED");
    expect(await db.fuelUsage.count({ where: { contractorId: dirtyId } })).toBe(1);
  });
});

describe("ARCHIVED contractors are excluded from the default list", () => {
  it("hides archived contractors unless explicitly filtered", async () => {
    const id = await createContractor("To Be Archived");
    await db.timesheet.create({
      data: {
        contractorId: id,
        date: new Date("2026-03-01"),
        totalHours: 8,
        createdBy: tokens.admin.id,
      },
    });
    await DELETE_CONTRACTOR(
      buildRequest(`/api/contractors/${id}`, { token: tokens.adminToken, method: "DELETE" }),
      { params: Promise.resolve({ id }) }
    );

    // Default list: archived contractor is hidden.
    const defaultRes = await GET_CONTRACTORS_LIST(
      buildRequest("/api/contractors?pageSize=100", { token: tokens.adminToken })
    );
    expect(defaultRes.status).toBe(200);
    const defaultBody = await defaultRes.json();
    const defaultIds = defaultBody.data.data.map((c: { id: string }) => c.id);
    expect(defaultIds).not.toContain(id);

    // Explicit ARCHIVED filter: it appears again.
    const archivedRes = await GET_CONTRACTORS_LIST(
      buildRequest("/api/contractors?statuses=ARCHIVED&pageSize=100", { token: tokens.adminToken })
    );
    expect(archivedRes.status).toBe(200);
    const archivedBody = await archivedRes.json();
    const archivedIds = archivedBody.data.data.map((c: { id: string }) => c.id);
    expect(archivedIds).toContain(id);
  });
});
