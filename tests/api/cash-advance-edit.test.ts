import { describe, it, expect, beforeEach } from "vitest";
import { seedUsers, buildRequest, TEST_ADMIN, type SeedResult } from "../helpers";
import { POST as createListTransaction } from "@/app/api/cash-transactions/route";
import { PATCH, DELETE } from "@/app/api/cash-transactions/[id]/route";
import { POST as APPROVE } from "@/app/api/approvals/[entity]/[id]/route";
import { generatePayroll, approvePayroll, recordPayrollPayment } from "@/services/hr.service";
import { companyWalletService } from "@/services/company-wallet.service";
import { db } from "@/lib/db";
import { toMinor } from "@/lib/money";

async function issueAdvance(
  token: string,
  body: Record<string, unknown>
): Promise<{ id: string; approvalStatus: string }> {
  const res = await createListTransaction(
    buildRequest("/api/cash-transactions", {
      token,
      method: "POST",
      body: { type: "ADVANCE", ...body },
    })
  );
  const json = await res.json();
  if (res.status !== 201) throw new Error(`create failed: ${res.status} ${json.error}`);
  return json.data;
}

async function patchAdvance(token: string, id: string, body: Record<string, unknown>) {
  const res = await PATCH(
    buildRequest(`/api/cash-transactions/${id}`, { token, method: "PATCH", body }),
    { params: Promise.resolve({ id }) }
  );
  return { status: res.status, body: await res.json() };
}

