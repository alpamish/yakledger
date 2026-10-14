// Single source of truth for the permission system.
// Shared by the runtime permission checks (src/lib/permissions.ts), the seed
// script (prisma/seed-permissions.ts), and the client role/permission UIs.

export interface PermissionDef {
  name: string;
  label: string;
  module: string;
}

export const PERMISSIONS: PermissionDef[] = [
  { name: "dashboard:view", label: "View Dashboard", module: "dashboard" },
  { name: "projectCost:view", label: "View Project Cost", module: "projectCost" },

  { name: "expenses:view", label: "View Expenses", module: "expenses" },
  { name: "expenses:create", label: "Create Expenses", module: "expenses" },
  { name: "expenses:edit", label: "Edit Expenses", module: "expenses" },
  { name: "expenses:delete", label: "Delete Expenses", module: "expenses" },
  { name: "expenses:approve", label: "Approve Expenses", module: "expenses" },

  { name: "employees:view", label: "View Employees", module: "employees" },
  { name: "employees:create", label: "Create Employees", module: "employees" },
  { name: "employees:edit", label: "Edit Employees", module: "employees" },
  { name: "employees:delete", label: "Delete Employees", module: "employees" },
  { name: "employees:approve", label: "Approve Attendance", module: "employees" },
  { name: "employees:salary:view", label: "View Employee Salaries", module: "employees" },
  { name: "employees:salary:manage", label: "Manage Employee Salaries", module: "employees" },
  { name: "employees:contract:view", label: "View Contracts", module: "employees" },
  { name: "employees:contract:manage", label: "Manage Contracts", module: "employees" },
  { name: "employees:documents:view", label: "View Documents", module: "employees" },
  { name: "employees:documents:manage", label: "Manage Documents", module: "employees" },
  { name: "employees:leave:view", label: "View Leave", module: "employees" },
  { name: "employees:leave:manage", label: "Manage Leave", module: "employees" },
  { name: "employees:payroll:view", label: "View Payroll", module: "employees" },
  { name: "employees:payroll:manage", label: "Manage Payroll", module: "employees" },
  { name: "employees:attendance:view", label: "View Attendance", module: "employees" },
  { name: "employees:attendance:manage", label: "Manage Attendance", module: "employees" },

  { name: "contractors:view", label: "View Contractors", module: "contractors" },
  { name: "contractors:create", label: "Create Contractors", module: "contractors" },
  { name: "contractors:edit", label: "Edit Contractors", module: "contractors" },
  { name: "contractors:delete", label: "Delete Contractors", module: "contractors" },
  { name: "contractors:archive", label: "Archive Contractors", module: "contractors" },
  { name: "contractors:suspend", label: "Suspend/Blacklist Contractors", module: "contractors" },
  { name: "contractors:authorize", label: "Manage Authorizations & Verify Documents", module: "contractors" },

  { name: "contracts:view", label: "View Contracts", module: "contracts" },
  { name: "contracts:create", label: "Create Contracts", module: "contracts" },
  { name: "contracts:edit", label: "Edit Contracts", module: "contracts" },
  { name: "contracts:delete", label: "Delete Contracts", module: "contracts" },
  { name: "contracts:approve", label: "Approve Contracts & Rates", module: "contracts" },

  { name: "contractors:claims:view", label: "View Contractor Claims", module: "contractors" },
  { name: "contractors:claims:create", label: "Create Contractor Claims", module: "contractors" },
  { name: "contractors:claims:edit", label: "Edit Contractor Claims", module: "contractors" },
  { name: "contractors:claims:approve", label: "Approve & Post Contractor Claims", module: "contractors" },
  { name: "contractors:payments:view", label: "View Contractor Payments", module: "contractors" },
  { name: "contractors:payments:create", label: "Record Contractor Payments", module: "contractors" },
  { name: "contractors:payments:reverse", label: "Reverse Contractor Payments", module: "contractors" },
  { name: "contractors:advances:view", label: "View Contractor Advances", module: "contractors" },
  { name: "contractors:advances:create", label: "Disburse Contractor Advances", module: "contractors" },
  { name: "contractors:advances:writeOff", label: "Write Off Contractor Advances", module: "contractors" },

  { name: "timesheets:view", label: "View Timesheets", module: "timesheets" },
  { name: "timesheets:create", label: "Create Timesheets", module: "timesheets" },
  { name: "timesheets:edit", label: "Edit Timesheets", module: "timesheets" },
  { name: "timesheets:delete", label: "Delete Timesheets", module: "timesheets" },
  { name: "timesheets:approve", label: "Approve Timesheets", module: "timesheets" },

  { name: "fuelUsage:view", label: "View Fuel Usage", module: "fuelUsage" },
  { name: "fuelUsage:create", label: "Create Fuel Usage", module: "fuelUsage" },
  { name: "fuelUsage:edit", label: "Edit Fuel Usage", module: "fuelUsage" },
  { name: "fuelUsage:delete", label: "Delete Fuel Usage", module: "fuelUsage" },
  { name: "fuelUsage:approve", label: "Approve Fuel Usage", module: "fuelUsage" },

  { name: "machinery:view", label: "View Machinery", module: "machinery" },
  { name: "machinery:create", label: "Create Machinery", module: "machinery" },
  { name: "machinery:edit", label: "Edit Machinery", module: "machinery" },
  { name: "machinery:delete", label: "Delete Machinery", module: "machinery" },

  { name: "assets:view", label: "View Assets", module: "assets" },
  { name: "assets:create", label: "Create Assets", module: "assets" },
  { name: "assets:edit", label: "Edit Assets", module: "assets" },
  { name: "assets:delete", label: "Delete Assets", module: "assets" },
  { name: "assets:approve", label: "Approve Asset Logs", module: "assets" },

  { name: "cashAdvance:view", label: "View Cash & Advances", module: "cashAdvance" },
  { name: "cashAdvance:create", label: "Create Cash Transactions", module: "cashAdvance" },
  { name: "cashAdvance:edit", label: "Edit Cash Transactions", module: "cashAdvance" },
  { name: "cashAdvance:delete", label: "Delete Cash Transactions", module: "cashAdvance" },
  { name: "cashAdvance:approve", label: "Approve Cash Transactions", module: "cashAdvance" },

  { name: "wallets:view", label: "View Wallets", module: "wallets" },
  { name: "wallets:manage", label: "Manage Wallets", module: "wallets" },

  { name: "reports:view", label: "View Reports", module: "reports" },
  { name: "reports:generatePdf", label: "Generate Report PDFs", module: "reports" },

  { name: "settings:view", label: "View Settings", module: "settings" },
  { name: "settings:edit", label: "Edit Settings", module: "settings" },

  { name: "users:view", label: "View Users", module: "users" },
  { name: "users:create", label: "Create Users", module: "users" },
  { name: "users:edit", label: "Edit Users", module: "users" },
  { name: "users:delete", label: "Delete Users", module: "users" },
  { name: "users:managePermissions", label: "Manage User Permissions", module: "users" },

  { name: "content:machinery", label: "Use Machinery Reference List", module: "content" },
  { name: "content:employees", label: "Use Employees Reference List", module: "content" },
  { name: "content:contractors", label: "Use Contractors Reference List", module: "content" },
  { name: "content:machinery-rates", label: "Use Machinery Rates Reference", module: "content" },
  { name: "content:fuel-containers", label: "Use Fuel Containers Reference", module: "content" },
];

