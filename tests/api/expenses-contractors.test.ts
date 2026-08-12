import { GET, POST } from "@/app/api/expenses/route";
import { GET as GET_CONTRACTORS, POST as POST_CONTRACTORS } from "@/app/api/contractors/route";
import { db } from "@/lib/db";
import { seedUsers, TEST_ADMIN, buildRequest } from "../helpers";

let tokens: Awaited<ReturnType<typeof seedUsers>>;

beforeAll(async () => {
  tokens = await seedUsers();
});

const E = (b: Record<string, unknown>) =>
  buildRequest("/api/expenses", { token: tokens.adminToken, method: "POST", body: b });

describe("/api/expenses — auth & permissions", () => {
  it("GET without token → 401", async () => {
    const res = await GET(buildRequest("/api/expenses"));
    expect(res.status).toBe(401);
  });

  it("GET as USER → 200 with empty data", async () => {
    const res = await GET(buildRequest("/api/expenses", { token: tokens.userToken }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.data).toEqual([]);
    expect(body.data.total).toBe(0);
  });

  it("GET as MANAGER → 200", async () => {
    const res = await GET(buildRequest("/api/expenses", { token: tokens.managerToken }));
    expect(res.status).toBe(200);
  });
});

describe("/api/expenses — validation", () => {
  it("POST missing required fields → 400", async () => {
    const res = await POST(E({ title: "no-amount" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    // The expense schema demands amount/paymentMethod/paidTo/paidBy/expenseDate; all flagged.
    expect(body.error).toEqual(expect.stringContaining("expected number"));
    expect(body.error.length).toBeGreaterThan(0);
  });

  it("POST with non-positive amount → 400 and the field-specific message", async () => {
    const res = await POST(
      E({
        title: "zero",
        category: "FUEL",
        amount: 0,
        paymentMethod: "CASH",
        paidTo: "a",
        paidBy: "b",
        expenseDate: new Date().toISOString(),
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/Amount must be positive/);
  });

  it("POST invalid category → 400", async () => {
    const res = await POST(
      E({
        title: "x",
        category: "BOGUS",
        amount: 10,
        paymentMethod: "CASH",
        paidTo: "a",
        paidBy: "b",
        expenseDate: new Date().toISOString(),
      })
    );
    expect(res.status).toBe(400);
  });
});

describe("/api/expenses — create with a paidById employee (wallet deduction)", () => {
  it("admin POST creates an APPROVED expense and deducts from the employee wallet", async () => {
    const employee = await db.employee.create({
      data: {
        fullName: "Exp Wallet Emp",
        fatherName: "Emp",
        phoneNumber: "0705555555",
        jobTitle: "Op",
        department: "OPERATIONS",
        hireDate: new Date(),
        createdBy: TEST_ADMIN.id,
      },
    });

    const res = await POST(
      E({
        title: "Truck fuel",
        description: "Diesel",
        category: "FUEL",
        amount: 250,
        paymentMethod: "CASH",
        paidTo: "Driver",
        paidBy: "Company",
        expenseDate: new Date().toISOString(),
        paidById: employee.id,
      })
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.approvalStatus).toBe("APPROVED");

    // Admin-created → balance should be 0 + 0 advance - 250 = -250.
    const account = await db.employeeCashAccount.findUnique({ where: { employeeId: employee.id } });
    expect(account).not.toBeNull();
    expect(account!.currentBalance).toBe(-250);

    // Audit log recorded.
    const audit = await db.auditLog.findFirst({ where: { entityId: body.data.id, entity: "Expense" } });
    expect(audit).not.toBeNull();
  });
});

describe("/api/contractors — list", () => {
  it("GET without token → 401", async () => {
    expect((await GET_CONTRACTORS(buildRequest("/api/contractors"))).status).toBe(401);
  });

  it("USER can list contractors (has contractors:view)", async () => {
    const res = await GET_CONTRACTORS(buildRequest("/api/contractors", { token: tokens.userToken }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("creates + fetches a contractor as admin", async () => {
    const res = await POST_CONTRACTORS(
      buildRequest("/api/contractors", {
        token: tokens.adminToken,
        method: "POST",
        body: {
          contractorName: "Alpha Construction",
          fatherName: "Abdullah",
          phoneNumber: "0701000000",
          contractorType: "MACHINERY_CONTRACTOR",
        },
      })
    );
    expect(res.status).toBe(201);
    const created = await res.json();
    expect(created.data.contractorName).toBe("Alpha Construction");

    const listRes = await GET_CONTRACTORS(buildRequest("/api/contractors", { token: tokens.adminToken }));
    const list = await listRes.json();
    expect(list.data.data.length).toBeGreaterThanOrEqual(1);
  });
});
