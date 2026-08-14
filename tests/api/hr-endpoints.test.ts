import { db } from "@/lib/db";
import { seedUsers, TEST_MANAGER, type SeedResult } from "../helpers";
import { buildRequest } from "../helpers";

import * as SalaryHistoryRoute from "@/app/api/employees/[id]/salary-history/route";
import * as ContractsRoute from "@/app/api/employees/[id]/contracts/route";
import * as DocumentsRoute from "@/app/api/employees/[id]/documents/route";
import * as LeaveRoute from "@/app/api/employees/[id]/leave/route";
import * as AssignmentsRoute from "@/app/api/employees/[id]/assignments/route";
import * as EmployeePayrollRoute from "@/app/api/employees/[id]/payroll/route";
import * as AlertsRoute from "@/app/api/employees/alerts/route";
import * as LeaveTypesRoute from "@/app/api/leave-types/route";
import * as PayrollRoute from "@/app/api/payroll/route";
import { generatePayroll } from "@/services/hr.service";

let tokens: SeedResult;
let adminEmpId: string;
let mgrEmpId: string;

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function json(res: Response) {
  return res.json();
}

beforeAll(async () => {
  tokens = await seedUsers();
  adminEmpId = tokens.employee.id;
  // Manager-owned employee so record-scoped access succeeds for MANAGER.
  const mgrEmp = await db.employee.create({
    data: {
      fullName: "Mgr HR Emp",
      fatherName: "M",
      phoneNumber: "0700000199",
      jobTitle: "Supervisor",
      department: "OPERATIONS",
      hireDate: new Date(),
      createdBy: TEST_MANAGER.id,
    },
  });
  mgrEmpId = mgrEmp.id;
});

describe("HR sub-resource permission gates (USER lacks sensitive perms)", () => {
  it("USER cannot view salary history (403)", async () => {
    const res = await SalaryHistoryRoute.GET(
      buildRequest(`/api/employees/${adminEmpId}/salary-history`, { token: tokens.userToken }),
      ctx(adminEmpId)
    );
    expect(res.status).toBe(403);
  });

  it("USER cannot view payroll (403)", async () => {
    const res = await EmployeePayrollRoute.GET(
      buildRequest(`/api/employees/${adminEmpId}/payroll`, { token: tokens.userToken }),
      ctx(adminEmpId)
    );
    expect(res.status).toBe(403);
  });

  it("USER cannot create a salary change (403)", async () => {
    const res = await SalaryHistoryRoute.POST(
      buildRequest(`/api/employees/${adminEmpId}/salary-history`, {
        token: tokens.userToken,
        method: "POST",
        body: { amount: 30000, effectiveFrom: "2026-01-01", reason: "raise" },
      }),
      ctx(adminEmpId)
    );
    expect(res.status).toBe(403);
  });

  it("USER cannot create a contract (403, lacks contract:manage)", async () => {
    const res = await ContractsRoute.POST(
      buildRequest(`/api/employees/${adminEmpId}/contracts`, {
        token: tokens.userToken,
        method: "POST",
        body: { contractNumber: "C-1", startDate: "2026-01-01" },
      }),
      ctx(adminEmpId)
    );
    expect(res.status).toBe(403);
  });

  it("USER cannot create a document (403, lacks documents:manage)", async () => {
    const res = await DocumentsRoute.POST(
      buildRequest(`/api/employees/${adminEmpId}/documents`, {
        token: tokens.userToken,
        method: "POST",
        body: { documentType: "ID_CARD" },
      }),
      ctx(adminEmpId)
    );
    expect(res.status).toBe(403);
  });

  it("USER cannot generate payroll (403, lacks payroll:manage)", async () => {
    const res = await PayrollRoute.POST(
      buildRequest(`/api/payroll`, {
        token: tokens.userToken,
        method: "POST",
        body: { periodStart: "2026-06-01", periodEnd: "2026-06-30", employeeIds: [adminEmpId] },
      })
    );
    expect(res.status).toBe(403);
  });

  it("USER with view perm but no record access gets 404 on another's contracts", async () => {
    const res = await ContractsRoute.GET(
      buildRequest(`/api/employees/${adminEmpId}/contracts`, { token: tokens.userToken }),
      ctx(adminEmpId)
    );
    expect(res.status).toBe(404);
  });
});

