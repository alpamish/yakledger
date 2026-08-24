import { GET as GET_CONTRACTOR_PROFILE } from "@/app/api/contractors/[id]/route";
import { GET as GET_CONTRACTOR_DASHBOARD } from "@/app/api/contractors/dashboard/route";
import { GET as GET_TIMESHEETS } from "@/app/api/timesheets/route";
import { GET as GET_FUEL } from "@/app/api/fuel-usage/route";
import { GET as GET_EMPLOYEE_DASHBOARD } from "@/app/api/employees/dashboard/route";
import { POST as POST_FINANCIAL_SUMMARY } from "@/app/api/employees/financial-summary/route";
import { GET as GET_EMPLOYEE_FINANCIAL_SUMMARY } from "@/app/api/employees/[id]/financial-summary/route";
import { db } from "@/lib/db";
import { seedUsers, TEST_ADMIN, TEST_USER, TEST_MANAGER, buildRequest } from "../helpers";

let tokens: Awaited<ReturnType<typeof seedUsers>>;
let contractorUser: string;
let contractorAdmin: string;
let employeeUser: string;
let employeeManager: string;

beforeAll(async () => {
  tokens = await seedUsers();
  const { employee } = tokens;
  const employeeAdmin = employee.id;

  contractorAdmin = (
    await db.contractor.create({
      data: {
        contractorName: "Admin Contractor",
        fatherName: "F",
        phoneNumber: "0700000001",
        contractorType: "MACHINERY_CONTRACTOR",
        createdBy: TEST_ADMIN.id,
      },
    })
  ).id;
  contractorUser = (
    await db.contractor.create({
      data: {
        contractorName: "User Contractor",
        fatherName: "F",
        phoneNumber: "0700000002",
        contractorType: "LABOR_CONTRACTOR",
        createdBy: TEST_USER.id,
      },
    })
  ).id;
  employeeUser = (
    await db.employee.create({
      data: {
        fullName: "User Employee",
        fatherName: "F",
        phoneNumber: "0700000003",
        jobTitle: "Operator",
        department: "OPERATIONS",
        hireDate: new Date(),
        createdBy: TEST_USER.id,
      },
    })
  ).id;
  employeeManager = (
    await db.employee.create({
      data: {
        fullName: "Manager Employee",
        fatherName: "F",
        phoneNumber: "0700000004",
        jobTitle: "Operator",
        department: "OPERATIONS",
        hireDate: new Date(),
        createdBy: TEST_MANAGER.id,
      },
    })
  ).id;

  // Approved expense paid to the admin's contractor (created by admin).
  await db.expense.create({
    data: {
      title: "Admin Expense",
      category: "MACHINERY",
      amount: 1000,
      paymentMethod: "CASH",
      paidTo: "Admin Contractor",
      paidBy: "Admin",
      expenseDate: new Date(),
      createdBy: TEST_ADMIN.id,
      paidToContractorId: contractorAdmin,
      approvalStatus: "APPROVED",
    },
  });
  // Approved + pending expenses to the user's contractor (created by user).
  await db.expense.create({
    data: {
      title: "User Approved Expense",
      category: "LABOR",
      amount: 500,
      paymentMethod: "CASH",
      paidTo: "User Contractor",
      paidBy: "User",
      expenseDate: new Date(),
      createdBy: TEST_USER.id,
      paidToContractorId: contractorUser,
      approvalStatus: "APPROVED",
    },
  });
  await db.expense.create({
    data: {
      title: "User Pending Expense",
      category: "LABOR",
      amount: 200,
      paymentMethod: "CASH",
      paidTo: "User Contractor",
      paidBy: "User",
      expenseDate: new Date(),
      createdBy: TEST_USER.id,
      paidToContractorId: contractorUser,
      approvalStatus: "PENDING",
    },
  });

  // Timesheets: admin approved (admin contractor), user approved + pending (user contractor).
  await db.timesheet.create({
    data: {
      contractorId: contractorAdmin,
      date: new Date(),
      totalHours: 10,
      createdBy: TEST_ADMIN.id,
      approvalStatus: "APPROVED",
    },
  });
  await db.timesheet.create({
    data: {
      contractorId: contractorUser,
      date: new Date(),
      totalHours: 8,
      createdBy: TEST_USER.id,
      approvalStatus: "APPROVED",
    },
  });
  await db.timesheet.create({
    data: {
      contractorId: contractorUser,
      date: new Date(),
      totalHours: 5,
      createdBy: TEST_USER.id,
      approvalStatus: "PENDING",
    },
  });

  // Fuel: user approved + pending (user contractor).
  await db.fuelUsage.create({
    data: {
      contractorId: contractorUser,
      fuelType: "DIESEL",
      quantity: 10,
      unitPrice: 60,
      totalCost: 600,
      date: new Date(),
      createdBy: TEST_USER.id,
      approvalStatus: "APPROVED",
    },
  });
  await db.fuelUsage.create({
    data: {
      contractorId: contractorUser,
      fuelType: "DIESEL",
      quantity: 5,
      unitPrice: 60,
      totalCost: 300,
      date: new Date(),
      createdBy: TEST_USER.id,
      approvalStatus: "PENDING",
    },
  });
});

function oneRequest(id: string, token?: string) {
  return [buildRequest(`/api/contractors/${id}`, { token }), { params: Promise.resolve({ id }) }] as const;
}

function empSummaryRequest(id: string, token?: string) {
  return [buildRequest(`/api/employees/${id}/financial-summary`, { token }), { params: Promise.resolve({ id }) }] as const;
}

