import { GET as GET_LIST } from "@/app/api/contractors/list/route";
import { GET as GET_CONTRACTORS, POST as POST_CONTRACTOR } from "@/app/api/contractors/route";
import { POST as BULK_ACTION } from "@/app/api/contractors/bulk-action/route";
import { db } from "@/lib/db";
import { seedUsers, buildRequest, TEST_ADMIN } from "../helpers";
import { generateToken } from "@/lib/auth";

let tokens: Awaited<ReturnType<typeof seedUsers>>;

// A USER created by someone else — out of the WATCHER's access scope.
let foreignContractorId: string;
// A contractor created by the WATCHER themselves.
let ownContractorId: string;

beforeAll(async () => {
  tokens = await seedUsers();

  // WATCHER holds contractors:view but not content:contractors, so their
  // access scope is limited to contractors they created (or were granted).
  const watcher = await db.user.create({
    data: {
      id: "u_watcher_ctr",
      email: "watcher@ctr.test",
      name: "Watcher CTR",
      password: "x",
      role: "WATCHER",
    },
  });

  const mkContractor = async (name: string, createdBy: string) => {
    const res = await POST_CONTRACTOR(
      buildRequest("/api/contractors", {
        token: tokens.adminToken,
        method: "POST",
        body: {
          contractorName: name,
          fatherName: "Father",
          phoneNumber: "0700000001",
          contractorType: "MACHINERY_CONTRACTOR",
        },
      })
    );
    const body = await res.json();
    const id = body.data.id as string;
    if (createdBy !== TEST_ADMIN.id) {
      await db.contractor.update({ where: { id }, data: { createdBy } });
    }
    return id;
  };

  foreignContractorId = await mkContractor("Foreign Co", TEST_ADMIN.id);
  ownContractorId = await mkContractor("Watcher Own Co", watcher.id);

  // Store watcher token for scoping assertions.
  watcherToken = generateToken({ userId: watcher.id, email: watcher.email, role: watcher.role });
});

let watcherToken = "";

describe("/api/contractors/list — access scoping", () => {
  it("returns all contractors to an unscoped admin", async () => {
    const res = await GET_LIST(buildRequest("/api/contractors/list", { token: tokens.adminToken }));
    expect(res.status).toBe(200);
    const body = await res.json();
    const ids = body.data.map((c: { id: string }) => c.id);
    expect(ids).toContain(foreignContractorId);
    expect(ids).toContain(ownContractorId);
  });

  it("scopes a restricted WATCHER to their own contractors only", async () => {
    const res = await GET_LIST(buildRequest("/api/contractors/list", { token: watcherToken }));
    expect(res.status).toBe(200);
    const body = await res.json();
    const ids = body.data.map((c: { id: string }) => c.id);
    expect(ids).toContain(ownContractorId);
    expect(ids).not.toContain(foreignContractorId);
  });

  it("rejects unauthenticated requests", async () => {
    const res = await GET_LIST(buildRequest("/api/contractors/list"));
    expect(res.status).toBe(401);
  });
});

