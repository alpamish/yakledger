import { GET, POST } from "@/app/api/expenses/route";
import { PUT as PUT_EXPENSE } from "@/app/api/expenses/[id]/route";
import { GET as GET_CONTRACTORS, POST as POST_CONTRACTORS } from "@/app/api/contractors/route";
import { DELETE as DELETE_CONTRACTOR } from "@/app/api/contractors/[id]/route";
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

describe("/api/contractors — contractor number", () => {
  const create = (name: string) =>
    POST_CONTRACTORS(
      buildRequest("/api/contractors", {
        token: tokens.adminToken,
        method: "POST",
        body: {
          contractorName: name,
          fatherName: "Father",
          phoneNumber: "070" + Math.floor(Math.random() * 1e7).toString().padStart(7, "0"),
          contractorType: "LABOR_CONTRACTOR",
        },
      })
    );

  it("POST assigns a unique CTR-xxxxx number", async () => {
    const res = await create("Number Test Co");
    expect(res.status).toBe(201);
    const created = await res.json();
    expect(created.data.contractorNumber).toMatch(/^CTR-\d{5}$/);
  });

  it("successive creates get sequential, unique numbers", async () => {
    const [a, b] = await Promise.all([create("Seq One"), create("Seq Two")]);
    const [aBody, bBody] = [await a.json(), await b.json()];
    expect(aBody.data.contractorNumber).toMatch(/^CTR-\d{5}$/);
    expect(bBody.data.contractorNumber).toMatch(/^CTR-\d{5}$/);
    expect(aBody.data.contractorNumber).not.toBe(bBody.data.contractorNumber);

    const ids = await db.contractor.findMany({
      where: { contractorNumber: { not: null } },
      select: { contractorNumber: true },
    });
    const numbers = ids.map((c) => c.contractorNumber).filter(Boolean);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it("a create after a delete does not reuse the deleted contractor's number", async () => {
    const first = await (await create("Delete Me")).json();
    const firstNumber = first.data.contractorNumber;

    const del = await DELETE_CONTRACTOR(
      buildRequest(`/api/contractors/${first.data.id}`, { token: tokens.adminToken, method: "DELETE" }),
      { params: Promise.resolve({ id: first.data.id }) }
    );
    expect(del.status).toBe(200);

    const second = await (await create("After Delete")).json();
    expect(second.data.contractorNumber).not.toBe(firstNumber);
    expect(second.data.contractorNumber).toMatch(/^CTR-\d{5}$/);
  });
});

describe("/api/contractors — inline machinery default rates", () => {
  it("creates a default MachineryRate tier for each inline machinery", async () => {
    const res = await POST_CONTRACTORS(
      buildRequest("/api/contractors", {
        token: tokens.adminToken,
        method: "POST",
        body: {
          contractorName: "Inline Machinery Co",
          fatherName: "Father",
          phoneNumber: "0702000000",
          contractorType: "MACHINERY_CONTRACTOR",
          machinery: [
            {
              machineryName: "Crane 25T",
              machineryType: "Crane",
              monthlyRate: 60000,
            },
          ],
        },
      })
    );
    expect(res.status).toBe(201);

    const machinery = await db.machinery.findMany({
      where: { assignedContractor: { contractorName: "Inline Machinery Co" } },
      include: { machineryRates: true },
    });
    expect(machinery).toHaveLength(1);
    expect(machinery[0].machineryRates).toHaveLength(1);
    expect(machinery[0].machineryRates[0].isDefault).toBe(true);
    expect(machinery[0].machineryRates[0].rateName).toBe("Default");
    expect(machinery[0].machineryRates[0].monthlyRate).toBe(60000);
  });

  it("rejects inline machinery with no rate", async () => {
    const res = await POST_CONTRACTORS(
      buildRequest("/api/contractors", {
        token: tokens.adminToken,
        method: "POST",
        body: {
          contractorName: "No Rate Machinery Co",
          fatherName: "Father",
          phoneNumber: "0703000000",
          contractorType: "MACHINERY_CONTRACTOR",
          machinery: [
            {
              machineryName: "Flatbed",
              machineryType: "Truck",
            },
          ],
        },
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/At least one rate/i);
  });
});

describe("/api/expenses — changing paidTo from contractor/employee to External clears the link", () => {
  const buildUpdate = (token: string, id: string, body: unknown) =>
    buildRequest(`/api/expenses/${id}`, { token, method: "PUT", body });

  it("clears paidToContractorId when the recipient is changed to External", async () => {
    const contractor = await db.contractor.create({
      data: {
        contractorName: "Link Clear Co",
        fatherName: "Father",
        phoneNumber: "0704100000",
        contractorType: "LABOR_CONTRACTOR",
        createdBy: TEST_ADMIN.id,
      },
    });

    const created = await POST(
      E({
        title: "Linked expense",
        category: "MISCELLANEOUS",
        amount: 100,
        paymentMethod: "CASH",
        paidTo: contractor.contractorName,
        paidBy: "Company",
        expenseDate: new Date().toISOString(),
        paidToContractorId: contractor.id,
        paidById: tokens.employee.id,
      })
    );
    expect(created.status).toBe(201);
    const expense = (await created.json()).data as { id: string; paidToContractorId: string };
    expect(expense.paidToContractorId).toBe(contractor.id);

    // Switch to External: explicit null clears the FK on the backend.
    const res = await PUT_EXPENSE(
      buildUpdate(tokens.adminToken, expense.id, {
        paidTo: "Some External Party",
        paidToId: null,
        paidToContractorId: null,
      }),
      { params: Promise.resolve({ id: expense.id }) }
    );
    expect(res.status).toBe(200);

    const updated = await db.expense.findUnique({ where: { id: expense.id } });
    expect(updated!.paidToContractorId).toBeNull();
    expect(updated!.paidToId).toBeNull();
    expect(updated!.paidTo).toBe("Some External Party");
  });

  it("clears paidToId when the recipient is changed from Employee to External", async () => {
    const employee = await db.employee.create({
      data: {
        fullName: "Link Clear Emp",
        fatherName: "Father",
        phoneNumber: "0704200000",
        jobTitle: "Op",
        department: "OPERATIONS",
        hireDate: new Date(),
        createdBy: TEST_ADMIN.id,
      },
    });

    const created = await POST(
      E({
        title: "Employee linked expense",
        category: "MISCELLANEOUS",
        amount: 50,
        paymentMethod: "CASH",
        paidTo: employee.fullName,
        paidBy: "Company",
        expenseDate: new Date().toISOString(),
        paidToId: employee.id,
        paidById: tokens.employee.id,
      })
    );
    expect(created.status).toBe(201);
    const expense = (await created.json()).data as { id: string; paidToId: string };
    expect(expense.paidToId).toBe(employee.id);

    const res = await PUT_EXPENSE(
      buildUpdate(tokens.adminToken, expense.id, {
        paidTo: "External Person",
        paidToId: null,
        paidToContractorId: null,
      }),
      { params: Promise.resolve({ id: expense.id }) }
    );
    expect(res.status).toBe(200);

    const updated = await db.expense.findUnique({ where: { id: expense.id } });
    expect(updated!.paidToId).toBeNull();
    expect(updated!.paidToContractorId).toBeNull();
    expect(updated!.paidTo).toBe("External Person");
  });
});
