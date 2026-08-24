const { PrismaClient } = require(".prisma/pg-client");

type NeonPrismaClient = InstanceType<typeof PrismaClient>;

/**
 * Build Prisma client options for the Postgres (Neon) sync client.
 * Same pooling rules as src/lib/db.ts — see PRISMA_CONNECTION_LIMIT there.
 */
function buildNeonOptions(): Record<string, unknown> {
  const baseUrl = process.env.PG_DATABASE_URL ?? "";
  const options: Record<string, unknown> = {
    log:
      process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  };

  if (baseUrl.startsWith("postgres")) {
    const limit = Number(process.env.PRISMA_CONNECTION_LIMIT ?? "");
    if (limit > 0) {
      try {
        const url = new URL(baseUrl);
        if (!url.searchParams.has("connection_limit")) {
          url.searchParams.set("connection_limit", String(limit));
        }
        if (!url.searchParams.has("pgbouncer")) {
          url.searchParams.set("pgbouncer", "true");
        }
        options.datasourceUrl = url.toString();
      } catch {
        // Malformed URL — fall back to the default datasource.
      }
    }
  }

  return options;
}

const globalForNeon = globalThis as unknown as {
  neonPrisma: NeonPrismaClient | undefined;
};

export const neonDb: NeonPrismaClient =
  globalForNeon.neonPrisma ?? new PrismaClient(buildNeonOptions());

globalForNeon.neonPrisma = neonDb;