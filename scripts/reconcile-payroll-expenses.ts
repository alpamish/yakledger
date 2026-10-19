/**
 * Reconcile payroll settlement counters from approved SALARY expenses.
 *
 * Marks APPROVED / PARTIALLY_PAID payrolls as PAID or PARTIALLY_PAID based on
 * the salary expenses already linked to them. Creates no new transactions:
 * no PayrollPayment, CashTransaction, Expense or AccountingEntry rows are
 * written. Idempotent — safe to run repeatedly.
 *
 * Run (honours DATABASE_URL, so it works for SQLite and Neon/Postgres):
 *
 *   bunx tsx scripts/reconcile-payroll-expenses.ts --dry-run
 *   bunx tsx scripts/reconcile-payroll-expenses.ts
 *
 * Optionally limit to specific payrolls:
 *
 *   bunx tsx scripts/reconcile-payroll-expenses.ts --payroll-id=<id> --payroll-id=<id>
 */
import { db } from "../src/lib/db";
import { fromMinor } from "../src/lib/money";
import { reconcilePayrollPaymentsFromExpenses } from "../src/services/payroll-reconcile.service";

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const payrollIds = args
    .filter((arg) => arg.startsWith("--payroll-id="))
    .map((arg) => arg.slice("--payroll-id=".length))
    .filter(Boolean);

  return reconcilePayrollPaymentsFromExpenses({
    dryRun,
    payrollIds: payrollIds.length > 0 ? payrollIds : undefined,
  });
}

main()
  .then((summary) => {
    console.log(
      `${summary.dryRun ? "[dry run] " : ""}Examined ${summary.examined} payroll(s): ` +
        `${summary.updated} updated (${summary.paid} paid, ${summary.partiallyPaid} partially paid), ` +
        `${summary.skipped} unchanged.`
    );
    console.log(
      `Paid total increased by ${fromMinor(summary.totalPaidMinorDelta)} AFN.`
    );

    for (const change of summary.changes) {
      console.log(
        `  ${change.employeeName} ${change.periodStart}–${change.periodEnd}: ` +
          `${change.previousStatus} (${fromMinor(change.previousPaidMinor)} AFN) → ` +
          `${change.nextStatus} (${fromMinor(change.nextPaidMinor)} AFN) ` +
          `from ${change.expenseCount} expense(s)`
      );
    }

    if (summary.dryRun) {
      console.log("No rows were written (dry run).");
    }
  })
  .catch((error) => {
    console.error("Payroll reconciliation failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
