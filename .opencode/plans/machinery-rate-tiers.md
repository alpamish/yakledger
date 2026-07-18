# MachineryRate Multi-Tier Pricing — Implementation Plan

## Problem
A single machinery can have multiple monthly rates depending on work type (e.g., hard cutting: 220,000 AFN, soft cutting: 200,000 AFN).

## Solution
Create a `MachineryRate` model allowing multiple rate configs per machine, link timesheets to the specific rate used.

---

## Data Safety Guarantees (Zero Data Loss)

| Guarantee | Details |
|---|---|
| **Existing Machinery table untouched** | NO columns removed or modified. Existing `hourlyRate`, `dailyRate`, `monthlyRate`, `contractDaysPerMonth`, `workHoursPerDay` remain as-is. Only a virtual relation `machineryRates` is added (no schema column change on Machinery). |
| **Timesheet table: additive only** | A single nullable column `machineryRateId` is added. Existing rows get `NULL` — zero data modification. Backfill script runs separately and is opt-in. |
| **Backward compatibility fallback** | If `machineryRateId` is null on a timesheet (e.g., migration not run yet), cost calculation falls back to `machinery.hourlyRate` — identical behavior to today. |
| **Migration is NOT in Prisma migrate** | Data migration is a separate script (`prisma/seed-machinery-rates.ts`) run at your discretion after the schema migration. You can review, test on a backup, or skip. |
| **Rollback is safe** | Revert by: (1) drop `machineryRateId` column from Timesheet, (2) drop `MachineryRate` table, (3) revert frontend code. Original Machinery table never changed. |
| **Cascade rules** | Delete machinery → rates cascade-delete (no orphans). Delete rate → timesheets set `machineryRateId = NULL` (SetNull), fallback to `machinery.hourlyRate`. |

---

## Step 1 — Prisma Schema

### `prisma/schema.prisma` & `prisma/schema.pg.prisma`

**Add to Machinery model** (add `machineryRates` relation):
```prisma
model Machinery {
  // ...existing fields...
  machineryRates        MachineryRate[]
  // ...existing relations...
}
```

**New model** (insert after `Machinery` block in both files):
```prisma
model MachineryRate {
  id                    String    @id @default(cuid())
  machineryId           String
  rateName              String
  monthlyRate           Float     @default(0)
  dailyRate             Float     @default(0)
  hourlyRate            Float     @default(0)
  contractDaysPerMonth  Int       @default(28)
  workHoursPerDay       Int       @default(9)
  isDefault             Boolean   @default(false)
  createdBy             String
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt

  machinery             Machinery  @relation(fields: [machineryId], references: [id], onDelete: Cascade)
  creator               User       @relation(fields: [createdBy], references: [id], onDelete: Cascade)
  timesheets            Timesheet[]

  @@index([machineryId])
}
```

**Modify Timesheet model** — add nullable `machineryRateId`:
```prisma
model Timesheet {
  // ...existing fields...
  machineryRateId     String?
  machineryRate       MachineryRate? @relation(fields: [machineryRateId], references: [id], onDelete: SetNull)
}
```

---

## Step 2 — Run Migration

```bash
bun prisma migrate dev --name add_machinery_rate_tiers
```

For PostgreSQL:
```bash
bun prisma migrate dev --schema prisma/schema.pg.prisma --name add_machinery_rate_tiers
```

---

## Step 3 — Data Migration Script

Create `prisma/seed-machinery-rates.ts`:

```typescript
import { db } from "../src/lib/db";

async function main() {
  const machineries = await db.machinery.findMany({ select: { id: true } });
  
  for (const m of machineries) {
    const existing = await db.machinery.findUnique({
      where: { id: m.id },
      select: { monthlyRate: true, dailyRate: true, hourlyRate: true, contractDaysPerMonth: true, workHoursPerDay: true }
    });
    if (!existing) continue;
    
    const rate = await db.machineryRate.create({
      data: {
        machineryId: m.id,
        rateName: "Default",
        monthlyRate: existing.monthlyRate,
        dailyRate: existing.dailyRate,
        hourlyRate: existing.hourlyRate,
        contractDaysPerMonth: existing.contractDaysPerMonth,
        workHoursPerDay: existing.workHoursPerDay,
        isDefault: true,
        createdBy: (await db.user.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } }))!.id,
      }
    });
    
    await db.timesheet.updateMany({
      where: { machineryId: m.id, machineryRateId: null },
      data: { machineryRateId: rate.id }
    });
  }
  
  console.log("Machinery rates migrated successfully");
}

main().catch(console.error);
```

