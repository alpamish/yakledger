# YakLedger — Complete Project Blueprint

## 1. Product Overview

**YakLedger** is a construction expense & workforce management SaaS for Afghan contracting businesses. It replaces paper-based ledgers with digital tracking of expenses, employees, contractors, machinery, timesheets, fuel usage, cash advances, attendance, assets, and maintenance.

### Core Identity
- **Domain**: Construction / Contracting (Afghanistan market)
- **Currency**: AFN (Afghani) — hardcoded throughout
- **Calendar**: Shamsi (Jalali/Persian) — using `date-fns-jalali`
- **Language**: Dari/Farsi (UI in English, PDFs support Dari text)
- **Target Users**: Site managers, accountants, foremen, project supervisors

---

## 2. Technology Stack (Current Implementation)

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Framework** | Next.js 16 (App Router) | Full-stack React framework |
| **Language** | TypeScript 5 (strict) | Type safety |
| **Styling** | Tailwind CSS 4 + shadcn/ui (New York, neutral) | UI primitives |
| **State (Client)** | Zustand 5 | Client state (auth, UI, filters, selections) |
| **State (Server)** | TanStack React Query 5 | Server data fetching & caching |
| **Database** | Prisma 6 + SQLite (primary) + PostgreSQL (secondary) | ORM |
| **Auth** | Custom JWT (bcryptjs + jsonwebtoken) | Authentication |
| **RBAC** | Custom permission engine | Authorization |
| **PDF** | @react-pdf/renderer (Vazirmatn font) | Report generation |
| **Charts** | Recharts | Dashboard analytics |
| **Forms** | react-hook-form + zod | Form validation |
| **Tables** | @tanstack/react-table | Data tables |
| **Package** | Bun | Runtime & package manager |
| **Deploy** | Docker (oven/bun) + Caddy (reverse proxy, port 81) | Production hosting |

### Key Dependencies
- `next@^16.1.1`, `react@^19.0.0`, `react-dom@^19.0.0`
- `@prisma/client@^6.11.1`, `prisma@^6.11.1`
- `zustand@^5.0.6`, `@tanstack/react-query@^5.82.0`
- `bcryptjs@^3.0.3`, `jsonwebtoken@^9.0.3`
- `@react-pdf/renderer@^4.5.1`
- `recharts@^2.15.4`, `date-fns-jalali@^4.4.0-0`
- `xlsx@^0.18.5` (Excel import/export)
- `sharp@^0.34.3` (image processing)
- `next-themes@^0.4.6` (dark/light mode)

---

## 3. Database Schema (Prisma — 21 Models)

### Dependency Order for Sync / Creation

```
1. User              → 8. Permission
2. AppSettings       → 9. RolePermission
3. Employee          → 10. UserPermission
4. Contractor        → 11. AuditLog
5. Expense           → 12. EmployeeCashAccount
6. Machinery         → 13. CashTransaction
7. MachineryRate     → 14. Transfer
8. Timesheet         → 15. Asset
9. FuelUsage         → 16. FuelTransaction
10. Attendance       → 17. MaintenanceRecord
                     → 18. AssetLog
```

### Model Details

#### 1. User
| Field | Type | Notes |
|-------|------|-------|
| id | String (cuid) | PK |
| email | String (unique) | Login |
| name | String | Display name |
| password | String | bcrypt hash (12 rounds) |
| role | String | ADMIN\|MANAGER\|USER\|WATCHER\|TIMESHEET_USER |
| avatar | String? | Image URL |
| createdAt | DateTime | auto now() |
| updatedAt | DateTime | auto updatedAt() |

Relations: UserPermission[], AuditLog[], all creator FKs on every model.

#### 2. Permission
| Field | Type | Notes |
|-------|------|-------|
| id | String (cuid) | PK |
| name | String (unique) | e.g. "expenses:view" |
| label | String | Display name |
| description | String? | |
| module | String | e.g. "expenses", "employees" |
| createdAt | DateTime | auto |

