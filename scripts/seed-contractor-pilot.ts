// Pilot seed for the contractor module (plan §7 rollout): one machinery
// contractor with a complete, realistic money trail, all created through the
// domain services so the ledger, balances, and derived report totals stay
// consistent:
//
//   contract (CON-#####, value 400k, retention 10%) + HOUR rate 150
//   2 approved timesheets (8h each) → claim gross 2400, FUEL deduction 150
//   advance 600 @ 25% recovery (before approval → FIFO recovers 502.5)
//   claim approved & posted → partial payment 800 → PARTIALLY_PAID
//   approved variation +25k (revised budget 425k) + pending variation +40k
//
// Idempotent: skips when the pilot contractor already exists.
// Run: bunx tsx scripts/seed-contractor-pilot.ts   (honours DATABASE_URL)
// Against a fresh DB, push the schema first:
//   bunx prisma db push --schema=prisma/schema.prisma
import { db } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth";
import { generateContractNumber } from "../src/lib/contract-number";
import { recomputeBalance } from "../src/services/contractor-ledger.service";
import {
  addDeduction,
  approveAndPostClaim,
  createClaimFromTimesheets,
  submitClaim,
} from "../src/services/contractor-claim.service";
import { createAdvance } from "../src/services/contractor-advance.service";
import { allocatePayment, recordPayment } from "../src/services/contractor-payment.service";

const PILOT_NAME = "Pilot Contractor (Demo)";

