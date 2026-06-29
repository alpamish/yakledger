export interface TableProgress {
  table: string;
  status: "pending" | "syncing" | "done" | "error";
  total: number;
  synced: number;
  skipped: number;
  errors: { rowId: string; message: string }[];
}

export interface SyncResult {
  success: boolean;
  tables: TableProgress[];
  startedAt: string;
  finishedAt: string;
  totalSynced: number;
  totalSkipped: number;
  totalErrors: number;
  error?: string;
}

type TableConfig = {
  name: string;
  batchSize: number;
};

const TABLE_ORDER: TableConfig[] = [
  { name: "User", batchSize: 50 },
  { name: "AppSettings", batchSize: 10 },
  { name: "Employee", batchSize: 50 },
  { name: "Contractor", batchSize: 50 },
  { name: "Machinery", batchSize: 50 },
  { name: "Expense", batchSize: 50 },
  { name: "Timesheet", batchSize: 100 },
  { name: "FuelUsage", batchSize: 100 },
  { name: "EmployeeCashAccount", batchSize: 50 },
  { name: "CashTransaction", batchSize: 100 },
  { name: "Transfer", batchSize: 100 },
  { name: "Asset", batchSize: 50 },
  { name: "FuelTransaction", batchSize: 100 },
  { name: "MaintenanceRecord", batchSize: 100 },
  { name: "AssetLog", batchSize: 100 },
  { name: "Attendance", batchSize: 100 },
  { name: "Permission", batchSize: 50 },
  { name: "RolePermission", batchSize: 50 },
  { name: "UserPermission", batchSize: 50 },
  { name: "AuditLog", batchSize: 200 },
];

export async function syncAll(
  force = false,
  onProgress?: (progress: TableProgress[]) => void
): Promise<SyncResult> {
  const startedAt = new Date().toISOString();
  const progress: TableProgress[] = TABLE_ORDER.map((t) => ({
    table: t.name,
    status: "pending",
    total: 0,
    synced: 0,
    skipped: 0,
    errors: [],
  }));

  const updateProgress = (idx: number, update: Partial<TableProgress>) => {
    progress[idx] = { ...progress[idx], ...update };
    onProgress?.([...progress]);
  };

  const { db } = await import("./db");
  const { neonDb } = await import("./neon-db");

  try {
    const settings = await (db as any).appSettings.findUnique({
      where: { id: "default" },
    });

    const lastSync = force ? null : (settings?.lastSyncTimestamp as Date | null);

    for (let idx = 0; idx < TABLE_ORDER.length; idx++) {
      const { name: table, batchSize } = TABLE_ORDER[idx];

      updateProgress(idx, { status: "syncing" });

      const where = lastSync
        ? { updatedAt: { gt: lastSync } }
        : {};

      let allRows: Record<string, unknown>[] = [];

      try {
        allRows = await (db as any)[table].findMany({ where } as any);
      } catch {
        allRows = await (db as any)[table].findMany();
      }

      const total = allRows.length;
      updateProgress(idx, { total });

      if (total === 0) {
        updateProgress(idx, { status: "done", synced: 0, skipped: 0 });
        continue;
      }

      let synced = 0;
      let skipped = 0;
      const errors: { rowId: string; message: string }[] = [];

      for (let i = 0; i < allRows.length; i += batchSize) {
        const batch = allRows.slice(i, i + batchSize);

        try {
          await (neonDb as any).$transaction(
            batch.map((row: Record<string, unknown>) => {
              const { id: _id, ...data } = row;
              return (neonDb as any)[table].upsert({
                where: { id: row.id },
                create: row,
                update: data,
              });
            })
          );
          synced += batch.length;
        } catch (batchErr) {
          for (const row of batch) {
            try {
              const { id: _id, ...data } = row;
              await (neonDb as any)[table].upsert({
                where: { id: row.id },
                create: row,
                update: data,
              });
              synced++;
            } catch (rowErr) {
              errors.push({
                rowId: row.id as string,
                message: rowErr instanceof Error ? rowErr.message : String(rowErr),
              });
            }
          }
        }

        updateProgress(idx, { synced, skipped, errors: [...errors] });
      }

      updateProgress(idx, {
        status: errors.length > 0 ? "done" : "done",
        synced,
        skipped,
        errors,
      });
    }

    await (db as any).appSettings.upsert({
      where: { id: "default" },
      create: { id: "default", lastSyncTimestamp: new Date() },
      update: { lastSyncTimestamp: new Date() },
    });

    const totalSynced = progress.reduce((s, p) => s + p.synced, 0);
    const totalSkipped = progress.reduce((s, p) => s + p.skipped, 0);
    const totalErrors = progress.reduce((s, p) => s + p.errors.length, 0);

    return {
      success: true,
      tables: progress,
      startedAt,
      finishedAt: new Date().toISOString(),
      totalSynced,
      totalSkipped,
      totalErrors,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return {
      success: false,
      tables: progress,
      startedAt,
      finishedAt: new Date().toISOString(),
      totalSynced: progress.reduce((s, p) => s + p.synced, 0),
      totalSkipped: progress.reduce((s, p) => s + p.skipped, 0),
      totalErrors: progress.reduce((s, p) => s + p.errors.length, 0),
      error: message,
    };
  }
}
