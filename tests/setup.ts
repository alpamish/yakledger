import { execSync } from "node:child_process";
import { db } from "@/lib/db";

// Ensure the test schema is present (idempotent; creates the file on first run).
// --accept-data-loss: schema changes (e.g. new unique constraints) that would
// otherwise prompt for confirmation in a non-interactive shell must be allowed.
execSync("npx prisma db push --schema=prisma/schema.prisma --skip-generate --accept-data-loss", {
  stdio: "ignore",
  env: { ...process.env },
});

// Reset *data* (not the file) so every test file starts from an empty DB.
// Rows are cleared regardless of FK order by temporarily suspending FK checks.
await db.$executeRawUnsafe(`PRAGMA foreign_keys = OFF;`);
const tables = await db.$queryRaw<{ name: string }[]>`
  SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_prisma%' AND name NOT LIKE 'sqlite_%';
`;
for (const { name } of tables) {
  await db.$executeRawUnsafe(`DELETE FROM "${name}";`);
}
await db.$executeRawUnsafe(`PRAGMA foreign_keys = ON;`);