describe("/api/contractors — sort field validation", () => {
  it("rejects sort fields that are not Contractor columns (was a 500)", async () => {
    const res = await GET_CONTRACTORS(
      buildRequest("/api/contractors?sortBy=hourlyRate", { token: tokens.adminToken })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("Invalid sort field");
  });

  it("accepts valid sort fields", async () => {
    const res = await GET_CONTRACTORS(
      buildRequest("/api/contractors?sortBy=contractorName&sortOrder=asc", { token: tokens.adminToken })
    );
    expect(res.status).toBe(200);
  });
});

describe("/api/contractors/bulk-action — permissions and scoping", () => {
  it("activate requires contractors:edit, not delete (USER can activate)", async () => {
    const res = await BULK_ACTION(
      buildRequest("/api/contractors/bulk-action", {
        token: tokens.userToken,
        method: "POST",
        body: { ids: [foreignContractorId], action: "activate" },
      })
    );
    expect(res.status).toBe(200);
  });

  it("delete requires contractors:delete (USER cannot delete)", async () => {
    const res = await BULK_ACTION(
      buildRequest("/api/contractors/bulk-action", {
        token: tokens.userToken,
        method: "POST",
        body: { ids: [foreignContractorId], action: "delete" },
      })
    );
    expect(res.status).toBe(403);
  });

  it("suspend requires contractors:suspend (USER cannot, MANAGER can)", async () => {
    // Phase 5: bulk suspend moved from contractors:edit to contractors:suspend
    // — suspension is a compliance-relevant lifecycle state.
    const denied = await BULK_ACTION(
      buildRequest("/api/contractors/bulk-action", {
        token: tokens.userToken,
        method: "POST",
        body: { ids: [foreignContractorId], action: "suspend" },
      })
    );
    expect(denied.status).toBe(403);

    const res = await BULK_ACTION(
      buildRequest("/api/contractors/bulk-action", {
        token: tokens.managerToken,
        method: "POST",
        body: { ids: [foreignContractorId], action: "suspend" },
      })
    );
    expect(res.status).toBe(200);
    const contractor = await db.contractor.findUnique({ where: { id: foreignContractorId } });
    expect(contractor?.status).toBe("SUSPENDED");
    // Lifecycle audit trail stays coherent with the single-contractor route.
    expect(contractor?.suspendedAt).not.toBeNull();
    // Restore for later tests.
    await db.contractor.update({
      where: { id: foreignContractorId },
      data: { status: "ACTIVE", suspendedAt: null },
    });
  });

  it("out-of-scope IDs are filtered out, not mutated", async () => {
    const res = await BULK_ACTION(
      buildRequest("/api/contractors/bulk-action", {
        token: watcherToken,
        method: "POST",
        // WATCHER has neither edit nor delete permission → 403.
        body: { ids: [foreignContractorId], action: "suspend" },
      })
    );
    expect(res.status).toBe(403);
  });

  it("admin bulk suspend only affects in-scope (all for admin) contractors", async () => {
    const res = await BULK_ACTION(
      buildRequest("/api/contractors/bulk-action", {
        token: tokens.adminToken,
        method: "POST",
        body: { ids: [ownContractorId, "nonexistent-id"], action: "suspend" },
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.affected).toBe(1);
    await db.contractor.update({ where: { id: ownContractorId }, data: { status: "ACTIVE" } });
  });

  it("validates the payload", async () => {
    const res = await BULK_ACTION(
      buildRequest("/api/contractors/bulk-action", {
        token: tokens.adminToken,
        method: "POST",
        body: { ids: [], action: "delete" },
      })
    );
    expect(res.status).toBe(400);
  });
});

describe("/api/contractors — contractor type parity (10 canonical values)", () => {
  it.each([
    "ELECTRICAL_CONTRACTOR",
    "PLUMBING_CONTRACTOR",
    "SUBCONTRACTOR",
    "CONSULTANT",
    "STRUCTURAL_CONTRACTOR",
  ])("accepts %s (previously rejected with 400)", async (contractorType) => {
    const res = await POST_CONTRACTOR(
      buildRequest("/api/contractors", {
        token: tokens.adminToken,
        method: "POST",
        body: {
          contractorName: `Type ${contractorType}`,
          fatherName: "Father",
          phoneNumber: `0700${contractorType.length}000`,
          contractorType,
        },
      })
    );
    expect(res.status).toBe(201);
  });

  it("still rejects unknown types", async () => {
    const res = await POST_CONTRACTOR(
      buildRequest("/api/contractors", {
        token: tokens.adminToken,
        method: "POST",
        body: {
          contractorName: "Bad Type",
          fatherName: "Father",
          phoneNumber: "0700999999",
          contractorType: "BOGUS_TYPE",
        },
      })
    );
    expect(res.status).toBe(400);
  });
});