describe("Editing cash advances (Plan-payroll.pdf §2 actions 3–4)", () => {
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
  });

  async function junePayroll() {
    const { payroll } = await generatePayroll({
      employeeId: s.employee.id,
      periodStart: new Date("2026-06-01"),
      periodEnd: new Date("2026-06-30"),
      createdById: TEST_ADMIN.id,
    });
    return payroll;
  }

  // Payroll only counts cash rows created inside the period, so the advance
  // has to be backdated into June like a real advance from that month.
  async function backdate(id: string) {
    await db.cashTransaction.update({
      where: { id },
      data: { createdAt: new Date("2026-06-10T10:00:00.000Z") },
    });
  }

  it("recalculates an unpaid payroll when the advance amount changes", async () => {
    const advance = await issueAdvance(s.adminToken, {
      employeeId: s.employee.id,
      amount: 30000,
    });
    await backdate(advance.id);

    const june = await junePayroll();
    const approved = await approvePayroll(june.id, TEST_ADMIN.id);
    expect(approved.status).toBe("APPROVED");
    expect(approved.totalPaidMinor).toBe(0);
    expect(approved.lines[0].paymentStatus).toBe("UNPAID");

    const { status, body } = await patchAdvance(s.adminToken, advance.id, {
      amount: 20000,
      note: "reduced after receipt",
    });
    expect(status).toBe(200);
    expect(body.payroll.recalculated).toContain(june.id);
    expect(body.payroll.adjustments).toHaveLength(0);
    expect(body.data.editedById).toBe(TEST_ADMIN.id);
    expect(body.data.editedAt).toBeTruthy();

    const after = await db.payroll.findUnique({
      where: { id: june.id },
      include: { lines: true },
    });
    expect(after!.status).toBe("NEEDS_RECALCULATION");
    expect(after!.lines[0].previousDebtMinor).toBe(toMinor(20000));
    expect(after!.lines[0].amountAlreadyReceivedMinor).toBe(toMinor(20000));

    const alloc = await db.payrollAdvanceAllocation.aggregate({
      _sum: { amountMinor: true },
      where: { payrollId: june.id },
    });
    expect(alloc._sum.amountMinor).toBe(toMinor(20000));

    const audit = await db.auditLog.findFirst({
      where: { entity: "CashTransaction", entityId: advance.id, action: "UPDATE" },
    });
    expect(audit).toBeTruthy();
    expect(audit!.details).toContain("amount");
  });

  it("posts an adjustment instead of touching a payroll that was already paid", async () => {
    const advance = await issueAdvance(s.adminToken, {
      employeeId: s.employee.id,
      amount: 10000,
    });
    await backdate(advance.id);

    const june = await junePayroll();
    await approvePayroll(june.id, TEST_ADMIN.id);
    // Payment is a separate action from approval (§2 action 6).
    const paid = await recordPayrollPayment(june.id, TEST_ADMIN.id, {
      paymentMethod: "CASH",
    });
    expect(paid!.status).toBe("PAID");
    expect(paid!.lines[0].paymentStatus).toBe("PAID");
    expect(paid!.totalPaidMinor).toBe(toMinor(15000));

    const { status, body } = await patchAdvance(s.adminToken, advance.id, {
      amount: 15000,
    });
    expect(status).toBe(200);
    expect(body.payroll.adjustments).toHaveLength(1);
    expect(body.payroll.recalculated).toHaveLength(0);

    const adjustment = await db.payrollAdjustment.findUnique({
      where: { id: body.payroll.adjustments[0] },
    });
    expect(adjustment!.kind).toBe("PREVIOUS_OVERPAYMENT_DEDUCTION");
    expect(adjustment!.amountMinor).toBe(toMinor(5000));
    expect(adjustment!.reason).toContain("Advance amount changed");
    expect(adjustment!.employeeId).toBe(s.employee.id);

    // Paid history is preserved: the payroll keeps its paid figures and the
    // recorded payment transaction is untouched.
    const after = await db.payroll.findUnique({ where: { id: june.id } });
    expect(after!.status).toBe("PAID");
    expect(after!.totalPaidMinor).toBe(toMinor(15000));

    const salaryPayment = await db.cashTransaction.count({
      where: { payrollId: june.id, type: "SALARY_PAYMENT" },
    });
    expect(salaryPayment).toBe(1);

    const auditEvent = await db.employeeAuditEvent.findFirst({
      where: { employeeId: s.employee.id, action: "ADVANCE_EDIT_ADJUSTMENT" },
    });
    expect(auditEvent).toBeTruthy();
  });

  it("refuses the edit from a user without cashAdvance:edit", async () => {
    const advance = await issueAdvance(s.adminToken, {
      employeeId: s.employee.id,
      amount: 1000,
    });
    const { status } = await patchAdvance(s.userToken, advance.id, { amount: 2000 });
    expect(status).toBe(403);
  });

  it("allows editing the due date without touching payroll", async () => {
    const advance = await issueAdvance(s.adminToken, {
      employeeId: s.employee.id,
      amount: 4000,
      dueDate: "2026-07-31",
    });
    const { status, body } = await patchAdvance(s.adminToken, advance.id, {
      dueDate: "2026-08-15",
    });
    expect(status).toBe(200);
    expect(body.payroll.recalculated).toHaveLength(0);
    expect(body.payroll.adjustments).toHaveLength(0);
    expect(new Date(body.data.dueDate).toISOString().slice(0, 10)).toBe("2026-08-15");
  });
});

describe("Deleting cash advances", () => {
  let s: SeedResult;

  beforeEach(async () => {
    s = await seedUsers();
  });

  it("rejects deleting an approved advance with 409", async () => {
    const advance = await issueAdvance(s.adminToken, {
      employeeId: s.employee.id,
      amount: 5000,
    });
    expect(advance.approvalStatus).toBe("APPROVED");

    const res = await DELETE(
      buildRequest(`/api/cash-transactions/${advance.id}`, {
        token: s.adminToken,
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: advance.id }) }
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("cannot be deleted");

    expect(
      await db.cashTransaction.findUnique({ where: { id: advance.id } })
    ).toBeTruthy();
  });

  it("deletes a pending advance", async () => {
    const advance = await issueAdvance(s.userToken, {
      employeeId: s.employee.id,
      amount: 5000,
    });
    expect(advance.approvalStatus).toBe("PENDING");

    const res = await DELETE(
      buildRequest(`/api/cash-transactions/${advance.id}`, {
        token: s.adminToken,
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: advance.id }) }
    );
    expect(res.status).toBe(200);
    expect(await db.cashTransaction.findUnique({ where: { id: advance.id } })).toBeNull();
  });
});