#### 3. RolePermission
| Field | Type | Notes |
|-------|------|-------|
| id | String (cuid) | PK |
| role | String | Role name |
| permissionId | String | FK → Permission |
| @@unique([role, permissionId]) | | |

#### 4. UserPermission
| Field | Type | Notes |
|-------|------|-------|
| id | String (cuid) | PK |
| userId | String | FK → User |
| permissionId | String | FK → Permission |
| granted | Boolean (default true) | |
| @@unique([userId, permissionId]) | | |

#### 5. Employee
| Field | Type | Notes |
|-------|------|-------|
| id | String (cuid) | PK |
| fullName, fatherName | String | |
| gender | String | male\|female\|other |
| dateOfBirth | DateTime? | |
| phoneNumber | String | Indexed |
| email, address, nationalId | String? | |
| jobTitle, department | String | Department enum |
| employmentType | String | FULL_TIME\|PART_TIME\|CONTRACT |
| salary | Float | |
| hireDate | DateTime | |
| status | String | ACTIVE\|INACTIVE\|TERMINATED |
| quitingDate | DateTime? | |
| idImageFront, idImageBack | String? | |
| emergencyContactName, emergencyContactPhone | String? | |
| createdBy | String | FK → User |

Relations: Expense[] (paidBy/paidTo), EmployeeCashAccount (1:1), CashTransaction[], Transfer[], Attendance[], Asset[], AssetLog[].

#### 6. Expense
| Field | Type | Notes |
|-------|------|-------|
| id | String (cuid) | PK |
| title | String | |
| description | String? | |
| category | String | 11 categories (FUEL, SALARY, etc.) |
| amount | Float | |
| paymentMethod | String | CASH\|BANK_TRANSFER\|CHECK\|CREDIT_CARD\|DEBIT_CARD\|MOBILE_PAYMENT\|OTHER |
| paidTo, paidBy | String | Text names |
| expenseDate | DateTime | |
| attachment, tags | String? | |
| notes | String? | |
| currency | String (default "AFN") | |
| paidById, paidToId | String? | FK → Employee |
| paidToContractorId, paidByContractorId | String? | FK → Contractor |
| createdBy | String | FK → User |

#### 7. Contractor
| Field | Type | Notes |
|-------|------|-------|
| id | String (cuid) | PK |
| contractorName, fatherName | String | |
| companyName, phoneNumber | String | |
| alternativePhone, email, address, nationalId | String? | |
| contractorType | String | 10 types (MACHINERY_CONTRACTOR, etc.) |
| status | String | ACTIVE\|INACTIVE\|SUSPENDED |
| notes | String? | |
| createdBy | String | FK → User |

#### 8. Timesheet
| Field | Type | Notes |
|-------|------|-------|
| id | String (cuid) | PK |
| contractorId | String | FK → Contractor |
| machineryId | String? | FK → Machinery |
| machineryRateId | String? | FK → MachineryRate |
| operatorName, workSite | String? | |
| date | DateTime | |
| startTime, lunchStart, lunchEnd, endTime | String? | HH:MM |
| totalHours | Float (default 0) | |
| overtimeHours | Float (default 0) | |
| approvedBy, approvedAt | String?, DateTime? | |
| notes | String? | |
| createdBy | String | FK → User |

#### 9. FuelUsage
| Field | Type | Notes |
|-------|------|-------|
| id | String (cuid) | PK |
| contractorId | String | FK → Contractor |
| machineryId | String? | FK → Machinery |
| fuelType | String | DIESEL\|GASOLINE\|LPG\|CNG\|OTHER |
| quantity | Float | Liters |
| unitPrice | Float | Per liter |
| totalCost | Float | qty × price |
| date | DateTime | |
| fuelStation, receiptAttachment | String? | |
| linkedExpenseId | String? | FK → Expense |
| fuelTransactionId | String? | FK → FuelTransaction |
| notes | String? | |
| createdBy | String | FK → User |

