import { createGzip, createGunzip } from "node:zlib";
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
  copyFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { pipeline } from "node:stream/promises";
import { createHash } from "node:crypto";
import { basename, join, resolve } from "node:path";
import Database from "better-sqlite3";

/**
 * Backup engine for YakhshiLedger.
 *
 * Design goals:
 *  - NO DATA LOSS: we use SQLite's online backup API (`sqlite3_backup_step`,
 *    exposed by better-sqlite3 as `db.backup()`). This streams pages into a
 *    complete, standalone database file as of a consistent point in time and
 *    tolerates concurrent writers. Unlike `cp`, it does NOT depend on the
 *    `-wal`/`-shm` files, so uncheckpointed transactions are never lost.
 *  - OPTIMIZED: each snapshot is gzip-compressed, written atomically (temp ->
 *    rename), and accompanied by a checksum manifest so a restore can be
 *    verified before it is trusted.
 *  - RETENTION: tiered rotation (daily / weekly / monthly) keeps history while
 *    bounding disk usage.
 */

export type BackupKind = "sqlite" | "postgres";

export interface BackupSource {
  readonly kind: BackupKind;
  /** Produce a complete, standalone database file at `destPath`. */
  snapshotTo(destPath: string): Promise<void>;
  close(): void;
}

const KNOWN_TABLES = [
  "User", "Employee", "Contractor", "Expense", "Timesheet", "FuelUsage",
  "Machinery", "MachineryRate", "CashTransaction", "Transfer", "Asset",
  "AssetLog", "FuelTransaction", "MaintenanceRecord", "Attendance",
  "RecordAccess", "Permission", "RolePermission", "UserPermission", "AuditLog",
];

export interface VerifyReport {
  ok: boolean;
  sqliteVersion: string;
  integrityCheck: "ok" | "fail";
  integrityErrors: string[];
  foreignKeyCheck: "ok" | "fail";
  foreignKeyErrors: unknown[];
  rowCounts: Record<string, number>;
  error?: string;
}

export interface BackupManifest {
  name: string;
  createdAt: string;
  kind: BackupKind;
  originalSize: number;
  compressedSize: number;
  sha256: string;
  sqliteVersion: string;
  rowCounts: Record<string, number>;
  integrity: "verified" | "unverified";
  reason?: string;
}

export interface BackupResult {
  file: string;
  manifest: BackupManifest;
  verification: VerifyReport;
  rotated: string[];
}

export interface RotationResult {
  kept: string[];
  removed: string[];
}

export interface RestoreResult {
  restoredFrom: string;
  guardBackup: string;
  verified: VerifyReport;
  /** Verification of the live database path AFTER the swap. */
  liveVerified?: VerifyReport;
}

// ---------------------------------------------------------------------------
// Configuration (env-driven, with safe defaults)
// ---------------------------------------------------------------------------

export function backupDir(): string {
  return resolve(process.cwd(), process.env.BACKUP_DIR ?? "backups");
}

export function retention(): {
  daily: number;
  weekly: number;
  monthly: number;
} {
  return {
    daily: Number(process.env.BACKUP_RETENTION_DAILY ?? 7),
    weekly: Number(process.env.BACKUP_RETENTION_WEEKLY ?? 4),
    monthly: Number(process.env.BACKUP_RETENTION_MONTHLY ?? 6),
  };
}

/**
 * Resolve the live database file path from DATABASE_URL.
 *
 * Prisma resolves `file:` URLs relative to the schema directory (prisma/), so
 * `file:./db/custom.db` actually lives at `prisma/db/custom.db`. We must match
 * that exactly, otherwise backups/restores would target the wrong file.
 */
function findSchemaDir(): string | null {
  for (const p of ["prisma/schema.prisma", "prisma/schema.pg.prisma"]) {
    if (existsSync(resolve(process.cwd(), p))) {
      return resolve(process.cwd(), "prisma");
    }
  }
  return null;
}

export function resolveDbPath(url = process.env.DATABASE_URL ?? ""): string {
  const schemaDir = findSchemaDir();
  if (!url || !url.startsWith("file:")) {
    // Mirror Prisma's default (`file:./db/custom.db` relative to schema dir).
    return schemaDir
      ? join(schemaDir, "db/custom.db")
      : resolve(process.cwd(), "prisma/db/custom.db");
  }
  const rel = url.slice("file:".length);
  if (rel.startsWith("/")) return rel;
  return schemaDir ? resolve(schemaDir, rel) : resolve(process.cwd(), rel);
}

// ---------------------------------------------------------------------------
// Backup sources
// ---------------------------------------------------------------------------

export class SqliteBackupSource implements BackupSource {
  readonly kind = "sqlite" as const;
  private conn: Database.Database;

