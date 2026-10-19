import { describe, it, expect, beforeAll } from "vitest";
import { GET } from "@/app/api/payroll/route";
import { db } from "@/lib/db";
import { seedUsers, buildRequest, TEST_ADMIN } from "../helpers";
import { toMinor } from "@/lib/money";

let tokens: Awaited<ReturnType<typeof seedUsers>>;
let walletId: string;
let empFinance: string;
let empLabor: string;
let empFleet: string;

async function makeEmployee(dept: string, name: string, phone: string) {
  const e = await db.employee.create({
    data: {
      fullName: name,
      fatherName: "Father",
      phoneNumber: phone,
      jobTitle: "Staff",
      department: dept,
      hireDate: new Date("2026-01-01"),
      createdBy: TEST_ADMIN.id,
      baseSalaryMinor: toMinor(25000),
    },
  });
  return e.id;
}

async function makePayroll(opts: {
  employeeId: string;
  start: string;
  end: string;
  status: string;
  type?: string;
  walletId?: string | null;
  netMinor: number;
  totalPaidMinor?: number;
  paymentStatus?: string;
}) {
  return db.payroll.create({
    data: {
      employeeId: opts.employeeId,
      periodStart: new Date(opts.start),
      periodEnd: new Date(opts.end),
      status: opts.status,
      type: opts.type ?? "STANDARD",
      walletId: opts.walletId ?? null,
      createdById: TEST_ADMIN.id,
      approvedById: opts.status === "DRAFT" ? null : TEST_ADMIN.id,
      approvedAt: opts.status === "DRAFT" ? null : new Date(),
      totalPaidMinor: opts.totalPaidMinor ?? 0,
      lines: {
        create: {
          employeeId: opts.employeeId,
          grossPayMinor: opts.netMinor,
          netPayableMinor: opts.netMinor,
          netPayMinor: Math.max(opts.netMinor, 0),
          paymentStatus: opts.paymentStatus ?? "UNPAID",
        },
      },
    },
  });
}

async function list(query = "") {
  const res = await GET(
    buildRequest(`/api/payroll${query}`, { token: tokens.adminToken })
  );
  return { status: res.status, body: await res.json() };
}

beforeAll(async () => {
  tokens = await seedUsers();
  await db.payroll.deleteMany();

  const wallet = await db.wallet.create({
    data: { name: "Filter Wallet", type: "CASH", currency: "AFN", balance: 0 },
  });
  walletId = wallet.id;

  empFinance = await makeEmployee("FINANCE", "Alice Filter", "0700000001");
  empLabor = await makeEmployee("LABOR", "Bob Filter", "0700000002");
  empFleet = await makeEmployee("FLEET", "Carol Filter", "0700000003");

  // A: Finance, June, APPROVED, on a wallet, net 10,000
  await makePayroll({
    employeeId: empFinance,
    start: "2026-06-01",
    end: "2026-06-30",
    status: "APPROVED",
    walletId,
    netMinor: toMinor(10000),
  });
  // B: Labor, July, DRAFT, no wallet, net 20,000
  await makePayroll({
    employeeId: empLabor,
    start: "2026-07-01",
    end: "2026-07-31",
    status: "DRAFT",
    netMinor: toMinor(20000),
  });
  // C: Fleet, August, PAID final settlement, on a wallet, net 30,000
  await makePayroll({
    employeeId: empFleet,
    start: "2026-08-01",
    end: "2026-08-31",
    status: "PAID",
    type: "FINAL_SETTLEMENT",
    walletId,
    netMinor: toMinor(30000),
    totalPaidMinor: toMinor(30000),
    paymentStatus: "PAID",
  });
});

