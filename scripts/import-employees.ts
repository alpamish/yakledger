import { db } from "../src/lib/db";

// Shamsi to Gregorian conversion
function convertShamsiToGregorian(shamsiDate: string): Date {
  const [year, month, day] = shamsiDate.split("-").map(Number);
  const baseYear = 2026;
  const baseMonth = 3;
  const baseDay = 21;

  const monthDays = [31, 31, 31, 31, 31, 31, 31, 30, 30, 30, 30, 29];
  let daysOffset = 0;
  for (let m = 1; m < month; m++) {
    daysOffset += monthDays[m - 1];
  }
  daysOffset += (day - 1);

  const baseDate = new Date(baseYear, baseMonth - 1, baseDay);
  const resultDate = new Date(baseDate);
  resultDate.setDate(baseDate.getDate() + daysOffset);
  return resultDate;
}

// Department mapping by job title
function getDepartment(jobTitle: string): string {
  const t = jobTitle.trim();

  if (t.includes("چیف سرویر") || t.includes("Chief Surveyor")) return "ENGINEERING";
  if (t.includes("سرویر") || t.includes("Surveyor")) return "ENGINEERING";
  if (t.includes("انجنیر ساحه") || t.includes("Area Engineer") || t.includes("Engineer")) return "ENGINEERING";

  if (t.includes("مدیر اداری") || t.includes("مالی") || t.includes("Finance") || t.includes("تحویلدار") || t.includes("Accountant")) return "FINANCE";

  if (t.includes("مدیر لوژستیک") || t.includes("Logistics") || t.includes("توزیع تیل") || t.includes("Oil Distribution")) return "LOGISTICS";

  if (t.includes("فورمین") || t.includes("Foreman") || t.includes("هلپر") || t.includes("Helper") || t.includes("مستری") || t.includes("Master") || t.includes("کی وی سی") || t.includes("KVC") || t.includes("آشپز") || t.includes("سرآشپز") || t.includes("Chef")) return "OPERATIONS";

  if (t.includes("کارگر") || t.includes("Worker") || t.includes("Labor")) return "LABOR";

  return "OPERATIONS"; // default for new employees
}

async function main() {
  console.log("Starting employee import (no data loss mode)...");

  // 1. Find existing admin
  const adminUser = await db.user.findFirst({
    where: { email: "aria@company.com" },
  });

  if (!adminUser) {
    console.error("Admin user not found! Cannot create employees without a createdBy user.");
    process.exit(1);
  }
  console.log(`Using existing admin: ${adminUser.name} (${adminUser.id})`);

  // 2. Read CSV
  const fs = require("fs");
  const path = require("path");
  const csvPath = path.join(process.cwd(), "Employee.csv");
  const csvContent = fs.readFileSync(csvPath, "utf-8");
  const lines = csvContent.split("\n").slice(1);

  console.log(`Found ${lines.length} records in CSV`);

  let importedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const line of lines) {
    if (!line.trim()) continue;

    try {
      // Parse CSV - handle commas inside fields by simple split
      const values = line.split(",");

      const fullName = values[0]?.trim();
      const fatherName = values[1]?.trim() === "None" ? "" : values[1]?.trim() || "";
      const gender = values[2]?.trim() || "male";
      const phoneNumber = values[4]?.trim() || "0";
      const address = values[6]?.trim() || "";
      const nationalId = values[7]?.trim() || "";
      const jobTitle = values[8]?.trim() || "";
      const hireDateStr = values[12]?.trim();
      const status = values[13]?.trim() || "ACTIVE";

      if (!fullName) {
        console.warn(`Skipping row with no name: ${line.substring(0, 40)}...`);
        skippedCount++;
        continue;
      }

      // Determine department from job title
      const department = getDepartment(jobTitle);

      // Check for duplicate (by fullName + fatherName)
      const existing = await db.employee.findFirst({
        where: { fullName, fatherName },
      });

      if (existing) {
        console.log(`Skipping (duplicate): ${fullName} (${fatherName}) - already exists`);
        skippedCount++;
        continue;
      }

      // Convert hire date
      let hireDate: Date;
      if (hireDateStr) {
        hireDate = convertShamsiToGregorian(hireDateStr);
      } else {
        hireDate = new Date();
      }

      // Create employee
      await db.employee.create({
        data: {
          fullName,
          fatherName,
          gender: gender.toLowerCase(),
          phoneNumber,
          address: address || null,
          nationalId: nationalId || null,
          jobTitle,
          department: department as any,
          employmentType: "FULL_TIME" as any,
          salary: 0,
          hireDate,
          status: status as any,
          createdBy: adminUser.id,
        },
      });

      importedCount++;
      console.log(`Imported: ${fullName} (${jobTitle}) → ${department} | Hire: ${hireDate.toISOString().split('T')[0]}`);
    } catch (error) {
      failedCount++;
      console.error(`Failed to import: ${line.substring(0, 50)}...`, (error as Error).message);
    }
  }

  console.log("\n=== Import Complete ===");
  console.log(`Imported: ${importedCount}`);
  console.log(`Skipped (duplicates): ${skippedCount}`);
  console.log(`Failed: ${failedCount}`);
}

main()
  .catch((e) => {
    console.error("Import failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });