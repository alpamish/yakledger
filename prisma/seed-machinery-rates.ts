import { db } from "../src/lib/db";

async function main() {
  const machineries = await db.machinery.findMany({
    select: { id: true, machineryName: true },
  });

  if (machineries.length === 0) {
    console.log("No machinery found. Nothing to migrate.");
    return;
  }

  // Find the first user to use as creator for default rates
  const firstUser = await db.user.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  if (!firstUser) {
    console.error("No users found. Cannot create rates without a creator.");
    process.exit(1);
  }

  let rateCount = 0;
  let timesheetUpdateCount = 0;

  for (const m of machineries) {
    const existing = await db.machinery.findUnique({
      where: { id: m.id },
      select: {
        monthlyRate: true,
        dailyRate: true,
        hourlyRate: true,
        contractDaysPerMonth: true,
        workHoursPerDay: true,
      },
    });
    if (!existing) continue;

    // Check if a default rate already exists for this machinery
    const existingDefault = await db.machineryRate.findFirst({
      where: { machineryId: m.id, isDefault: true },
    });
    if (existingDefault) {
      console.log(`  Skipping ${m.machineryName} — default rate already exists`);
      continue;
    }

    const rate = await db.machineryRate.create({
      data: {
        machineryId: m.id,
        rateName: "Default",
        monthlyRate: existing.monthlyRate,
        dailyRate: existing.dailyRate,
        hourlyRate: existing.hourlyRate,
        contractDaysPerMonth: existing.contractDaysPerMonth,
        workHoursPerDay: existing.workHoursPerDay,
        isDefault: true,
        createdBy: firstUser.id,
      },
    });
    rateCount++;

    // Update existing timesheets for this machinery to use the new default rate
    const result = await db.timesheet.updateMany({
      where: { machineryId: m.id, machineryRateId: null },
      data: { machineryRateId: rate.id },
    });
    timesheetUpdateCount += result.count;

    console.log(`  ${m.machineryName}: created default rate, linked ${result.count} timesheets`);
  }

  console.log(`\nDone! Created ${rateCount} default rates, updated ${timesheetUpdateCount} timesheets.`);
}

main().catch((error) => {
  console.error("Failed to migrate machinery rates:", error);
  process.exit(1);
});