#### 10. Machinery
| Field | Type | Notes |
|-------|------|-------|
| id | String (cuid) | PK |
| machineryName | String | |
| machineryType | String | Free text |
| plateNumber, model, driverName | String? | |
| status | String | OPERATIONAL\|UNDER_MAINTENANCE\|OUT_OF_SERVICE |
| assignedContractorId | String | FK → Contractor |
| fuelType | String (default "DIESEL") | |
| hourlyConsumptionRate | Float (default 0) | Expected L/hr |
| hourlyRate, dailyRate, monthlyRate | Float (default 0) | |
| contractDaysPerMonth | Int (default 28) | |
| workHoursPerDay | Int (default 9) | |
| contractStartDate, contractEndDate | DateTime? | |
| createdBy | String | FK → User |

#### 11. MachineryRate
| Field | Type | Notes |
|-------|------|-------|
| id | String (cuid) | PK |
| machineryId | String | FK → Machinery |
| rateName | String | |
| monthlyRate, dailyRate, hourlyRate | Float | |
| contractDaysPerMonth | Int (default 28) | |
| workHoursPerDay | Int (default 9) | |
| isDefault | Boolean | |
| createdBy | String | FK → User |

#### 12. Attendance
| Field | Type | Notes |
|-------|------|-------|
| id | String (cuid) | PK |
| employeeId | String | FK → Employee |
| date | DateTime | |
| status | String | PRESENT\|ABSENT\|HALF_DAY\|LEAVE\|HOLIDAY |
| notes | String? | |
| createdBy | String | FK → User |
| @@unique([employeeId, date]) | | |

#### 13. EmployeeCashAccount
| Field | Type | Notes |
|-------|------|-------|
| id | String (cuid) | PK |
| employeeId | String (unique) | FK → Employee |
| currentBalance | Float (default 0) | |
| Relations | 1:1 with Employee | |

#### 14. CashTransaction
| Field | Type | Notes |
|-------|------|-------|
| id | String (cuid) | PK |
| employeeId | String | FK → Employee |
| type | String | ADVANCE\|RETURN\|ADJUSTMENT |
| amount | Float | |
| note, referenceNumber | String? | |
| createdById | String | FK → User |

#### 15. Transfer
| Field | Type | Notes |
|-------|------|-------|
| id | String (cuid) | PK |
| fromEmployeeId, toEmployeeId | String | FK → Employee |
| amount | Float | |
| note, referenceNumber | String? | |
| createdById | String | FK → User |

#### 16. AppSettings (Singleton)
| Field | Type | Notes |
|-------|------|-------|
| id | String (default "default") | PK |
| companyName | String (default "YakhshiLedger") | |
| companyLogo, address, phone, email, website, taxId | String? | |
| allowSignup | Boolean (default false) | |
| lastSyncTimestamp | DateTime? | For PG sync |
| updatedAt | DateTime | |

#### 17. AuditLog
| Field | Type | Notes |
|-------|------|-------|
| id | String (cuid) | PK |
| action | String | CREATE\|UPDATE\|DELETE |
| entity | String | Model name |
| entityId | String? | Record ID |
| details | String? | |
| userId | String | FK → User |

#### 18. Asset
| Field | Type | Notes |
|-------|------|-------|
| id | String (cuid) | PK |
| name, category | String | VEHICLE\|FUEL\|FURNITURE\|LAPTOP\|ELECTRONICS\|MACHINERY\|OFFICE_EQUIPMENT\|OTHER |
| purchaseDate | DateTime | |
| purchasePrice, currentValue | Float | |
| quantity | Int (default 1) | |
| serialNumber, plateNumber | String? | |
| assignedToId | String? | FK → Employee |
| status | String | ACTIVE\|IN_USE\|UNDER_REPAIR\|SOLD\|LOST |
| notes, images | String? | |
| fuelType, fuelCapacity, fuelLocation | String?, Float?, String? | For fuel containers |
| isMainContainer | Boolean (default false) | |
| createdBy | String | FK → User |

#### 19. FuelTransaction
| Field | Type | Notes |
|-------|------|-------|
| id | String (cuid) | PK |
| type | String | PURCHASE\|TRANSFER\|ISSUE |
| fuelType | String | |
| quantity | Float | |
| unitPrice, totalCost | Float? | |
| supplier | String? | |
| assetId, containerId, destinationContainerId | String? | FK → Asset |
| contractorId | String? | FK → Contractor |
| machineryId | String? | FK → Machinery |
| issuedToName, notes | String? | |
| date | DateTime | |
| createdBy | String | FK → User |