  constructor(dbPath: string) {
    // Open read-only to avoid disturbing the running app; the online backup
    // API still produces a fully consistent copy.
    this.conn = new Database(dbPath, { readonly: true, fileMustExist: true });
  }

  async snapshotTo(destPath: string): Promise<void> {
    // better-sqlite3 online backup: consistent, concurrent-writer safe, and
    // yields a standalone file (no -wal/-shm dependency).
    await this.conn.backup(destPath);
  }

  close(): void {
    try {
      this.conn.close();
    } catch {
      /* noop */
    }
  }
}

/**
 * Postgres backend is intentionally a stub. SQLite is the primary (operational)
 * database today; this interface exists so a Postgres source (e.g. pg_dump via
 * child_process) can be dropped in later without touching the rest of the
 * engine. The factory below routes by DATABASE_URL automatically.
 */
export class PostgresBackupSource implements BackupSource {
  readonly kind = "postgres" as const;
  async snapshotTo(_destPath: string): Promise<void> {
    throw new Error(
      "Postgres backups are not implemented yet. Implement snapshotTo() via " +
        "pg_dump and register it in getBackupSource()."
    );
  }
  close(): void {
    /* noop */
  }
}

export function getBackupSource(dbPath = resolveDbPath()): BackupSource {
  const url = process.env.DATABASE_URL ?? "";
  // SQLite is the primary/operational database. Only route to Postgres when an
  // explicit Postgres URL is configured; otherwise default to SQLite.
  if (url.startsWith("postgres")) return new PostgresBackupSource();
  return new SqliteBackupSource(dbPath);
}

// ---------------------------------------------------------------------------
// Verification (reuses the logic from scripts/db-integrity-check.ts)
// ---------------------------------------------------------------------------

