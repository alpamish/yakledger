import { describe, it, expect, beforeEach } from "vitest";
import {
  seedUsers,
  buildRequest,
  type SeedResult,
} from "../helpers";
import { GET as GET_LOANS, POST as POST_LOAN } from "@/app/api/loans/route";
import { PATCH as PATCH_LOAN } from "@/app/api/loans/[id]/route";
import { POST as POST_REPAYMENT } from "@/app/api/loans/[id]/repayment/route";
import { GET as GET_APPROVALS } from "@/app/api/approvals/route";
import { POST as POST_APPROVAL } from "@/app/api/approvals/[entity]/[id]/route";
import { db } from "@/lib/db";
import { toMinor } from "@/lib/money";

const LOAN_PARAMS = (id: string) => ({ params: Promise.resolve({ id }) });
const APPROVAL_PARAMS = (entity: string, id: string) => ({
  params: Promise.resolve({ entity, id }),
});

async function issueLoan(
  token: string,
  body: Record<string, unknown>
): Promise<{ id: string; status: string; approvalStatus: string }> {
  const res = await POST_LOAN(
    buildRequest("/api/loans", { token, method: "POST", body })
  );
  const json = await res.json();
  if (res.status !== 201) throw new Error(`create failed: ${res.status} ${json.error}`);
  return json.data;
}

