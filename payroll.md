# Yakledger Payroll Module — Complete Reference

---

## 1. Architecture Overview

The payroll module follows the Yakledger pattern: **thin API routes** delegate to **service-layer business logic** (`src/services/hr.service.ts`), which owns all money calculations, transactions, and audit events. The UI is a single-page client component in `src/components/payroll/` that communicates via a typed client API wrapper (`src/services/payroll-api.ts`).

**Data flow:** UI → Client API → Next.js Route Handlers → HR Service → Prisma/SQLite → Client API → UI.

**Key design guarantees:**
- Salary for any historical date is derived from `SalaryHistory`, never the current employee record, so approved payroll is never retroactively affected.
- Future-dated salary changes do not affect current calculations.
- All mutations run in transactions and write audit events to `EmployeeAuditEvent`.
- Money is exact: integer minor units everywhere in HR; floats only for legacy fields.

---

## 2. Database Models

### 2.1 `Payroll`

| Field | Type | Default | Notes |
|---|---|---|---|
| `id` | `String @id` | `cuid()` | |
| `employeeId` | `String` | | FK to Employee, cascade delete |
| `periodStart` | `DateTime` | | Start of payroll period |
| `periodEnd` | `DateTime` | | End of payroll period |
| `currency` | `String` | `"AFN"` | |
| `status` | `String` | `"DRAFT"` | Only `"DRAFT"` and `"APPROVED"` |
| `notes` | `String?` | | |
| `walletId` | `String?` | | FK to Wallet (company wallet to pay from) |
| `approvedById` | `String?` | | FK to User |
| `approvedAt` | `DateTime?` | | |
| `revertedById` | `String?` | | |
| `revertedAt` | `DateTime?` | | |
| `reversalReason` | `String?` | | Free-text revert reason |
| `createdById` | `String?` | | FK to User |
| `createdAt` | `DateTime` | `now()` | |
| `updatedAt` | `DateTime` | `@updatedAt` | |

**Unique constraint:** `@@unique([employeeId, periodStart, periodEnd])` — one payroll per employee per period.

**Relations:** `lines` (PayrollLine[]), `allocations` (PayrollAdvanceAllocation[]), `expenses` (Expense[]), `employee`, `wallet`, `createdBy`, `approvedBy`.

### 2.2 `PayrollLine`

| Field | Type | Default | Notes |
|---|---|---|---|
| `id` | `String @id` | `cuid()` | |
| `payrollId` | `String` | | FK to Payroll, cascade delete |
| `employeeId` | `String` | | FK to Employee, cascade delete |
| `baseSalaryMinor` | `Int` | `0` | Pro-rated salary in minor units |
| `currency` | `String` | `"AFN"` | |
| `attendanceDays` | `Float` | `0` | Approved present + 0.5 × half-days |
| `workDays` | `Int` | `0` | Expected days (out of 30) |
| `overtimeHours` | `Float` | `0` | Approved OT hours |
| `overtimePayMinor` | `Int` | `0` | OT pay in minor units |
| `allowancesMinor` | `Int` | `0` | |
| `bonusesMinor` | `Int` | `0` | |
| `deductionsMinor` | `Int` | `0` | |
| `grossPayMinor` | `Int` | `0` | |
| `expensesPaidMinor` | `Int` | `0` | Period-scoped employee-paid expenses |
| `deductExpenses` | `Boolean` | `true` | Whether to deduct expenses from debt |
| `amountAlreadyReceivedMinor` | `Int` | `0` | Prior advances covering this gross |
| `previousDebtMinor` | `Int` | `0` | Employee's total debt before this period |
| `advancesDeductedMinor` | `Int` | `0` | Actual advances allocated (FIFO) at approval |
| `netPayableMinor` | `Int` | `0` | net = gross − debt |
| `remainingEmployeeDebtMinor` | `Int` | `0` | Debt remaining after this period |
| `paymentStatus` | `String` | `"UNPAID"` | `"UNPAID"` or `"PAID"` |
| `paymentMethod` | `String?` | | |
| `netPayMinor` | `Int` | `0` | `max(netPayableMinor, 0)` — actual payout |
| `salarySnapshotDate` | `DateTime?` | | The SalaryHistory effectiveFrom used |

