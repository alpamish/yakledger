#!/usr/bin/env bun
/**
 * YakhshiLedger backup CLI.
 *
 *   bun scripts/backup.ts                # create + rotate
 *   bun scripts/backup.ts --list         # list existing backups
 *   bun scripts/backup.ts --restore <file>
 *   bun scripts/backup.ts --dir <path> --reason "nightly"
 *
 * Uses the online-backup engine in src/lib/backup.ts: consistent, no-data-loss
 * snapshots of the live SQLite database.
 */
import "dotenv/config";
import { createInterface } from "node:readline/promises";
import {
  backupDir,
  createBackup,
  listBackups,
  restoreBackup,
  rotateBackups,
  retention,
} from "../src/lib/backup";
import { db } from "../src/lib/db";
import { verifyPassword } from "../src/lib/auth";

async function prompt(question: string, silent = false): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    // Minimal silent input: readline has no built-in mask; we accept plain input.
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };

  const dir = get("--dir");
  const reason = get("--reason");
  const restoreFile = get("--restore");
  const doList = args.includes("--list");
  const doRotate = args.includes("--rotate");
  const skipConfirm = args.includes("--yes");

  if (restoreFile) {
    // --- Data-loss warning + explicit confirmation ---
    console.warn("\n⚠️  WARNING: Restoring will REPLACE the current database.");
    console.warn(
      "Existing live data will be overwritten. A guard backup is taken\n" +
        "automatically first so this can be undone, but only proceed if you\n" +
        "intend to roll back to the selected backup.\n"
    );
    if (!skipConfirm) {
      const ok = await prompt('Type YES to confirm data loss: ');
      if (ok.toUpperCase() !== "YES") {
        console.log("Aborted. No changes made.");
        return;
      }
    }

    // --- Optional password re-authentication (admin) ---
    let password = get("--password");
    let email = get("--email");
    if (!password) {
      password = await prompt("Admin password (Enter to skip): ");
    }
    if (password) {
      if (!email) email = await prompt("Admin email: ");
      const u = await db.user.findUnique({
        where: { email },
        select: { role: true, password: true },
      });
      if (!u || u.role !== "ADMIN" || !(await verifyPassword(password, u.password))) {
        console.error("Password verification failed. Aborting.");
        process.exit(1);
      }
      console.log("Password verified.");
    }

    console.log(`Restoring from ${restoreFile} ...`);
    const res = await restoreBackup(restoreFile, dir ? { dir } : {});
    console.log("Restore complete.");
    console.log(`  restored from : ${res.restoredFrom}`);
    console.log(`  guard backup : ${res.guardBackup}`);
    console.log(
      `  verified      : integrity=${res.verified.integrityCheck}, fk=${res.verified.foreignKeyCheck}`
    );
    if (res.liveVerified) {
      console.log(
        `  live db       : integrity=${res.liveVerified.integrityCheck}, fk=${res.liveVerified.foreignKeyCheck}`
      );
    }
    return;
  }

  if (doList) {
    const backups = await listBackups(dir ?? backupDir());
    console.log(`Backups in ${dir ?? backupDir()} (${backups.length}):`);
    for (const b of backups) {
      console.log(
        `  ${b.name}  ${b.integrity}  orig=${b.originalSize}B comp=${b.compressedSize}B  rows=${Object.values(b.rowCounts).reduce((a, c) => a + c, 0)}`
      );
    }
    return;
  }

  console.log("Creating backup ...");
  const res = await createBackup({ reason, dir });
  console.log("Backup created:");
  console.log(`  file    : ${res.file}`);
  console.log(`  size    : ${res.manifest.originalSize}B -> ${res.manifest.compressedSize}B (gzip)`);
  console.log(`  sha256  : ${res.manifest.sha256}`);
  console.log(`  version : SQLite ${res.manifest.sqliteVersion}`);
  console.log(
    `  integrity: ${res.verification.integrityCheck} / fk=${res.verification.foreignKeyCheck}`
  );
  console.log(`  rotated : ${res.rotated.length} old backup(s) removed`);

  if (doRotate) {
    const r = await rotateBackups({ dir });
    console.log(`  keep=${r.kept.length} removed=${r.removed.length}`);
  }

  const cfg = retention();
  console.log(
    `Retention: daily=${cfg.daily} weekly=${cfg.weekly} monthly=${cfg.monthly}`
  );
}

main()
  .catch((e) => {
    console.error("Backup failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(async () => {
    try {
      await db.$disconnect();
    } catch {
      /* noop */
    }
  });
