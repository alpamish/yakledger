/**
 * Employee financial statement (Plan-payroll.pdf §2 action 10).
 *
 * Direction convention mirrors the employee cash-account balance
 * (`EmployeeCashAccount.currentBalance`, positive = employee owes the
 * company):
 *   DEBIT  — increases what the employee owes the company (advances,
 *            salary payments, transfers received, corrections, …)
 *   CREDIT — decreases it (returns, deductions, money earned, expenses
 *            paid on the company's behalf, transfers sent, …)
 */

export const STATEMENT_CATEGORIES = [
  "SALARY",
  "PAYMENT",
  "ADVANCE",
  "LOAN",
  "RETURN",
  "DEDUCTION",
  "TRANSFER",
  "EXPENSE",
  "REIMBURSEMENT",
  "CORRECTION",
] as const;
export type StatementCategory = (typeof STATEMENT_CATEGORIES)[number];

export const STATEMENT_CATEGORY_LABELS: Record<StatementCategory, string> = {
  SALARY: "Salary Earned",
  PAYMENT: "Salary Payment",
  ADVANCE: "Cash Advance",
  LOAN: "Loan",
  RETURN: "Cash Return",
  DEDUCTION: "Deduction",
  TRANSFER: "Transfer",
  EXPENSE: "Expense Paid",
  REIMBURSEMENT: "Reimbursement",
  CORRECTION: "Correction",
};

export type StatementEntry = {
  id: string;
  date: Date | string;
  category: StatementCategory;
  description: string;
  direction: "DEBIT" | "CREDIT";
  /** Positive magnitude in integer minor units (1 AFN = 100). */
  amountMinor: number;
  /** Informational only — not yet reflected in the cash balance. */
  memo?: boolean;
  reference?: string | null;
};

export type EmployeeStatement = {
  employeeId: string;
  employee: {
    fullName: string;
    jobTitle?: string | null;
    department?: string | null;
  } | null;
  dateFrom: Date | string | null;
  dateTo: Date | string | null;
  entries: StatementEntry[];
  /** Debit/credit totals of the listed period (memo entries excluded). */
  totals: { debitMinor: number; creditMinor: number; netMinor: number };
  /**
   * `closingMinor` is the current cash balance; `openingMinor` is the balance
   * just before `dateFrom` (derived as closing − period net).
   */
  balance: { openingMinor: number; closingMinor: number };
};