export const ROLES = [
  "ADMIN",
  "MANAGER",
  "USER",
  "WATCHER",
  "TIMESHEET_USER",
  "EXPENSE_USER",
  "DATA_ENTRY",
] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrator",
  MANAGER: "Manager",
  USER: "User",
  WATCHER: "Watcher",
  TIMESHEET_USER: "Timesheet User",
  EXPENSE_USER: "Expense User",
  DATA_ENTRY: "Data Entry",
};

// Base permissions each role gets by default. Reference/dependency permissions
// (e.g. content:* for the reference lists a create/edit form needs) are added
// automatically by `resolveRolePermissions`.
export const ROLE_PERMISSIONS: Record<string, string[]> = {
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
    "contractors:view", "contractors:create", "contractors:edit", "contractors:archive",
    "contractors:suspend", "contractors:authorize",
    "contractors:claims:view", "contractors:claims:create", "contractors:claims:edit", "contractors:claims:approve",
    "contractors:payments:view", "contractors:payments:create", "contractors:payments:reverse",
    "contractors:advances:view", "contractors:advances:create", "contractors:advances:writeOff",
    "contracts:view", "contracts:create", "contracts:edit", "contracts:approve",
    "timesheets:view", "timesheets:create", "timesheets:edit", "timesheets:approve",
    "fuelUsage:view", "fuelUsage:create", "fuelUsage:edit", "fuelUsage:approve",
    "machinery:view", "machinery:create", "machinery:edit",
    "assets:view", "assets:create", "assets:edit", "assets:approve",
    "cashAdvance:view", "cashAdvance:create", "cashAdvance:edit", "cashAdvance:approve",
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
    "contractors:claims:view", "contractors:payments:view", "contractors:advances:view",
    "contracts:view", "contracts:create", "contracts:edit",
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
    "contractors:claims:view",
    "contractors:payments:view",
    "contractors:advances:view",
    "contracts:view",
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
    "timesheets:view", "timesheets:create", "timesheets:edit",
    "contractors:view",
    "contracts:view",
    "machinery:view",
    "employees:view",
    "employees:attendance:view",
    "reports:view",
  ],
  EXPENSE_USER: [
    "dashboard:view", "projectCost:view",
    "expenses:view", "expenses:create", "expenses:edit",
    "employees:view",
    "contractors:view",
    "contracts:view",
    "cashAdvance:view",
    "wallets:view",
    "reports:view",
  ],
  DATA_ENTRY: [
    "dashboard:view", "projectCost:view",
    "expenses:view", "expenses:create", "expenses:edit",
    "timesheets:view", "timesheets:create", "timesheets:edit",
    "fuelUsage:view", "fuelUsage:create", "fuelUsage:edit",
    "employees:view",
    "employees:attendance:view", "employees:attendance:manage",
    "contractors:view",
    "contracts:view",
    "machinery:view",
    "assets:view",
    "cashAdvance:view", "cashAdvance:create",
    "wallets:view",
    "reports:view",
  ],
};