#### 20. MaintenanceRecord
| Field | Type | Notes |
|-------|------|-------|
| id | String (cuid) | PK |
| assetId | String | FK → Asset |
| serviceDate | DateTime | |
| serviceType | String | ROUTINE\|REPAIR\|INSPECTION\|TIRE_REPLACEMENT\|OIL_CHANGE\|BATTERY\|OTHER |
| cost | Float | |
| description, vendor | String? | |
| nextServiceDate | DateTime? | |
| notes | String? | |
| createdBy | String | FK → User |

#### 21. AssetLog
| Field | Type | Notes |
|-------|------|-------|
| id | String (cuid) | PK |
| assetId | String | FK → Asset |
| date | DateTime | |
| startTime, endTime | String? | |
| operatorId | String? | FK → Employee |
| startOdometer, endOdometer, distanceTraveled | Float? | |
| engineHoursStart, engineHoursEnd, engineHoursUsed | Float? | |
| fuelConsumed | Float? | |
| workSite, project, conditions, issues | String? | |
| status | String (default "PENDING") | PENDING\|APPROVED\|REJECTED |
| approvedById, approvedAt | String?, DateTime? | |
| remarks | String? | |
| createdBy | String | FK → User |

---

## 4. API Architecture (78 Routes)

### Pattern
```
/{module}          → GET (list/paginated), POST (create)
/{module}/[id]     → GET (detail), PUT (update), DELETE
/{module}/bulk     → POST (bulk operations)
/{module}/dashboard → GET (stats)
/{module}/upload   → POST (file upload)
```

### Route Map
| Module | Routes | Permissions |
|--------|--------|-------------|
| auth | login, register, me, permissions | Public / auth |
| expenses | route, [id], bulk-delete, dashboard, upload | expenses:* |
| employees | route, [id], list, bulk-action, dashboard, financial-summary, upload | employees:* |
| contractors | route, [id], list, bulk-action, dashboard, financial-report | contractors:* |
| machinery | route, [id], list, types, summary, bulk-action, [id]/rates, rates/[rateId] | machinery:* |
| timesheets | route, [id], [id]/approve, bulk | timesheets:* |
| fuel-usage | route, [id], bulk, summary, monthly-analysis, pdf, daily-detail | fuelUsage:* |
| fuel-transactions | route, [id], stock, financial-summary, avg-unit-price | fuelUsage:* |
| fuel-containers | route | fuelUsage:view |
| attendance | route, [id], bulk, summary | employees:* |
| assets | route, [id], dashboard | assets:* |
| asset-logs | route, [id], stats | assets:* |
| maintenance | route, [id] | assets:* |
| employee-wallet | route, ledger/[id], transfer | cashAdvance:* |
| cash-transactions | route, [id] | cashAdvance:* |
| users | route, [userId], [userId]/permissions | users:* |
| settings | route, upload-logo | settings:* |
| sync | route | Admin only |

### API Response Format
```typescript
// Success
{ success: true, data: T, message?: string }

// Error
{ success: false, error: string }

// Paginated
{ success: true, data: {
    data: T[], total, page, pageSize, totalPages
} }
```

### Middleware Pattern (Every Route)
1. `verifyToken(request.headers)` → JWT payload or null (401)
2. `checkUserPermission(userId, role, "module:action")` → boolean (403)
3. Parse & validate body with Zod schema
4. Execute business logic in Prisma transaction
5. Create AuditLog entry for mutations
6. Return NextResponse.json()

---

## 5. Frontend Architecture

### SPA Pattern — Single Page
- `src/app/page.tsx` is the only page
- All sections lazy-loaded via `next/dynamic` with skeleton loaders
- Navigation is client-side state (`currentSection` in Zustand)
- No Next.js file-based routing for app sections

