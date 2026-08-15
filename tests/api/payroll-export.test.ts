import { GET } from "@/app/api/payroll/export/route";
import { db } from "@/lib/db";
import { seedUsers, buildRequest, TEST_ADMIN } from "../helpers";
import { toMinor } from "@/lib/money";

let tokens: Awaited<ReturnType<typeof seedUsers>>;

beforeAll(async () => {
  tokens = await seedUsers();
  await db.payroll.create({
    data: {
      employeeId: tokens.employee.id,
      periodStart: new Date("2026-06-01"),
      periodEnd: new Date("2026-06-30"),
      status: "APPROVED",
      createdById: TEST_ADMIN.id,
      approvedById: TEST_ADMIN.id,
      approvedAt: new Date(),
      lines: {
        create: {
          employeeId: tokens.employee.id,
          grossPayMinor: toMinor(25000),
          amountAlreadyReceivedMinor: toMinor(2000),
          previousDebtMinor: toMinor(1000),
          netPayableMinor: toMinor(23000),
          remainingEmployeeDebtMinor: toMinor(0),
          paymentStatus: "PAID",
        },
      },
    },
  });
  await db.payroll.create({
    data: {
      employeeId: tokens.employee.id,
      periodStart: new Date("2026-07-01"),
      periodEnd: new Date("2026-07-31"),
      status: "DRAFT",
      createdById: TEST_ADMIN.id,
      lines: {
        create: {
          employeeId: tokens.employee.id,
          grossPayMinor: toMinor(25000),
          netPayableMinor: toMinor(25000),
          paymentStatus: "UNPAID",
        },
      },
    },
  });
});

describe("GET /api/payroll/export", () => {
  it("returns all payroll records as JSON with format=json", async () => {
    const res = await GET(
      buildRequest("/api/payroll/export?format=json", { token: tokens.adminToken })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data).toHaveLength(2);
    expect(json.data[0].employee.fullName).toBe("Test Employee");
    expect(json.data[0].lines[0].grossPayMinor).toBe(toMinor(25000));
  });

  it("respects the status filter in JSON mode", async () => {
    const res = await GET(
      buildRequest("/api/payroll/export?format=json&status=APPROVED", {
        token: tokens.adminToken,
      })
    );
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data).toHaveLength(1);
    expect(json.data[0].status).toBe("APPROVED");
  });

  it("returns CSV by default", async () => {
    const res = await GET(
      buildRequest("/api/payroll/export", { token: tokens.adminToken })
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    const text = await res.text();
    expect(text).toContain("Employee");
    expect(text).toContain("Test Employee");
  });

  it("denies a user without payroll view permission", async () => {
    const res = await GET(
      buildRequest("/api/payroll/export?format=json", { token: tokens.userToken })
    );
    expect(res.status).toBe(403);
  });
});
