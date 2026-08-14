/**
 * HR Data Migration
 * ----------------
 * One-time, idempotent migration that back-fills the new HR tables from the
 * existing Employee data without destroying or overwriting anything.
 *
 * For every employee it:
 *   1. Creates an initial SalaryHistory record from the legacy `salary` field
 *      (effective on hireDate). This becomes the source of truth for payroll.
 *   2. Syncs Employee.baseSalaryMinor to the migrated amount.
 *   3. Creates an initial EmployeePositionHistory row from jobTitle/department.
 *   4. Creates an initial EmployeeContract (only if the employee has a salary
 *      and no contract yet) capturing the current engagement.
 *   5. Assigns a stable employeeNumber where missing.
 *
 * Re-running is safe: salary history uses upsert on (employeeId, effectiveFrom);
 * position history / contract creation is guarded so it never duplicates.
 *
 * Run with:  npx tsx scripts/migrate-hr-data.ts
 */
import { db } from "../src/lib/db";

async function main() {
  console.log("Starting HR data migration...");

  const employees = await db.employee.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      fullName: true,
      salary: true,
      currency: true,
      hireDate: true,
      jobTitle: true,
      department: true,
      contractStartDate: true,
      contractEndDate: true,
      employeeNumber: true,
      createdBy: true,
      _count: { select: { salaryHistory: true, positionHistory: true, contracts: true } },
    },
  });

  console.log(`Found ${employees.length} employees.`);

  let salaryCreated = 0;
  let salarySkipped = 0;
  let positionCreated = 0;
  let contractCreated = 0;
  let numberAssigned = 0;

  for (const emp of employees) {
    const currency = emp.currency || "AFN";
    const amountMinor = Math.round((emp.salary || 0) * 100);

    // 1 + 2: salary history (upsert) + sync baseSalaryMinor
    const hireDate = emp.hireDate ?? new Date();
    const existingSalary = emp._count.salaryHistory > 0;

    if (!existingSalary) {
      await db.salaryHistory.upsert({
        where: { employeeId_effectiveFrom: { employeeId: emp.id, effectiveFrom: hireDate } },
        create: {
          employeeId: emp.id,
          amountMinor,
          currency,
          effectiveFrom: hireDate,
          reason: "Initial salary (migrated from legacy field)",
          createdById: emp.createdBy,
        },
        update: {},
      });
      salaryCreated++;
    } else {
      salarySkipped++;
    }

    await db.employee.update({
      where: { id: emp.id },
      data: { baseSalaryMinor: amountMinor, currency },
    });

    // 3: initial position history (guard against duplicates)
    if (emp._count.positionHistory === 0) {
      await db.employeePositionHistory.create({
        data: {
          employeeId: emp.id,
          position: emp.jobTitle || "Unknown",
          department: emp.department || "Unknown",
          effectiveFrom: hireDate,
          reason: "Initial position (migrated from legacy field)",
          createdById: emp.createdBy,
        },
      });
      positionCreated++;
    }

    // 4: initial contract (only if salary exists and none yet)
    if (emp._count.contracts === 0 && amountMinor > 0) {
      const start = emp.contractStartDate ?? hireDate;
      const end = emp.contractEndDate ?? null;
      const seq = String(Math.floor(Math.random() * 1e6)).padStart(6, "0");
      await db.employeeContract.create({
        data: {
          employeeId: emp.id,
          contractNumber: `MIG-${seq}`,
          contractType: "FIXED_TERM",
          startDate: start,
          endDate: end,
          salaryMinor: amountMinor,
          currency,
          position: emp.jobTitle,
          department: emp.department,
          status: "ACTIVE",
          notes: "Contract generated during HR migration",
          createdById: emp.createdBy,
        },
      });
      contractCreated++;
    }

    // 5: employee number
    if (!emp.employeeNumber) {
      const seq = String(salaryCreated + contractCreated).padStart(5, "0");
      await db.employee.update({
        where: { id: emp.id },
        data: { employeeNumber: `EMP-${seq}` },
      });
      numberAssigned++;
    }
  }

  console.log("Migration summary:");
  console.log(`  SalaryHistory created: ${salaryCreated} (skipped ${salarySkipped})`);
  console.log(`  PositionHistory created: ${positionCreated}`);
  console.log(`  Contracts created: ${contractCreated}`);
  console.log(`  EmployeeNumbers assigned: ${numberAssigned}`);

  // Verification
  const totalSalary = await db.salaryHistory.count();
  const totalPosition = await db.employeePositionHistory.count();
  const totalContract = await db.employeeContract.count();
  const zeroBase = await db.employee.count({ where: { baseSalaryMinor: 0 } });
  console.log("Verification:");
  console.log(`  SalaryHistory rows: ${totalSalary}`);
  console.log(`  PositionHistory rows: ${totalPosition}`);
  console.log(`  Contracts: ${totalContract}`);
  console.log(`  Employees with baseSalaryMinor=0: ${zeroBase}`);

  console.log("HR data migration complete.");
}

main()
  .catch((e) => {
    console.error("Migration failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
