import { db } from "../src/lib/db";

const PERMISSIONS = [
  { name: "dashboard:view", label: "View Dashboard", module: "dashboard" },
  { name: "projectCost:view", label: "View Project Cost", module: "projectCost" },

  { name: "expenses:view", label: "View Expenses", module: "expenses" },
  { name: "expenses:create", label: "Create Expenses", module: "expenses" },
  { name: "expenses:edit", label: "Edit Expenses", module: "expenses" },
  { name: "expenses:delete", label: "Delete Expenses", module: "expenses" },

  { name: "employees:view", label: "View Employees", module: "employees" },
  { name: "employees:create", label: "Create Employees", module: "employees" },
  { name: "employees:edit", label: "Edit Employees", module: "employees" },
  { name: "employees:delete", label: "Delete Employees", module: "employees" },

  { name: "contractors:view", label: "View Contractors", module: "contractors" },
  { name: "contractors:create", label: "Create Contractors", module: "contractors" },
  { name: "contractors:edit", label: "Edit Contractors", module: "contractors" },
  { name: "contractors:delete", label: "Delete Contractors", module: "contractors" },

  { name: "timesheets:view", label: "View Timesheets", module: "timesheets" },
  { name: "timesheets:create", label: "Create Timesheets", module: "timesheets" },
  { name: "timesheets:edit", label: "Edit Timesheets", module: "timesheets" },
  { name: "timesheets:delete", label: "Delete Timesheets", module: "timesheets" },
  { name: "timesheets:approve", label: "Approve Timesheets", module: "timesheets" },

  { name: "fuelUsage:view", label: "View Fuel Usage", module: "fuelUsage" },
  { name: "fuelUsage:create", label: "Create Fuel Usage", module: "fuelUsage" },
  { name: "fuelUsage:edit", label: "Edit Fuel Usage", module: "fuelUsage" },
  { name: "fuelUsage:delete", label: "Delete Fuel Usage", module: "fuelUsage" },

  { name: "machinery:view", label: "View Machinery", module: "machinery" },
  { name: "machinery:create", label: "Create Machinery", module: "machinery" },
  { name: "machinery:edit", label: "Edit Machinery", module: "machinery" },
  { name: "machinery:delete", label: "Delete Machinery", module: "machinery" },

  { name: "assets:view", label: "View Assets", module: "assets" },
  { name: "assets:create", label: "Create Assets", module: "assets" },
  { name: "assets:edit", label: "Edit Assets", module: "assets" },
  { name: "assets:delete", label: "Delete Assets", module: "assets" },

  { name: "cashAdvance:view", label: "View Cash & Advances", module: "cashAdvance" },
  { name: "cashAdvance:create", label: "Create Cash Transactions", module: "cashAdvance" },
  { name: "cashAdvance:delete", label: "Delete Cash Transactions", module: "cashAdvance" },

  { name: "reports:view", label: "View Reports", module: "reports" },

  { name: "settings:view", label: "View Settings", module: "settings" },
  { name: "settings:edit", label: "Edit Settings", module: "settings" },

  { name: "users:view", label: "View Users", module: "users" },
  { name: "users:create", label: "Create Users", module: "users" },
  { name: "users:edit", label: "Edit Users", module: "users" },
  { name: "users:delete", label: "Delete Users", module: "users" },
  { name: "users:managePermissions", label: "Manage User Permissions", module: "users" },
];

const ROLE_PERMISSIONS: Record<string, string[]> = {
  ADMIN: PERMISSIONS.map((p) => p.name),
  MANAGER: [
    "dashboard:view", "projectCost:view",
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
    "users:view", "users:create", "users:edit",
    "users:managePermissions",
  ],
  USER: [
    "dashboard:view", "projectCost:view",
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
    "dashboard:view", "projectCost:view",
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
    "dashboard:view", "projectCost:view",
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

  for (const [role, permNames] of Object.entries(ROLE_PERMISSIONS)) {
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