async function seed() {
  const existing = await db.contractor.findFirst({ where: { contractorName: PILOT_NAME } });
  if (existing) {
    console.log(`Pilot contractor already exists (${existing.contractorNumber ?? existing.id}) — nothing to do.`);
    return;
  }

  const admin =
    (await db.user.findFirst({ where: { role: "ADMIN" } })) ??
    (await db.user.create({
      data: {
        email: "pilot-admin@yakhshiledger.local",
        name: "Pilot Admin",
        password: await hashPassword("demo123"),
        role: "ADMIN",
      },
    }));

  // Contractor + machinery (plain reference rows — no derived money here).
  const contractor = await db.contractor.create({
    data: {
      contractorName: PILOT_NAME,
      fatherName: "Pilot",
      phoneNumber: "0799000001",
      contractorType: "MACHINERY_CONTRACTOR",
      createdBy: admin.id,
      machinery: {
        create: {
          machineryName: "Pilot Excavator",
          machineryType: "EXCAVATOR",
          hourlyRate: 150,
          hourlyConsumptionRate: 10,
          createdBy: admin.id,
        },
      },
    },
  });
  const machinery = await db.machinery.findFirstOrThrow({
    where: { assignedContractorId: contractor.id },
  });

  // Contract with a sequential CON- number (same Sequence table as the API).
  const contract = await db.$transaction(async (tx) => {
    const contractNumber = await generateContractNumber(tx);
    return tx.contractorContract.create({
      data: {
        contractNumber,
        contractorId: contractor.id,
        title: "Pilot road project contract",
        projectName: "Pilot Road Project",
        contractType: "MACHINERY_HIRE",
        value: 400000,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-12-31"),
        retentionPercent: 10,
        workHoursPerDay: 8,
        status: "ACTIVE",
        createdBy: admin.id,
      },
    });
  });

  await db.contractRate.create({
    data: {
      contractId: contract.id,
      label: "HOUR",
      rateType: "HOURLY",
      amount: 150,
      effectiveFrom: new Date("2026-01-01"),
      isDefault: true,
      createdBy: admin.id,
    },
  });

  // Two approved timesheets with contract-rate snapshots (claim fuel).
  const timesheets: { id: string }[] = [];
  for (const date of ["2026-09-05", "2026-09-12"]) {
    timesheets.push(
      await db.timesheet.create({
        data: {
          contractorId: contractor.id,
          machineryId: machinery.id,
          contractId: contract.id,
          rateLabel: "HOUR",
          rateAmount: 150,
          date: new Date(date),
          totalHours: 8,
          approvalStatus: "APPROVED",
          approvedById: admin.id,
          approvedAt: new Date(),
          createdBy: admin.id,
        },
      })
    );
  }

  // Claim from the timesheets + a fuel deduction, all via the claim engine.
  const claim = await createClaimFromTimesheets({
    contractId: contract.id,
    timesheetIds: timesheets.map((t) => t.id),
    title: "Pilot claim — September weeks 1–2",
    userId: admin.id,
  });
  const claimId = claim.id;

  await addDeduction({
    claimId,
    type: "FUEL",
    description: "Fuel recovered for September weeks",
    amount: 150,
    userId: admin.id,
  });

  // Advance BEFORE approval so the FIFO recovery lands on this claim.
  await createAdvance({
    contractorId: contractor.id,
    contractId: contract.id,
    amount: 600,
    date: new Date("2026-09-15"),
    recoveryPercent: 25,
    userId: admin.id,
  });

  await submitClaim(claimId, admin.id);
  await approveAndPostClaim(claimId, admin.id);

  // Partial payment with an explicit claim allocation (never implicit).
  const paymentResult = await recordPayment({
    contractorId: contractor.id,
    amount: 800,
    paymentDate: new Date("2026-09-20"),
    method: "BANK_TRANSFER",
    userId: admin.id,
  });
  await allocatePayment({
    paymentId: paymentResult.payment.id,
    allocations: [{ claimId, amount: 800 }],
    userId: admin.id,
  });

  // Variations: one approved (+25k applied to contract.value, like the API's
  // approve action) and one left pending so the pipeline is visible.
  const variationCount = await db.contractVariation.count({ where: { contractId: contract.id } });
  await db.$transaction(async (tx) => {
    const approvedVariation = await tx.contractVariation.create({
      data: {
        contractId: contract.id,
        variationNumber: `V${variationCount + 1}`,
        description: "Approved scope extension (extra culverts)",
        valueChange: 25000,
        effectiveFrom: new Date("2026-09-01"),
        status: "APPROVED",
        approvedById: admin.id,
        approvedAt: new Date(),
        createdBy: admin.id,
      },
    });
    await tx.contractorContract.update({
      where: { id: contract.id },
      data: { value: { increment: approvedVariation.valueChange } },
    });
    await tx.contractVariation.create({
      data: {
        contractId: contract.id,
        variationNumber: `V${variationCount + 2}`,
        description: "Proposed extra scope (pending decision)",
        valueChange: 40000,
        effectiveFrom: new Date("2026-10-15"),
        createdBy: admin.id,
      },
    });
  });

  const postedClaim = await db.contractorClaim.findUniqueOrThrow({ where: { id: claimId } });
  const updatedContract = await db.contractorContract.findUniqueOrThrow({
    where: { id: contract.id },
  });
  const balance = await recomputeBalance(contractor.id);

  console.log("Pilot contractor seeded:");
  console.log(`  contractor  ${PILOT_NAME} (${contractor.id})`);
  console.log(`  contract    ${contract.contractNumber} — "Pilot Road Project"`);
  console.log(
    `  budget      base 400,000 + approved variation 25,000 → revised ${updatedContract.value.toLocaleString("en-US")}`
  );
  console.log(
    `  claim       gross ${postedClaim.grossAmount} − deduction 150 → net ${postedClaim.netAmount}` +
      ` (retention ${postedClaim.retentionAmount}, recovered ${postedClaim.advanceRecoveryTotal},` +
      ` paid ${postedClaim.paidAmount} → outstanding ${postedClaim.netAmount - postedClaim.advanceRecoveryTotal - postedClaim.paidAmount})`
  );
  console.log(`  ledger      contractor balance ${balance} (positive = company owes the contractor)`);
  console.log("");
  console.log("Open the Contractor module and the Contractor Finance/Ops report tabs to review.");
}

seed()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