### 2.3 `PayrollAdvanceAllocation`

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id` | |
| `payrollId` | `String` | FK to Payroll, cascade delete |
| `cashTransactionId` | `String` | FK to CashTransaction, cascade delete |
| `amountMinor` | `Int` | Allocated amount |
| `createdAt` | `DateTime` | |

**Unique constraint:** `@@unique([payrollId, cashTransactionId])` — an advance can never be allocated to the same payroll twice.

---

## 3. Money Conventions

### 3.1 Minor Units (HR/Payroll)

All HR financial fields (`baseSalaryMinor`, `grossPayMinor`, `netPayableMinor`, `allowancesMinor`, etc.) are stored as **integer minor units** where `1 AFN = 100` minor units.

From `src/lib/money.ts`:
```typescript
export const MINOR_PER_UNIT = 100;
toMinor(amount: number | string): number    // 25000 → 2500000
fromMinor(minor: number): number            // 2500000 → 25000
formatMinor(minor: number, currency = "AFN"): string  // → "AFN 25,000.00"
```

- `toMinor` uses `Math.round(n * 100)` to avoid float drift.
- `fromMinor` divides by 100.
- `formatMinor` uses `Intl.NumberFormat` with 2 decimal places.

### 3.2 Major Units (Wallets)

- `Wallet.balance` and `EmployeeCashAccount.currentBalance` are **Float major units**. They are derived quantities, recomputed from the ledger (sum of `WalletTransaction.amount` for company wallets; complex formula for employee wallets).

### 3.3 Conversion at API Boundaries

The client API (`payroll-api.ts`) sends allowances/bonuses/deductions as major-unit Float AFN values. The API route handler converts them to minor units via `toMinor()` before passing to the service layer.

---

## 4. Service Layer Functions

All in `src/services/hr.service.ts`.

### 4.1 `generatePayroll(params)`

**Signature:**
```typescript
async function generatePayroll(params: {
  employeeId: string;
  periodStart: Date | string;
  periodEnd: Date | string;
  createdById: string;
  allowancesMinor?: number;
  bonusesMinor?: number;
  deductionsMinor?: number;
  walletId?: string;
  deductExpenses?: boolean;
  workDays?: number;
}): Promise<{ payroll: any; created: boolean }>
```

**Behavior:**

1. **Idempotency:** Looks up existing Payroll by unique `(employeeId, periodStart, periodEnd)`. If found (DRAFT or APPROVED), returns it as-is with `created: false`.

2. **Salary resolution:** Calls `getEmployeeSalaryAtDate(employeeId, periodEnd)` to find the SalaryHistory record whose `effectiveFrom <= periodEnd` (latest first). Throws `"No salary found for employee in this period"` if none.

3. **Work days calculation (auto):**
   - If `workDays` is not provided, reads the employee's `hireDate`.
   - If hired on/before `periodStart`: `workDays = min(totalDaysInMonth, 30)`.
   - If hired mid-month: `workDays = totalDaysInMonth - hireDate.getDate() + 1`.
   - Fallback: 30.

4. **Attendance aggregation (only APPROVED records):**
   - `attendanceDays` = count(PRESENT) + count(HALF_DAY) × 0.5
   - `overtimeHours` = sum(overtimeHours) from all approved attendance in the period

5. **Salary pro-rating:**
   ```
   baseSalaryMinor = round(monthlySalaryMinor × workDays / 30)
   ```

6. **Overtime pay:**
   ```
   hourlyMinor = round(monthlySalaryMinor / 30 / paidDailyHours)
   overtimePayMinor = round(hourlyMinor × overtimeRate × overtimeHours)
   ```

7. **Gross pay:**
   ```
   grossPayMinor = baseSalaryMinor + overtimePayMinor + allowancesMinor + bonusesMinor − deductionsMinor
   ```

8. **Debt/advance figures:** Calls `computePayrollFigures()`.

9. **Creates** a `Payroll` (status DRAFT) with nested `PayrollLine` containing all computed figures.

**Business rules:**
- If `deductExpenses` is not explicitly `false`, it defaults to `true`.
- `netPayMinor = max(netPayableMinor, 0)` — never negative.
- `salarySnapshotDate` records which SalaryHistory was used (for historical audit).

### 4.2 `computePaidDailyHours(emp)`

Computes the number of paid hours per work day from the employee's schedule:

```
if (workStartTime && workEndTime are set):
    diff_minutes = (endHour×60 + endMin) − (startHour×60 + startMin)
    if diff < 0: diff += 1440    // handles midnight-crossing (e.g., 22:00 → 06:00)
    paid = diff − breakMinutes
    if paid > 0: return paid / 60

