import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { resolveApprovalStatusOnCreate, APPROVED } from "@/lib/access-control";
import { walletService } from "@/services/wallet.service";
import { fromMinor } from "@/lib/money";

type Actor = { id: string; role: string };

/** Mirror of wallet.service's private helper: the balance recompute only
 * writes to an existing account, so make sure one is there first. */
async function ensureCashAccount(
  employeeId: string,
  client: Prisma.TransactionClient | typeof db = db
) {
  const existing = await client.employeeCashAccount.findUnique({
    where: { employeeId },
  });
  if (existing) return existing;
  return client.employeeCashAccount.create({ data: { employeeId } });
}

export type CreateLoanParams = {
  employeeId: string;
  principalMinor: number;
  issueDate: Date | string;
  dueDate?: Date | string | null;
  monthlyInstallmentMinor?: number | null;
  autoDeduct?: boolean;
  note?: string | null;
};

export type LoanDeductionProposal = {
  totalMinor: number;
  perLoan: { loanId: string; amountMinor: number }[];
};

/**
 * Loan lifecycle and repayment deduction (Plan-payroll.pdf §1 "Loans").
 *
 * A loan is created through the approval workflow like an advance: Admins get
 * it approved immediately, everyone else waits for an approver. Approval
 * disburses the principal as a `LOAN` cash transaction (the employee balance
 * counts it exactly like an ADVANCE) and flips the loan ACTIVE.
 *
 * Repayment happens two ways, both reducing `Loan.balanceMinor`:
 *  - manual: a `LOAN_REPAYMENT` cash transaction (may itself be pending);
 *  - payroll: `PayrollLoanAllocation` rows posted when the payroll is
 *    approved — no cash transaction, because the reduced salary payment
 *    already carries the money side.
 */
