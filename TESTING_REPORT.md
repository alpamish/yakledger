# Enhanced Overall Testing — Report

**Project:** YakLedger (Next.js 16, Prisma, JWT/RBAC construction ledger)
**Date:** 2026-08-06
**Scope:** Static gates + new automated test suite + DB integrity + runtime smoke + Neon verification.

## 1. Executive summary

| Gate | Command | Result |
|---|---|---|
| Type-check (app) | `npx tsc --noEmit` | ✅ clean |
| Production build | `npm run build` | ✅ `Compiled successfully` |
| Type-check (tests) | `npm run test:types` | ✅ clean |
| Lint | `npm run lint` | ❌ 156 errors / 11 warnings |
| Automated tests | `npm test` (`vitest run`) | ✅ **60 passed** (7 files) |
| Runtime smoke (local SQLite) | `curl` against `localhost:3000` | ✅ `/api/auth/me`, `/api/expenses`, `/api/machinery/types` all 200 |
| DB integrity (custom.db) | `npx tsx scripts/db-integrity-check.ts` | ⚠️ 3 issues (2 FAIL, 1 WARN) |
| Neon schema | `Neon` table listing | ✅ schema intact (21 tables) |

The app **builds and runs**, and the new test suite passes. Two categories of pre-existing issues were surfaced (lint + production-data integrity). One latent logic bug in the Shamsi calendar helper was caught by writing tests.

## 2. What I added

This repo previously had **no** test infrastructure (no test runner, no test files, no `test` script). I added a Vitest suite:

```
tests/
  tsconfig.json              # test-only tsconfig (vitest/globals + node types)
  setup.ts                   # wipes the disposable SQLite DB + runs prisma db push per file
  helpers.ts                 # seedUsers(), buildRequest() (typed JWT-authenticated requests)
  lib/
    auth.test.ts             # 7  — JWT sign/verify, token extraction
    access-control.test.ts   # 10 — scope building, approval-status resolution, withScope
    permissions.test.ts      # 9  — role defaults, per-user deny/allow overrides
    shamsi-utils.test.ts     # 9  — digit normalization, date round-trips, formatCurrency
  services/
    wallet.service.test.ts   # 11 — advance/return/transfer/adjustment balance math + ledger
  api/
    expenses-contractors.test.ts #10 — auth 401/403, zod 400, CRUD, wallet deduction on expense create
    machinery.test.ts         # 4  — auth, create, detail 200, 404
scripts/
  db-integrity-check.ts      # one-off read-only DB verification script
vitest.config.ts             # node env, isolated test DB, single-fork for deterministic setup
```

`package.json` gained: `test`, `test:watch`, `test:coverage`, `test:types`, `vitest.config.ts`, and `dev` dep `vitest`, `@vitest/coverage-v8`, `happy-dom`.

**Key design decision:** integration tests run against a **disposable SQLite DB** (`prisma/db/test-vitest.db`, gitignored) that `setup.ts` wipes+synchronizes per file, so production data is never touched. The `db.ts` runtime switch (sqlite `@prisma/client` vs the Neon `pg-client`) is driven by `DATABASE_URL`, so pointing it at a `file:` URL exercises the exact same code path the local app uses.

## 3. Findings

