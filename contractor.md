# Yakledger Contractor Module — Complete Reference

---

## 1. Architecture Overview

The contractor module covers two coupled domains:

1. **Contractor CRUD** — `/api/contractors*` — registering machinery/transport/labor contractors.
2. **Operations records** that hang off a contractor — `Timesheet`, `FuelUsage`, `Machinery`, `MachineryRate` — served by separate API trees (`/api/timesheets`, `/api/fuel-usage`, `/api/machinery`) with their own permissions (`timesheets:*`, `fuelUsage:*`, `machinery:*`).

**Key architectural differences from payroll:**

- **There is no `src/services/contractor.service.ts`.** All server business logic lives inline in the seven route files under `src/app/api/contractors/**/route.ts`. Only a **client** wrapper exists (`src/services/contractor-api.ts`).
- **No contractor-specific validation file.** Contractor zod schemas are declared *inside* the route files (payroll's live in `src/lib/validations/hr.ts`).
- **Contractors own no ledger.** Payments are `Expense` rows FK'd via `paidToContractorId` / `paidByContractorId`; wallet impact happens through the normal expense path (`companyWalletService.deductForExpense`). There is no `contractor.balance` field anywhere.
- **Money is Float major units (AFN)** everywhere — no `toMinor` / `fromMinor` (that helper is payroll/HR only).

**Data flow:** UI → Client API (`contractor-api.ts`) → Next.js Route Handlers → Prisma/SQLite → Client API → UI.

**Key design guarantees:**
- Contractor numbers (`CTR-00001`) are issued from a `Sequence` row inside the create transaction and never reused.
- Inline machinery creation always gets a nested default `MachineryRate`.
- Financial totals in lists/dashboards/profiles are scope-filtered (`buildAggregateScope` ⇒ APPROVED only; `buildListScope` ⇒ APPROVED + REJECTED, own PENDING visible).
- All mutations write `AuditLog` entries.

---

## 2. Database Models

### 2.1 `Contractor`

**File:** `prisma/schema.prisma:499-530` (SQLite) / `prisma/schema.pg.prisma:695-726` (Postgres)

| Field | Type | Default | Notes |
|---|---|---|---|
| `id` | `String @id` | `cuid()` | |
| `contractorNumber` | `String?` | | `@unique`, `CTR-00001` form |
| `contractorName` | `String` | | required |
| `fatherName` | `String` | | required (Afghan form convention) |
| `companyName` | `String?` | | |
| `phoneNumber` | `String` | | required, indexed |
| `alternativePhone` | `String?` | | |
| `email` | `String?` | | zod `.email()` when present |
| `address` | `String?` | | |
| `nationalId` | `String?` | | indexed |
| `contractorType` | `String` | | SQLite: plain String; PG: `enum ContractorType` |
| `status` | `String` | `"ACTIVE"` | SQLite: String; PG: `enum ContractorStatus` |
| `notes` | `String?` | | |
| `createdBy` | `String` | | FK to User, cascade delete |
| `createdAt` | `DateTime` | `now()` | |
| `updatedAt` | `DateTime` | `@updatedAt` | |
| `idImageFront` | `String?` | | public upload path |
| `idImageBack` | `String?` | | public upload path |

**Indexes:** `phoneNumber`, `nationalId`, `status`, `createdBy`.

**Relations:** `creator` (User), `expensesPaidBy` / `expensesPaidTo` (Expense[]), `fuelTransactions`, `fuelUsages`, `machinery`, `timesheets`.

**Note:** `Contractor` has **no `Wallet` relation** — linkage to wallets is only through `Expense.walletId`.

**PG enums** (`schema.pg.prisma:79-98`):

```prisma
enum ContractorType {
  MACHINERY_CONTRACTOR
  TRANSPORTATION_CONTRACTOR
  LABOR_CONTRACTOR
  MATERIAL_SUPPLIER
  ELECTRICAL_CONTRACTOR
  PLUMBING_CONTRACTOR
  SUBCONTRACTOR
  CONSULTANT
  STRUCTURAL_CONTRACTOR
  OTHER
}

enum ContractorStatus {
  ACTIVE
  INACTIVE
  SUSPENDED
}
```

> **Schema drift:** the PG `Contractor` model as written does not list `idImageFront`/`idImageBack`, while the SQLite schema does. Keep both schemas in sync (see AGENTS.md).

### 2.2 `Timesheet`

| Field | Type | Default | Notes |
|---|---|---|---|
| `id` | `String @id` | `cuid()` | |
| `contractorId` | `String` | | FK, cascade delete |
| `machineryId` | `String?` | | |
| `machineryRateId` | `String?` | | rate used for revenue calc |
| `operatorName` | `String?` | | |
| `workSite` | `String?` | | |
| `date` | `DateTime` | | |
| `startTime` / `lunchStart` / `lunchEnd` / `endTime` | `String?` | | clock strings |
| `totalHours` | `Float` | `0` | |
| `overtimeHours` | `Float` | `0` | |
| `approvalStatus` | `String` | `"PENDING"` | `PENDING` / `APPROVED` / `REJECTED` |
| `approvedBy` / `approvedById` / `approvedAt` / `approvalNote` | optional | | |
| `createdBy` | `String` | | |

**Indexes:** `[contractorId, date]`, `[approvalStatus, contractorId, date]`, plus others.

### 2.3 `FuelUsage`

| Field | Type | Default | Notes |
|---|---|---|---|
| `id` | `String @id` | `cuid()` | |
| `contractorId` | `String` | | FK, cascade delete |
| `machineryId` | `String?` | | |
| `fuelType` | `String` | | |
| `quantity` | `Float` | | |
| `unitPrice` | `Float` | | |
| `totalCost` | `Float` | | |
| `date` | `DateTime` | | |
| `fuelStation` | `String?` | | |
| `receiptAttachment` | `String?` | | |
| `linkedExpenseId` | `String?` | | links burn → expense |
| `fuelTransactionId` | `String?` | | links burn → fuel stock |
| `billable` | `Boolean` | `false` | |
| `notes` | `String?` | | |
| `approvalStatus` + approval fields | | `"PENDING"` | same shape as Timesheet |
| `createdBy` | `String` | | |

### 2.4 `Machinery`

| Field | Type | Default | Notes |
|---|---|---|---|
| `id` | `String @id` | `cuid()` | |
| `machineryName` | `String` | | |
| `machineryType` | `String` | | |
| `plateNumber` / `model` | `String?` | | |
| `driverName` / `driverFatherName` / `driverPhoneNumber` / `driverNationalId` | `String?` | | |
| `driverIdImageFront` / `driverIdImageBack` | `String?` | | |
| `status` | `String` | `"OPERATIONAL"` | |
| `assignedContractorId` | `String` | | FK, **required**, cascade delete |
| `fuelType` | `String` | `"DIESEL"` | |
| `hourlyConsumptionRate` | `Float` | `0` | |
| `hourlyRate` / `dailyRate` / `monthlyRate` | `Float` | `0` | |
| `contractDaysPerMonth` | `Int` | `28` | |
| `workHoursPerDay` | `Int` | `9` | |
| `contractStartDate` / `contractEndDate` | `DateTime?` | | |
| `createdBy` | `String` | | |

### 2.5 `MachineryRate`

| Field | Type | Default | Notes |
|---|---|---|---|
| `id` | `String @id` | `cuid()` | |
| `machineryId` | `String` | | FK, cascade delete |
| `rateName` | `String` | | `"Default"` for auto-created |
| `monthlyRate` / `dailyRate` / `hourlyRate` | `Float` | `0` | |
| `contractDaysPerMonth` | `Int` | `28` | |
| `workHoursPerDay` | `Int` | `9` | |
| `isDefault` | `Boolean` | `false` | |
| `createdBy` | `String` | | |

**Relations:** `timesheets[]`.

### 2.6 `Sequence`

```prisma
model Sequence {
  name  String @id
  value Int    @default(1)
}
```

Used row: `contractorNumber` → issued as `CTR-%05d`.

---

## 3. Money Conventions

### 3.1 Major Units (Contractor) vs Minor Units (Payroll)

Contractor-domain money fields are **Prisma `Float` major units in AFN**:

- `Expense.amount`
- `Machinery.hourlyRate` / `dailyRate` / `monthlyRate`
- `MachineryRate.monthlyRate` / `dailyRate` / `hourlyRate`
- `FuelUsage.quantity` / `unitPrice` / `totalCost`

There is **no** `toMinor` / `fromMinor` conversion on this path — `src/lib/money.ts` is payroll/HR only.

### 3.2 UI Formatting

`formatCurrency` in `src/lib/utils.ts:8-14`:

```typescript
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style:'currency', currency:'AFN',
    minimumFractionDigits:2, maximumFractionDigits:2 }).format(amount)
}
```

(`contractor-profile.tsx:91` defines a private, near-identical helper; the reports tab imports the shared one.)

### 3.3 PDF Formatting

PDFs use **local** currency helpers, not `lib/utils`:

```typescript
// contractor-financial-summary-pdf-document.tsx:16
`AFN ${Math.round(amount).toLocaleString("en-US")}`
// contractor-financial-report-pdf-document.tsx:25
farsiNum(Math.round(n).toLocaleString("en-US")) + " AFN"
// machinery-contractor-summary-pdf-document.tsx:22
"AFN " + toLocaleString(..., { minimumFractionDigits: 2, maximumFractionDigits: 2 })
```

### 3.4 Rounding

- Route-level aggregates/distributions round to 2dp: `Math.round(x * 100) / 100`.
- PDFs round to whole AFN for display.
- Revenue is **derived, never stored** (see §12).

---

## 4. Service Layer Functions

**There is no server-side contractor service.** Business logic is inline in the route files. The only "service" is the client API wrapper (§6) plus two shared libs:

- `src/lib/contractor-number.ts` — `generateContractorNumber(tx)` issues the next `CTR-#####` from the `Sequence` row inside the caller's transaction.
- `src/lib/access-control.ts` — `buildAccessScope` / `buildListScope` / `buildAggregateScope` / `withScope` used by every read path.

Money-relevant server logic lives in the **expense** path instead:

```typescript
// src/app/api/expenses/route.ts:355-364 (inside db.$transaction)
if (approvalStatus === APPROVED && data.walletId) {
  await companyWalletService.deductForExpense(tx, data.walletId, data.amount,
    user.id, created.id, `Expense: ${created.title}`);
}
// :371-377 best-effort, outside the transaction
walletService.reconcileForExpense(data.paidById)
```

**Duplication warning:** financial math (timesheet revenue, net figures) is duplicated in three places — `contractor-profile.tsx` (EN + FA render paths) and `financial-report/route.ts` — with slightly different fallbacks (§12.4).

---

## 5. API Routes

All under `src/app/api/contractors/`.

| Route file | Methods | Permission | Purpose |
|---|---|---|---|
| `route.ts` (283 lines) | GET, POST | `contractors:view`, `contractors:create` | list+filter+paginate; create with inline machinery |
| `[id]/route.ts` (311 lines) | GET, PUT, DELETE | `contractors:view`, `contractors:edit`, `contractors:delete` | profile w/ computed aggregates |
| `list/route.ts` (41 lines) | GET | `contractors:view` **or** `content:contractors` | dropdown list |
| `dashboard/route.ts` (172 lines) | GET | `contractors:view` | dashboard stats |
| `bulk-action/route.ts` (96 lines) | POST | `contractors:delete` (for **all 3** actions) | delete/activate/suspend |
| `financial-report/route.ts` (233 lines) | POST | `contractors:view` | per-machinery financial report |
| `upload/route.ts` (104 lines) | POST | `contractors:create` | ID card front/back images |

### 5.1 `GET /api/contractors`

**Permission:** `contractors:view`

**Query parameters:**

| Param | Default | Notes |
|---|---|---|
| `page` | `1` | ≥ 1 |
| `pageSize` | `10` | 1..100 |
| `search` | — | OR-contains over `contractorName, fatherName, phoneNumber, email, companyName, nationalId, contractorNumber` |
| `contractorTypes` | — | comma list |
| `statuses` | — | comma list |
| `sortBy` | `createdAt` | whitelist: `createdAt`, `contractorName`, `status` (see §12.2) |
| `sortOrder` | `desc` | |

**Access scoping:** `scopedWhere = withScope(where, await buildAccessScope(user, "contractor"))`.

**Includes:** `creator` (id/email/name/role/avatar) and `_count` of `expensesPaidTo`, `timesheets`, `fuelUsages`, `machinery`.

**Response:**
```json
{
  "success": true,
  "data": {
    "data": ["...contractor records"],
    "total": "number",
    "page": "number",
    "pageSize": "number",
    "totalPages": "number"
  }
}
```

### 5.2 `POST /api/contractors`

**Permission:** `contractors:create` · **Status:** `201`

**Request body (validated by `createContractorSchema`, declared locally at `route.ts:31-72`):**
```json
{
  "contractorName": "required",
  "fatherName": "required",
  "companyName": "optional",
  "phoneNumber": "required",
  "alternativePhone": "optional",
  "email": "optional (zod .email())",
  "address": "optional",
  "nationalId": "optional",
  "contractorType": "MACHINERY_CONTRACTOR | TRANSPORTATION_CONTRACTOR | LABOR_CONTRACTOR | MATERIAL_SUPPLIER | OTHER",
  "status": "ACTIVE | INACTIVE | SUSPENDED  (default ACTIVE)",
  "notes": "optional",
  "idImageFront": "optional",
  "idImageBack": "optional",
  "machinery": ["optional array of inlineMachinerySchema"]
}
```

**Behavior (single `db.$transaction`):**
1. `generateContractorNumber(tx)` → `CTR-#####`.
2. `tx.contractor.create`.
3. For each inline machinery entry: `tx.machinery.create` **plus a nested default rate**:
   ```typescript
   machineryRates: {
     create: { rateName: "Default", monthlyRate: m.monthlyRate, dailyRate: m.dailyRate,
       hourlyRate: m.hourlyRate, contractDaysPerMonth: m.contractDaysPerMonth,
       workHoursPerDay: m.workHoursPerDay, isDefault: true, createdBy: user.id },
   }
   ```
4. `tx.auditLog.create({ action: "CREATE", entity: "Contractor", entityId, details, userId })`.

**Response:** `{ success: true, data, message: "Contractor created successfully" }`.

### 5.3 `GET /api/contractors/[id]`

**Permission:** `contractors:view`

Builds **9 scopes in parallel** (`Promise.all`): `buildAccessScope(user,"contractor")`, `buildAggregateScope(user, "expense"|"timesheet"|"fuelUsage")`, `buildListScope(user, "expense"|"timesheet"|"fuelUsage")`, `buildAccessScope(user, "machinery"|"machineryRate")`.

**Includes:** `creator`, scoped `expensesPaidTo` (ordered `expenseDate desc`, limited select), scoped `machinery`, `_count` with per-relation filters.

**Computed fields appended:**
```typescript
totalExpensesPaid = expense.aggregate(_sum.amount) where withScope({ paidToContractorId: id }, expenseScope)
monthlyExpenses   = last 6 months grouped by "YYYY-MM" → [{ month, amount }]
machineryRates    = machineryRate.findMany({ where: withScope({ machineryId: { in: contractorMachineryIds } }, machineryRateScope) })
```

**Response:** `{ success: true, data: { ...contractor, totalExpensesPaid, monthlyExpenses, machineryRates } }`.

### 5.4 `PUT /api/contractors/[id]`

**Permission:** `contractors:edit`

Validated by `updateContractorSchema` — all create fields optional, **no `machinery` array** (machinery is create-only). Scope-checked `findFirst` (404 if out of scope) → `db.contractor.update` → `auditLog UPDATE`.

> **Quirk:** the response `data` is the `select: { id: true }` record — **PUT returns only `{ id }`**.

### 5.5 `DELETE /api/contractors/[id]`

**Permission:** `contractors:delete`

Scope-checked lookup → `auditLog DELETE` written **before** the delete → `db.contractor.delete`. Child rows (`Machinery`, `Timesheet`, `FuelUsage`) cascade via `onDelete: Cascade`.

### 5.6 `GET /api/contractors/list`

**Permission:** `contractors:view` **or** `content:contractors`

Optional `?status=`; selects `{ id, contractorName, fatherName, contractorType, status }` ordered by name.

> **No access scope applied** — any holder sees all contractors. Used by dropdowns (expense form, machinery form, fuel form, timesheet form, quick search).

### 5.7 `GET /api/contractors/dashboard`

**Permission:** `contractors:view`

Aggregates (all scope-filtered):

| Key | Source |
|---|---|
| `totalContractors` / `active` / `inactive` / `suspended` | `groupBy status` counts |
| `totalContractorExpenses` | `expense.aggregate(_sum.amount)` where `paidToContractorId != null` + `expenseScope` |
| `monthlyContractorPayments` | same restricted to current calendar month |
| `totalTimesheetHours` | `timesheet.aggregate(_sum.totalHours)` + `timesheetScope` (APPROVED only) |
| `totalFuelCost` | `fuelUsage.aggregate(_sum.totalCost)` + `fuelUsageScope` |
| `contractorsByType` | `groupBy contractorType _count` |
| `monthlyPaymentTrend` | last 6 months pre-zeroed → `[{ month: "YYYY-MM", amount }]` |
| `recentContractors` | take 5, with `creator` |
| `topContractorsByExpense` | `expense.groupBy paidToContractorId _sum.amount desc take 5`, then hydrated names |

### 5.8 `POST /api/contractors/bulk-action`

**Permission:** `contractors:delete` (for **delete, activate, and suspend** alike)

```typescript
const bulkActionSchema = z.object({
  ids: z.array(z.string()).min(1, "At least one ID is required"),
  action: z.enum(["delete", "activate", "suspend"]),
});
```

- `delete` → `contractor.deleteMany`
- `activate` → `status: "ACTIVE"`
- `suspend` → `status: "SUSPENDED"`

Writes `auditLog` `BULK_DELETE` / `BULK_ACTIVATE` / `BULK_SUSPEND` (no `entityId`). Response `{ success: true, data: { affected }, message }`.

> **No access-scope filtering on `ids`** — assumes admin-scoped ids.

### 5.9 `POST /api/contractors/financial-report`

**Permission:** `contractors:view` · **Body:** `{ dateFrom?, dateTo? }` (built as `T00:00:00` / `T23:59:59`)

**Flow:** fetch all scoped `machinery` (+ `assignedContractor`) → timesheets (`machineryId in …`, date-filtered, `buildListScope`) → expenses (`paidToContractorId in …`, date-filtered) → default `MachineryRate` (`isDefault: true`).

**Formulas:**
```typescript
// rate fallback (note hard-coded 9)
computedHourlyRate = defaultRate ? defaultRate.hourlyRate
                   : (m.dailyRate > 0 ? m.dailyRate / 9 : m.hourlyRate);

// per month
totalPrice = totalHours * pricePerHour;            // rounded to 2dp

// expenses distributed across a contractor's machines pro-rata by money share
share = machineMoney / contractorTotalMoney;       // last machine absorbs remainder

totalReceivable = agg.totalMoney - totalWithdrawals;
```

Payment rows reuse **all** contractor expenses for each machine of that contractor (`giver: paidBy`, `receiver: paidTo`, `description: notes`).

**Response:** `{ success: true, data: MachineryReport[] }` — `[]` if no machinery.

### 5.10 `POST /api/contractors/upload`

**Permission:** `contractors:create`

Multipart `formData` fields: `front`, `back`, `contractorId` (optional).

- Validation via `CONTRACTOR_ID_UPLOAD` (`src/lib/upload-config.ts:19-25`): `maxSizeBytes: 10MB`, `allowedTypes: ["image/jpeg","image/png"]`, `maxWidth/MaxHeight: 1200`, `jpegQuality: 80`.
- `sharp` resize `fit: "inside", withoutEnlargement: true` → JPEG q80.
- Paths: `public/uploads/contractors/{contractorId}/id/{front|back}/id-{side}-{timestamp}.jpg` (or `.../temp/{side}/...`), returned as public `/uploads/contractors/...`.
- Errors prefixed `Validation:` → 400.

### 5.11 Related Record Routes (separate API trees)

| Route | Permission | Notes |
|---|---|---|
| `/api/timesheets` | `timesheets:view/create/edit/approve` | list/create/update/delete/approve/bulkCreate |
| `/api/fuel-usage` | `fuelUsage:view/create/edit/approve` | + summary, monthly analysis, daily detail |
| `/api/machinery` | `machinery:view/create/edit` | CRUD, rates CRUD, driver ID image upload |
| `/api/approvals` | shared | handles `expense \| timesheet \| fuelUsage \| ...` in one approvals UI |

---

## 6. Client API

**File:** `src/services/contractor-api.ts` (561 lines) — exports `contractorsApi`, `timesheetsApi`, `fuelUsageApi`, `machineryApi`.

Shared `request<T>` helper: adds `Authorization: Bearer <getToken()>`; `401` → `window.location.href = "/"` + throws `ApiError`; parses `{ error | message }`; `204 → undefined`.

```typescript
contractorsApi.getAll(params?: ContractorFilters & { page, pageSize, sortBy, sortOrder })  // GET /api/contractors
contractorsApi.getById(id)                                   // GET /api/contractors/[id]
contractorsApi.create(data: ContractorFormData)              // POST /api/contractors
contractorsApi.update(id, Partial<ContractorFormData>)       // PUT  /api/contractors/[id]
contractorsApi.delete(id)                                    // DELETE /api/contractors/[id]
contractorsApi.bulkAction(ids, "delete"|"activate"|"suspend")// POST /api/contractors/bulk-action
contractorsApi.getDashboard()                                // GET /api/contractors/dashboard
contractorsApi.getList(status?)                              // GET /api/contractors/list
contractorsApi.getFinancialReport({ dateFrom?, dateTo? })    // POST /api/contractors/financial-report
```

Also: `timesheetsApi` (`getAll/getById/create/update/delete/approve/bulkCreate`), `fuelUsageApi` (`summary/getAll/create/…/getMonthlyAnalysis/getDailyDetail/getMonthlyAnalysisPdf`), `machineryApi` (CRUD + `bulkAction` + `getTypes/getSummary/getContractorSummary/getFuelSummary/getWorkHoursSummary/getList/getRates/createRate/updateRate/deleteRate/uploadDriverIdImage`).

**Note:** `contractorsApi.update` uses **PUT** (payroll's equivalent is PATCH).

---

## 7. Validation Schemas

Contractor schemas are **not** in `src/lib/validations/hr.ts` — they live where they're used.

### 7.1 `createContractorSchema` — `src/app/api/contractors/route.ts:31-72`

```typescript
const CONTRACTOR_TYPE_VALUES = [
  "MACHINERY_CONTRACTOR", "TRANSPORTATION_CONTRACTOR", "LABOR_CONTRACTOR",
  "MATERIAL_SUPPLIER", "OTHER",
] as const;                                    // ← only 5 of the 10 TS/PG types

const CONTRACTOR_STATUS_VALUES = ["ACTIVE", "INACTIVE", "SUSPENDED"] as const;

const createContractorSchema = z.object({
  contractorName: z.string().min(1, "Contractor name is required"),
  fatherName: z.string().min(1, "Father name is required"),
  companyName: z.string().optional().nullable(),
  phoneNumber: z.string().min(1, "Phone number is required"),
  alternativePhone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  address: z.string().optional().nullable(),
  nationalId: z.string().optional().nullable(),
  idImageFront: z.string().optional().nullable(),
  idImageBack: z.string().optional().nullable(),
  contractorType: z.enum(CONTRACTOR_TYPE_VALUES),
  status: z.enum(CONTRACTOR_STATUS_VALUES).default("ACTIVE"),
  notes: z.string().optional().nullable(),
  machinery: z.array(inlineMachinerySchema).optional(),
});
```

### 7.2 `inlineMachinerySchema`

```typescript
const inlineMachinerySchema = z.object({
  machineryName: z.string().min(1, "Machinery name is required"),
  machineryType: z.string().min(1, "Machinery type is required"),
  plateNumber: z.string().optional().nullable(),
  model: z.string().optional().nullable(),
  driverName: z.string().optional().nullable(),
  status: z.enum(MACHINERY_STATUS_VALUES).default("OPERATIONAL"),
  fuelType: z.enum(FUEL_TYPE_VALUES).default("DIESEL"),
  hourlyConsumptionRate: z.number().min(0).default(0),
  hourlyRate: z.number().min(0).default(0),
  dailyRate: z.number().min(0).default(0),
  monthlyRate: z.number().min(0).default(0),
  contractDaysPerMonth: z.number().int().min(1).max(31).default(28),
  workHoursPerDay: z.number().int().min(1).max(24).default(9),
  contractStartDate: z.string().optional().nullable(),
  contractEndDate: z.string().optional().nullable(),
}).superRefine((data, ctx) => {
  if (data.hourlyRate <= 0 && data.dailyRate <= 0 && data.monthlyRate <= 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["monthlyRate"],
      message: "At least one rate (hourly, daily, or monthly) is required" });
  }
});
```

### 7.3 `updateContractorSchema` — `src/app/api/contractors/[id]/route.ts:22-36`

All create fields optional; **no `machinery` key** (machinery only at create).

### 7.4 `bulkActionSchema` — `src/app/api/contractors/bulk-action/route.ts:6-9`

See §5.8.

### 7.5 Client form schema — `src/components/contractor/contractor-form.tsx:49-87`

`contractorFormSchema` + `machineryEntrySchema`, wired via react-hook-form `zodResolver`; field array `machineryEntries: z.array(...).optional().default([])`. Submit maps `machineryEntries → data.machinery`.

### 7.6 Expense link field

`paidToContractorId: z.string().max(100).optional().nullable()` in `src/app/api/expenses/route.ts:59`, `[id]/route.ts:63`, `bulk/route.ts:53`.

---

## 8. UI Components

### 8.1 Registration

- `src/app/page.tsx:17` — dynamic import of `ContractorPage`; `:52` `case 'contractors':`.
- `src/components/layout/sidebar-nav.tsx:62` — `{ id: 'contractors', label: 'Contractors', icon: HardHat, permission: 'contractors:view', group: 'people' }` (`NavSection` union at `:41`). Adjacent items: `:63 timesheets`, `:65 fuelUsage`, `:67 machinery`.
- `src/components/layout/header.tsx:38` — `contractors: 'Contractors'`.
- Reports: `src/components/reports/reports-page.tsx:17,189` renders `<ContractorReportsTab />`.
- Quick search: `src/components/common/quick-search.tsx` (`contractorsApi.getList()`, `onSectionChange('contractors')`).

### 8.2 File Map

| File | Lines |
|---|---|
| `src/components/contractor/contractor-profile.tsx` | 1968 |
| `src/components/contractor/contractor-form.tsx` | 605 |
| `src/components/contractor/contractor-table.tsx` | 673 |
| `src/components/contractor/contractor-dashboard.tsx` | 526 |
| `src/components/contractor/contractor-page.tsx` | 211 |
| `src/hooks/use-contractor-store.ts` | 421 (zustand) |

### 8.3 `ContractorPage` (`src/components/contractor/contractor-page.tsx`)

- **Permission gating:** `if (!canView('contractors')) return null;` — early return **before** hooks (line 21).
- **Tabs:** `dashboard` | `list` | `profile` (profile auto-selected when `selectedContractor` set).
- **Shortcuts:** `Alt+N` opens the Add form when `canCreate('contractors')`.
- Header "Add Contractor" gated by `canCreate`; table `onEdit`/`onDelete` gated by `canEdit`/`canDelete`.
- `ConfirmDialog` for single delete and bulk action (delete/activate/suspend).

### 8.4 `ContractorTable` (`contractor-table.tsx`)

TanStack Table columns: checkbox select, `contractorName`, `contractorNumber` ("Contract ID"), `contractorType`, `phoneNumber`, `companyName`, **Machinery** (relation count), `status`, `createdAt`. Filter toolbar with `handleResetFilters`; row actions Edit / Delete / View Profile; bulk-action toolbar wired to the page.

### 8.5 `ContractorForm` (`contractor-form.tsx`)

Dialog (`sm:max-w-[800px]`), react-hook-form + zod, `useFieldArray name: 'machineryEntries'`. Edit mode maps `editingContractor.machinery → machineryEntries`.

Inline machinery sub-form **auto-derives rates from monthly** (lines 427-437):
```
daily  = monthly / contractDaysPerMonth
hourly = daily / workHoursPerDay         // rounded to 2dp
```
Helper text: *"Each machinery needs at least one rate (hourly, daily, or monthly)."*

### 8.6 `ContractorDashboard` (`contractor-dashboard.tsx`)

`fetchDashboard()` on mount. Six `StatCard`s (total/active/inactive/suspended contractors, total expenses, monthly payments, timesheet hours, fuel cost), contractor-type breakdown, monthly payment trend, recent contractors, top contractors by expense.

### 8.7 `ContractorProfile` (`contractor-profile.tsx`, 1968 lines)

- `const { canEdit, hasPermission, canView } = usePermissions();`
- **Tabs:** `overview | expenses | timesheets | fuel | machinery | financial`.
- Header **Download PDF Report** gated `hasPermission('reports:generatePdf')` → `ContractorPDFDocument`.
- **Financial tab:** date range (`finDateFrom`/`finDateTo`); **Download PDF** (EN) and **درایل PDF (فارسی)** → `ContractorFinancialSummaryPDFDocument` / `…Farsi…`.
- ID image capture dialog (rotation/preview) → upload route.
- Local `formatCurrency(amount)` helper at line 91 (module-level duplicate of `lib/utils`).

**Core financial computations (lines 269-334):**
```typescript
totalTimesheetHours = sum(timesheets.totalHours)
totalFuelCost       = sum(fuelUsages.totalCost)

// timesheet revenue — rate fallback chain
timesheetRevenue = Σ over timesheets with machineryId:
  if (ts.machineryRateId && rate found)      → ts.totalHours * rate.hourlyRate
  else if (default rate for machine)         → ts.totalHours * defaultRate.hourlyRate
  else if (machine)                          → ts.totalHours * (machine.dailyRate / machine.workHoursPerDay)

totalCosts   = finTotalFuelCost + finTabTotalExpenses
netFinancial = timesheetRevenue - totalCosts          // Net (Revenue - All Costs)
netWithoutFuel = timesheetRevenue - finTabTotalExpenses
```

Same chain is repeated in `monthlyData` (439-464) and `monthlyRateData` (388-436); `monthlyRateEntries` appends per-month `TOTAL` rows; `rateTierRows` (342-385) falls back to `'Base Rate'` from the machinery's own rates when no `MachineryRate` rows exist.

### 8.8 `useContractorStore` (`src/hooks/use-contractor-store.ts`, zustand)

State: `contractors`, `selectedContractorIds: Set`, `filters`, `pagination { page, pageSize: 10, total, totalPages }`, `sorting { createdAt/desc }`, `isFormOpen`, `editingContractor`, `isLoading`, `dashboardStats`, `selectedContractor`, `contractorList`, `machineryList`, `error`, `timesheets` + `timesheetPagination`, `fuelUsages` + `fuelUsagePagination`.

Actions: `fetchContractors`, `createContractor` (→ refetch list), `updateContractor` (→ refetch + profile if open), `deleteContractor`, `bulkAction`, `toggleSelect/selectAll/clearSelection`, `setFilters` (resets to page 1), `resetFilters`, `setPage/setPageSize/setSorting`, `openForm/closeForm`, `fetchDashboard`, `fetchContractorProfile` (also fetches timesheets & fuel usages at `pageSize: 100`), `clearSelectedContractor`, `fetchContractorList` (status `ACTIVE`, silent fail), `fetchMachineryList` (`OPERATIONAL`, silent), `clearError`, `fetchTimesheets/fetchFuelUsages`.

---

## 9. PDF Documents

All use `@react-pdf/renderer` and register the `Vazirmatn` font from `/fonts/Vazirmatn-Regular.ttf`.

| File | Lines | Triggered from | Content |
|---|---|---|---|
| `contractor-pdf-document.tsx` | 917 | profile + reports tab + preview modal | Cover (contractor info, assigned machinery, notes), TimesheetSection, FuelSection, ExpensesSection, SummaryPage |
| `contractor-financial-summary-pdf-document.tsx` | 440 | profile Financial tab (EN) | summary cards, `MachineryRateTable`, `MonthlyBreakdownTable` (GRAND TOTAL row), `ExpensesTable` |
| `contractor-financial-summary-farsi-pdf-document.tsx` | 432 | profile Financial tab (FA) | same structure, Persian labels (`خلاصه مالی قراردادی`, …), uses `@/lib/shamsi` (`toShamsiYear/Month/Day`, `getShamsiMonthName`) |
| `contractor-financial-report-pdf-document.tsx` | 501 | reports tab "All Contractors Financial Report" | cover + 4 machinery per page; `MachineryBlock` = MonthlyWorkTable + summary (Receivable/Withdrawn/Total/Hours) + PaymentsTable; `farsiNum()` digit conversion |
| `machinery-contractor-summary-pdf-document.tsx` | 244 | `reports/machinery-reports-tab.tsx:43` | per-contractor machinery count/hours/fuel qty/fuel cost table, totals row, 22 rows/page |
| `reports/contractor-pdf-preview-modal.tsx` | 182 | reports tab Preview | wraps `ContractorPDFDocument` in a modal |

**Props (financial summary):** `{ contractorName, companyName, dateFrom, dateTo, totalHours, totalOvertime, timesheetRevenue, totalExpenses, totalFuelCost, totalFuelQty, netFinancial, netWithoutFuel, rateTierRows, monthlyEntries, expenses }`.

**Props (financial report):** `{ data: MachineryReport[], companyName, dateFrom, dateTo }`.

Download helper: `downloadPdfBlob(blob, filename)` from `src/lib/pdf-utils` (+ `filterTimesheetsByDate`, `filterFuelUsagesByDate`); the profile page uses raw `URL.createObjectURL` instead.

---

## 10. Permission Model

### 10.1 Contractor-Specific Permissions

Defined in `src/lib/permission-catalog.ts`:

| Permission | Label | Module |
|---|---|---|
| `contractors:view` | View Contractors | contractors |
| `contractors:create` | Create Contractors | contractors |
| `contractors:edit` | Edit Contractors | contractors |
| `contractors:delete` | Delete Contractors | contractors |
| `content:contractors` | Use Contractors Reference List | content |

Related modules: `timesheets:view/create/edit/approve`, `fuelUsage:view/create/edit/approve`, `machinery:view/create/edit`, plus `reports:generatePdf` for all PDF buttons.

### 10.2 Role Assignments

| Role | view | create | edit | delete |
|---|---|---|---|---|
| ADMIN | Yes (wildcard `*`) | Yes | Yes | Yes |
| MANAGER | Yes | Yes | Yes | **No** |
| USER | Yes | Yes | Yes | **No** |
| WATCHER | Yes | No | No | No |
| TIMESHEET_USER | Yes | No | No | No |
| EXPENSE_USER | Yes | No | No | No |
| DATA_ENTRY | Yes | No | No | No |

Individual users can have per-user overrides via `UserPermission` records.

### 10.3 Permission Dependencies

```typescript
"expenses:create":  ["content:contractors", "wallets:view", "cashAdvance:view"],
"expenses:edit":    ["content:contractors", "wallets:view", "cashAdvance:view"],
"timesheets:create": ["content:machinery", "content:machinery-rates"],
"timesheets:edit":   ["content:machinery", "content:machinery-rates"],
"fuelUsage:create":  ["content:machinery", "content:fuel-containers"],
"fuelUsage:edit":    ["content:machinery", "content:fuel-containers"],
```

Resolved transitively by `resolvePermissions` / `resolveRolePermissions`; ADMIN returns every permission. Seeded by `prisma/seed-permissions.ts`.

### 10.4 Access Scoping

`src/lib/access-control.ts`:

```typescript
const ENTITY_CONTENT_PERMISSION = { machinery: "content:machinery", employee: "content:employees",
  contractor: "content:contractors", machineryRate: "content:machinery-rates" };
// RECORD_ENTITIES: contractor, timesheet, fuelUsage, machinery, machineryRate, employee, ...
// APPROVAL_ENTITIES: expense, timesheet, fuelUsage, cashTransaction, transfer, attendance, assetLog
```

- `buildAccessScope(user, "contractor")` → `{}` for admins or holders of `content:contractors`, else `{ OR: [{ createdBy: user.id }, { id: { in: grantedIds } }] }`.
- `buildListScope` = APPROVED + REJECTED for admins (own PENDING visible); `buildAggregateScope` = APPROVED only.
- `withScope(base, scope)` wraps as `{ AND: [base, scope] }` unless scope is empty.

UI: `usePermissions()` → `canView('contractors')` = `hasPermission("contractors:view")`, etc.

### 10.5 Approvals

Contractor-linked `Timesheet` and `FuelUsage` records flow through the shared approvals page/API (`src/components/approvals/*`, `/api/approvals`) alongside expenses, cash transactions, transfers, attendance, and asset logs.

---

## 11. Wallet & Ledger Integration

### 11.1 Contractors Have No Ledger

There is no `EmployeeCashAccount` equivalent — **no `contractor.balance` field exists anywhere**. Payments to/from contractors are plain `Expense` rows:

- `paidToContractorId` — company paid the contractor.
- `paidByContractorId` — contractor paid on behalf of the company.
- `walletId` — company wallet used for the payment.

### 11.2 Expense Creation Path

`src/app/api/expenses/route.ts:303-377`, inside `db.$transaction`:

```typescript
if (approvalStatus === APPROVED && data.walletId) {
  await companyWalletService.deductForExpense(tx, data.walletId, data.amount,
    user.id, created.id, `Expense: ${created.title}`);
}
```

- **Mutual-exclusion guard:** `walletId && deductFromWallet !== false` → 400 (lines 285-293).
- `approvalStatus` set by `resolveApprovalStatusOnCreate(user)` — admin ⇒ `APPROVED`, else `PENDING`; **wallet deduction only fires for APPROVED**.
- Post-commit best-effort: `walletService.reconcileForExpense(paidById)` when `paidById` is set (outside the transaction).

### 11.3 Link Set/Clear

`paidToContractorId` is set/cleared in `src/app/api/expenses/[id]/route.ts:243` and `expenses/bulk/route.ts:158`. Changing paid-to from contractor/employee to `External` clears the link.

### 11.4 How Totals Are Scoped

Dashboard/profile/report sums read `Expense.amount` through `buildAggregateScope` / `buildListScope` ⇒ **PENDING excluded from totals**, own PENDING visible in lists.

### 11.5 Fuel Linkage

`FuelUsage.linkedExpenseId` / `fuelTransactionId` connect fuel burn to expenses and fuel stock. The contractor flow never writes `WalletTransaction` directly — that is `companyWalletService`'s job.

---

## 12. Edge Cases and Special Behaviors

### 12.1 PUT Returns Only `{ id }`
`PUT /api/contractors/[id]` responds with the scope-checked `select: { id: true }` record, not the full updated contractor. Clients must refetch (`updateContractor` in the store does).

### 12.2 Sort Whitelist Includes Non-Existent Columns
GET list accepts `sortBy` ∈ `hourlyRate | dailyRate | monthlyRate` — **none of which are columns on `Contractor`**. Passing them makes Prisma throw → 500. Safe values: `createdAt`, `contractorName`, `status`.

### 12.3 Contractor Type Enum Mismatch
API zod allows **5** types (`MACHINERY_`, `TRANSPORTATION_`, `LABOR_`, `MATERIAL_SUPPLIER`, `OTHER`); the TS `CONTRACTOR_TYPES` (`src/types/contractor.ts:3-14`) and the PG enum allow **10** (adds `ELECTRICAL_`, `PLUMBING_`, `SUBCONTRACTOR`, `CONSULTANT`, `STRUCTURAL_`). Create/update **rejects** the extra 5 even though labels/colors exist for them.

### 12.4 Daily→Hourly Fallback Differs Between Code Paths
- `financial-report/route.ts:116` uses a **hard-coded `/9`**: `m.dailyRate / 9`.
- `contractor-profile.tsx` uses `machine.dailyRate / machine.workHoursPerDay`.

Same machinery with `workHoursPerDay ≠ 9` yields different revenue in the profile vs. the report.

### 12.5 Rate Resolution Fallback Chain
For any timesheet revenue calculation:
1. `timesheet.machineryRateId` → that `MachineryRate.hourlyRate`
2. else the machinery's `isDefault` `MachineryRate.hourlyRate`
3. else `machinery.dailyRate / machinery.workHoursPerDay`

### 12.6 Bulk Actions
- All three actions (`delete`, `activate`, `suspend`) require **`contractors:delete`**.
- No per-record access-scope filtering on `ids`.
- Audit logs are written without `entityId`.

### 12.7 `contractors/list` Has No Access Scope
Any holder of `contractors:view` **or** `content:contractors` sees **all** contractors in the dropdown, regardless of `RecordAccess` grants.

### 12.8 Inline Machinery Requires a Rate
`inlineMachinerySchema.superRefine` rejects entries where `hourlyRate`, `dailyRate`, and `monthlyRate` are all ≤ 0 with `"At least one rate (hourly, daily, or monthly) is required"` (400).

### 12.9 Contractor Numbers Are Never Reused
Numbers come from the `Sequence` row inside the create transaction. A create-after-delete issues the next number, not the freed one (tested). Backfill: `npx tsx scripts/migrate-contractor-numbers.ts`.

### 12.10 Cascade Deletes
Deleting a contractor cascades to `Machinery`, `Timesheet`, and `FuelUsage`. Expenses keep their `paidToContractorId` FK value pointing at a deleted row — the audit log entry is written *before* deletion.

### 12.11 Financial Report Expense Distribution
Expenses are distributed across a contractor's machines pro-rata by money share; **the last machine absorbs the rounding remainder** (`Math.round(x * 100) / 100`). Returns `[]` when there is no machinery.

### 12.12 No Server Service / Duplicated Financial Math
There is no `contractor.service.ts`; logic is duplicated across 7 route files, and financial math is triplicated (`contractor-profile.tsx` EN/FA + `financial-report/route.ts`).

### 12.13 Schema Drift (SQLite vs PG)
SQLite `Contractor` has `idImageFront`/`idImageBack`; the PG model as written does not. Keep `prisma/schema.prisma` and `prisma/schema.pg.prisma` in sync on every change (AGENTS.md).

### 12.14 Early Return Before Hooks
`contractor-page.tsx` returns `null` before calling hooks when `!canView('contractors')` — any hook added above that line must be considered for conditional-hook violations.

---

## 13. Test Coverage

### Test Files

| File | Covers |
|---|---|
| `tests/api/expenses-contractors.test.ts` (369 lines) | **the main contractor test file** |
| `tests/api/visibility-scoping.test.ts` | profile counts, dashboard scoping, timesheet/fuel lists |
| `tests/lib/permissions.test.ts` | role defaults + transitive dependencies |
| `tests/lib/access-control.test.ts` | pure scope helpers |

### `tests/api/expenses-contractors.test.ts` suites

1. **`/api/expenses — auth & permissions** — GET no token 401; USER 200; MANAGER 200.
2. **`/api/expenses — validation`** — missing fields 400; non-positive amount 400 with field message; invalid category 400.
3. **paidById employee (wallet deduction)** — admin POST creates an APPROVED expense and deducts the employee wallet (+ audit log assertion).
4. **`/api/contractors — list`** — 401 without token; **USER can list** (has `contractors:view`); admin create+fetch (`MACHINERY_CONTRACTOR`, 201).
5. **`/api/contractors — contractor number`** — `toMatch(/^CTR-\d{5}$/)`; successive creates unique; **create-after-delete does not reuse a number** (lines 199-212).
6. **`/api/contractors — inline machinery default rates`** — asserts exactly one `MachineryRate`, `isDefault: true`, `rateName: "Default"`, `monthlyRate: 60000`; rejects no-rate inline machinery with 400 `/At least one rate/i`.
7. **Changing paidTo from contractor/employee to External clears the link** — PUT clears `paidToContractorId`/`paidToId` (note: uses `method: "PUT"` on `/api/expenses/[id]`).

### `tests/api/visibility-scoping.test.ts`

- `:180` timesheet list — creator sees own records at any status; ADMIN sees only APPROVED/REJECTED.
- `:208` fuel list — same pattern.
- `:228` **contractor profile counts** — `_count` includes own APPROVED only; `expensesPaidTo` shows own APPROVED + own PENDING but not others'.
- `:250` **contractor dashboard** — USER sees own approved financials only; ADMIN sees all approved (PENDING excluded from aggregates).

### `tests/lib/permissions.test.ts`

- `:16` MANAGER has approve/manage but **not** delete; `:22` USER create/edit not delete; `:29` WATCHER view-only; `:41` TIMESHEET_USER + machinery ref; `:53` EXPENSE_USER gets expense create/edit plus contractor/wallet refs; `:63` DATA_ENTRY; `:75` transitive dependencies; overrides tests.

### Gaps

**No dedicated tests** for `/api/contractors/dashboard`, `/financial-report`, `/bulk-action`, `/upload`, or `PUT/DELETE [id]`. Contractor fixtures also appear in `tests/api/machinery.test.ts`, `fuel.test.ts`, `fuel-purchase-expense.test.ts`, `employee-expenses-tab.test.ts`, `approvals-bulk.test.ts`, `approvals-list.test.ts`.

Harness: route handlers imported directly + `buildRequest()` / `seedUsers()` from `tests/helpers.ts`; DB reset by `tests/setup.ts`.

---

## 14. Business Rules Summary

1. **No server service layer** — business logic lives inline in `src/app/api/contractors/**/route.ts`; only a client wrapper exists.
2. **Contractor numbers are unique and never reused**, issued from `Sequence` inside the create transaction.
3. **Inline machinery always gets a default `MachineryRate`** and must declare at least one rate.
4. **Contractors have no ledger/balance** — all money movement is `Expense` rows linked by `paidToContractorId` / `paidByContractorId`.
5. **Wallet deduction happens only for APPROVED expenses** with a `walletId`, via `companyWalletService.deductForExpense`.
6. **`walletId` and `deductFromWallet` are mutually exclusive** on expenses (400 otherwise).
7. **Money is Float major units (AFN)** in this domain — never `toMinor`/`fromMinor`.
8. **Aggregate totals exclude PENDING records** (`buildAggregateScope` = APPROVED only); list views show APPROVED + REJECTED + own PENDING.
9. **Access scoping applies to list, profile, dashboard, and financial report** — but **not** to `/api/contractors/list`.
10. **Bulk actions (including activate/suspend) require `contractors:delete`** and skip per-record scope checks.
11. **MANAGER and USER can create/edit but not delete** contractors.
12. **Machinery is create-only** — `updateContractorSchema` has no `machinery` key.
13. **`PUT` returns only `{ id }`** — clients must refetch.
14. **Revenue is derived, never stored**: `timesheetHours × hourlyRate` with a three-step fallback chain; profile and financial-report use different daily→hourly fallbacks (`workHoursPerDay` vs hard-coded 9).
15. **Financial-report expenses are distributed pro-rata across a contractor's machines**, last machine absorbing the remainder.
16. **Deleting a contractor cascades** to machinery, timesheets, and fuel usages; audit log is written before deletion.
17. **ID uploads** are capped at 10MB JPEG/PNG, resized with `sharp` to ≤1200px, q80, stored under `/uploads/contractors/...`.
18. **PDF generation requires `reports:generatePdf`**; all contractor PDFs use Vazirmatn with local currency formatting (EN and Farsi variants available for the financial summary).
19. **All mutations write `AuditLog` entries** (`CREATE`, `UPDATE`, `DELETE`, `BULK_*`).
20. **Approvals for timesheets/fuel/expenses flow through the shared approvals UI/API.**