describe("Loans API (Plan-payroll.pdf §1)", () => {
  let s: SeedResult;

  beforeEach(async () => {
    s = await seedUsers();
    await db.employee.update({
      where: { id: s.employee.id },
      data: { hireDate: new Date("2026-01-01") },
    });
  });

  describe("POST /api/loans", () => {
    it("issues an Admin loan immediately (APPROVED, disbursed)", async () => {
      const loan = await issueLoan(s.adminToken, {
        employeeId: s.employee.id,
        principalMinor: toMinor(3000),
        issueDate: "2026-05-01",
      });

      expect(loan.approvalStatus).toBe("APPROVED");
      expect(loan.status).toBe("ACTIVE");

      const account = await db.employeeCashAccount.findUnique({
        where: { employeeId: s.employee.id },
      });
      expect(account!.currentBalance).toBe(3000);
    });

    it("holds a Manager loan for approval", async () => {
      const loan = await issueLoan(s.managerToken, {
        employeeId: s.employee.id,
        principalMinor: toMinor(1500),
        issueDate: "2026-05-01",
      });

      expect(loan.approvalStatus).toBe("PENDING");
      expect(loan.status).toBe("PENDING");
      expect(await db.employeeCashAccount.count({ where: { employeeId: s.employee.id } })).toBe(0);
    });

    it("rejects a non-positive amount", async () => {
      const res = await POST_LOAN(
        buildRequest("/api/loans", {
          token: s.adminToken,
          method: "POST",
          body: {
            employeeId: s.employee.id,
            principalMinor: 0,
            issueDate: "2026-05-01",
          },
        })
      );
      expect(res.status).toBe(400);
    });
  });

  describe("Approval pipeline", () => {
    it("lists a pending loan in the approvals queue and disburses it on approve", async () => {
      const loan = await issueLoan(s.managerToken, {
        employeeId: s.employee.id,
        principalMinor: toMinor(2000),
        issueDate: "2026-05-01",
      });

      const listRes = await GET_APPROVALS(
        buildRequest("/api/approvals?entity=loan&status=PENDING", {
          token: s.adminToken,
        })
      );
      const listJson = await listRes.json();
      expect(listRes.status).toBe(200);
      expect(listJson.data.counts.loan).toBeGreaterThanOrEqual(1);
      expect(listJson.data.items.some((i: any) => i.id === loan.id)).toBe(true);

      const approveRes = await POST_APPROVAL(
        buildRequest(`/api/approvals/loan/${loan.id}`, {
          token: s.adminToken,
          method: "POST",
          body: { action: "approve" },
        }),
        APPROVAL_PARAMS("loan", loan.id)
      );
      expect(approveRes.status).toBe(200);

      const after = await db.loan.findUnique({ where: { id: loan.id } });
      expect(after!.approvalStatus).toBe("APPROVED");
      expect(after!.status).toBe("ACTIVE");

      const txn = await db.cashTransaction.findFirst({
        where: { employeeId: s.employee.id, type: "LOAN" },
      });
      expect(txn).toBeTruthy();
      const account = await db.employeeCashAccount.findUnique({
        where: { employeeId: s.employee.id },
      });
      expect(account!.currentBalance).toBe(2000);
    });

    it("does not disburse on reject", async () => {
      const loan = await issueLoan(s.managerToken, {
        employeeId: s.employee.id,
        principalMinor: toMinor(2000),
        issueDate: "2026-05-01",
      });

      const res = await POST_APPROVAL(
        buildRequest(`/api/approvals/loan/${loan.id}`, {
          token: s.adminToken,
          method: "POST",
          body: { action: "reject", note: "too large" },
        }),
        APPROVAL_PARAMS("loan", loan.id)
      );
      expect(res.status).toBe(200);

      const after = await db.loan.findUnique({ where: { id: loan.id } });
      expect(after!.approvalStatus).toBe("REJECTED");
      expect(
        await db.cashTransaction.count({
          where: { employeeId: s.employee.id, type: "LOAN" },
        })
      ).toBe(0);
    });
  });

  describe("GET /api/loans", () => {
    it("lists loans for Admin with employee details", async () => {
      const loan = await issueLoan(s.adminToken, {
        employeeId: s.employee.id,
        principalMinor: toMinor(3000),
        issueDate: "2026-05-01",
      });

      const res = await GET_LOANS(
        buildRequest(`/api/loans?employeeId=${s.employee.id}`, { token: s.adminToken })
      );
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.data.length).toBe(1);
      expect(json.data[0].id).toBe(loan.id);
      expect(json.data[0].employee.fullName).toBeTruthy();
      expect(json.data[0].principalMinor).toBe(toMinor(3000));
    });
  });

  describe("PATCH /api/loans/[id]", () => {
    it("edits loan terms (installment, auto-deduct, due date)", async () => {
      const loan = await issueLoan(s.adminToken, {
        employeeId: s.employee.id,
        principalMinor: toMinor(3000),
        issueDate: "2026-05-01",
      });

      const res = await PATCH_LOAN(
        buildRequest(`/api/loans/${loan.id}`, {
          token: s.adminToken,
          method: "PATCH",
          body: {
            monthlyInstallmentMinor: toMinor(500),
            autoDeduct: false,
            dueDate: "2026-12-31",
          },
        }),
        LOAN_PARAMS(loan.id)
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.monthlyInstallmentMinor).toBe(toMinor(500));
      expect(json.data.autoDeduct).toBe(false);
      expect(new Date(json.data.dueDate).toISOString().slice(0, 10)).toBe("2026-12-31");
    });

    it("refuses to edit a paid loan", async () => {
      const loan = await issueLoan(s.adminToken, {
        employeeId: s.employee.id,
        principalMinor: toMinor(1000),
        issueDate: "2026-05-01",
      });
      await db.loan.update({
        where: { id: loan.id },
        data: { status: "PAID", balanceMinor: 0 },
      });

      const res = await PATCH_LOAN(
        buildRequest(`/api/loans/${loan.id}`, {
          token: s.adminToken,
          method: "PATCH",
          body: { autoDeduct: false },
        }),
        LOAN_PARAMS(loan.id)
      );
      expect(res.status).toBe(400);
    });

    it("refuses the edit from a user without cashAdvance:edit", async () => {
      const loan = await issueLoan(s.adminToken, {
        employeeId: s.employee.id,
        principalMinor: toMinor(1000),
        issueDate: "2026-05-01",
      });

      const res = await PATCH_LOAN(
        buildRequest(`/api/loans/${loan.id}`, {
          token: s.userToken,
          method: "PATCH",
          body: { autoDeduct: false },
        }),
        LOAN_PARAMS(loan.id)
      );
      expect(res.status).toBe(403);
    });
  });

  describe("POST /api/loans/[id]/repayment", () => {
    it("records a repayment and updates the balance", async () => {
      const loan = await issueLoan(s.adminToken, {
        employeeId: s.employee.id,
        principalMinor: toMinor(3000),
        issueDate: "2026-05-01",
      });

      const res = await POST_REPAYMENT(
        buildRequest(`/api/loans/${loan.id}/repayment`, {
          token: s.adminToken,
          method: "POST",
          body: { amountMinor: toMinor(1000), note: "cash back" },
        }),
        LOAN_PARAMS(loan.id)
      );
      expect(res.status).toBe(201);

      const after = await db.loan.findUnique({ where: { id: loan.id } });
      expect(after!.balanceMinor).toBe(toMinor(2000));
      const account = await db.employeeCashAccount.findUnique({
        where: { employeeId: s.employee.id },
      });
      expect(account!.currentBalance).toBe(2000);
    });

    it("rejects a repayment over the outstanding balance with 400", async () => {
      const loan = await issueLoan(s.adminToken, {
        employeeId: s.employee.id,
        principalMinor: toMinor(1000),
        issueDate: "2026-05-01",
      });

      const res = await POST_REPAYMENT(
        buildRequest(`/api/loans/${loan.id}/repayment`, {
          token: s.adminToken,
          method: "POST",
          body: { amountMinor: toMinor(5000) },
        }),
        LOAN_PARAMS(loan.id)
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/exceeds the outstanding loan balance/);
    });

    it("a Manager repayment stays pending until approved", async () => {
      const loan = await issueLoan(s.adminToken, {
        employeeId: s.employee.id,
        principalMinor: toMinor(3000),
        issueDate: "2026-05-01",
      });

      const res = await POST_REPAYMENT(
        buildRequest(`/api/loans/${loan.id}/repayment`, {
          token: s.managerToken,
          method: "POST",
          body: { amountMinor: toMinor(1000) },
        }),
        LOAN_PARAMS(loan.id)
      );
      expect(res.status).toBe(201);

      // Not applied yet: balance unchanged until the repayment is approved.
      let after = await db.loan.findUnique({ where: { id: loan.id } });
      expect(after!.balanceMinor).toBe(toMinor(3000));

      const txn = await db.cashTransaction.findFirst({
        where: { loanId: loan.id, type: "LOAN_REPAYMENT" },
      });
      expect(txn!.approvalStatus).toBe("PENDING");

      const approveRes = await POST_APPROVAL(
        buildRequest(`/api/approvals/cashTransaction/${txn!.id}`, {
          token: s.adminToken,
          method: "POST",
          body: { action: "approve" },
        }),
        APPROVAL_PARAMS("cashTransaction", txn!.id)
      );
      expect(approveRes.status).toBe(200);

      after = await db.loan.findUnique({ where: { id: loan.id } });
      expect(after!.balanceMinor).toBe(toMinor(2000));
      const account = await db.employeeCashAccount.findUnique({
        where: { employeeId: s.employee.id },
      });
      expect(account!.currentBalance).toBe(2000);
    });
  });
});
