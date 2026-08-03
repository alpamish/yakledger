import { db } from "./db";
import type { AuthUser } from "./permissions";

export const APPROVAL_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const APPROVED = "APPROVED" as const;
export const PENDING = "PENDING" as const;
export const REJECTED = "REJECTED" as const;

export const RECORD_ENTITIES = [
  "expense",
  "employee",
  "contractor",
  "timesheet",
  "fuelUsage",
  "machinery",
  "machineryRate",
  "attendance",
  "cashTransaction",
  "transfer",
  "asset",
  "fuelTransaction",
  "maintenance",
  "assetLog",
] as const;
export type RecordEntity = (typeof RECORD_ENTITIES)[number];

export const APPROVAL_ENTITIES = new Set<string>([
  "expense",
  "timesheet",
  "fuelUsage",
  "cashTransaction",
  "transfer",
  "attendance",
  "assetLog",
]);

export function isAdmin(user: { role: string }): boolean {
  return user.role === "ADMIN";
}

export function isApprovalEntity(entity: string): boolean {
  return APPROVAL_ENTITIES.has(entity);
}

export function approvedOnly(): { approvalStatus: ApprovalStatus } {
  return { approvalStatus: APPROVED };
}

/**
 * Build a Prisma `where` clause that restricts access to records the user
 * created OR was explicitly granted access to. Admins get an empty scope
 * (i.e. unrestricted access).
 */
export async function buildAccessScope(
  user: AuthUser,
  entity: string
): Promise<Record<string, unknown>> {
  if (isAdmin(user)) return {};

  const grants = await db.recordAccess.findMany({
    where: { entity, userId: user.id },
    select: { entityId: true },
  });

  const grantedIds = grants.map((g) => g.entityId);

  const or: Record<string, unknown>[] = [{ createdBy: user.id }];
  if (grantedIds.length > 0) {
    or.push({ id: { in: grantedIds } });
  }

  return { OR: or };
}

/**
 * Combine a base where clause with an access scope without clobbering any
 * existing `OR`/`AND` filters (e.g. search queries). Admin scope is empty
 * and returns the base unchanged.
 */
export function withScope<T extends Record<string, unknown>>(
  base: T,
  scope: Record<string, unknown>
): T {
  if (Object.keys(scope).length === 0) return base;
  return { AND: [base, scope] } as unknown as T;
}

/**
 * A single-record lookup that also enforces ownership/grant access.
 * Returns the record or null (callers return 404).
 */
export async function findAccessibleRecord<
  T extends { id: string; createdBy: string }
>(
  user: AuthUser,
  entity: string,
  id: string,
  fetcher: (where: Record<string, unknown>) => Promise<T | null>
): Promise<T | null> {
  const scope = await buildAccessScope(user, entity);
  return fetcher(withScope({ id }, scope));
}

/**
 * Can the user view this record? Admin, owner, or granted access.
 */
export async function canViewRecord(
  user: AuthUser,
  entity: string,
  record: { id: string; createdBy: string }
): Promise<boolean> {
  if (isAdmin(user)) return true;
  if (record.createdBy === user.id) return true;
  const grant = await db.recordAccess.findUnique({
    where: {
      entity_entityId_userId: { entity, entityId: record.id, userId: user.id },
    },
  });
  return !!grant;
}

/**
 * Can the user edit/manage this record? Admin, owner, or an explicit
 * `edit` access grant.
 */
export async function canManageRecord(
  user: AuthUser,
  entity: string,
  record: { id: string; createdBy: string }
): Promise<boolean> {
  if (isAdmin(user)) return true;
  if (record.createdBy === user.id) return true;

  const grant = await db.recordAccess.findUnique({
    where: {
      entity_entityId_userId: { entity, entityId: record.id, userId: user.id },
    },
  });
  return !!grant && grant.accessType === "edit";
}

/**
 * What should a record's approval status become after a create/edit?
 * - Admin-created/edited records are always valid immediately.
 * - Non-admin edits to an already-approved record send it back to PENDING
 *   for re-approval.
 */
export function resolveApprovalStatusOnEdit(
  user: { role: string },
  current?: string | null
): ApprovalStatus {
  if (isAdmin(user)) return APPROVED;
  if (current === APPROVED) return PENDING;
  return (current as ApprovalStatus) || PENDING;
}

export function resolveApprovalStatusOnCreate(user: { role: string }): ApprovalStatus {
  return isAdmin(user) ? APPROVED : PENDING;
}