export const loanService = {
  async create(params: CreateLoanParams, user: Actor) {
    if (params.principalMinor <= 0) throw new Error("Loan amount must be positive");

    const employee = await db.employee.findUnique({
      where: { id: params.employeeId },
      select: { id: true },
    });
    if (!employee) throw new Error("Employee not found");

    const issueDate =
      typeof params.issueDate === "string" ? new Date(params.issueDate) : params.issueDate;
    const dueDate =
      params.dueDate == null
        ? null
        : typeof params.dueDate === "string"
          ? new Date(params.dueDate)
          : params.dueDate;
    const approvalStatus = resolveApprovalStatusOnCreate(user);
    const approvedNow = approvalStatus === APPROVED;

    const loan = await db.$transaction(async (tx) => {
      const created = await tx.loan.create({
        data: {
          employeeId: params.employeeId,
          principalMinor: params.principalMinor,
          balanceMinor: params.principalMinor,
          currency: "AFN",
          issueDate,
          dueDate,
          monthlyInstallmentMinor: params.monthlyInstallmentMinor ?? null,
          autoDeduct: params.autoDeduct !== false,
          status: approvedNow ? "ACTIVE" : "PENDING",
          note: params.note ?? null,
          createdById: user.id,
          approvalStatus,
          approvedById: approvedNow ? user.id : null,
          approvedAt: approvedNow ? new Date() : null,
        },
      });

      if (approvedNow) {
        await ensureCashAccount(params.employeeId, tx);
        await disburseLoan(tx, created.id, params.employeeId, params.principalMinor, params.note ?? null, user.id);
      }

      return created;
    });

    if (approvedNow) {
      await walletService.recomputeBalance(params.employeeId);
      await db.auditLog.create({
        data: {
          action: "CREATE",
          entity: "Loan",
          entityId: loan.id,
          details: `Loan of ${fromMinor(params.principalMinor)} AFN issued to ${params.employeeId}`,
          userId: user.id,
        },
      });
    }

    return loan;
  },

  /**
   * Called from the generic approval pipeline (applyWalletEffect): the loan
   * was pending, now disburse the principal and activate it. Runs inside the
   * approval transaction, so a failure rolls the approval back.
   */
  async applyApproval(loanId: string, userId: string, tx: Prisma.TransactionClient) {
    const loan = await tx.loan.findUnique({ where: { id: loanId } });
    if (!loan) throw new Error("Loan not found");
    if (loan.status === "ACTIVE") return;

    await ensureCashAccount(loan.employeeId, tx);
    await disburseLoan(tx, loan.id, loan.employeeId, loan.principalMinor, loan.note, userId);
    await tx.loan.update({
      where: { id: loan.id },
      data: { status: "ACTIVE", approvalStatus: APPROVED },
    });
    try {
      await walletService.recomputeBalance(loan.employeeId, tx);
    } catch (err) {
      console.warn("Wallet effect for loan approval failed:", err);
    }
  },

  /**
   * Record a manual repayment (cash handed back by the employee). Rejected
   * when it exceeds the outstanding balance — HR decides how to settle the
   * remainder (cash, adjustment, next payroll) outside this row.
   */
  async recordRepayment(
    opts: { loanId: string; amountMinor: number; note?: string | null },
    user: Actor
  ) {
    const { loanId, amountMinor } = opts;
    if (amountMinor <= 0) throw new Error("Amount must be positive");

    const loan = await db.loan.findUnique({ where: { id: loanId } });
    if (!loan) throw new Error("Loan not found");
    if (loan.approvalStatus !== APPROVED || loan.status !== "ACTIVE") {
      throw new Error("Only an approved loan with an outstanding balance can be repaid");
    }
    if (amountMinor > loan.balanceMinor) {
      throw new Error(
        `Repayment (${fromMinor(amountMinor)} AFN) exceeds the outstanding loan balance of ` +
          `${fromMinor(loan.balanceMinor)} AFN; HR must handle the remainder separately`
      );
    }

    const approvalStatus = resolveApprovalStatusOnCreate(user);
    const txn = await db.cashTransaction.create({
      data: {
        employeeId: loan.employeeId,
        type: "LOAN_REPAYMENT",
        amount: amountMinor / 100,
        note: opts.note ?? "Loan repayment",
        loanId: loan.id,
        createdBy: user.id,
        approvalStatus,
        approvedById: approvalStatus === APPROVED ? user.id : null,
        approvedAt: approvalStatus === APPROVED ? new Date() : null,
      },
    });

    if (approvalStatus === APPROVED) {
      await applyRepaymentToLoan(db, loan, amountMinor);
      await walletService.recomputeBalance(loan.employeeId);
    }

    return txn;
  },

  /**
   * Propose the automatic deduction for one payroll: every active loan with
   * `autoDeduct` on, oldest first — its installment (or the full remaining
   * balance when no schedule exists), capped by the salary that is still
   * payable after the advance offset. Whatever does not fit stays on the loan
   * for HR to settle separately.
   *
   * Pass `effectivePayrollId` while that payroll still holds allocations
   * (before a restore): the amounts it already deducted are treated as
   * available again, so a proposal computed during a rebuild sees the same
   * balances the rebuild will free up.
   */
  async proposeDeduction(
    employeeId: string,
    capMinor: number,
    client: Prisma.TransactionClient | typeof db = db,
    opts?: { effectivePayrollId?: string }
  ): Promise<LoanDeductionProposal> {
    if (capMinor <= 0) return { totalMinor: 0, perLoan: [] };

    const loans = await client.loan.findMany({
      where: {
        employeeId,
        approvalStatus: APPROVED,
        OR: [
          { status: "ACTIVE" },
          ...(opts?.effectivePayrollId
            ? [{ allocations: { some: { payrollId: opts.effectivePayrollId } } }]
            : []),
        ],
      },
      orderBy: { issueDate: "asc" },
      select: {
        id: true,
        balanceMinor: true,
        monthlyInstallmentMinor: true,
        autoDeduct: true,
        status: true,
        allocations: {
          where: { payrollId: opts?.effectivePayrollId ?? "__none__" },
          select: { amountMinor: true },
        },
      },
    });

    // Balances as they will be once this payroll's own allocations are
    // restored: add back what this payroll already took from each loan. A
    // loan this payroll fully paid off (status PAID) counts too — the restore
    // will bring it back to ACTIVE.
    const available = loans.map((loan) => {
      const restored = loan.allocations.reduce((s, a) => s + a.amountMinor, 0);
      return {
        id: loan.id,
        balanceMinor: loan.balanceMinor + restored,
        monthlyInstallmentMinor: loan.monthlyInstallmentMinor,
        autoDeduct: loan.autoDeduct,
        status: loan.status,
        hadOwnAllocation: restored > 0,
      };
    });

    let remaining = capMinor;
    const perLoan: LoanDeductionProposal["perLoan"] = [];
    for (const loan of available) {
      if (remaining <= 0) break;
      if (!loan.autoDeduct) continue;
      if (loan.status !== "ACTIVE" && !loan.hadOwnAllocation) continue;
      const scheduled =
        loan.monthlyInstallmentMinor && loan.monthlyInstallmentMinor > 0
          ? Math.min(loan.monthlyInstallmentMinor, loan.balanceMinor)
          : loan.balanceMinor;
      const take = Math.min(scheduled, remaining);
      if (take <= 0) continue;
      perLoan.push({ loanId: loan.id, amountMinor: take });
      remaining -= take;
    }

    return { totalMinor: capMinor - remaining, perLoan };
  },

  /**
   * Deduct `targetMinor` from the employee's active loans into this payroll.
   * Idempotent (tops itself up like allocateAdvances) and never allocates
   * more than the outstanding balances — the caller validates the target
   * first so a violation throws before anything is written.
   *
   * Distribution mirrors `proposeDeduction`: each loan is filled up to its
   * installment schedule first (oldest loan first), then any remainder — an
   * HR override above the schedules — tops up remaining balances, also
   * oldest first. What HR reviewed on the draft is what gets allocated.
   */
  async allocate(
    tx: Prisma.TransactionClient,
    employeeId: string,
    payrollId: string,
    targetMinor: number
  ): Promise<number> {
    if (targetMinor <= 0) return 0;

    const existingAgg = await tx.payrollLoanAllocation.aggregate({
      _sum: { amountMinor: true },
      where: { payrollId },
    });
    const alreadyAllocated = existingAgg._sum.amountMinor ?? 0;
    if (alreadyAllocated >= targetMinor) return alreadyAllocated;

    const loans = await tx.loan.findMany({
      where: { employeeId, status: "ACTIVE", approvalStatus: APPROVED },
      orderBy: { issueDate: "asc" },
      select: { id: true, balanceMinor: true, monthlyInstallmentMinor: true },
    });
    const available = loans.reduce((s, l) => s + l.balanceMinor, 0);
    if (alreadyAllocated + available < targetMinor) {
      throw new Error(
        `Loan deduction (${fromMinor(targetMinor)} AFN) exceeds the outstanding loan balances ` +
          `(${fromMinor(alreadyAllocated + available)} AFN); HR must adjust the deduction`
      );
    }

    let toAllocate = targetMinor - alreadyAllocated;
    const takes: { loan: (typeof loans)[number]; amountMinor: number }[] = [];

    // Pass 1: honor the installment schedule, oldest loan first.
    for (const loan of loans) {
      if (toAllocate <= 0) break;
      const scheduled =
        loan.monthlyInstallmentMinor && loan.monthlyInstallmentMinor > 0
          ? Math.min(loan.monthlyInstallmentMinor, loan.balanceMinor)
          : loan.balanceMinor;
      const amount = Math.min(scheduled, toAllocate);
      if (amount <= 0) continue;
      takes.push({ loan, amountMinor: amount });
      toAllocate -= amount;
    }

    // Pass 2: HR asked for more than the schedules cover — fill the
    // remaining balances, oldest first.
    for (const loan of loans) {
      if (toAllocate <= 0) break;
      const already = takes.find((t) => t.loan.id === loan.id)?.amountMinor ?? 0;
      const amount = Math.min(loan.balanceMinor - already, toAllocate);
      if (amount <= 0) continue;
      takes.push({ loan, amountMinor: amount });
      toAllocate -= amount;
    }

    let totalAllocated = alreadyAllocated;
    for (const { loan, amountMinor } of takes) {
      const newBalance = loan.balanceMinor - amountMinor;
      await tx.payrollLoanAllocation.create({
        data: { payrollId, loanId: loan.id, amountMinor },
      });
      await tx.loan.update({
        where: { id: loan.id },
        data: {
          balanceMinor: newBalance,
          status: newBalance === 0 ? "PAID" : "ACTIVE",
        },
      });
      totalAllocated += amountMinor;
    }

    return totalAllocated;
  },

  /**
   * Give the balances allocated to a payroll back to the loans and drop the
   * rows — the mirror image of `allocate`, used by revert / recalculation /
   * deletion so a deduction only exists while its payroll does.
   */
  async restoreAllocations(tx: Prisma.TransactionClient, payrollId: string): Promise<number> {
    const rows = await tx.payrollLoanAllocation.findMany({ where: { payrollId } });
    if (rows.length === 0) return 0;

    let restored = 0;
    for (const row of rows) {
      const loan = await tx.loan.findUnique({ where: { id: row.loanId } });
      if (!loan) continue;
      const newBalance = loan.balanceMinor + row.amountMinor;
      await tx.loan.update({
        where: { id: loan.id },
        data: {
          balanceMinor: newBalance,
          status: newBalance > 0 ? "ACTIVE" : "PAID",
        },
      });
      restored += row.amountMinor;
    }
    await tx.payrollLoanAllocation.deleteMany({ where: { payrollId } });
    return restored;
  },

  /**
   * Total of all active loan balances for an employee — the ceiling an HR
   * loan deduction can never exceed.
   */
  async outstandingTotalMinor(
    employeeId: string,
    client: Prisma.TransactionClient | typeof db = db
  ): Promise<number> {
    const agg = await client.loan.aggregate({
      _sum: { balanceMinor: true },
      where: { employeeId, status: "ACTIVE", approvalStatus: APPROVED },
    });
    return agg._sum.balanceMinor ?? 0;
  },
};

