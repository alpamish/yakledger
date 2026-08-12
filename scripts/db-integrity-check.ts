import Database from "better-sqlite3";
import path from "node:path";

// Read-only verification of the production local SQLite DB.
const db = new Database(path.join(process.cwd(), "prisma/db/custom.db"), { readonly: true });

type Finding = { severity: "OK" | "WARN" | "FAIL"; check: string; detail: string };
const findings: Finding[] = [];

function ok(check: string, detail: string) {
  findings.push({ severity: "OK", check, detail });
}
function warn(check: string, detail: string) {
  findings.push({ severity: "WARN", check, detail });
}
function fail(check: string, detail: string) {
  findings.push({ severity: "FAIL", check, detail });
}

function tblExists(t: string) {
  const r = db.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`).get(t);
  return !!r;
}
function count(t: string): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get() as { n: number }).n;
}

console.log("=== YakLedger DB Integrity Check ===\n");

// 1. Foreign-key integrity (PRAGMA foreign_key_check).
{
  const violations = db.prepare(`PRAGMA foreign_key_check;`).all() as any[];
  if (violations.length === 0) {
    ok("foreign_key_check", "No FK violations reported by SQLite.");
  } else {
    fail("foreign_key_check", `${violations.length} violating rows: ${JSON.stringify(violations.slice(0, 3))}`);
  }
}

// 2. Wallet balance vs recomputed ledger.
{
  const rows = db.prepare(`
    SELECT e.id AS employee_id, e."fullName", eca."currentBalance" AS stored_balance
    FROM "Employee" e
    LEFT JOIN "EmployeeCashAccount" eca ON eca."employeeId" = e.id
    WHERE eca."currentBalance" IS NOT NULL
  `).all() as any[];

  let mismatches = 0;
  let checked = 0;
  const details: string[] = [];
  for (const r of rows) {
    checked++;
    // Replicate walletService.recalculateBalance formula:
    // balance = advances - expenses - returns + transfersIn - transfersOut   (APPROVED only)
    const adv = (db.prepare(`SELECT COALESCE(SUM(amount),0) AS c FROM "CashTransaction" WHERE "employeeId"=? AND type='ADVANCE' AND "approvalStatus"='APPROVED'`).get(r.employee_id) as { c: number }).c;
    const ret = (db.prepare(`SELECT COALESCE(SUM(amount),0) AS c FROM "CashTransaction" WHERE "employeeId"=? AND type='RETURN' AND "approvalStatus"='APPROVED'`).get(r.employee_id) as { c: number }).c;
    const exp = (db.prepare(`SELECT COALESCE(SUM(amount),0) AS c FROM "Expense" WHERE "paidById"=? AND "approvalStatus"='APPROVED'`).get(r.employee_id) as { c: number }).c;
    const tOut = (db.prepare(`SELECT COALESCE(SUM(amount),0) AS c FROM "Transfer" WHERE "fromEmployeeId"=? AND "approvalStatus"='APPROVED'`).get(r.employee_id) as { c: number }).c;
    const tIn = (db.prepare(`SELECT COALESCE(SUM(amount),0) AS c FROM "Transfer" WHERE "toEmployeeId"=? AND "approvalStatus"='APPROVED'`).get(r.employee_id) as { c: number }).c;
    const recomputed = (adv ?? 0) - (exp ?? 0) - (ret ?? 0) + (tIn ?? 0) - (tOut ?? 0);
    const stored = Number(r.stored_balance);
    if (Math.abs(recomputed - stored) > 0.005) {
      mismatches++;
      if (details.length < 5) details.push(`${r.employee_id} (${r.fullName}): stored=${stored} recomputed=${recomputed}`);
    }
  }
  if (mismatches === 0) ok("wallet_balance_recompute", `All ${checked} accounts match the recompute formula.`);
  else fail("wallet_balance_recompute", `${mismatches}/${checked} balance mismatches. e.g. ${details.join("; ")}`);
}

// 3. Fuel stock vs transaction ledger (Asset category FUEL + containers).
{
  try {
    const assets = db.prepare(`
      SELECT id, name, quantity, fuelType, "fuelCapacity", isMainContainer
      FROM "Asset"
      WHERE category='FUEL'
    `).all() as any[];
    let issues = 0;
    const details: string[] = [];
    for (const a of assets) {
      // stock = purchased + transfers_in - transfers_out - issued
      const q = `SELECT
        COALESCE(SUM(CASE WHEN type='PURCHASE' THEN quantity ELSE 0 END),0) AS purchase,
        COALESCE(SUM(CASE WHEN type='TRANSFER' AND "destinationContainerId"=? THEN quantity ELSE 0 END),0) AS trIn,
        COALESCE(SUM(CASE WHEN type='TRANSFER' AND "containerId"=? AND "destinationContainerId" IS NOT NULL THEN quantity ELSE 0 END),0) AS trOut,
        COALESCE(SUM(CASE WHEN type='ISSUE' THEN quantity ELSE 0 END),0) AS issued
        FROM "FuelTransaction" WHERE COALESCE(containerId,0)=0 OR containerId IS NULL OR containerId=?`;
      // Simpler: compute per container directly.
      const agg = db.prepare(`
        SELECT
          COALESCE(SUM(CASE WHEN type='PURCHASE' THEN quantity ELSE 0 END),0) AS purchase,
          COALESCE(SUM(CASE WHEN type='TRANSFER' AND "destinationContainerId"=? THEN quantity ELSE 0 END),0) AS trIn,
          COALESCE(SUM(CASE WHEN type='TRANSFER' AND "containerId"=? THEN quantity ELSE 0 END),0) AS trOut,
          COALESCE(SUM(CASE WHEN type='ISSUE' AND "destinationContainerId" IS NULL THEN quantity ELSE 0 END),0) AS issued
        FROM "FuelTransaction"
        WHERE (containerId=? OR destinationContainerId=?)
      `).get(a.id, a.id, a.id, a.id) as any;
      const stock = Number(agg.purchase) + Number(agg.trIn) - Number(agg.trOut) - Number(agg.issued);
      // No stored "current stock" column to compare; just report computed. Flag negative as suspect.
      if (stock < 0) {
        issues++;
        details.push(`Asset ${a.id} (${a.name}): negative computed stock ${stock}`);
      }
    }
    if (issues === 0) ok("fuel_stock_nonnegative", `${assets.length} fuel containers have non-negative computed stock.`);
    else warn("fuel_stock_nonnegative", `${issues} container(s) show negative computed fuel stock. ${details.join("; ")}`);
  } catch (e) {
    warn("fuel_stock_nonnegative", `fuel stock check skipped: ${(e as Error).message}`);
  }
}

// 4. Expense date format sanity (must be ISO parseable).
{
  const bad = db.prepare(`
    SELECT id, "expenseDate" FROM "Expense"
    WHERE typeof("expenseDate") != 'null' AND "expenseDate" NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]*'
    LIMIT 20
  `).all() as any[];
  const unparseable = bad.filter((b) => {
    const d = new Date(b.expenseDate);
    return isNaN(d.getTime());
  });
  if (bad.length === 0) ok("expense_date_format", "All expenseDate values are ISO-formatted.");
  else {
    fail("expense_date_format", `${bad.length} expense rows with non-ISO expenseDate. e.g. ${JSON.stringify(bad.slice(0,3))}`);
    if (unparseable.length) fail("expense_date_parseable", `${unparseable.length} expense rows that fail Date parsing.`);
  }
}

// 5. Unpaid-by-employee expense with paidById pointing to missing Employee.
{
  const orphans = db.prepare(`
    SELECT e.id, e."title", e."paidById" FROM "Expense" e
    LEFT JOIN "Employee" emp ON emp.id = e."paidById"
    WHERE e."paidById" IS NOT NULL AND emp.id IS NULL
    LIMIT 20
  `).all() as any[];
  if (orphans.length === 0) ok("expense_paidby_fk", "All Expenses.paidById reference existing employees.");
  else fail("expense_paidby_fk", `${orphans.length} expenses reference missing paidById employee. e.g. ${JSON.stringify(orphans.slice(0,3))}`);
}

// 6. Row counts snapshot.
const counts: Record<string, number> = {};
for (const t of ["User","Employee","Contractor","Expense","Timesheet","FuelUsage","Machinery","MachineryRate","CashTransaction","Transfer","Asset","AssetLog","FuelTransaction","MaintenanceRecord","Attendance","RecordAccess","Permission","RolePermission","UserPermission","AuditLog"]) {
  if (tblExists(t)) counts[t] = count(t);
}

// Report
console.log("Row counts:");
for (const [t, c] of Object.entries(counts)) console.log(`  ${t}: ${c}`);
console.log("\nChecks:");
let o = 0, w = 0, f = 0;
for (const x of findings) {
  const icon = x.severity === "OK" ? "OK  " : x.severity === "WARN" ? "WARN" : "FAIL";
  console.log(`  [${icon}] ${x.check}: ${x.detail}`);
  if (x.severity === "OK") o++;
  else if (x.severity === "WARN") w++;
  else f++;
}
console.log(`\nSummary: ${o} ok, ${w} warnings, ${f} failures`);
db.close();
process.exit(f === 0 ? 0 : 1);
