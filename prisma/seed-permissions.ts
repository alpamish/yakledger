import { db } from "../src/lib/db";
import { PERMISSIONS, ROLES, resolveRolePermissions } from "../src/lib/permission-catalog";

async function main() {
  console.log("Seeding permissions...");

  for (const perm of PERMISSIONS) {
    const existing = await db.permission.findUnique({ where: { name: perm.name } });
    if (!existing) {
      await db.permission.create({ data: perm });
      console.log(`  Created permission: ${perm.name}`);
    } else {
      console.log(`  Skipped (exists): ${perm.name}`);
    }
  }

  console.log("\nSeeding role-permission mappings...");

  for (const role of ROLES) {
    const permNames = resolveRolePermissions(role);
    for (const permName of permNames) {
      const perm = await db.permission.findUnique({ where: { name: permName } });
      if (!perm) {
        console.warn(`  Warning: Permission ${permName} not found, skipping`);
        continue;
      }

      const existing = await db.rolePermission.findUnique({
        where: { role_permissionId: { role, permissionId: perm.id } },
      });
      if (!existing) {
        await db.rolePermission.create({
          data: { role, permissionId: perm.id },
        });
      }
    }
    console.log(`  Mapped ${role} -> ${permNames.length} permissions`);
  }

  console.log("\nPermission seeding complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });