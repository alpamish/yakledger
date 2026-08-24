import { GET as GET_LIST, POST as POST_MACHINERY } from "@/app/api/machinery/route";
import { GET as GET_ONE, PUT as PUT_MACHINERY } from "@/app/api/machinery/[id]/route";
import { db } from "@/lib/db";
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

async function createMachinery(body: Record<string, unknown>) {
  return POST_MACHINERY(
    buildRequest("/api/machinery", {
      token: tokens.adminToken,
      method: "POST",
      body,
    })
  );
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
    const created = await createMachinery({
      machineryName: "Komatsu PC200",
      machineryType: "Excavator",
      assignedContractorId: contractorId,
      fuelType: "DIESEL",
      monthlyRate: 30000,
    });
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

describe("/api/machinery — default rate on create", () => {
  it("create without any rate → 400", async () => {
    const contractorId = await createContractor("No Rate Co");
    const res = await createMachinery({
      machineryName: "Rate-less Excavator",
      machineryType: "Excavator",
      assignedContractorId: contractorId,
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/At least one rate/i);
  });

  it("create with a rate auto-creates a default MachineryRate tier", async () => {
    const contractorId = await createContractor("Default Rate Co");
    const res = await createMachinery({
      machineryName: "D6 Dozer",
      machineryType: "Dozer",
      assignedContractorId: contractorId,
      monthlyRate: 45000,
      contractDaysPerMonth: 28,
      workHoursPerDay: 9,
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    const id = body.data.id as string;

    const rates = await db.machineryRate.findMany({ where: { machineryId: id } });
    expect(rates).toHaveLength(1);
    const rate = rates[0];
    expect(rate.isDefault).toBe(true);
    expect(rate.rateName).toBe("Default");
    expect(rate.monthlyRate).toBe(45000);
    expect(rate.contractDaysPerMonth).toBe(28);
    expect(rate.workHoursPerDay).toBe(9);
  });
});

describe("/api/machinery — default rate sync on edit", () => {
  it("PUT with a changed rate updates the default rate tier", async () => {
    const contractorId = await createContractor("Sync Rate Co");
    const created = await (await createMachinery({
      machineryName: "Backhoe 420",
      machineryType: "Backhoe",
      assignedContractorId: contractorId,
      monthlyRate: 30000,
    })).json();
    const id = created.data.id as string;

    const [r, p] = oneRequest(id, tokens.adminToken);
    const putRes = await PUT_MACHINERY(
      buildRequest(`/api/machinery/${id}`, { token: tokens.adminToken, method: "PUT", body: { monthlyRate: 36000 } }),
      p
    );
    expect(putRes.status).toBe(200);

    const rate = await db.machineryRate.findFirst({
      where: { machineryId: id, isDefault: true },
    });
    expect(rate).not.toBeNull();
    expect(rate!.monthlyRate).toBe(36000);
  });

  it("PUT without rate fields leaves the default rate untouched", async () => {
    const contractorId = await createContractor("No Sync Co");
    const created = await (await createMachinery({
      machineryName: "Loader 950",
      machineryType: "Loader",
      assignedContractorId: contractorId,
      monthlyRate: 20000,
    })).json();
    const id = created.data.id as string;

    const [r, p] = oneRequest(id, tokens.adminToken);
    const putRes = await PUT_MACHINERY(
      buildRequest(`/api/machinery/${id}`, { token: tokens.adminToken, method: "PUT", body: { machineryName: "Loader 950G" } }),
      p
    );
    expect(putRes.status).toBe(200);

    const rate = await db.machineryRate.findFirst({
      where: { machineryId: id, isDefault: true },
    });
    expect(rate).not.toBeNull();
    expect(rate!.monthlyRate).toBe(20000);
  });
});