describe("visibility-scoping — timesheet list shows own records at any status (creator sees own pending)", () => {
  it("GET /api/timesheets as USER returns own approved + pending records", async () => {
    const res = await GET_TIMESHEETS(buildRequest("/api/timesheets", { token: tokens.userToken }));
    expect(res.status).toBe(200);
    const body = await res.json();
    const ids = body.data.data.map((t: { id: string }) => t.id);
    expect(ids).toHaveLength(2);
  });

  it("GET /api/timesheets?approvalStatus=PENDING returns own pending records only", async () => {
    const res = await GET_TIMESHEETS(
      buildRequest("/api/timesheets?approvalStatus=PENDING", { token: tokens.userToken })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    const ids = body.data.data.map((t: { id: string }) => t.id);
    expect(ids).toHaveLength(1);
  });

  it("GET /api/timesheets as ADMIN returns only approved/rejected records (pending hidden)", async () => {
    const res = await GET_TIMESHEETS(buildRequest("/api/timesheets", { token: tokens.adminToken }));
    expect(res.status).toBe(200);
    const body = await res.json();
    const ids = body.data.data.map((t: { id: string }) => t.id);
    expect(ids).toHaveLength(2);
  });
});

describe("visibility-scoping — fuel list shows own records at any status (creator sees own pending)", () => {
  it("GET /api/fuel-usage as USER returns own approved + pending records", async () => {
    const res = await GET_FUEL(buildRequest("/api/fuel-usage", { token: tokens.userToken }));
    expect(res.status).toBe(200);
    const body = await res.json();
    const ids = body.data.data.map((f: { id: string }) => f.id);
    expect(ids).toHaveLength(2);
  });

  it("GET /api/fuel-usage?approvalStatus=PENDING returns own pending records only", async () => {
    const res = await GET_FUEL(
      buildRequest("/api/fuel-usage?approvalStatus=PENDING", { token: tokens.userToken })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    const ids = body.data.data.map((f: { id: string }) => f.id);
    expect(ids).toHaveLength(1);
  });
});

describe("visibility-scoping — contractor profile counts own approved records only (pending excluded from counts)", () => {
  it("profile _count includes own approved records but excludes pending and other users' records", async () => {
    const [r, p] = oneRequest(contractorUser, tokens.userToken);
    const res = await GET_CONTRACTOR_PROFILE(r, p);
    expect(res.status).toBe(200);
    const body = await res.json();
    const c = body.data;
    expect(c._count.expensesPaidTo).toBe(1);
    expect(c._count.timesheets).toBe(1);
    expect(c._count.fuelUsages).toBe(1);
    expect(c.totalExpensesPaid).toBe(500);
  });

  it("profile expensesPaidTo list shows own approved + own pending, but not other users' records", async () => {
    const [r, p] = oneRequest(contractorUser, tokens.userToken);
    const res = await GET_CONTRACTOR_PROFILE(r, p);
    const body = await res.json();
    const titles = body.data.expensesPaidTo.map((e: { title: string }) => e.title).sort();
    expect(titles).toEqual(["User Approved Expense", "User Pending Expense"]);
  });
});

describe("visibility-scoping — contractor dashboard", () => {
  it("USER dashboard includes own approved financials only (pending excluded)", async () => {
    const res = await GET_CONTRACTOR_DASHBOARD(buildRequest("/api/contractors/dashboard", { token: tokens.userToken }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.totalContractorExpenses).toBe(500);
    expect(body.data.monthlyContractorPayments).toBe(500);
    expect(body.data.totalTimesheetHours).toBe(8);
    expect(body.data.totalFuelCost).toBe(600);
  });

  it("ADMIN dashboard includes all approved financials (pending excluded)", async () => {
    const res = await GET_CONTRACTOR_DASHBOARD(buildRequest("/api/contractors/dashboard", { token: tokens.adminToken }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.totalContractorExpenses).toBe(1500);
    expect(body.data.totalTimesheetHours).toBe(18);
  });
});

describe("visibility-scoping — employee dashboard", () => {
  it("USER employee dashboard is scoped to own employees", async () => {
    const res = await GET_EMPLOYEE_DASHBOARD(buildRequest("/api/employees/dashboard", { token: tokens.userToken }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.totalEmployees).toBe(1);
  });

  it("ADMIN employee dashboard sees all employees", async () => {
    const res = await GET_EMPLOYEE_DASHBOARD(buildRequest("/api/employees/dashboard", { token: tokens.adminToken }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.totalEmployees).toBe(3);
  });
});

describe("visibility-scoping — employee financial summary", () => {
  it("POST financial-summary only returns accessible employees", async () => {
    const res = await POST_FINANCIAL_SUMMARY(
      buildRequest("/api/employees/financial-summary", {
        token: tokens.userToken,
        method: "POST",
        body: { ids: [employeeUser, employeeManager] },
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.employees.map((e: { id: string }) => e.id)).toEqual([employeeUser]);
    expect(body.data.totals.employeeCount).toBe(1);
  });

  it("GET [id]/financial-summary 404s for an employee outside the user's scope", async () => {
    const [r, p] = empSummaryRequest(tokens.employee.id, tokens.managerToken);
    const res = await GET_EMPLOYEE_FINANCIAL_SUMMARY(r, p);
    expect(res.status).toBe(404);
  });

  it("GET [id]/financial-summary succeeds for an employee within the user's scope", async () => {
    const [r, p] = empSummaryRequest(employeeManager, tokens.managerToken);
    const res = await GET_EMPLOYEE_FINANCIAL_SUMMARY(r, p);
    expect(res.status).toBe(200);
  });
});