describe("HR sub-resource ADMIN access (unrestricted)", () => {
  it("reads and creates salary history", async () => {
    const get = await SalaryHistoryRoute.GET(
      buildRequest(`/api/employees/${adminEmpId}/salary-history`, { token: tokens.adminToken }),
      ctx(adminEmpId)
    );
    expect(get.status).toBe(200);
    const created = await SalaryHistoryRoute.POST(
      buildRequest(`/api/employees/${adminEmpId}/salary-history`, {
        token: tokens.adminToken,
        method: "POST",
        body: { amount: 30000, effectiveFrom: "2026-01-01", reason: "initial" },
      }),
      ctx(adminEmpId)
    );
    expect(created.status).toBe(201);
    const body = await json(created);
    expect(body.data.amountMinor).toBe(3000000);
  });

  it("reads and creates contracts", async () => {
    const get = await ContractsRoute.GET(
      buildRequest(`/api/employees/${adminEmpId}/contracts`, { token: tokens.adminToken }),
      ctx(adminEmpId)
    );
    expect(get.status).toBe(200);
    const created = await ContractsRoute.POST(
      buildRequest(`/api/employees/${adminEmpId}/contracts`, {
        token: tokens.adminToken,
        method: "POST",
        body: { contractNumber: "K-100", startDate: "2026-01-01" },
      }),
      ctx(adminEmpId)
    );
    expect(created.status).toBe(201);
  });

  it("reads and creates documents", async () => {
    const get = await DocumentsRoute.GET(
      buildRequest(`/api/employees/${adminEmpId}/documents`, { token: tokens.adminToken }),
      ctx(adminEmpId)
    );
    expect(get.status).toBe(200);
    const created = await DocumentsRoute.POST(
      buildRequest(`/api/employees/${adminEmpId}/documents`, {
        token: tokens.adminToken,
        method: "POST",
        body: { documentType: "PASSPORT" },
      }),
      ctx(adminEmpId)
    );
    expect(created.status).toBe(201);
  });

  it("reads and creates leave requests", async () => {
    const get = await LeaveRoute.GET(
      buildRequest(`/api/employees/${adminEmpId}/leave`, { token: tokens.adminToken }),
      ctx(adminEmpId)
    );
    expect(get.status).toBe(200);
    const created = await LeaveRoute.POST(
      buildRequest(`/api/employees/${adminEmpId}/leave`, {
        token: tokens.adminToken,
        method: "POST",
        body: { startDate: "2026-06-10", endDate: "2026-06-12", reason: "vacation" },
      }),
      ctx(adminEmpId)
    );
    expect(created.status).toBe(201);
  });

  it("reads and creates assignments", async () => {
    const get = await AssignmentsRoute.GET(
      buildRequest(`/api/employees/${adminEmpId}/assignments`, { token: tokens.adminToken }),
      ctx(adminEmpId)
    );
    expect(get.status).toBe(200);
    const created = await AssignmentsRoute.POST(
      buildRequest(`/api/employees/${adminEmpId}/assignments`, {
        token: tokens.adminToken,
        method: "POST",
        body: { project: "Road A", startDate: "2026-06-01" },
      }),
      ctx(adminEmpId)
    );
    expect(created.status).toBe(201);
  });

  it("reads payroll for an employee", async () => {
    const get = await EmployeePayrollRoute.GET(
      buildRequest(`/api/employees/${adminEmpId}/payroll`, { token: tokens.adminToken }),
      ctx(adminEmpId)
    );
    expect(get.status).toBe(200);
  });

  it("reads HR alerts", async () => {
    const get = await AlertsRoute.GET(
      buildRequest(`/api/employees/alerts`, { token: tokens.adminToken })
    );
    expect(get.status).toBe(200);
  });

  it("reads and creates leave types", async () => {
    const get = await LeaveTypesRoute.GET(
      buildRequest(`/api/leave-types`, { token: tokens.adminToken })
    );
    expect(get.status).toBe(200);
    const created = await LeaveTypesRoute.POST(
      buildRequest(`/api/leave-types`, {
        token: tokens.adminToken,
        method: "POST",
        body: { name: "Annual", isPaid: true, defaultDays: 20 },
      })
    );
    expect(created.status).toBe(201);
  });
});

describe("HR access for MANAGER on its own employee", () => {
  it("MANAGER can read salary history of an employee it owns", async () => {
    const get = await SalaryHistoryRoute.GET(
      buildRequest(`/api/employees/${mgrEmpId}/salary-history`, { token: tokens.managerToken }),
      ctx(mgrEmpId)
    );
    expect(get.status).toBe(200);
  });

  it("MANAGER can create a salary change for an employee it owns", async () => {
    const created = await SalaryHistoryRoute.POST(
      buildRequest(`/api/employees/${mgrEmpId}/salary-history`, {
        token: tokens.managerToken,
        method: "POST",
        body: { amount: 28000, effectiveFrom: "2026-02-01", reason: "raise" },
      }),
      ctx(mgrEmpId)
    );
    expect(created.status).toBe(201);
  });
});

describe("Payroll generate + approve via API", () => {
  it("ADMIN generates then approves a payroll", async () => {
    await db.employee.update({
      where: { id: adminEmpId },
      data: { baseSalaryMinor: 2500000 },
    });

    const gen = await PayrollRoute.POST(
      buildRequest(`/api/payroll`, {
        token: tokens.adminToken,
        method: "POST",
        body: { periodStart: "2026-06-01", periodEnd: "2026-06-30", employeeIds: [adminEmpId] },
      })
    );
    expect(gen.status).toBe(200);

    const list = await PayrollRoute.GET(
      buildRequest(`/api/payroll`, { token: tokens.adminToken })
    );
    const listBody = await json(list);
    const payroll = listBody.data.data.find((p: any) => p.employeeId === adminEmpId);
    expect(payroll).toBeDefined();

    const approve = await EmployeePayrollRoute.POST(
      buildRequest(`/api/employees/${adminEmpId}/payroll`, {
        token: tokens.adminToken,
        method: "POST",
        body: { action: "approve", payrollId: payroll.id, paymentMethod: "CASH" },
      }),
      ctx(adminEmpId)
    );
    expect(approve.status).toBe(200);
    const approvedBody = await json(approve);
    expect(approvedBody.data.status).toBe("APPROVED");

    // Revert the approved payroll back to DRAFT.
    const revert = await EmployeePayrollRoute.POST(
      buildRequest(`/api/employees/${adminEmpId}/payroll`, {
        token: tokens.adminToken,
        method: "POST",
        body: { action: "revert", payrollId: payroll.id, reason: "correction" },
      }),
      ctx(adminEmpId)
    );
    expect(revert.status).toBe(200);
    const revertBody = await json(revert);
    expect(revertBody.data.status).toBe("DRAFT");
  });
});
