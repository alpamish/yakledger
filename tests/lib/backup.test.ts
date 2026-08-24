import { afterAll, beforeAll, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { existsSync, mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createBackup,
  listBackups,
  restoreBackup,
  verifyDatabase,
  resolveDbPath,
} from "@/lib/backup";

let workDir: string;
let dbPath: string;

beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), "yakledger-bktest-"));
  dbPath = join(workDir, "test.db");
  const conn = new Database(dbPath);
  conn.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE "User" (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL
    );
    CREATE TABLE "Expense" (
      id TEXT PRIMARY KEY,
      "userId" TEXT NOT NULL REFERENCES "User"(id),
      amount REAL NOT NULL
    );
    INSERT INTO "User" (id, email, name) VALUES ('u1','a@b.c','Alice'),('u2','x@y.z','Bob');
    INSERT INTO "Expense" (id, "userId", amount) VALUES ('e1','u1',100),('e2','u1',250),('e3','u2',75);
  `);
  conn.close();
});

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe("backup engine (no data loss)", () => {
  it("resolves the live db path from DATABASE_URL", () => {
    const p = resolveDbPath("file:./db/custom.db");
    expect(p).toContain("custom.db");
  });

  it("creates a verified, compressed, manifest-backed backup", async () => {
    const res = await createBackup({
      dir: workDir,
      liveDbPath: dbPath,
      reason: "test",
    });
    expect(res.verification.ok).toBe(true);
    expect(res.verification.integrityCheck).toBe("ok");
    expect(res.manifest.integrity).toBe("verified");
    expect(res.manifest.rowCounts["User"]).toBe(2);
    expect(res.manifest.rowCounts["Expense"]).toBe(3);
    expect(res.manifest.compressedSize).toBeGreaterThan(0);
    expect(res.file.endsWith(".sqlite.gz")).toBe(true);
    expect(
      existsSync(join(workDir, "latest.sqlite.gz"))
    ).toBe(true);
  });

  it("lists the backup with its manifest", async () => {
    const backups = await listBackups(workDir);
    expect(backups.length).toBeGreaterThanOrEqual(1);
    expect(backups[0].name).toContain("yakledger-");
  });

  it("round-trips a restore with a guard snapshot and no data loss", async () => {
    // Capture the original (3-expense) backup explicitly.
    const original = await createBackup({ dir: workDir, liveDbPath: dbPath, reason: "baseline" });
    const originalName = original.file.split("/").pop()!;

    // Mutate the source AFTER the backup was taken.
    const live = new Database(dbPath);
    live.exec(`INSERT INTO "Expense" (id,"userId",amount) VALUES ('e4','u2',999);`);
    expect(
      (live.prepare(`SELECT COUNT(*) AS n FROM "Expense"`).get() as { n: number }).n
    ).toBe(4);
    live.close();

    const beforeCount = (await listBackups(workDir)).length;
    const result = await restoreBackup(originalName, {
      dir: workDir,
      liveDbPath: dbPath,
    });
    expect(result.verified.ok).toBe(true);

    // A guard backup must have been taken before the restore.
    const after = await listBackups(workDir);
    expect(after.length).toBeGreaterThan(beforeCount);

    // Restored DB matches the backed-up state (3), not the mutated one (4).
    const restored = new Database(dbPath, { readonly: true });
    const expCount = restored
      .prepare(`SELECT COUNT(*) AS n FROM "Expense"`)
      .get() as { n: number };
    const userCount = restored
      .prepare(`SELECT COUNT(*) AS n FROM "User"`)
      .get() as { n: number };
    restored.close();

    expect(expCount.n).toBe(3);
    expect(userCount.n).toBe(2);
    expect(result.guardBackup).toContain("yakledger-");
    expect(result.liveVerified?.ok).toBe(true);
  });

  it("runs beforeSwap before afterSwap, around the atomic swap", async () => {
    const order: string[] = [];
    const result = await restoreBackup("latest.sqlite.gz", {
      dir: workDir,
      liveDbPath: dbPath,
      beforeSwap: async () => {
        order.push("before");
      },
      afterSwap: async () => {
        order.push("after");
      },
    });
    expect(order).toEqual(["before", "after"]);
    expect(result.liveVerified?.ok).toBe(true);
  });

  it("verifyDatabase flags a corrupted file", async () => {
    const bad = join(workDir, "corrupt.sqlite");
    const conn = new Database(bad);
    conn.exec("CREATE TABLE t(x); INSERT INTO t VALUES (1);");
    conn.close();
    // Truncate to simulate corruption.
    const buf = readFileSync(bad);
    writeFileSync(bad, buf.subarray(0, 20));
    const report = await verifyDatabase(bad);
    expect(report.ok).toBe(false);
    rmSync(bad, { force: true });
  });
});
