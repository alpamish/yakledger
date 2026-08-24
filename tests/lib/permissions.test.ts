import { checkUserPermission, getEffectivePermissions } from "@/lib/permissions";
import { db } from "@/lib/db";

describe("permissions (role defaults)", () => {
  it("ADMIN always resolves every permission", async () => {
    for (const perm of [
      "expenses:view",
      "expenses:delete",
      "users:managePermissions",
      "settings:*",
    ]) {
      expect(await checkUserPermission("u_admin", "ADMIN", perm)).toBe(true);
    }
  });

  it("MANAGER has approve/manage perms but NOT delete", async () => {
    expect(await checkUserPermission("u_mgr", "MANAGER", "expenses:approve")).toBe(true);
    expect(await checkUserPermission("u_mgr", "MANAGER", "users:managePermissions")).toBe(true);
    expect(await checkUserPermission("u_mgr", "MANAGER", "expenses:delete")).toBe(false);
  });

  it("USER can create/edit but cannot delete or manage permissions", async () => {
    expect(await checkUserPermission("u_user", "USER", "expenses:create")).toBe(true);
    expect(await checkUserPermission("u_user", "USER", "expenses:edit")).toBe(true);
    expect(await checkUserPermission("u_user", "USER", "users:managePermissions")).toBe(false);
    expect(await checkUserPermission("u_user", "USER", "expenses:delete")).toBe(false);
  });

  it("WATCHER is view-only", async () => {
    expect(await checkUserPermission("u_wa", "WATCHER", "expenses:view")).toBe(true);
    expect(await checkUserPermission("u_wa", "WATCHER", "expenses:create")).toBe(false);
    expect(await checkUserPermission("u_wa", "WATCHER", "expenses:approve")).toBe(false);
  });

  it("an unknown role gets no permissions", async () => {
    for (const perm of ["expenses:view", "dashboard:view"]) {
      expect(await checkUserPermission("ghost", "GHOST", perm)).toBe(false);
    }
  });

  it("TIMESHEET_USER gets create/edit plus machinery reference access", async () => {
    expect(await checkUserPermission("u_ts", "TIMESHEET_USER", "timesheets:create")).toBe(true);
    expect(await checkUserPermission("u_ts", "TIMESHEET_USER", "timesheets:edit")).toBe(true);
    expect(await checkUserPermission("u_ts", "TIMESHEET_USER", "content:machinery")).toBe(true);
    expect(await checkUserPermission("u_ts", "TIMESHEET_USER", "content:machinery-rates")).toBe(true);
    expect(await checkUserPermission("u_ts", "TIMESHEET_USER", "contractors:view")).toBe(true);
    // Employee reference list is OR-gated with employees:view; no content:employees dep.
    expect(await checkUserPermission("u_ts", "TIMESHEET_USER", "content:employees")).toBe(false);
    expect(await checkUserPermission("u_ts", "TIMESHEET_USER", "expenses:create")).toBe(false);
    expect(await checkUserPermission("u_ts", "TIMESHEET_USER", "expenses:view")).toBe(false);
  });

  it("EXPENSE_USER gets expense create/edit plus contractor/wallet refs", async () => {
    expect(await checkUserPermission("u_exp", "EXPENSE_USER", "expenses:create")).toBe(true);
    expect(await checkUserPermission("u_exp", "EXPENSE_USER", "expenses:edit")).toBe(true);
    expect(await checkUserPermission("u_exp", "EXPENSE_USER", "content:contractors")).toBe(true);
    expect(await checkUserPermission("u_exp", "EXPENSE_USER", "wallets:view")).toBe(true);
    expect(await checkUserPermission("u_exp", "EXPENSE_USER", "cashAdvance:view")).toBe(true);
    expect(await checkUserPermission("u_exp", "EXPENSE_USER", "timesheets:create")).toBe(false);
    expect(await checkUserPermission("u_exp", "EXPENSE_USER", "expenses:approve")).toBe(false);
  });

  it("DATA_ENTRY gets expenses/timesheets/fuelUsage/attendance entry", async () => {
    expect(await checkUserPermission("u_de", "DATA_ENTRY", "expenses:create")).toBe(true);
    expect(await checkUserPermission("u_de", "DATA_ENTRY", "timesheets:create")).toBe(true);
    expect(await checkUserPermission("u_de", "DATA_ENTRY", "fuelUsage:create")).toBe(true);
    expect(await checkUserPermission("u_de", "DATA_ENTRY", "employees:attendance:manage")).toBe(true);
    expect(await checkUserPermission("u_de", "DATA_ENTRY", "content:fuel-containers")).toBe(true);
    expect(await checkUserPermission("u_de", "DATA_ENTRY", "content:machinery")).toBe(true);
    expect(await checkUserPermission("u_de", "DATA_ENTRY", "wallets:view")).toBe(true);
    expect(await checkUserPermission("u_de", "DATA_ENTRY", "expenses:approve")).toBe(false);
    expect(await checkUserPermission("u_de", "DATA_ENTRY", "expenses:delete")).toBe(false);
  });

  it("reference dependencies resolve transitively via dependencies", async () => {
    expect(await checkUserPermission("u_dep", "USER", "content:contractors")).toBe(true);
    expect(await checkUserPermission("u_dep", "USER", "content:machinery")).toBe(true);
    expect(await checkUserPermission("u_dep", "USER", "content:machinery-rates")).toBe(true);
    expect(await checkUserPermission("u_dep", "USER", "content:fuel-containers")).toBe(true);
    // USER has expenses:create, so the expense reference deps (wallets, cashAdvance) apply.
    expect(await checkUserPermission("u_dep", "USER", "wallets:view")).toBe(true);
    // But WATCHER has no create/edit perms, so no reference deps are granted.
    expect(await checkUserPermission("u_dep", "WATCHER", "wallets:view")).toBe(false);
    expect(await checkUserPermission("u_dep", "WATCHER", "content:contractors")).toBe(false);
  });
});

