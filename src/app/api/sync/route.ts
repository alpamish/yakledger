import { NextRequest, NextResponse } from "next/server";
import { isLocalDb } from "@/lib/db";
import { syncAll, type TableProgress } from "@/lib/sync";
import { requirePermission } from "@/lib/permissions";

let lastSyncResult: {
  result: Awaited<ReturnType<typeof syncAll>>;
  finishedAt: string;
} | null = null;

let syncInProgress = false;

export async function GET(request: NextRequest) {
  const result = await requirePermission(request, "settings:edit");
  if ("status" in result) return result;

  return NextResponse.json({
    success: true,
    data: {
      isLocalDb,
      syncInProgress,
      lastSync: lastSyncResult
        ? {
            ...lastSyncResult.result,
            finishedAt: lastSyncResult.finishedAt,
          }
        : null,
    },
  });
}

export async function POST(request: NextRequest) {
  const result = await requirePermission(request, "settings:edit");
  if ("status" in result) return result;

  if (!isLocalDb) {
    return NextResponse.json({
      success: true,
      data: {
        message: "Already using NeonDB directly — no sync needed",
        skipped: true,
      },
    });
  }

  if (syncInProgress) {
    return NextResponse.json(
      { success: false, error: "Sync already in progress" },
      { status: 409 }
    );
  }

  syncInProgress = true;

  try {
    const { searchParams } = new URL(request.url);
    const force = searchParams.get("force") === "true";

    const progressCallback = (progress: TableProgress[]) => {
      lastSyncResult = {
        result: {
          success: true,
          tables: progress,
          startedAt: "",
          finishedAt: "",
          totalSynced: progress.reduce((s, p) => s + p.synced, 0),
          totalSkipped: progress.reduce((s, p) => s + p.skipped, 0),
          totalErrors: progress.reduce((s, p) => s + p.errors.length, 0),
        },
        finishedAt: new Date().toISOString(),
      };
    };

    const syncResult = await syncAll(force, progressCallback);

    lastSyncResult = {
      result: syncResult,
      finishedAt: new Date().toISOString(),
    };

    return NextResponse.json({ success: true, data: syncResult });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  } finally {
    syncInProgress = false;
  }
}
