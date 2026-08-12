import { POST as BULK_POST } from "@/app/api/approvals/bulk/route";
import { db } from "@/lib/db";
import { seedUsers, TEST_ADMIN } from "../helpers";

let tokens: Awaited<ReturnType<typeof seedUsers>>;
let contractorId: string;

beforeAll(async () => {
  tokens = await seedUsers();
  const contractor = await db.contractor.create({
    data: {
      contractorName: "Bulk Test Contractor",
      fatherName: "F",
      contractorType: "FIXED",
      phoneNumber: "0700000001",
      status: "ACTIVE",
      createdBy: TEST_ADMIN.id,
    },
  });
  contractorId = contractor.id;
});

async function seedPendingFuelUsage(id: string) {
  await db.fuelUsage.create({
    data: {
      id,
      contractorId,
      machineryId: null,
      fuelType: "DIESEL",
      quantity: 10,
      unitPrice: 2,
      totalCost: 20,
      date: new Date(),
      createdBy: TEST_ADMIN.id,
      approvalStatus: "PENDING",
    },
  });
}

describe("/api/approvals/bulk — bulk approve", () => {
  it("rejects an empty items array", async () => {
    const res = await BULK_POST(
      buildApprovalRequest(tokens.adminToken, { items: [] })
    );
    expect(res.status).toBe(400);
  });

  it("approves multiple pending records and returns counts", async () => {
    await seedPendingFuelUsage("fu_bulk_1");
    await seedPendingFuelUsage("fu_bulk_2");

    const res = await BULK_POST(
      buildApprovalRequest(tokens.adminToken, {
        items: [
          { entity: "fuelUsage", id: "fu_bulk_1" },
          { entity: "fuelUsage", id: "fu_bulk_2" },
        ],
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.approved).toBe(2);
    expect(body.data.skipped).toBe(0);

    const rec1 = await db.fuelUsage.findUniqueOrThrow({ where: { id: "fu_bulk_1" } });
    const rec2 = await db.fuelUsage.findUniqueOrThrow({ where: { id: "fu_bulk_2" } });
    expect(rec1.approvalStatus).toBe("APPROVED");
    expect(rec2.approvalStatus).toBe("APPROVED");
    expect(rec1.approvedById).toBe(TEST_ADMIN.id);
    expect(rec1.approvedAt).not.toBeNull();
  });

  it("skips already-approved records without erroring", async () => {
    await seedPendingFuelUsage("fu_bulk_3");
    await db.fuelUsage.update({
      where: { id: "fu_bulk_3" },
      data: { approvalStatus: "APPROVED" },
    });

    const res = await BULK_POST(
      buildApprovalRequest(tokens.adminToken, {
        items: [{ entity: "fuelUsage", id: "fu_bulk_3" }],
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.approved).toBe(0);
    expect(body.data.skipped).toBe(1);
  });

  it("creates an audit log for each approved record", async () => {
    await seedPendingFuelUsage("fu_bulk_4");
    await BULK_POST(
      buildApprovalRequest(tokens.adminToken, {
        items: [{ entity: "fuelUsage", id: "fu_bulk_4" }],
      })
    );

    const logs = await db.auditLog.findMany({ where: { entityId: "fu_bulk_4", action: "APPROVE" } });
    expect(logs.length).toBe(1);
    expect(logs[0].userId).toBe(TEST_ADMIN.id);
  });
});

function buildApprovalRequest(token: string, body: unknown) {
  const headers = new Headers();
  headers.set("Content-Type", "application/json");
  headers.set("Authorization", `Bearer ${token}`);
  const init: RequestInit = { method: "POST", headers, body: JSON.stringify(body) };
  return new Request("http://localhost:3000/api/approvals/bulk", init) as never;
}