Run with:
```bash
bun run prisma/seed-machinery-rates.ts
```

---

## Step 4 — TypeScript Types

Add to `src/types/contractor.ts`:

```typescript
export interface MachineryRate {
  id: string;
  machineryId: string;
  rateName: string;
  monthlyRate: number;
  dailyRate: number;
  hourlyRate: number;
  contractDaysPerMonth: number;
  workHoursPerDay: number;
  isDefault: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface MachineryRateFormData {
  rateName: string;
  monthlyRate: number;
  dailyRate: number;
  hourlyRate: number;
  contractDaysPerMonth: number;
  workHoursPerDay: number;
  isDefault: boolean;
}
```

Update `TimesheetFormData` — add `machineryRateId?: string`.

Update `BulkTimesheetRecord` — add `machineryRateId?: string`.

Update `MachineryWorkHours` — add `rateName?: string`.

---

## Step 5 — API Routes: MachineryRate CRUD

### `src/app/api/machinery/[id]/rates/route.ts`

**GET** — List all rates for a machinery (order by isDefault desc, rateName asc)
**POST** — Create a new rate (Zod: rateName required, rates >= 0, isDefault optional; if isDefault=true, unset others in a transaction)

### `src/app/api/machinery/[id]/rates/[rateId]/route.ts`

**PUT** — Update rate; if setting isDefault, unset others first
**DELETE** — Delete rate; prevent deletion if it's the only rate for that machinery

---

## Step 6 — Update Timesheet API Routes

### `src/app/api/timesheets/route.ts`

Add `machineryRateId: z.string().optional().nullable()` to Zod schema.
Pass `machineryRateId: data.machineryRateId ?? null` in the create.

### `src/app/api/timesheets/[id]/route.ts`

Add `machineryRateId` to update schema similarly.

### `src/app/api/timesheets/bulk/route.ts`

Add `machineryRateId` to `BulkTimesheetRecord` validation.

---

## Step 7 — Update Work-Hours Summary Cost Calculation

### `src/app/api/machinery/work-hours-summary/route.ts`

Replace: `totalCost: totalHours * m.hourlyRate`

With: Fetch timesheets with their `machineryRateId`, batch-load the rates, compute `SUM(totalHours * rate.hourlyRate)` per machinery. Fallback to `machinery.hourlyRate` when no rate is set (backward compat).

Add `rateName?: string` field showing the rate(s) used.

---

## Step 8 — API Service Layer

Add to `machineryApi` in `src/services/contractor-api.ts`:

```typescript
getRates(machineryId: string),
createRate(machineryId: string, data: MachineryRateFormData),
updateRate(machineryId: string, rateId: string, data: Partial<MachineryRateFormData>),
deleteRate(machineryId: string, rateId: string),
```

---

## Step 9 — Machinery Form — Rate Tiers UI

### `src/components/machinery/machinery-form.tsx`

After the "Rates & Contract" section, add a **"Rate Tiers"** subsection:

- List existing rates with name, monthly/daily/hourly display, "Default" badge
- Edit / Delete buttons per row
- "Add Rate Tier" button
- Sub-dialog for add/edit with: rateName, monthlyRate, contractDays, workHours (auto-calc daily/hourly), "Set as default" checkbox
- Uses the same rate calculation logic as existing (monthly → daily → hourly)

---

## Step 10 — Timesheet Form — Rate Selector

### `src/components/timesheet/timesheet-form.tsx`

**A. Add import** for `MachineryRate` type and `machineryApi` (already imported).

**B. Add state** for rates:
```typescript
const [machineryRates, setMachineryRates] = useState<MachineryRate[]>([]);
```

**C. Add `machineryRateId` to the zod schema:**
```typescript
const formSchema = z.object({
  // ...existing fields...
  machineryRateId: z.string().optional().nullable(),
});
```

**D. Add `machineryRateId` to default values** (both new and edit reset blocks):
```typescript
machineryRateId: editingTimesheet?.machineryRateId ?? '',
```

**E. Add effect to fetch rates when machineryId changes** (after line 165):
```typescript
const selectedMachineryId = form.watch('machineryId');

useEffect(() => {
  if (selectedMachineryId) {
    machineryApi.getRates(selectedMachineryId).then((res) => {
      const rates = res.data ?? [];
      setMachineryRates(rates);
      // Auto-select default rate if no rate is already set
      const currentRateId = form.getValues('machineryRateId');
      if (!currentRateId) {
        const defaultRate = rates.find((r) => r.isDefault);
        if (defaultRate) {
          form.setValue('machineryRateId', defaultRate.id);
        }
      }
    });
  } else {
    setMachineryRates([]);
    form.setValue('machineryRateId', '');
  }
}, [selectedMachineryId, form]);
```

