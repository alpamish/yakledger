import "dotenv/config";
import { db } from "../src/lib/db";
import { walletService } from "../src/services/wallet.service";

// One-time backfill: recompute every employee cash account balance with the
// updated formula that includes approved employee-paid expenses.
//
// Run with: bunx tsx scripts/recompute-wallets.ts

async function main() {
  const accounts = await db.employeeCashAccount.findMany({
    select: { employeeId: true },
  });

  console.log(`Recomputing ${accounts.length} employee wallet balance(s)...`);

  for (const account of accounts) {
    const balance = await walletService.recomputeBalance(account.employeeId);
    const employee = await db.employee.findUnique({
      where: { id: account.employeeId },
      select: { fullName: true },
    });
    console.log(`  ${employee?.fullName ?? account.employeeId}: ${balance.toFixed(2)}`);
  }

  console.log("Recompute complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });