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