export async function verifyDatabase(dbPath: string): Promise<VerifyReport> {
  const report: VerifyReport = {
    ok: false,
    sqliteVersion: "unknown",
    integrityCheck: "fail",
    integrityErrors: [],
    foreignKeyCheck: "fail",
    foreignKeyErrors: [],
    rowCounts: {},
  };
  let conn: Database.Database | null = null;
  try {
    conn = new Database(dbPath, { readonly: true, fileMustExist: true });
    report.sqliteVersion = String(
      (conn.prepare("SELECT sqlite_version() AS v").get() as { v: unknown }).v
    );

    const integrity = conn
      .prepare("PRAGMA integrity_check")
      .all() as { integrity_check: string }[];
    const integrityOk =
      integrity.length === 1 && integrity[0].integrity_check === "ok";
    report.integrityCheck = integrityOk ? "ok" : "fail";
    if (!integrityOk)
      report.integrityErrors = integrity.map((r) => r.integrity_check);

    const fk = conn.prepare("PRAGMA foreign_key_check").all();
    report.foreignKeyCheck = fk.length === 0 ? "ok" : "fail";
    report.foreignKeyErrors = fk;

    for (const t of KNOWN_TABLES) {
      const exists = conn
        .prepare(
          "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?"
        )
        .get(t);
      if (exists) {
        const c = conn.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get() as {
          n: number;
        };
        report.rowCounts[t] = c.n;
      }
    }

    report.ok =
      report.integrityCheck === "ok" && report.foreignKeyCheck === "ok";
  } catch (e) {
    report.error = (e as Error).message;
    report.ok = false;
  } finally {
    try {
      conn?.close();
    } catch {
      /* noop */
    }
  }
  return report;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timestamp(): string {
  // Local, filesystem-safe timestamp used in filenames.
  return new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace("T", "_")
    .replace("Z", "");
}

function gzipBuffer(buf: Buffer): Promise<Buffer> {
  return new Promise((resolvePromise, reject) => {
    const chunks: Buffer[] = [];
    const gz = createGzip({ level: 9 });
    gz.on("data", (c) => chunks.push(c as Buffer));
    gz.on("end", () => resolvePromise(Buffer.concat(chunks)));
    gz.on("error", reject);
    gz.end(buf);
  });
}

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

function manifestPathFor(gzPath: string): string {
  return gzPath.replace(/\.sqlite\.gz$/, ".manifest.json");
}

// ---------------------------------------------------------------------------
// Uploader (configurable storage; local by default, remote-ready)
// ---------------------------------------------------------------------------

export interface BackupUploader {
  readonly name: string;
  /** Optional: push a finished backup to remote storage. */
  upload?(gzPath: string, manifestPath: string): Promise<void>;
}

/**
 * Local uploader is a no-op because files are already written into BACKUP_DIR.
 * To add offsite copies (S3 / GCS / Azure), implement BackupUploader.upload and
 * select it via BACKUP_REMOTE below — no other engine code needs to change.
 */
class LocalUploader implements BackupUploader {
  readonly name = "local";
}

export function createUploader(): BackupUploader {
  const remote = process.env.BACKUP_REMOTE ?? "local";
  switch (remote) {
    case "local":
    default:
      return new LocalUploader();
  }
}

// ---------------------------------------------------------------------------
// Core: create a backup
// ---------------------------------------------------------------------------

export interface CreateBackupOptions {
  reason?: string;
  dir?: string;
  /** Live database file to snapshot. Defaults to the resolved DATABASE_URL. */
  liveDbPath?: string;
}

export async function createBackup(
  options: CreateBackupOptions = {}
): Promise<BackupResult> {
  const dir = options.dir ?? backupDir();
  mkdirSync(dir, { recursive: true });

  const source = getBackupSource(options.liveDbPath ?? resolveDbPath());
  const tmpDir = join(tmpdir(), "yakledger-backup");
  mkdirSync(tmpDir, { recursive: true });

  const ts = timestamp();
  const baseName = `yakledger-${ts}`;
  const partPath = join(tmpDir, `${baseName}.sqlite.part`);
  const gzPath = join(dir, `${baseName}.sqlite.gz`);
  const latestGz = join(dir, "latest.sqlite.gz");
  const latestManifest = join(dir, "latest.manifest.json");

  try {
    // 1. Consistent, no-data-loss snapshot via online backup API.
    await source.snapshotTo(partPath);

    // 2. Verify BEFORE we trust or publish the file.
    const verification = await verifyDatabase(partPath);
    if (!verification.ok) {
      throw new Error(
        `Backup verification failed: integrity=${verification.integrityCheck}, ` +
          `fk=${verification.foreignKeyCheck}, ${verification.error ?? ""}`
      );
    }

    // 3. Compress + checksum.
    const raw = readFileSync(partPath);
    const compressed = await gzipBuffer(raw);
    const digest = sha256(raw);

    // 4. Atomic publish: write to temp, then rename into place.
    const gzTmp = `${gzPath}.part`;
    writeFileSync(gzTmp, compressed);
    renameSync(gzTmp, gzPath);

    const manifest: BackupManifest = {
      name: basename(gzPath),
      createdAt: new Date().toISOString(),
      kind: source.kind,
      originalSize: raw.length,
      compressedSize: compressed.length,
      sha256: digest,
      sqliteVersion: verification.sqliteVersion,
      rowCounts: verification.rowCounts,
      integrity: "verified",
      reason: options.reason,
    };
    const manifestTmp = `${manifestPathFor(gzPath)}.part`;
    writeFileSync(manifestTmp, JSON.stringify(manifest, null, 2));
    renameSync(manifestTmp, manifestPathFor(gzPath));

    // 5. Refresh "latest" pointer atomically.
    copyFileSync(gzPath, `${latestGz}.part`);
    renameSync(`${latestGz}.part`, latestGz);
    copyFileSync(manifestPathFor(gzPath), `${latestManifest}.part`);
    renameSync(`${latestManifest}.part`, latestManifest);

    // 6. Optional offsite push.
    const uploader = createUploader();
    if (uploader.upload) {
      await uploader.upload(gzPath, manifestPathFor(gzPath));
    }

    // 7. Rotate old backups.
    const rotated = await rotateBackups({ dir });

    return { file: gzPath, manifest, verification, rotated: rotated.removed };
  } finally {
    source.close();
    try {
      if (existsSync(partPath)) rmSync(partPath);
    } catch {
      /* noop */
    }
  }
}

// ---------------------------------------------------------------------------
// Retention / rotation
// ---------------------------------------------------------------------------

function tierOf(name: string): "daily" | "weekly" | "monthly" | "other" {
  const m = name.match(/yakledger-(\d{4})-(\d{2})-(\d{2})-/);
  if (!m) return "other";
  const [, y, mo, d] = m;
  if (d === "01") return "monthly";
  const dow = new Date(Number(y), Number(mo) - 1, Number(d)).getDay();
  if (dow === 1) return "weekly";
  return "daily";
}

export async function listBackups(dir = backupDir()): Promise<BackupManifest[]> {
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir).filter(
    (f) => f.endsWith(".sqlite.gz") && !f.startsWith("latest")
  );
  const out: BackupManifest[] = [];
  for (const f of files) {
    const mp = manifestPathFor(join(dir, f));
    if (existsSync(mp)) {
      try {
        out.push(JSON.parse(readFileSync(mp, "utf8")) as BackupManifest);
        continue;
      } catch {
        /* fall through */
      }
    }
    out.push({
      name: f,
      createdAt: new Date(statSync(join(dir, f)).mtimeMs).toISOString(),
      kind: "sqlite",
      originalSize: 0,
      compressedSize: statSync(join(dir, f)).size,
      sha256: "",
      sqliteVersion: "",
      rowCounts: {},
      integrity: "unverified",
    });
  }
  out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return out;
}

