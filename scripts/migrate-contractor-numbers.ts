/**
 * Contractor Number Migration
 * ---------------------------
 * One-time, idempotent migration that assigns a unique contract ID
 * (`CTR-00001`, mirroring the `Employee.employeeNumber` convention) to every
 * existing contractor that does not already have one.
 *
 * Contractors are processed in `createdAt` ascending order, starting from the
 * current highest issued number. Finally the `Sequence` counter used to issue
 * new numbers is seeded so newly-created contractors continue past the
 * backfilled range (never colliding and never reusing a number).
 *
 * Re-running is safe: contractors that already have a contractorNumber are
 * skipped, and the sequence always continues from the highest existing number.
 *
 * Run with:  npx tsx scripts/migrate-contractor-numbers.ts
 */
import "dotenv/config";
import { db } from "../src/lib/db";
import {
  CONTRACTOR_SEQUENCE_NAME,
  formatContractorNumber,
  parseContractorNumber,
} from "../src/lib/contractor-number";

async function main() {
  console.log("Starting contractor number migration...");

  const highest = await db.contractor.findFirst({
    where: { contractorNumber: { not: null } },
    orderBy: { contractorNumber: "desc" },
    select: { contractorNumber: true },
  });

  let next = 1;
  if (highest?.contractorNumber) {
    const parsed = parseContractorNumber(highest.contractorNumber);
    if (parsed !== null) next = parsed + 1;
  }

  const contractors = await db.contractor.findMany({
    where: { contractorNumber: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, contractorName: true },
  });

  let assigned = 0;

  for (const contractor of contractors) {
    await db.contractor.update({
      where: { id: contractor.id },
      data: { contractorNumber: formatContractorNumber(next) },
    });
    next++;
    assigned++;
  }

  // Seed the issuing sequence so future creates continue past the max.
  await db.sequence.upsert({
    where: { name: CONTRACTOR_SEQUENCE_NAME },
    update: { value: next - 1 },
    create: { name: CONTRACTOR_SEQUENCE_NAME, value: next - 1 },
  });

  const total = await db.contractor.count();
  const withNumber = await db.contractor.count({
    where: { contractorNumber: { not: null } },
  });

  console.log("Migration summary:");
  console.log(`  Contractors assigned: ${assigned}`);
  console.log(`  Already had a number: ${total - assigned}`);
  console.log("Verification:");
  console.log(`  Total contractors: ${total}`);
  console.log(`  With contractorNumber: ${withNumber}`);
  console.log(`  Missing after migration: ${total - withNumber}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Contractor number migration failed:", error);
    process.exit(1);
  });
