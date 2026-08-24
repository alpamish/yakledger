import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "./auth-middleware";
import { db } from "./db";
import {
  ROLES,
  ROLE_PERMISSIONS,
  resolveRolePermissions,
} from "./permission-catalog";

export type AuthUser = NonNullable<Awaited<ReturnType<typeof getAuthenticatedUser>>>;

export { ROLES };

const ADMIN_ROLES = ["ADMIN"];

export function isAdminUser(user: Pick<AuthUser, "role">): boolean {
  return ADMIN_ROLES.includes(user.role);
}

const ROLE_PERMISSION_CACHE = new Map<string, string[]>();

/**
 * Effective base permissions for a role, including the reference-list
 * dependencies (content:*, wallets:view, etc.) that create/edit forms need.
 */
function resolvedRolePermissions(role: string): string[] {
  const cached = ROLE_PERMISSION_CACHE.get(role);
  if (cached) return cached;

  if (ADMIN_ROLES.includes(role) || ROLE_PERMISSIONS[role]?.includes("*")) {
    const adminPerms = resolveRolePermissions(role);
    ROLE_PERMISSION_CACHE.set(role, adminPerms);
    return adminPerms;
  }

  const perms = resolveRolePermissions(role);
  ROLE_PERMISSION_CACHE.set(role, perms);
  return perms;
}

export async function checkUserPermission(
  userId: string,
  role: string,
  permission: string
): Promise<boolean> {
  if (ADMIN_ROLES.includes(role)) return true;

  const rolePerms = resolvedRolePermissions(role);
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

  const rolePerms = resolvedRolePermissions(role) ?? [];
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