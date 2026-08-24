import "dotenv/config";
import { db } from "../src/lib/db";

// One-time backfill: approve every currently PENDING record for the entities
// that have no wallet side-effect on approval (Attendance, FuelUsage,
// Timesheet). Expense / CashTransaction / Transfer are already fully approved.
//
// Run with: bunx tsx scripts/approve-all.ts

async function main() {
  const admin = await db.user.findFirst({
    where: { role: "ADMIN" },
    select: { id: true, name: true },
  });

  if (!admin) {
    console.error("No ADMIN user found. Aborting.");
    process.exit(1);
  }
  console.log(`Approving as admin: ${admin.name} (${admin.id})`);

  const now = new Date();
  const note = "Bulk approved (backfill)";

  const attendance = await db.attendance.updateMany({
    where: { approvalStatus: "PENDING" },
    data: {
      approvalStatus: "APPROVED",
      approvedById: admin.id,
      approvedAt: now,
      approvalNote: note,
    },
  });
  console.log(`  Attendance: ${attendance.count} rows -> APPROVED`);

  const fuelUsage = await db.fuelUsage.updateMany({
    where: { approvalStatus: "PENDING" },
    data: {
      approvalStatus: "APPROVED",
      approvedById: admin.id,
      approvedAt: now,
      approvalNote: note,
    },
  });
  console.log(`  FuelUsage: ${fuelUsage.count} rows -> APPROVED`);

  const timesheet = await db.timesheet.updateMany({
    where: { approvalStatus: "PENDING" },
    data: {
      approvalStatus: "APPROVED",
      approvedById: admin.id,
      approvedBy: admin.id,
      approvedAt: now,
      approvalNote: note,
    },
  });
  console.log(`  Timesheet: ${timesheet.count} rows -> APPROVED`);

  console.log("Approve-all complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