describe("Advance payment method (Plan-payroll.pdf §2 action 5)", () => {
  let s: SeedResult;

  beforeEach(async () => {
    s = await seedUsers();
  });

  it("records the payment, posts an accounting entry and debits the company wallet", async () => {
    const wallet = await companyWalletService.create({
      name: `Payroll Wallet ${Date.now()}`,
      type: "CASH",
      currency: "AFN",
      initialBalance: 50000,
      createdBy: TEST_ADMIN.id,
    });

    const res = await createListTransaction(
      buildRequest("/api/cash-transactions", {
        token: s.adminToken,
        method: "POST",
        body: {
          employeeId: s.employee.id,
          type: "ADVANCE",
          amount: 5000,
          paymentMethod: "COMPANY_WALLET",
          walletId: wallet.id,
        },
      })
    );
    expect(res.status).toBe(201);
    const txn = (await res.json()).data;

    expect(txn.paymentMethod).toBe("COMPANY_WALLET");
    expect(txn.paidAt).toBeTruthy();

    const refreshed = await db.wallet.findUnique({ where: { id: wallet.id } });
    expect(refreshed!.balance).toBe(45000);

    const walletTxn = await db.walletTransaction.findFirst({
      where: { walletId: wallet.id, type: "ADVANCE" },
    });
    expect(walletTxn).toBeTruthy();
    expect(walletTxn!.amount).toBeLessThan(0);

    const entry = await db.accountingEntry.findFirst({
      where: { cashTransactionId: txn.id, type: "ADVANCE_PAYMENT" },
    });
    expect(entry).toBeTruthy();
    expect(entry!.amountMinor).toBe(-toMinor(5000));
  });

  it("marks a cash advance paid on creation without a wallet entry", async () => {
    const txn = await issueAdvance(s.adminToken, {
      employeeId: s.employee.id,
      amount: 3000,
      paymentMethod: "CASH",
    });

    const stored = await db.cashTransaction.findUnique({ where: { id: txn.id } });
    expect(stored!.paymentMethod).toBe("CASH");
    expect(stored!.paidAt).toBeTruthy();

    const entry = await db.accountingEntry.findFirst({
      where: { cashTransactionId: txn.id, type: "ADVANCE_PAYMENT" },
    });
    expect(entry).toBeTruthy();
    expect(entry!.amountMinor).toBe(-toMinor(3000));
  });

  it("rejects a company-wallet advance without a wallet", async () => {
    const res = await createListTransaction(
      buildRequest("/api/cash-transactions", {
        token: s.adminToken,
        method: "POST",
        body: {
          employeeId: s.employee.id,
          type: "ADVANCE",
          amount: 1000,
          paymentMethod: "COMPANY_WALLET",
        },
      })
    );
    expect(res.status).toBe(500);
    expect((await res.json()).error).toContain("requires a wallet");
  });
});

describe("Approving a pending advance", () => {
  let s: SeedResult;

  beforeEach(async () => {
    s = await seedUsers();
  });

  it("pays the advance once and does not double count the wallet balance", async () => {
    const advance = await issueAdvance(s.userToken, {
      employeeId: s.employee.id,
      amount: 5000,
    });
    expect(advance.approvalStatus).toBe("PENDING");

    const res = await APPROVE(
      buildRequest(`/api/approvals/cashTransaction/${advance.id}`, {
        token: s.adminToken,
        method: "POST",
        body: { action: "approve" },
      }),
      { params: Promise.resolve({ entity: "cashTransaction", id: advance.id }) }
    );
    expect(res.status).toBe(200);

    const stored = await db.cashTransaction.findUnique({ where: { id: advance.id } });
    expect(stored!.approvalStatus).toBe("APPROVED");
    expect(stored!.paidAt).toBeTruthy();

    // +5000 owed by the employee — counted exactly once.
    const account = await db.employeeCashAccount.findUnique({
      where: { employeeId: s.employee.id },
    });
    expect(Math.round(account!.currentBalance * 100)).toBe(toMinor(5000));

    const debits = await db.cashTransaction.count({
      where: { employeeId: s.employee.id, type: "DEBIT" },
    });
    expect(debits).toBe(0);
  });
});