describe("permissions (overrides)", () => {
  // UserPermission has a FK to User, so a real User row is required.
  async function makeUser(id: string, role = "USER") {
    await db.user.create({
      data: { id, email: `${id}@test.local`, name: id, password: "hash", role },
    });
  }

  async function upsertPermission(name: string) {
    return db.permission.upsert({
      where: { name },
      update: {},
      create: { name, label: name, module: name.split(":")[0] },
    });
  }

  it("a UserPermission grant overrides the role default", async () => {
    await makeUser("u_override");
    const perm = await upsertPermission("expenses:delete");
    await db.userPermission.create({
      data: { userId: "u_override", permissionId: perm.id, granted: true },
    });
    // USER normally cannot delete; the override grants it.
    expect(await checkUserPermission("u_override", "USER", "expenses:delete")).toBe(true);
  });

  it("a UserPermission denial overrides the role default", async () => {
    await makeUser("u_denied");
    const perm = await upsertPermission("expenses:view");
    await db.userPermission.create({
      data: { userId: "u_denied", permissionId: perm.id, granted: false },
    });
    // Admin ignores overrides; USER is denied despite role default.
    expect(await checkUserPermission("u_denied", "ADMIN", "expenses:view")).toBe(true);
    expect(await checkUserPermission("u_denied", "USER", "expenses:view")).toBe(false);
  });
});

describe("permissions.getEffectivePermissions", () => {
  it("ADMIN returns the wildcard map", async () => {
    expect(await getEffectivePermissions("u_admin", "ADMIN")).toEqual({ "*": true });
  });

  it("non-admin merges role defaults with per-user overrides", async () => {
    await db.user.create({
      data: { id: "u_merge", email: "u_merge@test.local", name: "u_merge", password: "h", role: "USER" },
    });
    const perm = await db.permission.upsert({
      where: { name: "expenses:view" },
      update: {},
      create: { name: "expenses:view", label: "View Expenses", module: "expenses" },
    });
    await db.userPermission.create({
      data: { userId: "u_merge", permissionId: perm.id, granted: false },
    });

    const perms = await getEffectivePermissions("u_merge", "USER");
    expect(perms["expenses:create"]).toBe(true); // role default retained
    expect(perms["expenses:view"]).toBe(false); // override revoked
  });
});
