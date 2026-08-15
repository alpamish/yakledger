import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "./auth-middleware";
import { db } from "./db";

export type AuthUser = NonNullable<Awaited<ReturnType<typeof getAuthenticatedUser>>>;

export function isAdminUser(user: Pick<AuthUser, "role">): boolean {
  return ADMIN_ROLES.includes(user.role);
}

const ADMIN_ROLES = ["ADMIN"];

const ROLE_PERMISSION_DEFAULTS: Record<string, string[]> = {
  ADMIN: ["*"],
  MANAGER: [
    "dashboard:view", "projectCost:view",
    "expenses:view", "expenses:create", "expenses:edit", "expenses:approve",
    "employees:view", "employees:create", "employees:edit", "employees:approve",
    "employees:salary:view", "employees:salary:manage",
    "employees:contract:view", "employees:contract:manage",
    "employees:documents:view", "employees:documents:manage",
    "employees:leave:view", "employees:leave:manage",
    "employees:payroll:view", "employees:payroll:manage",
    "employees:attendance:view", "employees:attendance:manage",
    "contractors:view", "contractors:create", "contractors:edit",
    "timesheets:view", "timesheets:create", "timesheets:edit", "timesheets:approve",
    "fuelUsage:view", "fuelUsage:create", "fuelUsage:edit", "fuelUsage:approve",
    "machinery:view", "machinery:create", "machinery:edit",
    "assets:view", "assets:create", "assets:edit", "assets:approve",
    "cashAdvance:view", "cashAdvance:create", "cashAdvance:approve",
    "wallets:view", "wallets:manage",
    "reports:view", "reports:generatePdf",
    "settings:view",
    "users:view", "users:create", "users:edit",
    "users:managePermissions",
  ],
  USER: [
    "dashboard:view", "projectCost:view",
    "expenses:view", "expenses:create", "expenses:edit",
    "employees:view", "employees:create", "employees:edit",
    "employees:contract:view",
    "employees:documents:view",
    "employees:leave:view", "employees:leave:manage",
    "employees:attendance:view", "employees:attendance:manage",
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
    "dashboard:view", "projectCost:view",
    "expenses:view",
    "employees:view",
    "employees:attendance:view",
    "employees:leave:view",
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
    "dashboard:view", "projectCost:view",
    "expenses:view",
    "employees:view",
    "employees:attendance:view",
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

export async function requireAnyPermission(
  request: NextRequest,
  permissions: string[]
): Promise<{ user: AuthUser } | NextResponse> {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  for (const permission of permissions) {
    const has = await checkUserPermission(user.id, user.role, permission);
    if (has) return { user };
  }

  return NextResponse.json(
    { success: false, error: "Forbidden: insufficient permissions" },
    { status: 403 }
  );
}
