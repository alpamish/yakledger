import { db } from "../src/lib/db";

const APPROVAL_MODELS = [
  "Expense",
  "Timesheet",
  "FuelUsage",
  "CashTransaction",
  "Transfer",
  "Attendance",
  "AssetLog",
] as const;

const ENTITY_TABLE: Record<string, string> = {
  expense: "Expense",
  employee: "Employee",
  contractor: "Contractor",
  timesheet: "Timesheet",
  fuelUsage: "FuelUsage",
  machinery: "Machinery",
  machineryRate: "MachineryRate",
  attendance: "Attendance",
  cashTransaction: "CashTransaction",
  transfer: "Transfer",
  asset: "Asset",
  fuelTransaction: "FuelTransaction",
  maintenance: "MaintenanceRecord",
  assetLog: "AssetLog",
};

async function backfillApprovalStatus() {
  console.log("=== Backfilling approvalStatus -> APPROVED ===");
  for (const model of APPROVAL_MODELS) {
    const count = await db.$executeRawUnsafe(
      `UPDATE "${model}" SET "approvalStatus"='APPROVED', "approvedAt"=COALESCE("approvedAt","createdAt") WHERE "approvalStatus"='PENDING'`
    );
    console.log(`  ${model}: ${count} rows -> APPROVED`);
  }
}

async function backfillExistingUserGrants() {
  const users = await db.user.findMany({ select: { id: true, role: true } });
  const admin = users.find((u) => u.role === "ADMIN");
  const nonAdmins = users.filter((u) => u.role !== "ADMIN");

  if (nonAdmins.length === 0) {
    console.log("=== No non-admin users; skipping record grants ===");
    return;
  }

  console.log("=== Granting existing non-admin users view access to existing records ===");
  const grantedBy = admin?.id ?? users[0]?.id;
  if (!grantedBy) {
    console.log("  No users found; skipping");
    return;
  }

  for (const user of nonAdmins) {
    for (const [entity, table] of Object.entries(ENTITY_TABLE)) {
      let ids: { id: string }[] = [];
      try {
        ids = (await db.$queryRawUnsafe(`SELECT id FROM "${table}"`)) as { id: string }[];
      } catch (e) {
        console.warn(`  Could not read ${table}: ${(e as Error).message}`);
        continue;
      }
      if (ids.length === 0) continue;

      const data = ids.map((row) => ({
        entity,
        entityId: row.id,
        userId: user.id,
        accessType: "view",
        grantedBy,
      }));

      const batchSize = 400;
      for (let i = 0; i < data.length; i += batchSize) {
        const batch = data.slice(i, i + batchSize);
        const values = batch
          .map(
            () =>
              `(lower(hex(randomblob(16))), '${entity}', ?, ?, 'view', ?, datetime('now'))`
          )
          .join(",");
        await db.$executeRawUnsafe(
          `INSERT OR IGNORE INTO "RecordAccess" ("id","entity","entityId","userId","accessType","grantedBy","createdAt") VALUES ${values}`,
          ...batch.flatMap((g) => [g.entityId, g.userId, g.grantedBy])
        );
      }
      console.log(`  ${user.email}: ${table} (${ids.length} grants)`);
    }
  }
}

async function main() {
  await backfillApprovalStatus();
  await backfillExistingUserGrants();
  console.log("Backfill complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
