import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const orphans = await prisma.fuelTransaction.findMany({
    where: { type: "ISSUE", contractorId: null, assetId: null },
    select: { id: true, date: true, quantity: true, fuelType: true, containerId: true },
  });

  if (orphans.length === 0) {
    console.log("No orphan FuelTransaction records found.");
    return;
  }

  console.log(`Found ${orphans.length} orphan ISSUE records (no contractorId, no assetId):`);
  let totalQty = 0;
  for (const r of orphans) {
    console.log(`  ${r.id} | ${r.date.toISOString().split("T")[0]} | ${r.fuelType} | ${r.quantity}L`);
    totalQty += r.quantity;
  }
  console.log(`Total quantity to restore: ${totalQty}L\n`);

  const ids = orphans.map((r) => r.id);

  await prisma.$transaction(async (tx) => {
    const deletedUsages = await tx.fuelUsage.deleteMany({
      where: { fuelTransactionId: { in: ids } },
    });
    console.log(`Deleted ${deletedUsages.count} linked FuelUsage record(s).`);

    const deletedTx = await tx.fuelTransaction.deleteMany({
      where: { id: { in: ids } },
    });
    console.log(`Deleted ${deletedTx.count} FuelTransaction record(s).`);
  });

  console.log("\nDone. Container stock balances will automatically reflect the restoration on next read.");
}

main()
  .catch((e) => {
    console.error("Cleanup failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
