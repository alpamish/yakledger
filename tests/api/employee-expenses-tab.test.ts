import { GET, POST } from "@/app/api/expenses/route";
import { db } from "@/lib/db";
import { seedUsers, TEST_ADMIN, buildRequest } from "../helpers";

let tokens: Awaited<ReturnType<typeof seedUsers>>;
let employeeId: string;
let contractorId: string;

beforeAll(async () => {
  tokens = await seedUsers();
  const employee = await db.employee.create({
    data: {
      fullName: "Tab Expense Emp",
      fatherName: "Emp",
      phoneNumber: "0707777777",
      jobTitle: "Operator",
      department: "OPERATIONS",
      hireDate: new Date(),
      createdBy: TEST_ADMIN.id,
    },
  });
  employeeId = employee.id;

  const contractor = await db.contractor.create({
    data: {
      contractorName: "Tab Contractor",
      fatherName: "C",
      phoneNumber: "0706666666",
      contractorType: "MACHINERY_CONTRACTOR",
      creator: { connect: { id: TEST_ADMIN.id } },
    },
  });
  contractorId = contractor.id;
});

const createExpense = (body: Record<string, unknown>) =>
  POST(
    buildRequest("/api/expenses", { token: tokens.adminToken, method: "POST", body })
  );

describe("/api/expenses — paidToId filtering (employee Expenses tab)", () => {
  it("filters expenses paid to a specific employee with pagination", async () => {
    for (let i = 1; i <= 3; i++) {
      const res = await createExpense({
        title: `Emp expense ${i}`,
        category: "SALARY",
        amount: 100 * i,
        paymentMethod: "CASH",
        paidTo: "Emp",
        paidBy: "Company",
        expenseDate: new Date(2026, 0, i).toISOString(),
        paidToId: employeeId,
        // The schema requires a wallet or a paying employee for traceability.
        paidById: employeeId,
      });
      expect(res.status).toBe(201);
    }

    // Other expenses: one paid to a contractor, one with no payee id.
    const contractorRes = await createExpense({
      title: "Contractor expense",
      category: "MACHINERY",
      amount: 500,
      paymentMethod: "BANK_TRANSFER",
      paidTo: "Contractor",
      paidBy: "Company",
      expenseDate: new Date(2026, 0, 5).toISOString(),
      paidToContractorId: contractorId,
      paidById: employeeId,
    });
    expect(contractorRes.status).toBe(201);

    const otherRes = await createExpense({
      title: "External expense",
      category: "OFFICE_EXPENSE",
      amount: 50,
      paymentMethod: "CASH",
      paidTo: "External vendor",
      paidBy: "Company",
      expenseDate: new Date(2026, 0, 6).toISOString(),
      paidById: employeeId,
    });
    expect(otherRes.status).toBe(201);

    const res = await GET(
      buildRequest(
        `/api/expenses?paidToId=${employeeId}&page=1&pageSize=10&sortBy=expenseDate&sortOrder=desc`,
        { token: tokens.adminToken }
      )
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.total).toBe(3);
    expect(body.data.totalPages).toBe(1);
    expect(body.data.data.length).toBe(3);
    for (const exp of body.data.data) {
      expect(exp.paidToId).toBe(employeeId);
      expect(exp.title).toMatch(/^Emp expense/);
    }
    // Sorted by expenseDate desc → "Emp expense 3" first.
    expect(body.data.data[0].title).toBe("Emp expense 3");
  });

  it("paginates paidToId results across pages", async () => {
    for (let i = 4; i <= 13; i++) {
      await createExpense({
        title: `Paginated emp expense ${i}`,
        category: "REWARD",
        amount: 50,
        paymentMethod: "CASH",
        paidTo: "Emp",
        paidBy: "Company",
        expenseDate: new Date(2026, 1, i).toISOString(),
        paidToId: employeeId,
        paidById: employeeId,
      });
    }

    const res = await GET(
      buildRequest(
        `/api/expenses?paidToId=${employeeId}&page=1&pageSize=10&sortBy=expenseDate&sortOrder=desc`,
        { token: tokens.adminToken }
      )
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.total).toBe(13);
    expect(body.data.totalPages).toBe(2);
    expect(body.data.data.length).toBe(10);

    const page2 = await GET(
      buildRequest(
        `/api/expenses?paidToId=${employeeId}&page=2&pageSize=10&sortBy=expenseDate&sortOrder=desc`,
        { token: tokens.adminToken }
      )
    );
    const page2Body = await page2.json();
    expect(page2Body.data.data.length).toBe(3);
  });

  it("combines paidToId with a category filter", async () => {
    const res = await GET(
      buildRequest(
        `/api/expenses?paidToId=${employeeId}&category=REWARD&page=1&pageSize=10`,
        { token: tokens.adminToken }
      )
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.total).toBe(10);
    for (const exp of body.data.data) {
      expect(exp.paidToId).toBe(employeeId);
      expect(exp.category).toBe("REWARD");
    }
  });
});