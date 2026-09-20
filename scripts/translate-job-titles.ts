import Database from "bun:sqlite";

const DB_PATH = "prisma/db/custom.db";

const MAPPING: Record<string, string> = {
  کارگر: "Laborer",
  فورمین: "Foreman",
  محافظ: "Guard",
  سرویر: "Surveyor",
  آشپز: "Cook",
  "انجنیر ساحه": "Site Engineer",
  هلپر: "Helper",
  نانوا: "Baker",
  "کارگر - تیل": "Fuel Laborer",
  نگهبان: "Security Guard",
  "مدیر ماشینری": "Machinery Manager",
  "شاگرد نانوا": "Baker Apprentice",
  "دستیار آشپز": "Cook Assistant",
  گارد: "Guard",
  "کارمند خدماتی": "Service Staff",
  "چیف سرویر": "Chief Surveyor",
  پزشک: "Doctor",
  "مسول امنیت": "Security Officer",
  مستری: "Mechanic",
  "مدیر لوژستیک": "Logistics Manager",
  "مدیر توزیع تیل": "Fuel Distribution Manager",
  "مدیر برسی تیل": "Fuel QC Manager",
  "مدیر برسی": "QC Manager",
  "مدیر اداری/مالی": "Admin/Finance Manager",
  "شریک پروژه": "Project Partner",
  "شب باش": "Night Watchman",
  سرکارگر: "Head Laborer",
  سرآشپز: "Head Cook",
  "سر محافظ": "Head Guard",
  راننده: "Driver",
  "دستیار نانوا": "Baker Assistant",
  "خدمه دفتر": "Office Attendant",
  آبکش: "Dishwasher",
};

const db = new Database(DB_PATH);

// 1. Show before state
const before = db
  .query(
    "SELECT jobTitle, COUNT(*) as cnt FROM Employee WHERE jobTitle IS NOT NULL AND jobTitle != '' GROUP BY jobTitle ORDER BY cnt DESC"
  )
  .all() as { jobTitle: string; cnt: number }[];

const farsiBefore = before.filter((r) => /[\u0600-\u06FF]/.test(r.jobTitle));
const totalFarsi = farsiBefore.reduce((sum, r) => sum + r.cnt, 0);
console.log(`\n=== BEFORE: ${before.length} distinct titles, ${farsiBefore.length} Farsi (${totalFarsi} records) ===\n`);
for (const r of farsiBefore) {
  console.log(`  ${r.jobTitle} → ${r.cnt} record(s)`);
}

// 2. Normalize whitespace first
const trimResult = db.query("UPDATE Employee SET jobTitle = TRIM(jobTitle) WHERE jobTitle != TRIM(jobTitle)").run();
console.log(`\nTrimmed whitespace from ${trimResult.changes} record(s)`);

// 3. Apply translations
let totalUpdated = 0;
const tx = db.transaction(() => {
  for (const [farsi, english] of Object.entries(MAPPING)) {
    const result = db
      .query("UPDATE Employee SET jobTitle = ? WHERE jobTitle = ?")
      .run(english, farsi);
    if (result.changes > 0) {
      console.log(`  ${farsi} → ${english}: ${result.changes} updated`);
      totalUpdated += result.changes;
    }
    // Also handle trailing-space variants that survived TRIM
    const result2 = db
      .query("UPDATE Employee SET jobTitle = ? WHERE jobTitle = ?")
      .run(english, farsi + " ");
    if (result2.changes > 0) {
      console.log(`  ${farsi} (trailing space) → ${english}: ${result2.changes} updated`);
      totalUpdated += result2.changes;
    }
  }
});
tx();

console.log(`\nTotal records updated: ${totalUpdated}`);

// 4. Verify
const after = db
  .query(
    "SELECT jobTitle, COUNT(*) as cnt FROM Employee WHERE jobTitle IS NOT NULL AND jobTitle != '' GROUP BY jobTitle ORDER BY jobTitle"
  )
  .all() as { jobTitle: string; cnt: number }[];

const farsiAfter = after.filter((r) => /[\u0600-\u06FF]/.test(r.jobTitle));
console.log(`\n=== AFTER: ${after.length} distinct titles, ${farsiAfter.length} Farsi ===\n`);
if (farsiAfter.length > 0) {
  console.log("WARNING: Remaining Farsi titles:");
  for (const r of farsiAfter) console.log(`  ${r.jobTitle}: ${r.cnt}`);
} else {
  console.log("All job titles are now in English:");
  for (const r of after) {
    console.log(`  ${r.jobTitle}: ${r.cnt}`);
  }
}

db.close();
