import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

// Dedicated, disposable SQLite test database (never the production file).
const TEST_DB = "file:./prisma/db/test-vitest.db";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    env: {
      DATABASE_URL: TEST_DB,
      JWT_SECRET: "vitest-test-secret",
    },
    include: ["tests/**/*.test.ts"],
    // Isolate each test file so DB state created in one file doesn't bleed
    // into another; setup.ts re-syncs schema per file.
    fileParallelism: false,
    pool: "forks",
    poolOptions: {
      forks: { singleFork: true },
    },
  },
  resolve: {
    alias: { "@": resolve(__dirname, "./src") },
  },
});
