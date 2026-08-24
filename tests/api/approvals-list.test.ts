import { GET } from "@/app/api/approvals/route";
import { db } from "@/lib/db";
import { seedUsers, TEST_ADMIN } from "../helpers";

let tokens: Awaited<ReturnType<typeof seedUsers>>;
let contractorId: string;

beforeAll(async () => {
  tokens = await seedUsers();
  const contractor = await db.contractor.create({
    data: {
      contractorName: "Pagination Test Contractor",
      fatherName: "F",
      contractorType: "FIXED",
      phoneNumber: "0700000002",
      status: "ACTIVE",
      createdBy: TEST_ADMIN.id,
    },
  });
  contractorId = contractor.id;
});

async function seedPendingExpense(id: string, createdAt: Date) {
  await db.expense.create({
data: {
        id,
        title: `Pagination Expense ${id}`,
        category: "FUEL",
        amount: 10,
        paymentMethod: "CASH",
        paidTo: "Test Employee",
        paidBy: "Test Employee",
        expenseDate: new Date(),
        createdAt,
        createdBy: TEST_ADMIN.id,
        approvalStatus: "PENDING",
      },
  });
}

function buildApprovalRequest(token: string, path: string) {
  const headers = new Headers();
  headers.set("Content-Type", "application/json");
  headers.set("Authorization", `Bearer ${token}`);
  const init: RequestInit = { method: "GET", headers };
  return new Request(`http://localhost:3000${path}`, init) as never;
}

describe("/api/approvals — GET with pagination", () => {
  it("returns page 1 of pageSize with total count", async () => {
    await seedPendingExpense("pg_exp_1", new Date(Date.now() - 3000));
    await seedPendingExpense("pg_exp_2", new Date(Date.now() - 2000));
    await seedPendingExpense("pg_exp_3", new Date(Date.now() - 1000));

    const res = await GET(buildApprovalRequest(tokens.adminToken, "/api/approvals?status=PENDING&entity=expense&page=1&pageSize=2"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.items).toHaveLength(2);
    expect(body.data.total).toBe(3);
    expect(body.data.totalPages).toBe(2);
    expect(body.data.page).toBe(1);
    expect(body.data.pageSize).toBe(2);
    expect(body.data.counts.expense).toBe(3);
    expect(body.data.items[0].id).toBe("pg_exp_1");
  });

  it("returns the second page when page=2", async () => {
    const res = await GET(buildApprovalRequest(tokens.adminToken, "/api/approvals?status=PENDING&entity=expense&page=2&pageSize=2"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0].id).toBe("pg_exp_3");
    expect(body.data.page).toBe(2);
  });

  it("clamps page beyond totalPages to the last page", async () => {
    const res = await GET(buildApprovalRequest(tokens.adminToken, "/api/approvals?status=PENDING&entity=expense&page=99&pageSize=2"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.page).toBe(2);
    expect(body.data.items[0].id).toBe("pg_exp_3");
  });

  it("rejects unauthenticated without any approve permission", async () => {
    const res = await GET(buildApprovalRequest("", "/api/approvals?status=PENDING"));
    expect(res.status).toBe(401);
  });
});