### Finding 1 — ESLint: 156 errors (latent runtime bug pattern) — ❌ HIGH
The single largest contributor is `react-hooks/rules-of-hooks` (149 of 156) in **10 page/profile components**:
```
src/components/expense/expense-page.tsx          (20)
src/components/employee/employee-page.tsx        (20)
src/components/users/users-page.tsx              (20)
src/components/contractor/contractor-page.tsx    (18)
src/components/machinery/machinery-page.tsx      (18)
src/components/timesheet/timesheet-page.tsx      (18)
src/components/settings/settings-page.tsx        (14)
src/components/cash-advance/cash-advance-page.tsx ( 2)
src/components/assets/assets-page.tsx            ( 3)
src/components/contractor/contractor-profile.tsx ( 7)
src/components/employee/employee-profile.tsx       ( 5)
```
All share the same anti-pattern: a permission guard **before** hooks:
```tsx
export function ExpensePage() {
  const { canView } = usePermissions();
  if (!canView('expenses')) return null;   // ← early return BEFORE hooks below
  const [open, setOpen] = useState(false); // ← eslint: "React Hook called conditionally"
  ...
```
This "works" only because `canView(...)` currently returns `true` at runtime, so the early return never fires. The moment a permission flips (e.g. WATCHER role, or a `UserPermission` denial), React throws a hook-order mismatch and the page crashes. **This is a real correctness bug, masked by always-true guards.** Recommended fix: move all `useState`/`useEffect`/`useCallback`/`useMemo` declarations **above** the early return (guards should return after hooks, or be lifted out).

The remaining 8 errors are `@typescript-eslint/no-require-imports` (4 locations — stylistic; the `db.ts` conditional `require()` is the intentional sqlite/pg client switch):
- `src/lib/db.ts:5-6`, `src/lib/neon-db.ts:1`, `check-expenses.ts:1-2`, `scripts/import-employees.ts:57-58`.

### Finding 2 — Production DB: wallet balances drift from the canonical formula — ❌ HIGH
`scripts/db-integrity-check.ts` recomputes `EmployeeCashAccount.currentBalance` using the **exact** formula in `wallet.service.recalculateBalance` (advances − expenses − returns + transfers_in − transfers_out, APPROVED-only). On `prisma/db/custom.db`: **6 of 7 accounts mismatch**, e.g.:
- `استاد جمشید`: stored **+41,048** vs recomputed **−314,040** (off by ~355k)
- `حاجی عبدالبشیر`: stored **−4,040,564** vs recomputed **−3,983,224**
- `انجنیر انعام الله`: stored **−119,864** vs recomputed **−174,864**

**Why:** `wallet.service` updates balances **incrementally** (`createAdvance`, `deductFromWallet`, `createTransfer`, …) and **never reconciles**. When an expense is later approved (rather than created approved by an ADMIN) the `deductFromWallet` path in `POST /api/expenses` — which only fires for admin-created approved expenses — does not fire, so `currentBalance` and the recomputed sum diverge. Conclusion: **`EmployeeCashAccount.currentBalance` is unreliable in production** and should be reconciled via `recalculateBalance` (or the incremental writes must always run on approval).

### Finding 3 — 20 `Expense.expenseDate` values stored as epoch numbers — ❌ MEDIUM
20 rows in `Expense` store `expenseDate` as a raw epoch integer (e.g. `1778457600000`) instead of an ISO string, e.g. rows `f3dddc8d-…`, `4f90b56d-…`. This is exactly the data-quality problem the **already-present but uncommitted** `check-expenses.ts` script targets. Risk: any code path that treats `expenseDate` as a string (the `/api/expenses` GET returns the raw value; PDF reports and the frontend `new Date(expenseDate)` parsing) gets inconsistent results. Recommended: run `npx tsx check-expenses.ts` (its own script) or a parameterized UPDATE to normalize these 20 rows to ISO.

### Finding 4 — Negative computed fuel stock on one container — ⚠️ MEDIUM/WARN
`FuelTransaction` stock (`purchased + transfers_in − transfers_out − issued`) is **negative (−14,413)** for one container. Could be (a) the app's exact stock formula differs slightly from my approximation in the check, or (b) a real data inconsistency (issued > purchased). Needs a product-owner to confirm the canonical stock formula, then a one-off reconciliation.