/** Create the disbursing `LOAN` cash transaction inside an existing tx. */
async function disburseLoan(
  tx: Prisma.TransactionClient,
  loanId: string,
  employeeId: string,
  principalMinor: number,
  note: string | null,
  userId: string
) {
  await tx.cashTransaction.create({
    data: {
      employeeId,
      type: "LOAN",
      amount: principalMinor / 100,
      note: note ?? "Loan issued",
      createdBy: userId,
      approvalStatus: APPROVED,
      approvedById: userId,
      approvedAt: new Date(),
      paidAt: new Date(),
    },
  });
}

/** Reduce the loan balance for a repayment that just became effective. */
async function applyRepaymentToLoan(
  client: Prisma.TransactionClient | typeof db,
  loan: { id: string; balanceMinor: number },
  amountMinor: number
) {
  const newBalance = Math.max(0, loan.balanceMinor - amountMinor);
  await client.loan.update({
    where: { id: loan.id },
    data: {
      balanceMinor: newBalance,
      status: newBalance === 0 ? "PAID" : "ACTIVE",
    },
  });
}

/**
 * Keep a pending `LOAN_REPAYMENT` cash transaction in sync with its loan when
 * the transaction is approved through the generic approval pipeline.
 */
export async function applyRepaymentApproval(
  record: { loanId?: unknown; amount?: unknown },
  tx: Prisma.TransactionClient
) {
  const loanId = typeof record.loanId === "string" ? record.loanId : null;
  const amount = typeof record.amount === "number" ? record.amount : 0;
  if (!loanId || amount <= 0) return;

  const loan = await tx.loan.findUnique({ where: { id: loanId } });
  if (!loan || loan.status !== "ACTIVE") return;
  // The balance may have shrunk while the repayment was pending (e.g. a
  // payroll deducted part of the loan). Take what is left; any excess is HR's
  // to settle separately — the loan can never go below zero.
  const amountMinor = Math.min(Math.round(amount * 100), loan.balanceMinor);
  if (amountMinor <= 0) return;
  await applyRepaymentToLoan(tx, loan, amountMinor);
}