describe("GET /api/payroll filters", () => {
  it("returns everything unfiltered with a whole-set summary", async () => {
    const { status, body } = await list("?pageSize=100");
    expect(status).toBe(200);
    expect(body.data.total).toBe(3);
    expect(body.data.summary.totalNetPayableMinor).toBe(toMinor(60000));
    expect(body.data.summary.paidLines).toBe(1);
    expect(body.data.summary.unpaidLines).toBe(2);
  });

  it("totals the whole filtered set, not just the current page", async () => {
    const { body } = await list("?pageSize=1");
    expect(body.data.data).toHaveLength(1);
    expect(body.data.total).toBe(3);
    expect(body.data.summary.totalNetPayableMinor).toBe(toMinor(60000));
  });

  it("filters by status", async () => {
    const { body } = await list("?status=APPROVED");
    expect(body.data.total).toBe(1);
    expect(body.data.data[0].employee.fullName).toBe("Alice Filter");
    expect(body.data.summary.totalNetPayableMinor).toBe(toMinor(10000));
  });

  it("filters by payment state", async () => {
    const paid = await list("?paymentState=PAID");
    expect(paid.body.data.total).toBe(1);
    expect(paid.body.data.data[0].status).toBe("PAID");

    const unpaid = await list("?paymentState=UNPAID");
    expect(unpaid.body.data.total).toBe(1);
    expect(unpaid.body.data.data[0].status).toBe("APPROVED");
  });

  it("filters by department", async () => {
    const { body } = await list("?department=FINANCE");
    expect(body.data.total).toBe(1);
    expect(body.data.data[0].employee.fullName).toBe("Alice Filter");
  });

  it("filters by wallet, including payrolls with none", async () => {
    const none = await list("?walletId=none");
    expect(none.body.data.total).toBe(1);
    expect(none.body.data.data[0].employee.fullName).toBe("Bob Filter");

    const mine = await list(`?walletId=${walletId}`);
    expect(mine.body.data.total).toBe(2);
  });

  it("filters by payroll type", async () => {
    const { body } = await list("?type=FINAL_SETTLEMENT");
    expect(body.data.total).toBe(1);
    expect(body.data.data[0].employee.fullName).toBe("Carol Filter");
  });

  it("filters by period overlap", async () => {
    // Window 15 Jul – 15 Aug intersects July (B) and August (C), not June (A).
    const { body } = await list("?periodStart=2026-07-15&periodEnd=2026-08-15");
    expect(body.data.total).toBe(2);
    const names = body.data.data.map((p: any) => p.employee.fullName).sort();
    expect(names).toEqual(["Bob Filter", "Carol Filter"]);
  });

  it("filters by net payable range", async () => {
    const min = await list(`?minNetMinor=${toMinor(15000)}`);
    expect(min.body.data.total).toBe(2);
    const max = await list(`?maxNetMinor=${toMinor(15000)}`);
    expect(max.body.data.total).toBe(1);
    expect(max.body.data.data[0].employee.fullName).toBe("Alice Filter");
  });

  it("searches by employee name", async () => {
    const { body } = await list("?search=Bob");
    expect(body.data.total).toBe(1);
    expect(body.data.data[0].employee.fullName).toBe("Bob Filter");
  });

  it("sorts by employee server-side", async () => {
    const { body } = await list("?sort=employee&dir=asc&pageSize=100");
    expect(body.data.data[0].employee.fullName).toBe("Alice Filter");
    expect(body.data.data[2].employee.fullName).toBe("Carol Filter");
  });

  it("combines filters (department + payment state)", async () => {
    const { body } = await list("?department=FLEET&paymentState=PAID");
    expect(body.data.total).toBe(1);
    expect(body.data.data[0].employee.fullName).toBe("Carol Filter");
  });

  it("reports payable, paid and remaining for a partially paid payroll", async () => {
    const empId = await makeEmployee("FINANCE", "Dana Partial", "0700000011");
    await makePayroll({
      employeeId: empId,
      start: "2026-10-01",
      end: "2026-10-31",
      status: "PARTIALLY_PAID",
      netMinor: toMinor(50000),
      totalPaidMinor: toMinor(20000),
      paymentStatus: "PARTIALLY_PAID",
    });

    const { body } = await list("?search=Dana");
    expect(body.data.total).toBe(1);
    expect(body.data.summary.totalPayableMinor).toBe(toMinor(50000));
    expect(body.data.summary.totalPaidMinor).toBe(toMinor(20000));
    expect(body.data.summary.totalOutstandingMinor).toBe(toMinor(30000));
  });

  it("totals drafts as payable but not as remaining to pay", async () => {
    const empId = await makeEmployee("FINANCE", "Eli Draft", "0700000012");
    await makePayroll({
      employeeId: empId,
      start: "2026-11-01",
      end: "2026-11-30",
      status: "DRAFT",
      netMinor: toMinor(40000),
    });

    const { body } = await list("?search=Eli");
    expect(body.data.total).toBe(1);
    expect(body.data.summary.totalPayableMinor).toBe(toMinor(40000));
    expect(body.data.summary.totalPaidMinor).toBe(0);
    expect(body.data.summary.totalOutstandingMinor).toBe(0);
  });
});
