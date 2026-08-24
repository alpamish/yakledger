const dbUrl = process.env.DATABASE_URL ?? "";
export const isLocalDb = dbUrl.startsWith("file:");

const { PrismaClient } = isLocalDb
  ? require("@prisma/client")
  : require(".prisma/pg-client");

type PrismaClientInstance = InstanceType<typeof PrismaClient>;

/**
 * Build Prisma client options.
 *
 * Cloud (Postgres/Neon) optimization: opt into connection pooling by setting
 * PRISMA_CONNECTION_LIMIT (e.g. "10"). When set, the datasource URL is routed
 * through Neon/PgBouncer-style pooled connections (pgbouncer=true) with a
 * bounded connection limit, so serverless/cloud instances reuse connections
 * instead of opening fresh direct connections per request.
 */
function buildPrismaOptions(baseUrl: string): Record<string, unknown> {
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

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClientInstance | undefined;
};

export const db: PrismaClientInstance =
  globalForPrisma.prisma ??
  new PrismaClient(buildPrismaOptions(dbUrl));

globalForPrisma.prisma = db;