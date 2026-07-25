import { db } from "../src/lib/db";

async function main() {
  const defaultRates = await db.machineryRate.findMany({
    where: { isDefault: true },
    select: {
      id: true,
      monthlyRate: true,
      dailyRate: true,
      hourlyRate: true,
      contractDaysPerMonth: true,
      workHoursPerDay: true,
    },
  });

  if (defaultRates.length === 0) {
    console.log("No default rates found. Nothing to fix.");
    return;
  }

  let fixed = 0;
  let skipped = 0;

  for (const rate of defaultRates) {
    if (rate.contractDaysPerMonth <= 0 || rate.workHoursPerDay <= 0 || rate.monthlyRate <= 0) {
      skipped++;
      continue;
    }

    const expectedDaily = Math.round((rate.monthlyRate / rate.contractDaysPerMonth) * 100) / 100;
    const expectedHourly = Math.round((expectedDaily / rate.workHoursPerDay) * 100) / 100;

    if (rate.dailyRate !== expectedDaily || rate.hourlyRate !== expectedHourly) {
      await db.machineryRate.update({
        where: { id: rate.id },
        data: { dailyRate: expectedDaily, hourlyRate: expectedHourly },
      });
      fixed++;
      console.log(
        `  Fixed rate ${rate.id}: daily ${rate.dailyRate} -> ${expectedDaily}, hourly ${rate.hourlyRate} -> ${expectedHourly} ` +
        `(monthly=${rate.monthlyRate}, days=${rate.contractDaysPerMonth}, hours=${rate.workHoursPerDay})`
      );
    }
  }

  console.log(`\nDone! Checked ${defaultRates.length} default rates, fixed ${fixed}, skipped ${skipped}.`);
}

main().catch((error) => {
  console.error("Failed to fix machinery default rates:", error);
  process.exit(1);
});