**F. Add Rate Tier field** in the form JSX, replace the machinery + approvedBy row. The new layout:
```
Left: Machinery selector
Right: Rate Tier dropdown (only shown when machineryRates.length > 0)
```

Exact JSX for the rate tier field:
```tsx
{machineryRates.length > 0 && (
  <FormField control={form.control} name="machineryRateId" render={({ field }) => (
    <FormItem>
      <FormLabel>Rate Tier</FormLabel>
      <Select onValueChange={field.onChange} value={field.value ?? ''}>
        <FormControl>
          <SelectTrigger>
            <SelectValue placeholder="Select rate tier" />
          </SelectTrigger>
        </FormControl>
        <SelectContent>
          {machineryRates.map((r) => (
            <SelectItem key={r.id} value={r.id}>
              {r.rateName} — Afs {r.monthlyRate.toLocaleString()}/mo
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FormMessage />
    </FormItem>
  )} />
)}
```

**G. Pass `machineryRateId` in submit:**
```typescript
const data: TimesheetFormData = {
  ...values,
  machineryRateId: values.machineryRateId || undefined,
  // ...existing fields...
};
```

### `src/components/timesheet/batch-timesheet-form.tsx`

- Add rate selector in the global defaults toolbar
- Add rate column per row (optional, can be set globally)

---

## Step 11 — Update Work-Hours PDF

### `src/components/pdf/machinery-work-hours-pdf-document.tsx`

Add a "Rate Tier" column between "Monthly Rate" and "Efficiency".

---

## Step 12 — Update Contractor Profile Financial Summary

### `src/app/api/contractors/[id]/route.ts`

**A. Include `machineryRateId`** in the timesheet query (add to the `select` inside the `timesheets` include):
```typescript
timesheets: {
  orderBy: { date: "desc" },
  take: 20,
  include: {
    machinery: {
      select: { id: true, machineryName: true, machineryType: true, plateNumber: true },
    },
  },
},
```
Change the `select` to include `machineryRateId`:
```typescript
timesheets: {
  orderBy: { date: "desc" },
  take: 20,
  select: {
    id: true,
    machineryId: true,
    machineryRateId: true,  // NEW
    date: true,
    totalHours: true,
    overtimeHours: true,
    startTime: true,
    lunchStart: true,
    lunchEnd: true,
    endTime: true,
    operatorName: true,
    workSite: true,
    notes: true,
    approvedBy: true,
    approvedAt: true,
    machinery: {
      select: { id: true, machineryName: true, machineryType: true, plateNumber: true },
    },
  },
},
```

**B. Include `machineryRates`** alongside the existing `machinery` include — add a separate field or modify the machinery include to also bring in rates. The simplest approach: add a separate include for rates:

Currently the `machinery` include loads all machinery for the contractor:
```typescript
machinery: {
  orderBy: { createdAt: "desc" },
},
```

Add a new field in the response that loads all machinery rates for the contractor's machinery:
```typescript
// After the main contractor query, fetch machineryRates for all machinery
const machineryIds = contractor.machinery.map(m => m.id);
const machineryRates = await db.machineryRate.findMany({
  where: { machineryId: { in: machineryIds } },
});
```

Add to response:
```typescript
const responseData = {
  ...contractor,
  totalExpensesPaid,
  monthlyExpenses,
  machineryRates,  // NEW — flat list of all rates for all machinery
};
```

### `src/types/contractor.ts`

Update the `Timesheet` interface to include `machineryRateId`:
```typescript
export interface Timesheet {
  // ...existing fields...
  machineryRateId?: string | null;
  // ...existing fields...
}
```

Update the `Contractor` interface to include `machineryRates`:
```typescript
export interface Contractor {
  // ...existing fields...
  machineryRates?: MachineryRate[];
  // ...existing fields...
}
```

### `src/components/contractor/contractor-profile.tsx`

**A. Timesheet Revenue Calculation** (lines 256-265) — now uses the timesheet's specific rate:

```typescript
const timesheetRevenue = finFilteredTimesheets.reduce((sum, ts) => {
  if (ts.machineryId) {
    // Prefer the timesheet's specific MachineryRate
    const rateId = ts.machineryRateId;
    if (rateId) {
      const rate = (c.machineryRates ?? []).find((r) => r.id === rateId);
      if (rate) {
        return sum + ts.totalHours * rate.hourlyRate;
      }
    }
    // Fallback to machinery's dailyRate / workHoursPerDay
    const machine = machineryRates.find((m) => m.id === ts.machineryId);
    if (machine) {
      const effectiveHourly = machine.workHoursPerDay > 0 ? machine.dailyRate / machine.workHoursPerDay : 0;
      return sum + ts.totalHours * effectiveHourly;
    }
  }
  return sum;
}, 0);
```