### Finding 5 — Latent bug: `getShamsiMonthDays` builds a Gregorian Date — ⚠️ MEDIUM
`src/lib/shamsi.ts:23`:
```ts
export function getShamsiMonthDays(year: number, month: number): number {
  return jalaliGetDaysInMonth(new Date(year, month)); // ← year/month interpreted as GREGORIAN
}
```
`new Date(1404, 0)` is Gregorian year 1404, not Shamsi 1404. `date-fns-jalali`'s `getDaysInMonth` then resolves the Jalali month for that Gregorian instant, returning the **wrong day count** (e.g. returns 30 for Farvardin 1404 which has 31). This is consumed by `machinery-timesheet-template.tsx:378`, so Shamsi day-grids can render with the wrong number of days. The test suite now pins the (currently incorrect) behavior with a shape assertion and a TODO; correct implementation converts the Shamsi Y/M/D to a Gregorian `Date` first (e.g. via `date-fns-jalali`'s `parse`).

### Finding 6 — Neon `neondb` schema is intact but a production `User` count is 0 — ⚠️ LOW/OBSERVATION
The `server.log` "The table `main.User` does not exist" error is **not** a Neon problem — `main.User` is SQLite syntax. Verified via the Neon API that `public.*"User"` exists on the `yakledger` project, all 21 tables match `schema.pg.prisma`. However, `SELECT count(*) FROM "User"` on `neondb` returns **0** while the local SQLite has 2 users / 1580 expenses. So: (a) the stale server.log error came from an old SQLite startup against an un-seeded file (now resolved), and (b) if Neon is meant to be the live production DB, its rows haven't been populated by sync — confirm with the operator whether SQLite or Neon is authoritative.

### Finding 7 — Internal permission constants are not exported — ℹ️ NOTE
`ROLE_PERMISSION_DEFAULTS` and `ADMIN_ROLES` in `src/lib/permissions.ts` are module-internal (no `export`). This is a deliberate encapsulation (they're exercised via `checkUserPermission`/`getEffectivePermissions`), not a bug — the test suite verifies behavior through the public API rather than importing the constants.

## 4. What passes cleanly (no concerns)
- TypeScript strict compilation (app)
- Next.js production build (all 90+ route handlers compile)
- JWT auth flow (hash/verify, sign, tamper detection, header extraction)
- RBAC engine (ADMIN wildcard, role defaults, per-user deny/allow overrides via `UserPermission`)
- Access-control scope building (`buildAccessScope`, `withScope`, `findAccessibleRecord` semantics)
- Wallet core math: advance/return/transfer/adjustment, self-transfer guard, positive-amount guard, ledger running balance, expense-linked deduction
- Expenses API: 401/403, zod 400 on missing/unpositive amount/invalid category, 201 create, audit-log write, wallet auto-deduct
- Contractors & Machinery API: auth, create-with-FK, list, 404 for unknown id
- Shamsi digit normalization, `shamsiToGregorian` round-trip + range/structure validation, `formatCurrency`

## 5. Recommendation (do-this-next, in priority order)
1. **Fix the 10 components' hook ordering** (Finding 1) — unblocks lint and removes a latent crash.
2. **Re-run `recalculateBalance` against all employees in `custom.db`** (Finding 2) to reconcile `currentBalance`, then backfill the missing incremental paths so approvals re-trigger a balance recomputation.
3. **Normalize the 20 bad `Expense.expenseDate` rows** via the existing `check-expenses.ts` (Finding 3).
4. **Fix `getShamsiMonthDays`** (Finding 5) to construct a genuine Jalali date, then re-assert with the correct 31-day value.
5. Extend the suite: approvals workflow (`/api/approvals/[entity]/[id]`), fuel-usage analytics, and a light E2E smoke with Playwright once the above are stable.

## 6. How to run it
```bash
bun install            # one-time
npm test               # → vitest (60 checks, ~25s)
npm run test:types     # → tsc on tests/
npx tsx scripts/db-integrity-check.ts   # → read-only custom.db verification
```
Nothing in `tests/` or `scripts/db-integrity-check.ts` touched production data — the integration tests run on an isolated, wiped-per-file SQLite DB (`prisma/db/test-vitest.db`, gitignored).