### Component Tree
```
RootLayout (ThemeProvider + QueryProvider + Toaster)
└── Home
    ├── [LoadingAuth] → Spinner
    ├── [!Authenticated] → LoginPage
    └── [Authenticated] → AppShell
        ├── SidebarNav (permission-filtered)
        ├── Header (user menu, search)
        ├── SectionContent (switch on section)
        │   ├── DashboardPage
        │   ├── ExpensePage → ExpenseTable + ExpenseForm + DetailModal
        │   ├── EmployeePage → EmployeeTable + Form + Profile (tabs: info, salary, advances, expenses, attendance, documents)
        │   ├── ContractorPage → ContractorTable + Form + Profile (tabs: machinery, timesheets, expenses, financial)
        │   ├── MachineryPage → MachineryTable + Form + Summary + TimesheetTemplate
        │   ├── AttendancePanel → Table + Calendar + BulkForm
        │   ├── FuelUsagePage → FuelUsageForm + BatchForm + Analysis (KPIs, charts, anomalies, daily breakdown)
        │   ├── FuelPage → Stock management (financial summary, container cards, transactions, export)
        │   ├── CashAdvancePage → WalletCards + WalletDetail + AdvanceForm + ReturnForm + TransferForm + LedgerView + TransactionsList
        │   ├── AssetsPage → CRUD table
        │   ├── AssetLogsPage → Logs with inline status + PDF export
        │   ├── MaintenancePage + MaintenanceForm
        │   ├── UsersPage → Inline permission editing
        │   ├── SettingsPage → Company info, logo, sync status
        │   └── ReportsPage → Multi-tab PDF generator
        └── QuickSearch (global command palette)
```

### State Management
- **Zustand stores** (one per module): persist UI state, filters, pagination, selections
- **TanStack React Query**: server data fetching with 30s stale time, 5min GC
- **Each store follows the same pattern**:
  ```typescript
  interface XStore {
    items: X[]; selectedIds: Set<string>; filters: XFilters;
    pagination: { page, pageSize, total, totalPages };
    sorting: { sortBy, sortOrder };
    isFormOpen: boolean; editingItem: X | null; isLoading: boolean;
    dashboardStats: XDashboardStats | null; error: string | null;
    itemList: Pick<X, id | name>[]; // for dropdowns
    // CRUD actions
    fetchAll() → fetch filtered list
    create(data) → POST then re-fetch
    update(id, data) → PUT then re-fetch
    delete(id) → DELETE then re-fetch
    // Selection
    toggleSelect(id), selectAll(), clearSelection()
    // Filters
    setFilters(partial), resetFilters()
    // Pagination
    setPage(n), setPageSize(n)
    // Sorting
    setSorting(by, order)
    // UI
    openForm(item?), closeForm()
    // Dashboard
    fetchDashboard()
    // Profile
    fetchProfile(id), clearSelected()
    // Dropdown
    fetchList(status?)
    // Error
    clearError()
  }
  ```

### Service Layer
- `api.ts` — generic fetch wrapper with in-memory cache (TTL: 15s dashboards, 30s lists, 10s default)
- Module-specific service files for each domain
- `wallet.service.ts` — **server-side** business logic (wallet operations, balance recalculation, ledger computation)

---

## 6. Auth & Permissions

### Authentication
- bcryptjs (12 rounds) for password hashing
- jsonwebtoken for JWT (7-day expiry)
- Token stored in `localStorage` under key `auth_token`
- Every request: `Authorization: Bearer {token}`
- 401 response ⇒ auto-clear token ⇒ redirect to login

### JWT Payload
```typescript
{ userId: string; email: string; role: string }
```

### Permission Model
- **12 modules**: dashboard, expenses, employees, contractors, timesheets, fuelUsage, machinery, assets, cashAdvance, reports, settings, users
- **6 actions**: view, create, edit, delete, approve, managePermissions
- **~56 permission strings** total

