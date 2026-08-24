import { GET as GET_STOCK } from "@/app/api/fuel-transactions/stock/route";
import { GET as GET_TRANSACTIONS, POST as POST_TRANSACTION } from "@/app/api/fuel-transactions/route";
import { PUT as PUT_TRANSACTION } from "@/app/api/fuel-transactions/[id]/route";
import { POST as POST_USAGE } from "@/app/api/fuel-usage/route";
import { GET as GET_USAGE } from "@/app/api/fuel-usage/[id]/route";
import { db } from "@/lib/db";
import { seedUsers, TEST_ADMIN, buildRequest } from "../helpers";

let tokens: Awaited<ReturnType<typeof seedUsers>>;

beforeAll(async () => {
  tokens = await seedUsers();
});

async function createContainer(name: string, fuelType: string, capacity?: number) {
  return db.asset.create({
    data: {
      name,
      category: "FUEL",
      purchaseDate: new Date(),
      purchasePrice: 0,
      currentValue: 0,
      fuelType,
      fuelCapacity: capacity ?? null,
      createdBy: TEST_ADMIN.id,
    },
  });
}

async function createContractor(name: string) {
  return db.contractor.create({
    data: {
      contractorName: name,
      fatherName: "Father",
      phoneNumber: `07${Math.floor(Math.random() * 1e7).toString().padStart(7, "0")}`,
      contractorType: "MACHINERY_CONTRACTOR",
      createdBy: TEST_ADMIN.id,
    },
  });
}

async function createMachinery(contractorId: string, name: string) {
  return db.machinery.create({
    data: {
      machineryName: name,
      machineryType: "Excavator",
      assignedContractorId: contractorId,
      fuelType: "DIESEL",
      hourlyRate: 500,
      dailyRate: 4000,
      monthlyRate: 90000,
      createdBy: TEST_ADMIN.id,
    },
  });
}

const txn = (body: Record<string, unknown>) =>
  POST_TRANSACTION(
    buildRequest("/api/fuel-transactions", { token: tokens.adminToken, method: "POST", body })
  );

describe("/api/fuel-transactions/stock — company-level balance ignores transfers", () => {
  it("purchase + internal transfer keeps company stock, splits container balances", async () => {
    const a = await createContainer("Tank A", "DIESEL", 2000);
    const b = await createContainer("Tank B", "DIESEL", 2000);

    const purchase = await txn({
      type: "PURCHASE",
      fuelType: "DIESEL",
      quantity: 1000,
      unitPrice: 60,
      totalCost: 60000,
      containerId: a.id,
    });
    expect(purchase.status).toBe(201);

    const transfer = await txn({
      type: "TRANSFER",
      fuelType: "DIESEL",
      quantity: 400,
      containerId: a.id,
      destinationContainerId: b.id,
    });
    expect(transfer.status).toBe(201);

    const stockRes = await GET_STOCK(buildRequest("/api/fuel-transactions/stock", { token: tokens.adminToken }));
    expect(stockRes.status).toBe(200);
    const body = await stockRes.json();

    const diesel = body.data.stock.find((s: { fuelType: string }) => s.fuelType === "DIESEL");
    expect(diesel.totalPurchased).toBe(1000);
    expect(diesel.totalIssued).toBe(0);
    // Transfers are internal — company stock must stay at purchased - issued.
    expect(diesel.balance).toBe(1000);

    const stockA = await GET_STOCK(
      buildRequest(`/api/fuel-transactions/stock?containerId=${a.id}`, { token: tokens.adminToken })
    );
    const bodyA = await stockA.json();
    expect(bodyA.data.balance).toBe(600);
    expect(bodyA.data.totalTransferredOut).toBe(400);

    const stockB = await GET_STOCK(
      buildRequest(`/api/fuel-transactions/stock?containerId=${b.id}`, { token: tokens.adminToken })
    );
    const bodyB = await stockB.json();
    expect(bodyB.data.balance).toBe(400);
    expect(bodyB.data.totalTransferredIn).toBe(400);
  });
});