// A permission that lets a user create/edit records automatically implies the
// reference-list permissions those forms need (contractors, machinery, rates,
// fuel containers, wallets). The employee reference list is OR-gated with
// `employees:view`, which every entry role already holds, so `content:employees`
// is deliberately NOT a dependency: granting it would relax record-level access
// scope for the entire employee entity (contracts, salary, docs).
export const PERMISSION_DEPENDENCIES: Record<string, string[]> = {
  "expenses:create": ["content:contractors", "wallets:view", "cashAdvance:view"],
  "expenses:edit": ["content:contractors", "wallets:view", "cashAdvance:view"],
  "timesheets:create": ["content:machinery", "content:machinery-rates"],
  "timesheets:edit": ["content:machinery", "content:machinery-rates"],
  "fuelUsage:create": ["content:machinery", "content:fuel-containers"],
  "fuelUsage:edit": ["content:machinery", "content:fuel-containers"],
  "cashAdvance:create": ["wallets:view"],
  "assets:create": ["assets:view"],
  "assets:edit": ["assets:view"],
  // Contractor financial subsystem: claims reference contracts, payments and
  // advances move money out of wallets against the contractor reference list.
  "contractors:claims:create": ["contracts:view", "content:contractors"],
  "contractors:claims:edit": ["contracts:view", "content:contractors"],
  "contractors:payments:create": ["contractors:view", "content:contractors", "wallets:view"],
  "contractors:advances:create": ["contractors:view", "content:contractors", "wallets:view"],
  // Compliance (Phase 5): authorizations/documents act on an existing
  // contractor reference; lifecycle actions are status management on one.
  "contractors:authorize": ["contractors:view"],
  "contractors:suspend": ["contractors:view"],
};

/** Expand a permission list through its dependency graph (transitively). */
export function resolvePermissions(base: string[]): string[] {
  const resolved = new Set<string>();
  const queue = [...base];
  while (queue.length > 0) {
    const perm = queue.shift() as string;
    if (resolved.has(perm)) continue;
    resolved.add(perm);
    for (const dep of PERMISSION_DEPENDENCIES[perm] ?? []) {
      if (!resolved.has(dep)) queue.push(dep);
    }
  }
  return [...resolved];
}

/** Effective permissions for a role (base + reference dependencies). */
export function resolveRolePermissions(role: string): string[] {
  if (role === "ADMIN") return PERMISSIONS.map((p) => p.name);
  return resolvePermissions(ROLE_PERMISSIONS[role] ?? []);
}