### Roles
| Role | Permissions | Description |
|------|-------------|-------------|
| ADMIN | Wildcard `*` | Full access |
| MANAGER | 22 perms (CRUD minus delete, plus approve/manage) | Operations manager |
| USER | 18 perms (CRUD minus delete/approve/manage) | Daily user |
| WATCHER | 11 perms (view only) | Read-only |
| TIMESHEET_USER | 11 perms (view + timesheet CRUD) | Time entry specialist |

### Permission Resolution
1. If ADMIN → `true`
2. Check role defaults from `ROLE_PERMISSION_DEFAULTS` (in `permissions.ts`)
3. If role has `"*"` → `true`
4. Check `UserPermission` overrides in DB
5. Return final boolean

### Client-Side Permission Check
```typescript
// usePermissions() hook → { hasPermission, can, canView, canCreate, canEdit, canDelete, canApprove }
// Reads from Zustand store: user.permissions map
// Used for: sidebar visibility, button rendering, conditional UI
```

---

## 7. Key Business Logic

### Wallet System
- **Advance**: `balance += amount` (employee owes company)
- **Return**: `balance -= amount` (employee pays back)
- **Expense (paidBy employee)**: `balance -= amount` (auto-deduct)
- **Transfer**: `from.balance -= amount; to.balance += amount`
- **Balance formula**: `advances - expenses_paid_by - returns + transfers_in - transfers_out`
- **Ledger**: Merge CashTransaction + Expense + Transfer records, sort by date, compute running balance

### Timesheet System
- Daily entries with startTime, lunchBreak, endTime → totalHours
- Approval workflow (approvedBy/approvedAt)
- MachineryRate template for cost calculation
- Hybrid month-view editor with Shamsi calendar days
- Bulk creation API

### Fuel Analysis & Anomaly Detection
- Monthly analysis per machinery
- **Anomalies**:
  1. Month-over-month consumption change
  2. Deviation from expected (hourlyConsumptionRate × hours worked)
  3. Daily deviation from monthly average
- `warning` vs `critical` severity
- PDF export with charts

### Fuel Stock Management
- Assets with `category=FUEL` + `isMainContainer=true` = fuel containers
- Stock = `purchased + transfers_in - transfers_out - issued`
- Three transaction types: PURCHASE, TRANSFER, ISSUE
- Container-level tracking with capacity and usage %

### Sync (SQLite → PostgreSQL)
- 20 tables in FK-safe dependency order
- Batch upserts (batches of 50-200)
- Incremental: only rows where `updatedAt > lastSyncTimestamp`
- All-or-nothing with per-row error handling fallback

### PDF Reports (25 types)
Using `@react-pdf/renderer` with custom Vazirmatn font:
- Expense reports (list + detail)
- Employee reports (list, profile, expenses)
- Contractor reports (profile, financial, summary)
- Machinery reports (list, summary, per-contractor, fuel, work-hours)
- Fuel reports (summary, stock, financial, analysis, usage list, transactions)
- Asset reports (list, logs)
- Financial summary

---

## 8. Type System

### Enum Constants
- **Categories (11)**: FUEL, SALARY, MAINTENANCE, TRANSPORTATION, MACHINERY, MACHINERY_TRANSPORTATION, FOOD, MATERIALS, EQUIPMENT_RENTAL, OFFICE_EXPENSE, MISCELLANEOUS
- **Payment Methods (7)**: CASH, BANK_TRANSFER, CHECK, CREDIT_CARD, DEBIT_CARD, MOBILE_PAYMENT, OTHER
- **Departments (9)**: ADMINISTRATION, FINANCE, OPERATIONS, ENGINEERING, LOGISTICS, SECURITY, MACHINERY_TEAM, LABOR, KITCHEN
- **Contractor Types (10)**: MACHINERY_CONTRACTOR, TRANSPORTATION_CONTRACTOR, LABOR_CONTRACTOR, MATERIAL_SUPPLIER, ELECTRICAL_CONTRACTOR, PLUMBING_CONTRACTOR, SUBCONTRACTOR, CONSULTANT, STRUCTURAL_CONTRACTOR, OTHER
- **Fuel Types (5)**: DIESEL, GASOLINE, LPG, CNG, OTHER
- **Machinery Statuses (3)**: OPERATIONAL, UNDER_MAINTENANCE, OUT_OF_SERVICE
- **Attendance Statuses (5)**: PRESENT, ABSENT, HALF_DAY, LEAVE, HOLIDAY
- **Asset Categories (8)**: VEHICLE, FUEL, FURNITURE, LAPTOP, ELECTRONICS, MACHINERY, OFFICE_EQUIPMENT, OTHER
- **Asset Statuses (5)**: ACTIVE, IN_USE, UNDER_REPAIR, SOLD, LOST
- **Fuel Transaction Types (3)**: PURCHASE, TRANSFER, ISSUE
- **Maintenance Types (7)**: ROUTINE, REPAIR, INSPECTION, TIRE_REPLACEMENT, OIL_CHANGE, BATTERY, OTHER
- **Log Statuses (3)**: PENDING, APPROVED, REJECTED
- **Cash Transaction Types (3)**: ADVANCE, RETURN, ADJUSTMENT

