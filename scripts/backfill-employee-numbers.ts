/**
 * Backfill Employee Numbers
 * -------------------------
 * One-time script that assigns EMP-XXX numbers to all employees
 * that don't have one yet, ordered by hireDate ascending.
 *
 * Uses the Sequence table so numbers are consistent with the
 * generateEmployeeNumber() function used during creation.
 *
 * Run with:  npx tsx scripts/backfill-employee-numbers.ts
 */

import { PrismaClient } from "@prisma/client";
import { generateEmployeeNumber, formatEmployeeNumber } from "../src/lib/employee-number";

const db = new PrismaClient();

async function main() {
  console.log("Starting employee number backfill...\n");

  // Find all employees without employeeNumber, ordered by hireDate
  const employees = await db.employee.findMany({
    where: { employeeNumber: null },
    orderBy: { hireDate: "asc" },
    select: { id: true, fullName: true, hireDate: true },
  });

  console.log(`Found ${employees.length} employees without employee numbers.\n`);

  if (employees.length === 0) {
    console.log("Nothing to backfill. All employees already have numbers.");
    return;
  }

  let assigned = 0;
  let failed = 0;

  for (const emp of employees) {
    try {
      const employeeNumber = await db.$transaction(async (tx) => {
        return generateEmployeeNumber(tx);
      });

      await db.employee.update({
        where: { id: emp.id },
        data: { employeeNumber },
      });

      console.log(`  ✓ ${emp.fullName} → ${employeeNumber}`);
      assigned++;
    } catch (e) {
      console.error(`  ✗ ${emp.fullName} — ${(e as Error).message}`);
      failed++;
    }
  }

  console.log("\nBackfill complete:");
  console.log(`  Assigned: ${assigned}`);
  console.log(`  Failed: ${failed}`);

  // Verify
  const remaining = await db.employee.count({ where: { employeeNumber: null } });
  console.log(`  Remaining without number: ${remaining}`);
}

main()
  .catch((e) => {
    console.error("Backfill failed:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
