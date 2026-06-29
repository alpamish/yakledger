import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "./auth-middleware";
import { db } from "./db";

export type AuthUser = NonNullable<Awaited<ReturnType<typeof getAuthenticatedUser>>>;

const ADMIN_ROLES = ["ADMIN"];

const ROLE_PERMISSION_DEFAULTS: Record<string, string[]> = {
  ADMIN: ["*"],
  MANAGER: [
    "dashboard:view",
    "expenses:view", "expenses:create", "expenses:edit",
    "employees:view", "employees:create", "employees:edit",
    "contractors:view", "contractors:create", "contractors:edit",
    "timesheets:view", "timesheets:create", "timesheets:edit", "timesheets:approve",
    "fuelUsage:view", "fuelUsage:create", "fuelUsage:edit",
    "machinery:view", "machinery:create", "machinery:edit",
    "assets:view", "assets:create", "assets:edit",
    "cashAdvance:view", "cashAdvance:create",
    "reports:view",
    "settings:view",
  ],
  USER: [
    "dashboard:view",
    "expenses:view", "expenses:create", "expenses:edit",
    "employees:view", "employees:create", "employees:edit",
    "contractors:view", "contractors:create", "contractors:edit",
    "timesheets:view", "timesheets:create", "timesheets:edit",
    "fuelUsage:view", "fuelUsage:create", "fuelUsage:edit",
    "machinery:view", "machinery:create", "machinery:edit",
    "assets:view", "assets:create", "assets:edit",
    "cashAdvance:view", "cashAdvance:create",
    "reports:view",
    "settings:view",
  ],
  WATCHER: [
    "dashboard:view",
    "expenses:view",
    "employees:view",
    "contractors:view",
    "timesheets:view",
    "fuelUsage:view",
    "machinery:view",
    "assets:view",
    "cashAdvance:view",
    "reports:view",
    "settings:view",
  ],
  TIMESHEET_USER: [
    "dashboard:view",
    "expenses:view",
    "employees:view",
    "contractors:view",
    "timesheets:view", "timesheets:create", "timesheets:edit",
    "fuelUsage:view",
    "machinery:view",
    "cashAdvance:view",
    "reports:view",
  ],
};

export async function checkUserPermission(
  userId: string,
  role: string,
  permission: string
): Promise<boolean> {
  if (ADMIN_ROLES.includes(role)) return true;

  const rolePerms = ROLE_PERMISSION_DEFAULTS[role];
  if (!rolePerms) return false;

  if (rolePerms.includes("*")) return true;

  const hasByRole = rolePerms.includes(permission);

  const perm = await db.permission.findUnique({ where: { name: permission } });
  if (!perm) return hasByRole;

  const override = await db.userPermission.findUnique({
    where: { userId_permissionId: { userId, permissionId: perm.id } },
  });

  if (override) return override.granted;

  return hasByRole;
}

export async function getEffectivePermissions(userId: string, role: string): Promise<Record<string, boolean>> {
  if (ADMIN_ROLES.includes(role)) {
    return { "*": true };
  }

  const rolePerms = ROLE_PERMISSION_DEFAULTS[role] ?? [];
  const perms: Record<string, boolean> = {};
  for (const p of rolePerms) perms[p] = true;

  const overrides = await db.userPermission.findMany({
    where: { userId },
    include: { permission: true },
  });

  for (const ov of overrides) {
    perms[ov.permission.name] = ov.granted;
  }

  return perms;
}

export async function requirePermission(
  request: NextRequest,
  permission: string
): Promise<{ user: AuthUser } | NextResponse> {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const has = await checkUserPermission(user.id, user.role, permission);
  if (!has) {
    return NextResponse.json(
      { success: false, error: "Forbidden: insufficient permissions" },
      { status: 403 }
    );
  }

  return { user };
}