Every enum has corresponding `LABELS` and `COLORS` maps in the types files.

---

## 9. Regionalization (Shamsi / Dari)

### Shahmsi Calendar (`src/lib/shamsi.ts`)
```typescript
import { format, addDays, getDaysInMonth, getYear, getMonth, getDate } from "date-fns-jalali";

const SHAMSI_MONTH_NAMES = [
  "حمل", "ثور", "جوزا", "سرطان", "اسد", "سنبله",
  "میزان", "عقرب", "قوس", "جدی", "دلو", "حوت",
];

formatShamsi(date, "yyyy/MM/dd") → "1404/09/22"
toShamsiYear(date), toShamsiMonth(date), toShamsiDay(date)
```

### Currency
- Hardcoded as "AFN" in Expense model default
- Displayed throughout UI as cost/amount values

---

## 10. Seed Data (Permissions)
```typescript
56 permissions total across 12 modules.
5 role mappings (ADMIN=all, MANAGER=22, USER=18, WATCHER=11, TIMESHEET_USER=11)
See `prisma/seed-permissions.ts` for exact mapping.
```

---

## 11. Deployment

### Dockerfile (Multi-stage)
1. **deps**: bun install --production
2. **builder**: bun install all, prisma generate, next build
3. **runner**: copy standalone output, serve with bun server.js

### Caddyfile
```caddy
:81 { reverse_proxy localhost:3000 }
```

### Environment
```
DATABASE_URL="file:./db/custom.db"       # SQLite local
JWT_SECRET="<secret>"
PG_DATABASE_URL="postgresql://..."       # NeonDB (optional)
PG_DIRECT_URL="postgresql://..."         # Direct Neon connection
```

---

## 12. File Tree (All Source Files)

```
yakledger/
├── .env                    # DB URLs + JWT secret
├── Caddyfile               # Reverse proxy (port 81 → 3000)
├── Dockerfile              # Multi-stage Bun build
├── next.config.ts          # standalone output, devIndicators:false
├── package.json            # 90+ deps, 12 scripts
├── tsconfig.json           # strict mode
├── tailwind.config.ts      # Tailwind 4 + shadcn
├── prisma/
│   ├── schema.prisma       # SQLite (21 models)
│   ├── schema.pg.prisma    # PostgreSQL variant
│   ├── seed-permissions.ts  # 56 permissions, 5 roles
│   └── db/custom.db        # SQLite database file
│
└── src/
    ├── app/
    │   ├── globals.css
    │   ├── layout.tsx
    │   ├── page.tsx         # SPA entry
    │   └── api/             # 78 route handlers
    ├── components/
    │   ├── auth/            # login-page.tsx
    │   ├── layout/          # app-shell, sidebar-nav, header, footer
    │   ├── common/          # spinner, confirm-dialog, empty-state, quick-search
    │   ├── dashboard/       # dashboard-page.tsx
    │   ├── expense/         # 5 components
    │   ├── employee/        # 6 components
    │   ├── contractor/      # 5 components
    │   ├── machinery/       # 6 components (incl. timesheet template)
    │   ├── attendance/      # 4 components (panel, table, calendar, bulk)
    │   ├── fuel-usage/      # 7 components (incl. analysis, charts, KPIs)
    │   ├── fuel/            # 4 components (stock, purchase, issue, transfer)
    │   ├── cash-advance/    # 8 components (wallets, forms, ledger)
    │   ├── users/           # users-page.tsx
    │   ├── settings/        # settings-page.tsx
    │   ├── reports/         # reports-page.tsx
    │   ├── maintenance/     # maintenance-page.tsx, maintenance-form.tsx
    │   ├── asset-logs/      # asset-logs-page.tsx, asset-log-form.tsx
    │   ├── pdf/             # 25 PDF document components
    │   ├── ui/              # 47 shadcn/ui primitives
    │   ├── theme-provider.tsx
    │   └── query-provider.tsx
    ├── hooks/               # 10 files (6 stores + 4 utility hooks)
    ├── lib/                 # 7 files (db, auth, permissions, shamsi, sync, utils)
    ├── services/            # 7 files (API clients + wallet service)
    ├── types/               # 4 files (expense, employee, contractor, asset)
    └── scripts/             # debug-db.ts, import-employees.ts
```

