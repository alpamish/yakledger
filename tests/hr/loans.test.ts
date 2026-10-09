import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { loanService } from "@/services/loan.service";
import {
  generatePayroll,
  approvePayroll,
  revertPayroll,
  updatePayrollLine,
  getEmployeeStatement,
  getEmployeeFinancialSummary,
} from "@/services/hr.service";
import { toMinor } from "@/lib/money";

async function makeUser(role: string, email: string) {
  return db.user.create({ data: { email, name: email, password: "x", role } });
}

async function makeEmployee(userId: string) {
  return db.employee.create({
    data: {
      fullName: "Loan Emp",
      fatherName: "F",
      phoneNumber: "0700000010",
      jobTitle: "Driver",
      department: "LABOR",
      employmentType: "FULL_TIME",
      hireDate: new Date("2026-01-01"),
      status: "ACTIVE",
      createdBy: userId,
      baseSalaryMinor: toMinor(25000),
      workStartTime: "07:00",
      workEndTime: "18:00",
      breakMinutes: 60,
    },
  });
}

async function addSalary(empId: string) {
  await db.salaryHistory.create({
    data: {
      employeeId: empId,
      amountMinor: toMinor(25000),
      currency: "AFN",
      effectiveFrom: new Date("2026-01-01"),
    },
  });
}

async function junePayroll(empId: string, createdById: string) {
  const { payroll } = await generatePayroll({
    employeeId: empId,
    periodStart: new Date("2026-06-01"),
    periodEnd: new Date("2026-06-30"),
    createdById,
  });
  return payroll;
}

const GROSS = toMinor(25000); // full-month June salary