fallback: return workHoursPerDay ?? 9
```

### 4.3 `computePayrollFigures(employeeId, periodStart, periodEnd, grossPayMinor, deductExpenses)`

**Core debt/reimbursement calculation.** Returns an object with seven fields.

**Formulas:**

1. `priorEarnedMinor` = SUM(PayrollLine.grossPayMinor) WHERE employee is this one, payroll status is APPROVED, and periodEnd < current periodStart. (Total gross from all prior approved payrolls.)

2. `receivedMinor` = SUM(CashTransaction.amount for ADVANCE + SALARY_PAYMENT types, approved, created <= periodEnd) converted to minor units MINUS SUM(CashTransaction.amount for RETURN type, approved, created <= periodEnd) converted to minor units.

3. `totalExpensesMinor` = SUM(Expense.amount for employee-paid expenses with `deductFromWallet != false`, approved, expenseDate <= periodEnd) in minor units. (Cumulative across all time up to period end.)

4. `periodExpensesMinor` = Same as above but scoped to `expenseDate >= periodStart AND <= periodEnd`. (Only the current period's expenses.)

5. `previousDebtMinor = receivedMinor − priorEarnedMinor − (deductExpenses ? totalExpensesMinor : 0)`

6. `amountAlreadyReceivedMinor = max(0, min(grossPayMinor, previousDebtMinor))`

7. `netPayableMinor = grossPayMinor − previousDebtMinor`

8. `remainingEmployeeDebtMinor = max(previousDebtMinor − grossPayMinor, 0)`

**Interpretation:**
- `previousDebtMinor > 0` means the employee owes the company (received more than earned so far).
- `previousDebtMinor < 0` means the company owes the employee (expenses paid or over-deduction).
- `netPayableMinor > 0` means the company pays the employee.
- `netPayableMinor < 0` means the employee still owes after this period's salary.

### 4.4 `allocateAdvances(tx, employeeId, periodEnd, payrollId, amountMinor)`

**Purpose:** FIFO allocation of approved employee advances to a specific payroll, ensuring no advance is ever allocated twice across approved payrolls.

**Algorithm:**
1. Sum all `PayrollAdvanceAllocation.amountMinor` for this employee's APPROVED payrolls (ADVANCE type only).
2. Get all approved ADVANCE CashTransactions for this employee up to `periodEnd`, ordered by `createdAt ASC`.
3. `availableMinor = max(0, totalAdvancesMinor − priorAllocMinor)`
4. `toAllocate = min(amountMinor, availableMinor)`
5. Iterate advances in FIFO order, allocating `min(advanceAmount, toAllocate)` per advance, creating `PayrollAdvanceAllocation` records.

**Returns:** Total amount allocated.

### 4.5 `approvePayroll(payrollId, approvedById, opts?)`

**Signature:**
```typescript
async function approvePayroll(
  payrollId: string,
  approvedById: string,
  opts?: { paymentMethod?: string; walletId?: string }
)
```

**Behavior (all inside a single `db.$transaction`):**

1. **Guard:** Throws if not found. If already APPROVED, returns as-is (idempotent).

2. **Recompute figures at approval time:** Calls `computePayrollFigures()` again because the ledger may have changed since draft was generated.

3. **Allocate advances:** Calls `allocateAdvances()` with the recomputed `amountAlreadyReceivedMinor`.

4. **Net payment:** `netPayMinor = max(fig.netPayableMinor, 0)`. If positive:
   - If a `walletId` is specified (from opts or the draft), calls `companyWalletService.deductForPayroll()` which validates the wallet is active and has sufficient balance.
   - Creates a `CashTransaction` of type `"SALARY_PAYMENT"` with `approvalStatus: "APPROVED"`.
   - Creates an `Expense` record of category `"SALARY"` with `approvalStatus: "APPROVED"`.

5. **Update payroll:** Sets `status: "APPROVED"`, `approvedById`, `approvedAt`. Updates the line with recomputed figures.

6. **Audit event:** Creates `PAYROLL_APPROVED` in `EmployeeAuditEvent`.

7. **Post-transaction:** Recomputes employee wallet balance via `walletService.recomputeBalance(employeeId)`.

**Wallet deduction rules (from `company-wallet.service.ts`):**
- If `amount <= 0`, no-op.
- Validates wallet exists and is active.
- Recomputes wallet balance from ledger (not cached field).
- Throws `"Insufficient balance in wallet..."` if balance < amount.
- Creates a `WalletTransaction` of type `"PAYROLL"` with negative amount.

### 4.6 `updatePayrollLine(lineId, updates)`

**Editable fields (DRAFT only):**
- `overtimeHours` — recomputes OT pay and gross
- `allowancesMinor` — recomputes gross
- `bonusesMinor` — recomputes gross
- `deductionsMinor` — recomputes gross
- `deductExpenses` — recomputes debt figures
- `walletId` — updates the parent Payroll record
- `netPayableMinor` — manual override (skips formula)
- `remainingEmployeeDebtMinor` — manual override (skips formula)

**Recomputation logic:**
1. Recalculate overtime pay from the updated hours.
2. Recalculate gross: `baseSalary + OT pay + allowances + bonuses − deductions`.
3. Recalculate debt figures via `computePayrollFigures()` with updated `deductExpenses`.
4. If manual overrides for `netPayableMinor` or `remainingEmployeeDebtMinor` are provided, use them instead of computed values.
5. `netPayMinor = max(netPayableMinor, 0)`.

**Guard:** Throws `"Only draft payroll lines can be edited"` if the parent payroll is not DRAFT.

### 4.7 `revertPayroll(payrollId, userId, reason?)`

**Purpose:** Undo an approved payroll back to DRAFT.

**Guard checks:**
- Must exist.
- Must be APPROVED (throws otherwise).
- Must not have been already reverted (`revertedAt` must be null).

**Steps (inside a transaction):**
1. Delete linked Expenses (`payrollId` match).
2. Delete linked CashTransactions (`payrollId` match — salary payments).
3. Delete PayrollAdvanceAllocation records (frees advances for re-allocation).
4. Reverse any company wallet deductions via `companyWalletService.reversePayrollDeduction()`.
5. Update payroll: `status: "DRAFT"`, clear `approvedById`/`approvedAt`, set `revertedById`, `revertedAt`, `reversalReason`.
6. Create audit event `PAYROLL_REVERTED`.

**Post-transaction:** Recomputes employee wallet balance.

**Cannot revert:** Draft payrolls, already-reverted payrolls.

### 4.8 `deletePayroll(payrollId, userId)`

**Guards:**
- Must exist.
- Must be DRAFT. (Approved must be reverted first.)
- Must have no linked expenses.

**Steps (transaction):**
1. Create audit event `PAYROLL_DELETED`.
2. Delete the payroll (cascades to PayrollLine).

### 4.9 `getEmployeeFinancialSummary(employeeId)`

Returns a per-employee financial summary:
- `daysWorked`: approved attendance since hire (PRESENT + 0.5 × HALF_DAY). Falls back to calendar days if no attendance records.
- `earnedSalary`: `dailySalary × daysWorked + overtimePay`
- `totalPaid`: salaryPayments + expensesPaidTo + reimbursements
- `totalReceived`: salaryPayments + expensesPaidTo + advancesReceived
- `outstanding`: `earnedSalary + reimbursements − totalReceived` (positive = company owes employee)

### 4.10 `computeAttendanceHours(employeeId, checkInTime?, checkOutTime?, explicitOvertimeHours?)`

Computes worked hours and overtime from clock-in/out times.
- `workedHours = (checkOut − checkIn) / 3_600_000`
- If explicit overtime supplied, uses it. Otherwise: `overtime = max(0, workedHours − paidDailyHours)`.

### 4.11 Salary History Functions

- `getEmployeeSalaryAtDate(employeeId, date)` — finds the latest SalaryHistory record with `effectiveFrom <= date`.
- `getCurrentEmployeeSalary(employeeId)` — calls the above with today's date.
- `getSalaryHistory(employeeId, order)` — returns all salary history records.
- `createSalaryChange(params)` — creates a SalaryHistory row, syncs employee.baseSalaryMinor if effective now, writes audit event. Validates: no duplicate effective date, no conflicting later record.

### 4.12 `sanitizeSalaryFields(emp, canViewSalary)`

Strips `salary` and `baseSalaryMinor` from an employee object if the caller lacks `employees:salary:view` permission.

---

## 5. API Routes

### 5.1 `GET /api/payroll`

**File:** `src/app/api/payroll/route.ts`
**Permission:** `employees:payroll:view`

**Query parameters:**
| Param | Default | Notes |
|---|---|---|
| `status` | — | Filter by DRAFT/APPROVED |
| `search` | — | Search by fullName or employeeNumber |
| `page` | `1` | |
| `pageSize` | `10` | Max 100 |

**Access scoping:** Uses `buildAccessScope(user, "employee")` to restrict visible employees based on the user's role and permissions.

**Response:**
```json
{
  "success": true,
  "data": {
    "data": ["...payroll records with lines, employee, wallet, createdBy, approvedBy"],
    "total": "number",
    "page": "number",
    "pageSize": "number",
    "totalPages": "number",
    "summary": {
      "totalGrossMinor": "number",
      "totalAlreadyReceivedMinor": "number",
      "totalPreviousDebtMinor": "number",
      "totalNetPayableMinor": "number",
      "totalRemainingDebtMinor": "number",
      "totalExpensesMinor": "number",
      "paidLines": "number",
      "unpaidLines": "number"
    }
  }
}
```

### 5.2 `POST /api/payroll`

**Permission:** `employees:payroll:manage`

**Request body (validated by `payrollGenerateSchema`):**
```json
{
  "periodStart": "2026-06-01",
  "periodEnd": "2026-06-30",
  "employeeIds": ["optional-array"],
  "allowancesMinor": 0,
  "bonusesMinor": 0,
  "deductionsMinor": 0,
  "walletId": "optional",
  "deductExpenses": true,
  "workDays": 30
}
```

**Behavior:**
- If `employeeIds` is omitted or empty, generates for all non-TERMINATED employees in the user's access scope.
- Uses `Promise.allSettled()` for parallel generation.
- Returns counts of generated, skipped, and errors.

**Response:**
```json
{
  "success": true,
  "data": {
    "generated": "number",
    "skipped": "number",
    "errors": ["employeeId: error message"]
  },
  "message": "Generated X payroll record(s), Y skipped (already exist)"
}
```

### 5.3 `PATCH /api/payroll/[id]`

**Permission:** `employees:payroll:manage`

**Request body (validated by `payrollLineUpdateSchema`):**
```json
{
  "lineId": "required",
  "overtimeHours": 0,
  "allowancesMinor": 0,
  "bonusesMinor": 0,
  "deductionsMinor": 0,
  "netPayableMinor": 0,
  "remainingEmployeeDebtMinor": 0,
  "deductExpenses": true,
  "walletId": "optional"
}
```

The API converts major-unit allowances/bonuses/deductions to minor units via `toMinor()` before calling `updatePayrollLine()`.

### 5.4 `DELETE /api/payroll/[id]`

**Permission:** `employees:payroll:manage`

Calls `deletePayroll(id, user.id)`. Returns `{ success: true, message: "Payroll record deleted" }`.

### 5.5 `GET /api/payroll/export`

**Permission:** `employees:payroll:view`

**Query parameters:**
| Param | Notes |
|---|---|
| `status` | Filter |
| `periodStart` | Date range filter |
| `periodEnd` | Date range filter |
| `format` | `"json"` (default `"csv"`) |

**JSON mode:** Returns full payroll records with employee details (fullName, employeeNumber, department, jobTitle).

**CSV mode:** Returns a CSV with columns: Employee No, Employee, Department, Period Start, Period End, Status, Gross (AFN), Employee Expenses (AFN), Already Received (AFN), Previous Debt (AFN), Net Payable (AFN), Payment Status, Remaining Debt (AFN). All monetary values are divided by 100 for display.

### 5.6 `GET /api/employees/[id]/payroll`

**Permission:** `employees:payroll:view`

Returns all payroll records for a specific employee, including lines and wallet info, ordered by periodStart descending.

### 5.7 `POST /api/employees/[id]/payroll`

**Permission:** `employees:payroll:manage`

**Request body:**
```json
{
  "payrollId": "...",
  "action": "approve | revert",
  "paymentMethod": "CASH",
  "reason": "optional revert reason",
  "walletId": "optional"
}
```

Dispatches to `approvePayroll()` or `revertPayroll()`.

---

## 6. Client API

Defined in `src/services/payroll-api.ts`:

```typescript
payrollApi.list(params: PayrollListParams)       // GET /api/payroll?...
payrollApi.generate(body: PayrollGenerateBody)    // POST /api/payroll
payrollApi.approve(employeeId, payrollId, paymentMethod?, walletId?)  // POST /api/employees/[id]/payroll
payrollApi.revert(employeeId, payrollId, reason?)                     // POST /api/employees/[id]/payroll
payrollApi.delete(id)                              // DELETE /api/payroll/[id]
payrollApi.updateLine(payrollId, data)             // PATCH /api/payroll/[id]
```

**Error handling:** 401 redirects to `/`. Other errors throw `ApiError` with the server message.

---

## 7. Validation Schemas

Defined in `src/lib/validations/hr.ts`.

### `payrollGenerateSchema`
```typescript
z.object({
  periodStart: z.string().min(1),
  periodEnd: z.string().min(1),
  employeeIds: z.array(z.string()).optional(),
  allowancesMinor: z.number().int().min(0).optional(),
  bonusesMinor: z.number().int().min(0).optional(),
  deductionsMinor: z.number().int().min(0).optional(),
  walletId: z.string().optional(),
  deductExpenses: z.boolean().optional(),
  workDays: z.number().int().min(1).max(31).optional(),
})
```

### `payrollLineUpdateSchema`
```typescript
z.object({
  lineId: z.string().min(1),
  overtimeHours: z.number().min(0).optional(),
  allowancesMinor: z.number().int().min(0).optional(),
  bonusesMinor: z.number().int().min(0).optional(),
  deductionsMinor: z.number().int().min(0).optional(),
  netPayableMinor: z.number().int().optional(),           // can be negative
  remainingEmployeeDebtMinor: z.number().int().min(0).optional(),
  deductExpenses: z.boolean().optional(),
  walletId: z.string().optional(),
})
```

---

## 8. UI Components

### 8.1 `PayrollPage` (`src/components/payroll/payroll-page.tsx`)

**Features:**
- **Summary cards:** Total Gross, Expenses, Already Received, Net Payable (highlighted), Remaining Debt. Shows paid/unpaid counts.
- **Sortable table** via `@tanstack/react-table` with columns: Period, Employee, OT Hours, Gross, Expenses, Allowances, Bonuses, Deductions, Already Received, Prev Debt, Net Payable, Remaining Debt, Payment (badge), Wallet, By, Actions.
- **Search** by employee name/number with debounced input.
- **Status filter** dropdown: All, DRAFT, APPROVED.
- **Edit Mode toggle** (requires `employees:payroll:manage`): DRAFT rows become editable inline. Editable fields: OT Hours, Expenses (deductExpenses toggle), Allowances, Bonuses, Deductions, Net Payable, Remaining Debt, Wallet (dropdown). All save on blur via `handleInlineSave()`.
- **Pagination** with page size selector (10/25/50/100) and smart page number display with ellipsis.
- **Live refresh** every 30 seconds via `useLiveRefresh`.
- **Permission gating:** Returns null if `!canView`.

### 8.2 `PayrollActions` (`src/components/payroll/payroll-actions.tsx`)

For DRAFT payrolls:
- **"Approve & Pay"** dialog: Select payment method (from `PAYMENT_METHODS`), select wallet (shows balances), confirm.
- **"Delete"** with destructive confirmation dialog.

For APPROVED payrolls:
- **"Revert to Draft"** with destructive confirmation dialog. Hardcoded reason: "Manual correction".

### 8.3 `PayrollGenerateDialog` (`src/components/payroll/payroll-generate-dialog.tsx`)

Form with fields:
- Period Start / Period End (date pickers, defaults to current month)
- Allowances / Bonuses / Deductions (AFN major units)
- Work Days (optional, auto-calculates from hire date)
- Pay from Wallet (dropdown with balances)
- Deduct Employee Expenses toggle (default on)

Validates: periodEnd >= periodStart. Calls `payrollApi.generate()`.

### 8.4 `PayrollExportDropdown` (`src/components/payroll/payroll-export-dropdown.tsx`)

Dropdown with four export options:
- **CSV:** Downloads from the server-side CSV endpoint.
- **Excel (.xlsx):** Fetches JSON, builds workbook via `xlsx` library with two sheets: "Payroll" (per-line detail) and "Summary" (totals).
- **PDF (Full):** Fetches JSON, renders `PayrollPDFDocument`.
- **PDF (Summary):** Fetches JSON, renders `PayrollSummaryPDFDocument`.

PDF options require `reports:generatePdf` permission.

---

## 9. PDF Documents

### 9.1 `PayrollPDFDocument` (`src/components/pdf/payroll-pdf-document.tsx`)

Landscape A4 document with 14 columns: #, Emp No, Employee, Dept, Period, Status, Gross, Expenses, Received, Prev Debt, Net Payable, Rem. Debt, Payment, Wallet.

- Data sorted by department then gross pay (descending).
- Row height: 22px. First page: 14 rows. Continuation pages: 19 rows.
- Totals row on the last page.
- Footer: record count, total net payable, signature lines (Prepared By / Approved By), company name.
- Uses Vazirmatn font (Persian/Arabic support).
- Status filter displayed if active.

### 9.2 `PayrollSummaryPDFDocument` (`src/components/pdf/payroll-summary-pdf-document.tsx`)

Same layout but with 12 columns focused on a summary view: #, Emp No, Employee, **Position**, Period, Status, **Salary**, **Work Days**, **OverTime**, Net Payable, Payment, **Dept**.

- Footer shows total salary and total net payable.

---

## 10. Permission Model

### 10.1 Payroll-Specific Permissions

| Permission | Label | Module |
|---|---|---|
| `employees:payroll:view` | View Payroll | employees |
| `employees:payroll:manage` | Manage Payroll | employees |
| `reports:generatePdf` | Generate Report PDFs | reports |

### 10.2 Role Assignments

| Role | `payroll:view` | `payroll:manage` | `generatePdf` |
|---|---|---|---|
| ADMIN | Yes (wildcard `*`) | Yes | Yes |
| MANAGER | Yes | Yes | Yes |
| USER | No | No | No |
| WATCHER | No | No | No |
| TIMESHEET_USER | No | No | No |
| EXPENSE_USER | No | No | No |
| DATA_ENTRY | No | No | No |

Individual users can have per-user permission overrides via `UserPermission` records in the database.

### 10.3 Access Scoping

The GET endpoint uses `buildAccessScope(user, "employee")` to restrict which employees' payroll records are visible. ADMIN/MANAGER roles see all; restricted roles see only employees they have access to via `RecordAccess` grants.

---

## 11. Employee Wallet Integration

### 11.1 Balance Formula (`wallet.service.ts`)

```
balance =
  advances + salaryPayments + adjustments
  − returns − deductions
  − earnedGross (from approved PayrollLines)
  + transfersIn − transfersOut
  − expensesPaidBy (approved employee-paid expenses with deductFromWallet)
