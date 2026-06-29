const { PrismaClient } = require(".prisma/pg-client");

const globalForNeon = globalThis as unknown as {
  neonPrisma: InstanceType<typeof PrismaClient> | undefined;
};

export const neonDb: typeof PrismaClient.prototype =
  globalForNeon.neonPrisma ??
  new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForNeon.neonPrisma = neonDb;