describe("Loans (Plan-payroll.pdf §1)", () => {
  let admin: any;
  let manager: any;
  let emp: any;

  beforeEach(async () => {
    admin = await makeUser("ADMIN", `loan-admin-${Date.now()}-${Math.random()}@t.co`);
    manager = await makeUser("MANAGER", `loan-mgr-${Date.now()}-${Math.random()}@t.co`);
    emp = await makeEmployee(admin.id);
    await addSalary(emp.id);
  });

  describe("Lifecycle & balance math", () => {
    it("an Admin-issued loan disburses immediately: ACTIVE, LOAN txn, balance increases", async () => {
      const loan = await loanService.create(
        { employeeId: emp.id, principalMinor: toMinor(3000), issueDate: "2026-05-01" },
        admin
      );

      expect(loan.status).toBe("ACTIVE");
      expect(loan.approvalStatus).toBe("APPROVED");
      expect(loan.balanceMinor).toBe(toMinor(3000));

      const txn = await db.cashTransaction.findFirst({
        where: { employeeId: emp.id, type: "LOAN" },
      });
      expect(txn).toBeTruthy();
      expect(Math.round(txn!.amount * 100)).toBe(toMinor(3000));

      const account = await db.employeeCashAccount.findUnique({
        where: { employeeId: emp.id },
      });
      expect(account!.currentBalance).toBe(3000);
    });

    it("a Manager-issued loan waits for approval and only disburses on approval", async () => {
      const loan = await loanService.create(
        { employeeId: emp.id, principalMinor: toMinor(2000), issueDate: "2026-05-01" },
        manager
      );

      expect(loan.status).toBe("PENDING");
      expect(loan.approvalStatus).toBe("PENDING");
      expect(await db.cashTransaction.count({ where: { employeeId: emp.id, type: "LOAN" } })).toBe(0);
      expect(await db.employeeCashAccount.count({ where: { employeeId: emp.id } })).toBe(0);

      await db.$transaction((tx) => loanService.applyApproval(loan.id, manager.id, tx));

      const after = await db.loan.findUnique({ where: { id: loan.id } });
      expect(after!.status).toBe("ACTIVE");
      expect(after!.approvalStatus).toBe("APPROVED");
      expect(await db.cashTransaction.count({ where: { employeeId: emp.id, type: "LOAN" } })).toBe(1);
      const account = await db.employeeCashAccount.findUnique({
        where: { employeeId: emp.id },
      });
      expect(account!.currentBalance).toBe(2000);
    });

    it("rejects a repayment larger than the outstanding balance", async () => {
      const loan = await loanService.create(
        { employeeId: emp.id, principalMinor: toMinor(1000), issueDate: "2026-05-01" },
        admin
      );

      await expect(
        loanService.recordRepayment(
          { loanId: loan.id, amountMinor: toMinor(2000) },
          admin
        )
      ).rejects.toThrow(/exceeds the outstanding loan balance/);
    });

    it("a manual repayment reduces the loan balance and the cash balance; full repayment marks PAID", async () => {
      const loan = await loanService.create(
        { employeeId: emp.id, principalMinor: toMinor(3000), issueDate: "2026-05-01" },
        admin
      );

      await loanService.recordRepayment(
        { loanId: loan.id, amountMinor: toMinor(1000) },
        admin
      );

      let after = await db.loan.findUnique({ where: { id: loan.id } });
      expect(after!.balanceMinor).toBe(toMinor(2000));
      expect(after!.status).toBe("ACTIVE");
      let account = await db.employeeCashAccount.findUnique({
        where: { employeeId: emp.id },
      });
      expect(account!.currentBalance).toBe(2000);

      await loanService.recordRepayment(
        { loanId: loan.id, amountMinor: toMinor(2000) },
        admin
      );

      after = await db.loan.findUnique({ where: { id: loan.id } });
      expect(after!.balanceMinor).toBe(0);
      expect(after!.status).toBe("PAID");
      account = await db.employeeCashAccount.findUnique({
        where: { employeeId: emp.id },
      });
      expect(account!.currentBalance).toBe(0);
    });
  });

  describe("Payroll auto-deduction", () => {
    it("proposes the full outstanding balance (no installment) and reduces net pay on approval", async () => {
      await loanService.create(
        { employeeId: emp.id, principalMinor: toMinor(3000), issueDate: "2026-05-01" },
        admin
      );

      const payroll = await junePayroll(emp.id, admin.id);
      const draftLine = payroll.lines[0];
      expect(draftLine.loanDeductionMinor).toBe(toMinor(3000));
      expect(draftLine.netPayableMinor).toBe(GROSS - toMinor(3000));

      await approvePayroll(payroll.id, admin.id);

      const loan = await db.loan.findFirst({ where: { employeeId: emp.id } });
      expect(loan!.balanceMinor).toBe(0);
      expect(loan!.status).toBe("PAID");

      const allocations = await db.payrollLoanAllocation.findMany({
        where: { payrollId: payroll.id },
      });
      expect(allocations).toHaveLength(1);
      expect(allocations[0].amountMinor).toBe(toMinor(3000));

      const line = await db.payrollLine.findFirst({ where: { payrollId: payroll.id } });
      expect(line!.netPayMinor).toBe(GROSS - toMinor(3000));
    });

    it("respects the monthly installment instead of the full balance", async () => {
      await loanService.create(
        {
          employeeId: emp.id,
          principalMinor: toMinor(3000),
          issueDate: "2026-05-01",
          monthlyInstallmentMinor: toMinor(500),
        },
        admin
      );

      const payroll = await junePayroll(emp.id, admin.id);
      expect(payroll.lines[0].loanDeductionMinor).toBe(toMinor(500));

      await approvePayroll(payroll.id, admin.id);
      const loan = await db.loan.findFirst({ where: { employeeId: emp.id } });
      expect(loan!.balanceMinor).toBe(toMinor(2500));
      expect(loan!.status).toBe("ACTIVE");
    });

    it("skips loans with autoDeduct off", async () => {
      await loanService.create(
        {
          employeeId: emp.id,
          principalMinor: toMinor(3000),
          issueDate: "2026-05-01",
          autoDeduct: false,
        },
        admin
      );

      const payroll = await junePayroll(emp.id, admin.id);
      expect(payroll.lines[0].loanDeductionMinor).toBe(0);
      expect(payroll.lines[0].netPayableMinor).toBe(GROSS);
    });

    it("caps the deduction at the net salary; the remainder stays on the loan", async () => {
      // 30,000 AFN loan against a 25,000 AFN salary.
      await loanService.create(
        { employeeId: emp.id, principalMinor: toMinor(30000), issueDate: "2026-05-01" },
        admin
      );

      const payroll = await junePayroll(emp.id, admin.id);
      expect(payroll.lines[0].loanDeductionMinor).toBe(GROSS);
      expect(payroll.lines[0].netPayableMinor).toBe(0);

      await approvePayroll(payroll.id, admin.id);

      const loan = await db.loan.findFirst({ where: { employeeId: emp.id } });
      expect(loan!.balanceMinor).toBe(toMinor(5000));
      expect(loan!.status).toBe("ACTIVE");

      const line = await db.payrollLine.findFirst({ where: { payrollId: payroll.id } });
      expect(line!.netPayMinor).toBe(0);
    });

    it("pays the oldest loan first when several compete for the cap", async () => {
      await loanService.create(
        {
          employeeId: emp.id,
          principalMinor: toMinor(15000),
          issueDate: "2026-03-01",
          monthlyInstallmentMinor: toMinor(10000),
        },
        admin
      );
      await loanService.create(
        {
          employeeId: emp.id,
          principalMinor: toMinor(15000),
          issueDate: "2026-04-01",
          monthlyInstallmentMinor: toMinor(10000),
        },
        admin
      );

      const payroll = await junePayroll(emp.id, admin.id);
      // Cap is the full salary: both installments fit.
      expect(payroll.lines[0].loanDeductionMinor).toBe(toMinor(20000));

      await approvePayroll(payroll.id, admin.id);
      const loans = await db.loan.findMany({
        where: { employeeId: emp.id },
        orderBy: { issueDate: "asc" },
      });
      expect(loans[0].balanceMinor).toBe(toMinor(5000));
      expect(loans[1].balanceMinor).toBe(toMinor(5000));
    });
  });

  describe("HR override", () => {
    it("an HR-entered deduction wins over the proposal and is flagged", async () => {
      await loanService.create(
        { employeeId: emp.id, principalMinor: toMinor(3000), issueDate: "2026-05-01" },
        admin
      );

      const payroll = await junePayroll(emp.id, admin.id);
      const updated = await updatePayrollLine(
        payroll.lines[0].id,
        { loanDeductionMinor: toMinor(500) },
        admin.id
      );

      const line = updated!.lines[0];
      expect(line.loanDeductionMinor).toBe(toMinor(500));
      expect(line.loanDeductionOverridden).toBe(true);
      expect(line.netPayableMinor).toBe(GROSS - toMinor(500));

      await approvePayroll(payroll.id, admin.id);
      const loan = await db.loan.findFirst({ where: { employeeId: emp.id } });
      expect(loan!.balanceMinor).toBe(toMinor(2500));
    });

    it("rejects an override larger than the net salary after advances", async () => {
      const payroll = await junePayroll(emp.id, admin.id);
      await expect(
        updatePayrollLine(
          payroll.lines[0].id,
          { loanDeductionMinor: toMinor(30000) },
          admin.id
        )
      ).rejects.toThrow(/exceeds the net salary after advances/);
    });

    it("rejects a draft override larger than the outstanding loan balances", async () => {
      await loanService.create(
        { employeeId: emp.id, principalMinor: toMinor(1000), issueDate: "2026-05-01" },
        admin
      );

      const payroll = await junePayroll(emp.id, admin.id);
      await expect(
        updatePayrollLine(
          payroll.lines[0].id,
          { loanDeductionMinor: toMinor(2000) },
          admin.id
        )
      ).rejects.toThrow(/exceeds the outstanding loan balances/);
    });

    it("editing an approved payroll rebuilds the allocations against the new target", async () => {
      await loanService.create(
        { employeeId: emp.id, principalMinor: toMinor(3000), issueDate: "2026-05-01" },
        admin
      );

      const payroll = await junePayroll(emp.id, admin.id);
      await approvePayroll(payroll.id, admin.id);
      expect(
        (await db.loan.findFirst({ where: { employeeId: emp.id } }))!.balanceMinor
      ).toBe(0);

      await updatePayrollLine(
        payroll.lines[0].id,
        { loanDeductionMinor: toMinor(1000) },
        admin.id
      );

      const loan = await db.loan.findFirst({ where: { employeeId: emp.id } });
      expect(loan!.balanceMinor).toBe(toMinor(2000));
      expect(loan!.status).toBe("ACTIVE");

      const allocations = await db.payrollLoanAllocation.findMany({
        where: { payrollId: payroll.id },
      });
      expect(allocations).toHaveLength(1);
      expect(allocations[0].amountMinor).toBe(toMinor(1000));
    });
  });

  describe("Revert restores loan balances", () => {
    it("reverting an approved payroll gives the deducted amounts back", async () => {
      await loanService.create(
        { employeeId: emp.id, principalMinor: toMinor(3000), issueDate: "2026-05-01" },
        admin
      );

      const payroll = await junePayroll(emp.id, admin.id);
      await approvePayroll(payroll.id, admin.id);
      expect(
        (await db.loan.findFirst({ where: { employeeId: emp.id } }))!.balanceMinor
      ).toBe(0);

      await revertPayroll(payroll.id, admin.id, "needs correction");

      const loan = await db.loan.findFirst({ where: { employeeId: emp.id } });
      expect(loan!.balanceMinor).toBe(toMinor(3000));
      expect(loan!.status).toBe("ACTIVE");
      expect(
        await db.payrollLoanAllocation.count({ where: { payrollId: payroll.id } })
      ).toBe(0);
    });
  });

  describe("Statement & financial summary", () => {
    it("lists loan disbursements as DEBIT and repayments as CREDIT", async () => {
      const loan = await loanService.create(
        { employeeId: emp.id, principalMinor: toMinor(3000), issueDate: "2026-05-01" },
        admin
      );
      await loanService.recordRepayment(
        { loanId: loan.id, amountMinor: toMinor(500) },
        admin
      );

      const stmt = await getEmployeeStatement(emp.id);
      const loanEntries = stmt.entries.filter((e) => e.category === "LOAN");
      expect(loanEntries).toHaveLength(2);

      const debit = loanEntries.find((e) => e.direction === "DEBIT");
      const credit = loanEntries.find((e) => e.direction === "CREDIT");
      expect(debit!.amountMinor).toBe(toMinor(3000));
      expect(credit!.amountMinor).toBe(toMinor(500));

      // Statement totals reconcile with the cash balance (2,500 AFN owed).
      expect(stmt.totals.debitMinor).toBe(toMinor(3000));
      expect(stmt.totals.creditMinor).toBe(toMinor(500));
      expect(stmt.balance.closingMinor).toBe(toMinor(2500));
    });

    it("reports issued and outstanding loan totals in the financial summary", async () => {
      const loan = await loanService.create(
        { employeeId: emp.id, principalMinor: toMinor(3000), issueDate: "2026-05-01" },
        admin
      );
      await loanService.recordRepayment(
        { loanId: loan.id, amountMinor: toMinor(1000) },
        admin
      );

      const summary = await getEmployeeFinancialSummary(emp.id);
      expect(summary.loansIssued).toBe(3000);
      expect(summary.loansOutstanding).toBe(2000);
    });
  });
});
