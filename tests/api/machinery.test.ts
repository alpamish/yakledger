import { GET as GET_LIST, POST as POST_MACHINERY } from "@/app/api/machinery/route";
import { GET as GET_ONE } from "@/app/api/machinery/[id]/route";
import { seedUsers, TEST_ADMIN, buildRequest } from "../helpers";

let tokens: Awaited<ReturnType<typeof seedUsers>>;

beforeAll(async () => {
  tokens = await seedUsers();
});

// Next.js dynamic route handlers receive a second `{ params }` argument.
function oneRequest(id: string, token?: string) {
  return [buildRequest(`/api/machinery/${id}`, { token }), { params: Promise.resolve({ id }) }] as const;
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
  return body.data.id as string;
}

describe("/api/machinery — auth", () => {
  it("GET without token → 401", async () => {
    expect((await GET_LIST(buildRequest("/api/machinery"))).status).toBe(401);
  });

  it("USER can list machinery", async () => {
    const res = await GET_LIST(buildRequest("/api/machinery", { token: tokens.userToken }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.data).toEqual([]);
  });
});

describe("/api/machinery — create + fetch by id", () => {
  it("admin creates machinery and the detail endpoint returns it (200)", async () => {
    const contractorId = await createContractor("Machinery Co");
    const created = await POST_MACHINERY(
      buildRequest("/api/machinery", {
        token: tokens.adminToken,
        method: "POST",
        body: {
          machineryName: "Komatsu PC200",
          machineryType: "Excavator",
          assignedContractorId: contractorId,
          fuelType: "DIESEL",
        },
      })
    );
    expect(created.status).toBe(201);
    const createdBody = await created.json();
    const id = createdBody.data.id as string;

    const listRes = await GET_LIST(buildRequest("/api/machinery", { token: tokens.adminToken }));
    const list = await listRes.json();
    expect(list.data.data.length).toBeGreaterThanOrEqual(1);

    const [r, p] = oneRequest(id, tokens.adminToken);
    const oneRes = await GET_ONE(r, p);
    expect(oneRes.status).toBe(200);
    const one = await oneRes.json();
    expect(one.data.machineryName).toBe("Komatsu PC200");
    expect(one.data.assignedContractor.contractorName).toBe("Machinery Co");
    expect(one.data._count).toEqual({ timesheets: 0, fuelUsages: 0 });
  });

  it("GET /api/machinery/:unknown → 404", async () => {
    const [r, p] = oneRequest("nonexistent-id", tokens.adminToken);
    const res = await GET_ONE(r, p);
    expect(res.status).toBe(404);
  });
});
