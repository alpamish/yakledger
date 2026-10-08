import { describe, it, expect, beforeEach } from "vitest";
import {
  seedUsers,
  buildRequest,
  TEST_ADMIN,
  type SeedResult,
} from "../helpers";
import { GET as GET_STATEMENT } from "@/app/api/employees/[id]/statement/route";
import {
  generatePayroll,
  approvePayroll,
  recordPayrollPayment,
  getEmployeeStatement,
} from "@/services/hr.service";
import { recordReimbursement } from "@/services/reimbursement.service";
import { walletService } from "@/services/wallet.service";
import { db } from "@/lib/db";
import { toMinor } from "@/lib/money";

const EMP_PARAMS = (id: string) => ({ params: Promise.resolve({ id }) });

describe("Employee financial statement (Plan-payroll.pdf §2 action 10)", () => {
  let s: SeedResult;

  beforeEach(async () => {
    s = await seedUsers();
    await db.employee.update({
      where: { id: s.employee.id },
      data: {
        hireDate: new Date("2026-01-01"),
        baseSalaryMinor: toMinor(25000),
        workStartTime: "07:00",
        workEndTime: "18:00",
        breakMinutes: 60,
      },
    });
    await db.salaryHistory.create({
      data: {
        employeeId: s.employee.id,
        amountMinor: toMinor(25000),
        currency: "AFN",
        effectiveFrom: new Date("2026-01-01"),
      },
    });
    // The cash account exists so every domain operation keeps it fresh and
    // the statement's closing balance is the stored balance, not a fallback.
    await db.employeeCashAccount.upsert({
      where: { employeeId: s.employee.id },
      create: { employeeId: s.employee.id, currentBalance: 0 },
      update: { currentBalance: 0 },
    });
  });

  async function addCash(
    type: string,
    amount: number,
    createdAt: Date,
    extra: Record<string, unknown> = {}
  ) {
    const txn = await db.cashTransaction.create({
      data: {
        employeeId: s.employee.id,
        type,
        amount,
        approvalStatus: "APPROVED",
        createdBy: TEST_ADMIN.id,
        approvedById: TEST_ADMIN.id,
        approvedAt: createdAt,
        createdAt,
        ...extra,
      },
    });
    await walletService.recomputeBalance(s.employee.id);
    return txn;
  }

  it("covers all activity with debit/credit totals and the net balance", async () => {
    await addCash("ADVANCE", 1000, new Date("2026-06-10"));
    await addCash("RETURN", 200, new Date("2026-06-15"));
    await addCash("ADJUSTMENT", 50, new Date("2026-06-18"));

    const expense = await db.expense.create({
      data: {
        title: "Fuel for site visit",
        amount: 300,
        category: "FUEL",
        paymentMethod: "CASH",
        paidTo: "Company",
        paidBy: "Employee",
        expenseDate: new Date("2026-06-12"),
        paidById: s.employee.id,
        createdBy: TEST_ADMIN.id,
        approvalStatus: "APPROVED",
        approvedById: TEST_ADMIN.id,
        approvedAt: new Date("2026-06-12"),
      },
    });
    await recordReimbursement({
      employeeId: s.employee.id,
      expenseIds: [expense.id],
      paymentMethod: "CASH",
      paidById: TEST_ADMIN.id,
    });

    const second = await db.employee.create({
      data: {
        fullName: "Statement Peer",
        fatherName: "P",
        phoneNumber: "0700000001",
        jobTitle: "Driver",
        department: "LABOR",
        employmentType: "FULL_TIME",
        hireDate: new Date("2026-01-01"),
        status: "ACTIVE",
        createdBy: TEST_ADMIN.id,
        baseSalaryMinor: toMinor(20000),
      },
    });
    await db.transfer.create({
      data: {
        fromEmployeeId: second.id,
        toEmployeeId: s.employee.id,
        amount: 400,
        approvalStatus: "APPROVED",
        createdBy: TEST_ADMIN.id,
        approvedById: TEST_ADMIN.id,
        approvedAt: new Date("2026-06-20"),
        createdAt: new Date("2026-06-20"),
      },
    });

    const { payroll } = await generatePayroll({
      employeeId: s.employee.id,
      periodStart: new Date("2026-06-01"),
      periodEnd: new Date("2026-06-30"),
      createdById: TEST_ADMIN.id,
    });
    await approvePayroll(payroll.id, TEST_ADMIN.id);
    await recordPayrollPayment(payroll.id, TEST_ADMIN.id, {
      amountMinor: toMinor(10000),
      paymentMethod: "CASH",
    });

    const stmt = await getEmployeeStatement(s.employee.id);
    const byCategory = (cat: string) =>
      stmt.entries.filter((e) => e.category === cat);

    expect(byCategory("ADVANCE")).toHaveLength(1);
    expect(byCategory("RETURN")).toHaveLength(1);
    expect(byCategory("EXPENSE")).toHaveLength(1);
    expect(byCategory("REIMBURSEMENT")).toHaveLength(1);
    expect(byCategory("TRANSFER")).toHaveLength(1);
    expect(byCategory("CORRECTION")).toHaveLength(1);
    expect(byCategory("SALARY")).toHaveLength(1);
    expect(byCategory("PAYMENT")).toHaveLength(1);

    // Directions follow the cash-account convention.
    expect(byCategory("ADVANCE")[0].direction).toBe("DEBIT");
    expect(byCategory("RETURN")[0].direction).toBe("CREDIT");
    expect(byCategory("EXPENSE")[0].direction).toBe("CREDIT");
    expect(byCategory("REIMBURSEMENT")[0].direction).toBe("DEBIT");
    expect(byCategory("TRANSFER")[0].direction).toBe("DEBIT");
    expect(byCategory("SALARY")[0].direction).toBe("CREDIT");
    expect(byCategory("PAYMENT")[0].direction).toBe("DEBIT");

    const grossMinor = (
      await db.payrollLine.findFirst({ where: { payrollId: payroll.id } })
    )!.grossPayMinor;
    expect(stmt.totals.debitMinor).toBe(
      toMinor(1000) + toMinor(50) + toMinor(300) + toMinor(400) + toMinor(10000)
    );
    expect(stmt.totals.creditMinor).toBe(
      toMinor(200) + toMinor(300) + grossMinor
    );
    expect(stmt.totals.netMinor).toBe(
      stmt.totals.debitMinor - stmt.totals.creditMinor
    );

    // The statement's closing balance IS the employee cash balance.
    expect(stmt.balance.closingMinor).toBe(stmt.totals.netMinor);
    expect(stmt.balance.openingMinor).toBe(0);
  });

  it("filters by date range and derives the opening balance", async () => {
    await addCash("ADVANCE", 1000, new Date("2026-06-10"));
    await addCash("ADVANCE", 500, new Date("2026-07-10"));

    const stmt = await getEmployeeStatement(s.employee.id, {
      dateFrom: "2026-06-01",
      dateTo: "2026-06-30",
    });

    expect(stmt.entries).toHaveLength(1);
    expect(stmt.entries[0].category).toBe("ADVANCE");
    expect(stmt.totals.debitMinor).toBe(toMinor(1000));
    expect(stmt.totals.creditMinor).toBe(0);

    // Closing is the current balance (both advances); opening is derived.
    expect(stmt.balance.closingMinor).toBe(toMinor(1500));
    expect(stmt.balance.openingMinor).toBe(toMinor(500));
    expect(
      stmt.balance.openingMinor + stmt.totals.netMinor
    ).toBe(stmt.balance.closingMinor);
  });

  it("lists pending corrections as memo rows without touching the totals", async () => {
    await db.payrollAdjustment.create({
      data: {
        employeeId: s.employee.id,
        kind: "PREVIOUS_OVERPAYMENT_DEDUCTION",
        amountMinor: 5000,
        reason: "Advance amount was edited after payment",
        createdById: TEST_ADMIN.id,
      },
    });

    const stmt = await getEmployeeStatement(s.employee.id);

    expect(stmt.entries).toHaveLength(1);
    expect(stmt.entries[0].memo).toBe(true);
    expect(stmt.entries[0].direction).toBe("DEBIT");
    expect(stmt.totals.debitMinor).toBe(0);
    expect(stmt.totals.creditMinor).toBe(0);
    expect(stmt.balance.closingMinor).toBe(0);
  });

  it("serves the statement through the API and enforces permissions", async () => {
    await addCash("ADVANCE", 250, new Date("2026-06-10"));

    const ok = await GET_STATEMENT(
      buildRequest(`/api/employees/${s.employee.id}/statement`, {
        token: s.adminToken,
      }),
      EMP_PARAMS(s.employee.id)
    );
    expect(ok.status).toBe(200);
    const body = await ok.json();
    expect(body.data.totals.debitMinor).toBe(toMinor(250));
    expect(body.data.balance.closingMinor).toBe(toMinor(250));

    const forbidden = await GET_STATEMENT(
      buildRequest(`/api/employees/${s.employee.id}/statement`, {
        token: s.userToken,
      }),
      EMP_PARAMS(s.employee.id)
    );
    expect(forbidden.status).toBe(403);
  });
});
