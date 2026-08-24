import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-middleware";
import { verifyPassword } from "@/lib/auth";
import { isAdminUser } from "@/lib/permissions";
import type { AuthUser } from "@/lib/permissions";
import { db } from "@/lib/db";
import {
  createBackup,
  listBackups,
  restoreBackup,
} from "@/lib/backup";

// All backup operations are ADMIN-only.
async function requireAdmin(
  request: NextRequest
): Promise<NextResponse | { user: AuthUser }> {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }
  if (!isAdminUser(user)) {
    return NextResponse.json(
      { success: false, error: "Forbidden: admin role required" },
      { status: 403 }
    );
  }
  return { user };
}

// GET /api/backup - list existing backups
export async function GET(request: NextRequest) {
  const denied = await requireAdmin(request);
  if (denied instanceof NextResponse) return denied;
  try {
    const backups = await listBackups();
    return NextResponse.json({ success: true, data: backups });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: (e as Error).message },
      { status: 500 }
    );
  }
}

// POST /api/backup - { action: "create" } | { action: "restore", file }
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const user = admin.user;

  let body: { action?: string; reason?: string; file?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const action = body.action ?? "create";

  try {
    if (action === "restore") {
      if (!body.file) {
        return NextResponse.json(
          { success: false, error: "file is required for restore" },
          { status: 400 }
        );
      }
      if (!body.password) {
        return NextResponse.json(
          { success: false, error: "password is required for restore" },
          { status: 400 }
        );
      }
      // Re-authenticate the admin with their password before any destructive
      // operation. getAuthenticatedUser does not return the hash, so fetch it.
      const record = await db.user.findUnique({
        where: { id: user.id },
        select: { password: true },
      });
      if (!record || !(await verifyPassword(body.password, record.password))) {
        return NextResponse.json(
          { success: false, error: "Invalid password" },
          { status: 401 }
        );
      }
      const result = await restoreBackup(body.file, {
        // Release the running app's Prisma connection before the file swap and
        // reconnect afterwards, so the restored data is live without a restart.
        beforeSwap: async () => {
          await db.$disconnect();
        },
        afterSwap: async () => {
          await db.$connect();
        },
      });
      return NextResponse.json({ success: true, data: result });
    }

    if (action === "create") {
      const result = await createBackup({ reason: body.reason });
      return NextResponse.json({ success: true, data: result });
    }

    return NextResponse.json(
      { success: false, error: `Unknown action: ${action}` },
      { status: 400 }
    );
  } catch (e) {
    return NextResponse.json(
      { success: false, error: (e as Error).message },
      { status: 500 }
    );
  }
}