```

Positive balance = employee owes the company. Negative = company owes the employee.

### 11.2 Payroll Approval Wallet Effects

1. Employee wallet: Recomputed after approval (salary payment increases what they "received").
2. Company wallet (if specified): Deducted by `netPayMinor / 100` with a `"PAYROLL"` WalletTransaction.
3. CashTransaction created: type `"SALARY_PAYMENT"`, amount = `netPayMinor / 100`.
4. Expense created: category `"SALARY"`, amount = same, linked to payroll.

### 11.3 Payroll Revert Wallet Effects

1. Expense and CashTransaction records deleted.
2. Advance allocations freed.
3. Company wallet reversal: `"REVERSAL"` WalletTransaction created with negated amount.
4. Employee wallet recomputed.

---

## 12. Edge Cases and Special Behaviors

### 12.1 Idempotency
- `generatePayroll`: Returns existing record if one exists for the same employee+period (DRAFT or APPROVED). Never duplicates.
- `approvePayroll`: Returns existing if already APPROVED. No double-settlement.

### 12.2 Midnight-Crossing Work Schedules
`computePaidDailyHours` handles schedules like 22:00–06:00 by adding 1440 minutes when the difference is negative, correctly computing 8 paid hours.

### 12.3 Mid-Month Hire Date
When an employee is hired mid-month and `workDays` is not specified:
- `workDays = totalDaysInMonth − hireDate.getDate() + 1`
- Salary is pro-rated: `baseSalaryMinor = round(monthlySalary × workDays / 30)`.

### 12.4 No Attendance Records
If an employee has no attendance records, `attendanceDays = 0` and `overtimeHours = 0`, but the full pro-rated salary still applies.

### 12.5 Negative Net Payable (Employee Owes)
When `previousDebtMinor > grossPayMinor`:
- `netPayableMinor` is negative.
- `netPayMinor = max(netPayableMinor, 0) = 0` — nothing is paid out.
- `paymentStatus = "UNPAID"`.
- The remaining debt carries forward to the next period.
- Advance allocations still happen up to `amountAlreadyReceivedMinor`.

### 12.6 Employee-Paid Expenses
- Expenses reduce the employee's debt (company owes them more).
- Only expenses with `deductFromWallet != false` are counted.
- The `deductExpenses` toggle allows excluding all expenses from the debt calculation.
- Period-scoped expenses (`periodExpensesMinor`) are displayed separately from total cumulative expenses used in debt calculation.

### 12.7 Reimbursement Through Payroll
When the company owes the employee (e.g., employee-paid expense of 1000 AFN):
- `previousDebtMinor = −toMinor(1000)` (negative = company owes)
- `netPayableMinor = grossPayMinor + 1000`
- The employee gets salary + reimbursement in one payment.

### 12.8 Advance Double-Counting Prevention
The `PayrollAdvanceAllocation` model ensures each advance is allocated at most once per payroll. Prior allocations are summed and subtracted from total advances to get the available amount. The FIFO algorithm iterates chronologically.

### 12.9 Insufficient Wallet Balance
If the selected company wallet has insufficient funds, `approvePayroll` throws `"Insufficient balance in wallet..."`. The payroll remains DRAFT, no expense or payment record is created.

### 12.10 Revert After Approval
Revert removes all settlement artifacts (expenses, payments, advance allocations, wallet deductions) and returns the payroll to DRAFT. The employee's wallet is recomputed.

### 12.11 Batch Generation Error Handling
The POST endpoint uses `Promise.allSettled()`, so a failure for one employee (e.g., missing salary) does not prevent generation for others. Errors are collected and returned in the response.

### 12.12 Edit Mode Overrides
When editing a DRAFT line, the user can manually override `netPayableMinor` and `remainingEmployeeDebtMinor`, bypassing the automatic formula. This allows correcting for special situations.

---

## 13. Test Coverage

### Test Files:
- `tests/hr/payroll-figures.test.ts` — core calculations and edge cases
- `tests/hr/payroll-advance.test.ts` — debt carry-forward, advance allocation, revert
- `tests/hr/payroll-wallet.test.ts` — company wallet deduction, insufficient balance, revert
- `tests/hr/payroll-reimbursement.test.ts` — expense settlement through payroll
- `tests/api/payroll-export.test.ts` — JSON/CSV export, permissions

### Test Suites in `payroll-figures.test.ts`:

1. **`computePayrollFigures` edge cases** (6 tests):
   - Employee with no attendance (0 days worked)
   - RETURN transactions reduce received amount
   - Expenses with `deductFromWallet=false` are excluded
   - Expenses with `deductFromWallet=true` reduce debt
   - Only counts expenses up to periodEnd
   - Correctly tracks prior earned from approved payrolls

2. **Payroll with allowances, bonuses, deductions** (2 tests):
   - Applies allowances, bonuses, deductions to gross
   - Batch generation for multiple employees

3. **Batch generation error handling** (1 test):
   - Collects errors for employees without salary

4. **`computePaidDailyHours` edge cases** (2 tests):
   - Midnight-crossing schedule (22:00–06:00)
   - Zero break minutes

5. **Skip duplicate drafts on generation** (4 tests):
   - Returns existing DRAFT without creating new
   - Returns existing APPROVED as immutable
   - Can generate for a different period

6. **Delete draft payroll** (5 tests):
   - Deletes a DRAFT payroll
   - Cannot delete an APPROVED payroll
   - Cannot delete non-existent
   - Allows re-generation after deletion
   - Creates audit event on deletion

7. **Expense deduction toggle** (4 tests):
   - `deductExpenses=false` excludes expenses
   - Stores `deductExpenses=false` on PayrollLine
   - Stores period-scoped `expensesPaidMinor`
   - `approvePayroll` respects the toggle

8. **`updatePayrollLine`** (6 tests):
   - Updates allowances and recalculates gross
   - Updates bonuses and recalculates gross
   - Flips deductExpenses and recalculates debt
   - Rejects editing non-DRAFT lines
   - Updates overtime hours and recalculates overtime pay

---

## 14. Business Rules Summary

1. **One payroll per employee per period** (database constraint).
2. **Drafts are editable; approved payrolls are immutable** (must revert to edit).
3. **Debt is cumulative** across periods — advances and prior earnings carry forward.
4. **Advances are allocated FIFO** and never double-counted across payrolls.
5. **Salary is always derived from SalaryHistory**, not the current employee record.
6. **Approved attendance is the only source** for attendance days and overtime.
7. **Overtime uses the employee's schedule** (paid daily hours) for the hourly rate.
8. **Expense deduction is togglable** per payroll line.
9. **Period-scoped expenses are displayed** separately from cumulative expenses.
10. **Company wallet validation** happens at approval time, not draft time.
11. **Revert fully undoes approval**: removes payments, expenses, allocations, wallet deductions.
12. **Delete only works on drafts** with no linked expenses.
13. **Batch generation** tolerates individual failures via `Promise.allSettled`.
14. **Manual overrides** are allowed for net payable and remaining debt on draft lines.
15. **All mutations are transactional** and create audit events.
16. **Wallet balances are always recomputed** from the ledger after any payroll settlement.
17. **No employee wallet is created** for employees with no cash activity (even after payroll approval).
