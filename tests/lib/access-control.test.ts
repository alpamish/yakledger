import {
  isAdmin,
  buildAccessScope,
  buildListScope,
  buildAggregateScope,
  withScope,
  resolveApprovalStatusOnCreate,
  resolveApprovalStatusOnEdit,
  APPROVED,
  PENDING,
  REJECTED,
  isApprovalEntity,
} from "@/lib/access-control";
import { db } from "@/lib/db";
import type { AuthUser } from "@/lib/permissions";

// Minimal AuthUser shape the access-control helpers expect.
// Seed real User rows so FK-constrained relations (RecordAccess, UserPermission)
// can reference them. These ids deliberately do NOT collide with seeded data.
beforeAll(async () => {
  await db.user.createMany({
    data: [
      { id: "u_admin", email: "admin@test.local", name: "admin", password: "hash", role: "ADMIN" },
      { id: "u_regular", email: "regular@test.local", name: "regular", password: "hash", role: "USER" },
      { id: "u_watcher", email: "watcher@test.local", name: "watcher", password: "hash", role: "WATCHER" },
    ],
  });
});

const adminUser = { id: "u_admin", role: "ADMIN" } as AuthUser;
const regularUser = { id: "u_regular", role: "USER" } as AuthUser;
const watcherUser = { id: "u_watcher", role: "WATCHER" } as AuthUser;

describe("access-control helpers (pure)", () => {
  it("isAdmin recognises ADMIN and rejects everything else", () => {
    expect(isAdmin({ role: "ADMIN" })).toBe(true);
    expect(isAdmin({ role: "MANAGER" })).toBe(false);
    expect(isAdmin({ role: "USER" })).toBe(false);
  });

  it("isApprovalEntity classifies the approval entity set", () => {
    expect(isApprovalEntity("expense")).toBe(true);
    expect(isApprovalEntity("timesheet")).toBe(true);
    expect(isApprovalEntity("assetLog")).toBe(true);
    expect(isApprovalEntity("employee")).toBe(false);
    expect(isApprovalEntity("machine")).toBe(false);
  });

  it("resolveApprovalStatusOnCreate returns APPROVED for admins, PENDING otherwise", () => {
    expect(resolveApprovalStatusOnCreate(adminUser)).toBe(APPROVED);
    expect(resolveApprovalStatusOnCreate(regularUser)).toBe(PENDING);
  });

  it("resolveApprovalStatusOnEdit escalates re-approval for non-admins editing approved records", () => {
    // Admin always yields APPROVED.
    expect(resolveApprovalStatusOnEdit(adminUser, APPROVED)).toBe(APPROVED);
    // Non-admin editing an already-approved record is sent back to review.
    expect(resolveApprovalStatusOnEdit(regularUser, APPROVED)).toBe(PENDING);
    // Non-admin editing a pending record keeps it pending.
    expect(resolveApprovalStatusOnEdit(regularUser, PENDING)).toBe(PENDING);
    // Non-admin editing a rejected record resubmits it as pending.
    expect(resolveApprovalStatusOnEdit(regularUser, REJECTED)).toBe(PENDING);
    // Nullish current status defaults to PENDING for non-admins.
    expect(resolveApprovalStatusOnEdit(regularUser, null)).toBe(PENDING);
    expect(resolveApprovalStatusOnEdit(regularUser, undefined)).toBe(PENDING);
  });

  it("approval status constants are the canonical strings", () => {
    expect(APPROVED).toBe("APPROVED");
    expect(PENDING).toBe("PENDING");
    expect(REJECTED).toBe("REJECTED");
  });
});

describe("access-control.withScope", () => {
  it("returns the base clause untouched for an empty (admin) scope", () => {
    const base = { amount: { gte: 10 } };
    expect(withScope(base, {})).toEqual(base);
  });

  it("nests base + scope under AND when a scope is present", () => {
    const base = { amount: { gte: 10 } };
    const scope = { OR: [{ createdBy: "u_regular" }] };
    const merged = withScope(base, scope);
    expect(merged).toEqual({ AND: [base, scope] });
  });
});

describe("access-control.buildAccessScope", () => {
  it("admin gets an unrestricted (empty) scope", async () => {
    expect(await buildAccessScope(adminUser, "expense")).toEqual({});
  });

  it("a non-admin user is scoped to records they created or were granted access to", async () => {
    // Seed an explicit record-access grant for the regular user.
    await db.recordAccess.create({
      data: {
        entity: "expense",
        entityId: "exp_granted",
        userId: "u_regular",
        grantedBy: "u_admin",
      },
    });

    const scope = await buildAccessScope(regularUser, "expense");
    // Owner clause always present; granted id adds an IN membership.
    expect(scope).toEqual({
      OR: [{ createdBy: "u_regular" }, { id: { in: ["exp_granted"] } }],
    });
  });

  it("a non-admin with no grants is scoped only to own records", async () => {
    // WATCHER has no create/edit perms, so no reference content:* deps apply.
    const scope = await buildAccessScope(watcherUser, "contractor");
    expect(scope).toEqual({ OR: [{ createdBy: "u_watcher" }] });
  });

  it("a content-permission grant relaxes the scope to unrestricted for that entity", async () => {
    await db.permission.upsert({
      where: { name: "content:machinery" },
      update: {},
      create: { name: "content:machinery", label: "Use Machinery Reference List", module: "content" },
    });
    const perm = await db.permission.findUniqueOrThrow({ where: { name: "content:machinery" } });
    await db.userPermission.upsert({
      where: { userId_permissionId: { userId: "u_watcher", permissionId: perm.id } },
      update: { granted: true },
      create: { userId: "u_watcher", permissionId: perm.id, granted: true },
    });

    expect(await buildAccessScope(watcherUser, "machinery")).toEqual({});
    expect(await buildAccessScope(watcherUser, "employee")).toEqual({
      OR: [{ createdBy: "u_watcher" }],
    });
  });
});

describe("access-control.buildListScope (creator sees own records at any status)", () => {
  it("admin list scope for an approval entity keeps only approved + rejected", async () => {
    expect(await buildListScope(adminUser, "expense")).toEqual({
      approvalStatus: { in: [APPROVED, REJECTED] },
    });
  });

  it("non-admin list scope includes own records at any status (pending visible to creator)", async () => {
    // u_regular has a grant on exp_granted from the buildAccessScope test.
    expect(await buildListScope(regularUser, "expense")).toEqual({
      OR: [
        { createdBy: "u_regular" },
        { AND: [{ approvalStatus: APPROVED }, { id: { in: ["exp_granted"] } }] },
      ],
    });
  });

  it("non-approval entities fall back to buildAccessScope", async () => {
    expect(await buildListScope(regularUser, "employee")).toEqual(
      await buildAccessScope(regularUser, "employee")
    );
  });
});

describe("access-control.buildAggregateScope (only approved counted)", () => {
  it("admin aggregate scope for an approval entity keeps only approved", async () => {
    expect(await buildAggregateScope(adminUser, "expense")).toEqual({
      approvalStatus: APPROVED,
    });
  });

  it("non-admin aggregate scope counts approved only (own + granted)", async () => {
    expect(await buildAggregateScope(regularUser, "expense")).toEqual({
      OR: [
        { createdBy: "u_regular", approvalStatus: APPROVED },
        { AND: [{ approvalStatus: APPROVED }, { id: { in: ["exp_granted"] } }] },
      ],
    });
  });

  it("non-approval entities fall back to buildAccessScope", async () => {
    expect(await buildAggregateScope(regularUser, "employee")).toEqual(
      await buildAccessScope(regularUser, "employee")
    );
  });
});