**B. Monthly Breakdown Revenue** (lines 280-284) — same change:

```typescript
if (ts.machineryId) {
  const rateId = ts.machineryRateId;
  if (rateId) {
    const rate = (c.machineryRates ?? []).find((r) => r.id === rateId);
    if (rate) {
      acc[month].revenue += ts.totalHours * rate.hourlyRate;
      return acc;
    }
  }
  const machine = machineryRates.find((m) => m.id === ts.machineryId);
  if (machine) {
    const effectiveHourly = machine.workHoursPerDay > 0 ? machine.dailyRate / machine.workHoursPerDay : 0;
    acc[month].revenue += ts.totalHours * effectiveHourly;
  }
}
```

**C. Machinery Rate Overview table** — could add a column showing available rate tiers, or keep the current display (showing default/stored rates from Machinery model). For simplicity, add a secondary small table or badges showing rate tier names per machine.

### `src/app/api/contractors/financial-report/route.ts`

Update the `computedHourlyRate` calculation at line 105 to use MachineryRate:

```typescript
// Fetch all machinery rates for the machinery list
const allMachineryRateIds = await db.machineryRate.findMany({
  where: { machineryId: { in: machineryIds }, isDefault: true },
  select: { machineryId: true, hourlyRate: true, dailyRate: true, workHoursPerDay: true },
});
const rateByMachinery = new Map(allMachineryRateIds.map(r => [r.machineryId, r]));

// Inside the machinery loop:
const defaultRate = rateByMachinery.get(m.id);
const computedHourlyRate = defaultRate
  ? defaultRate.hourlyRate
  : (m.dailyRate > 0 ? m.dailyRate / 9 : m.hourlyRate);
```

### `src/components/pdf/contractor-financial-summary-pdf-document.tsx`

Update the `MachineryRateTable` to show default rate name alongside the stored rates. Pass `defaultRateName` or show rate tier names if available.

---

## Summary of All File Changes

| # | File | Action |
|---|------|--------|
| 1 | `prisma/schema.prisma` | Add MachineryRate model + machineryRateId on Timesheet + machineryRates relation on Machinery |
| 2 | `prisma/schema.pg.prisma` | Same changes (with PostgreSQL enums) |
| 3 | Migration files | Auto-generated by `prisma migrate` |
| 4 | `prisma/seed-machinery-rates.ts` | **New** — populate default rates + backfill timesheets |
| 5 | `src/types/contractor.ts` | Add MachineryRate/MachineryRateFormData, update TimesheetFormData/BulkTimesheetRecord/MachineryWorkHours |
| 6 | `src/app/api/machinery/[id]/rates/route.ts` | **New** — GET + POST |
| 7 | `src/app/api/machinery/[id]/rates/[rateId]/route.ts` | **New** — PUT + DELETE |
| 8 | `src/app/api/timesheets/route.ts` | Add machineryRateId to schema + creation |
| 9 | `src/app/api/timesheets/[id]/route.ts` | Add machineryRateId to update |
| 10 | `src/app/api/timesheets/bulk/route.ts` | Add machineryRateId to bulk records |
| 11 | `src/app/api/machinery/work-hours-summary/route.ts` | Update cost calc to use timesheet's rate |
| 12 | `src/services/contractor-api.ts` | Add rate CRUD methods to machineryApi |
| 13 | `src/components/machinery/machinery-form.tsx` | Add Rate Tiers management UI |
| 14 | `src/components/timesheet/timesheet-form.tsx` | Add rate tier selector dropdown |
| 15 | `src/components/timesheet/batch-timesheet-form.tsx` | Add rate tier selector |
| 16 | `src/components/pdf/machinery-work-hours-pdf-document.tsx` | Add Rate Tier column |
| 17 | `src/app/api/contractors/[id]/route.ts` | Include machineryRateId in timesheets + add machineryRates to response |
| 18 | `src/components/contractor/contractor-profile.tsx` | Update revenue calc to use timesheet's machineryRateId; fallback to existing logic |
| 19 | `src/app/api/contractors/financial-report/route.ts` | Use default MachineryRate for computedHourlyRate; fallback to existing |
| 20 | `src/components/pdf/contractor-financial-summary-pdf-document.tsx` | Show rate tier info in machinery rate table |