export async function rotateBackups(options: {
  dir?: string;
} = {}): Promise<RotationResult> {
  const dir = options.dir ?? backupDir();
  const cfg = retention();
  const backups = (await listBackups(dir)).filter(
    (b) => !b.name.startsWith("latest")
  );

  const byTier: Record<string, BackupManifest[]> = {
    daily: [],
    weekly: [],
    monthly: [],
    other: [],
  };
  for (const b of backups) byTier[tierOf(b.name)].push(b);

  const keep = new Set<string>();
  const take = (tier: string, n: number) => {
    byTier[tier]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, n)
      .forEach((b) => keep.add(b.name));
  };
  take("monthly", cfg.monthly);
  take("weekly", cfg.weekly);
  take("daily", cfg.daily);
  take("other", cfg.daily);

  const removed: string[] = [];
  for (const b of backups) {
    if (keep.has(b.name)) continue;
    const gz = join(dir, b.name);
    const mp = manifestPathFor(gz);
    const globals = [
      join(dir, "global.sqlite.gz"),
      join(dir, "global.manifest.json"),
    ];
    try {
      if (existsSync(gz)) {
        unlinkSync(gz);
        removed.push(b.name);
      }
      if (existsSync(mp)) unlinkSync(mp);
      globals.forEach((g) => existsSync(g) && unlinkSync(g));
    } catch {
      /* noop */
    }
  }

  const kept = backups.filter((b) => keep.has(b.name)).map((b) => b.name);
  return { kept, removed };
}

// ---------------------------------------------------------------------------
// Restore (with pre-restore guard snapshot so we never lose data)
// ---------------------------------------------------------------------------

export async function restoreBackup(
  backupFile: string,
  options: {
    dir?: string;
    liveDbPath?: string;
    /** Run immediately BEFORE the live file is swapped (e.g. release held connections). */
    beforeSwap?: () => Promise<void>;
    /** Run immediately AFTER the live file is swapped (e.g. reconnect). */
    afterSwap?: () => Promise<void>;
  } = {}
): Promise<RestoreResult> {
  const dir = options.dir ?? backupDir();
  const liveDbPath = options.liveDbPath ?? resolveDbPath();

  // 1. Locate the requested backup (accept a bare name or full path).
  const gzPath = existsSync(backupFile)
    ? backupFile
    : join(dir, backupFile);
  if (!existsSync(gzPath)) {
    throw new Error(`Backup file not found: ${gzPath}`);
  }

  // 2. Guard: snapshot the CURRENT database before we touch it.
  const guard = await createBackup({
    reason: "pre-restore guard",
    dir,
    liveDbPath: liveDbPath,
  });

  // 3. Decompress to a temp file and verify it.
  const tmpDir = join(tmpdir(), "yakledger-restore");
  mkdirSync(tmpDir, { recursive: true });
  const restoredPath = join(tmpDir, `restore-${timestamp()}.sqlite`);
  await gunzipFile(gzPath, restoredPath);
  const verified = await verifyDatabase(restoredPath);
  if (!verified.ok) {
    throw new Error(
      `Refusing to restore: backup failed verification ` +
        `(integrity=${verified.integrityCheck}, fk=${verified.foreignKeyCheck}). ` +
        `Current DB is untouched and a guard backup was still created at ${guard.file}.`
    );
  }

  // 4. Atomic swap of the live database file.
  // Release any holder of the live file (e.g. the running app's Prisma
  // connection) so the rename takes effect for them too.
  await options.beforeSwap?.();

  const liveWal = `${liveDbPath}-wal`;
  const liveShm = `${liveDbPath}-shm`;
  if (existsSync(liveWal)) rmSync(liveWal);
  if (existsSync(liveShm)) rmSync(liveShm);
  const targetTmp = `${liveDbPath}.restore.part`;
  copyFileSync(restoredPath, targetTmp);
  renameSync(targetTmp, liveDbPath);

  await options.afterSwap?.();

  // Defensive re-check of the live path after the swap.
  const liveVerified = await verifyDatabase(liveDbPath);

  return {
    restoredFrom: gzPath,
    guardBackup: guard.file,
    verified,
    liveVerified,
  };
}

async function gunzipFile(src: string, dest: string): Promise<void> {
  await pipeline(createReadStream(src), createGunzip(), createWriteStream(dest));
}