describe("/api/fuel-transactions — no negative stock", () => {
  it("ISSUE above available balance → 400", async () => {
    const a = await createContainer("Small Tank", "DIESEL", 100);
    const purchase = await txn({
      type: "PURCHASE",
      fuelType: "DIESEL",
      quantity: 100,
      unitPrice: 60,
      totalCost: 6000,
      containerId: a.id,
    });
    expect(purchase.status).toBe(201);

    const res = await txn({
      type: "ISSUE",
      fuelType: "DIESEL",
      quantity: 150,
      unitPrice: 60,
      totalCost: 9000,
      containerId: a.id,
      issuedToName: "Driver",
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Insufficient fuel/i);
  });

  it("TRANSFER above available balance → 400", async () => {
    const a = await createContainer("Source Tank", "DIESEL", 100);
    const b = await createContainer("Dest Tank", "DIESEL", 100);
    await txn({
      type: "PURCHASE",
      fuelType: "DIESEL",
      quantity: 50,
      unitPrice: 60,
      totalCost: 3000,
      containerId: a.id,
    });

    const res = await txn({
      type: "TRANSFER",
      fuelType: "DIESEL",
      quantity: 100,
      containerId: a.id,
      destinationContainerId: b.id,
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Insufficient fuel/i);
  });

  it("TRANSFER to the same container → 400", async () => {
    const a = await createContainer("Self Tank", "DIESEL", 100);
    const res = await txn({
      type: "TRANSFER",
      fuelType: "DIESEL",
      quantity: 10,
      containerId: a.id,
      destinationContainerId: a.id,
    });
    expect(res.status).toBe(400);
  });

  it("valid ISSUE deducts the container balance", async () => {
    const a = await createContainer("Deduct Tank", "DIESEL", 100);
    await txn({
      type: "PURCHASE",
      fuelType: "DIESEL",
      quantity: 100,
      unitPrice: 60,
      totalCost: 6000,
      containerId: a.id,
    });
    const issue = await txn({
      type: "ISSUE",
      fuelType: "DIESEL",
      quantity: 40,
      unitPrice: 60,
      totalCost: 2400,
      containerId: a.id,
      issuedToName: "Driver",
    });
    expect(issue.status).toBe(201);

    const stockA = await GET_STOCK(
      buildRequest(`/api/fuel-transactions/stock?containerId=${a.id}`, { token: tokens.adminToken })
    );
    const bodyA = await stockA.json();
    expect(bodyA.data.balance).toBe(60);
    expect(bodyA.data.totalIssued).toBe(40);
  });
});

describe("/api/fuel-transactions — PUT recomputes totalCost", () => {
  it("changing quantity updates totalCost automatically", async () => {
    const a = await createContainer("Edit Tank", "DIESEL", 1000);
    const created = await (await txn({
      type: "PURCHASE",
      fuelType: "DIESEL",
      quantity: 100,
      unitPrice: 50,
      totalCost: 5000,
      containerId: a.id,
    })).json();
    const id = created.data.id as string;

    const putRes = await PUT_TRANSACTION(
      buildRequest(`/api/fuel-transactions/${id}`, {
        token: tokens.adminToken,
        method: "PUT",
        body: { quantity: 120 },
      }),
      { params: Promise.resolve({ id }) }
    );
    expect(putRes.status).toBe(200);
    const body = await putRes.json();
    expect(body.data.quantity).toBe(120);
    expect(body.data.totalCost).toBe(6000);
  });
});

describe("/api/fuel-usage — container integration & getById", () => {
  it("POST usage from a mismatched container fuel type → 400", async () => {
    const a = await createContainer("Gas Tank", "GASOLINE", 500);
    const contractor = await createContractor("Fuel Co");
    const machinery = await createMachinery(contractor.id, "Fuel Dozer");

    const res = await POST_USAGE(
      buildRequest("/api/fuel-usage", {
        token: tokens.adminToken,
        method: "POST",
        body: {
          contractorId: contractor.id,
          machineryId: machinery.id,
          fuelType: "DIESEL",
          quantity: 10,
          unitPrice: 60,
          date: new Date().toISOString(),
          containerId: a.id,
        },
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/holds GASOLINE/i);
  });

  it("POST usage over-draws the container → 400", async () => {
    const a = await createContainer("Usage Tank", "DIESEL", 100);
    await txn({
      type: "PURCHASE",
      fuelType: "DIESEL",
      quantity: 20,
      unitPrice: 60,
      totalCost: 1200,
      containerId: a.id,
    });
    const contractor = await createContractor("Usage Co");
    const machinery = await createMachinery(contractor.id, "Usage Dozer");

    const res = await POST_USAGE(
      buildRequest("/api/fuel-usage", {
        token: tokens.adminToken,
        method: "POST",
        body: {
          contractorId: contractor.id,
          machineryId: machinery.id,
          fuelType: "DIESEL",
          quantity: 50,
          unitPrice: 60,
          date: new Date().toISOString(),
          containerId: a.id,
        },
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Insufficient fuel/i);
  });

  it("GET /api/fuel-usage/:id returns the created record", async () => {
    const contractor = await createContractor("GetById Co");
    const machinery = await createMachinery(contractor.id, "GetById Dozer");

    const created = await (await POST_USAGE(
      buildRequest("/api/fuel-usage", {
        token: tokens.adminToken,
        method: "POST",
        body: {
          contractorId: contractor.id,
          machineryId: machinery.id,
          fuelType: "DIESEL",
          quantity: 25,
          unitPrice: 60,
          totalCost: 1500,
          date: new Date().toISOString(),
        },
      })
    )).json();

    const getRes = await GET_USAGE(
      buildRequest(`/api/fuel-usage/${created.data.id}`, { token: tokens.adminToken }),
      { params: Promise.resolve({ id: created.data.id }) }
    );
    expect(getRes.status).toBe(200);
    const body = await getRes.json();
    expect(body.data.quantity).toBe(25);
    expect(body.data.contractor.contractorName).toBe("GetById Co");
  });
});
