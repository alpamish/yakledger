const dbUrl = process.env.DATABASE_URL ?? "";
export const isLocalDb = dbUrl.startsWith("file:");

const { PrismaClient } = isLocalDb
  ? require("@prisma/client")
  : require(".prisma/pg-client");

const globalForPrisma = globalThis as unknown as {
  prisma: InstanceType<typeof PrismaClient> | undefined;
};

export const db: typeof PrismaClient.prototype =
  globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