---

## 13. Recommended SaaS Architecture

### Option A: Monolith (Fastest — Next.js 16)
Same architecture, swap SQLite for PostgreSQL, add:
- Multi-tenancy: `workspaceId` on every model
- Billing: Stripe subscriptions
- Auth: Clerk/NextAuth.js for OAuth + MFA
- File storage: Uploadthing/S3
- Deployment: Vercel/Railway

### Option B: Rust Backend + TS Frontend (Best performance)
- **Frontend**: Vite + React 19 + Tailwind + shadcn/ui
- **Backend**: Axum (Rust) with SQLx/SeaORM + PostgreSQL
- **Auth**: JWT with Argon2
- **PDF**: printpdf crate
- **Charts**: Plotly.js on frontend
- **Deployment**: Docker compose (Rust binary + frontend static files + Caddy)

### Option C: Full TypeScript (Best for AI Dev)
- **Frontend**: Next.js 16 + Tailwind + shadcn
- **Backend**: Next.js API routes (what it already uses)
- **Database**: NeonDB PostgreSQL via Prisma
- **Auth**: Neon Auth (Better Auth) with built-in RLS
- **Deployment**: Vercel + NeonDB

### Multi-Tenancy Pattern
```prisma
model Workspace {
  id        String   @id @default(cuid())
  name      String
  slug      String   @unique
  createdAt DateTime @default(now())
  users     WorkspaceUser[]
}
model WorkspaceUser {
  id          String   @id @default(cuid())
  workspaceId String
  userId      String
  role        String   // owner | admin | member | viewer
  @@unique([workspaceId, userId])
}
// All business models get: workspaceId String
```

### SaaS Features to Build
1. Multi-tenancy (workspace)
2. Stripe billing (per-seat or tiered)
3. Team invitation flow
4. OAuth (Google, GitHub)
5. Enhanced analytics dashboard
6. Public REST API with API keys
7. Email notifications (invites, reports)
8. Automated daily backups
9. Audit log viewer in UI
10. Dark/light theme (already implemented)

### Rust Crate Recommendations (for Option B)
```toml
axum, tower-http (cors)
sqlx (postgres, chrono, uuid) or sea-orm
argon2, jsonwebtoken
serde, serde_json
printpdf (PDF)
chrono (dates)
validator (form validation)
uuid
```

---

## 14. Estimated Effort

| Component | Lines of Code | Effort |
|-----------|--------------|--------|
| Schema + Seeds | 750 | Low |
| API Routes | ~12,000 | High |
| Components | ~35,000 | Very High |
| PDF Documents | ~10,000 | High |
| Stores + Hooks | ~3,500 | Medium |
| Services | ~2,500 | Medium |
| Library | ~1,000 | Low |
| Types | ~1,800 | Low |
| **Total (TS/TSX)** | **~66,000** | **3-6 months (solo)** |

For an AI coding agent: provide this Plan.md and the schema as context, then generate module by module.
