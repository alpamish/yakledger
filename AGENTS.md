# AGENTS.md

Single-page ERP app ("Yakledger"): Next.js 16 App Router + React 19 + Prisma + Tailwind 4. All UI "pages" are client components in `src/components/<module>/`, registered in `src/app/page.tsx` (`SectionContent`), `src/components/layout/sidebar-nav.tsx` (`NavSection`), and `src/components/layout/header.tsx`. Server logic lives in `src/services/*.ts`; REST handlers live in `src/app/api/**/route.ts`. Package manager: bun (bun.lock); `npx` also works.

## Commands
- `bun run dev` — dev server on :3000 (logs to `dev.log`)
- `bunx tsc -p tsconfig.json --noEmit` — typecheck app code (run before every commit)
- `bun run test:types` — `tsc -p tests/tsconfig.json --noEmit` for tests
- `bun run test` — full vitest suite (~160 tests); single file: `bunx vitest run tests/path/to/file.test.ts`
- `bun run build` — `next build` + copies `.next/static` and `public` into `.next/standalone`
- `bun run lint` — eslint, but nearly every rule is disabled; not a meaningful gate

> `next.config.ts` sets `typescript.ignoreBuildErrors: true`, so `next build` does **not** typecheck. Verify types separately with tsc.

## Database
- Active dev DB is SQLite. `DATABASE_URL="file:./db/custom.db"` in `.env`, resolved relative to the schema → actual file `prisma/db/custom.db`. DB files and `.env` are gitignored.
- **Two Prisma schemas must be kept in sync on every change**: `prisma/schema.prisma` (SQLite) and `prisma/schema.pg.prisma` (Postgres/Neon). The SQLite schema uses plain `String` fields where the PG schema declares real enums. Editing one without the other breaks `db:generate` / the other client.
- No migrations: apply with `bun run db:push` (SQLite) / `bun run db:push:pg` (Neon). After schema edits run `bun run db:generate`.
- Client selection in `src/lib/db.ts`: `require("@prisma/client")` when `DATABASE_URL` starts with `file:`, else `.prisma/pg-client`. `src/lib/neon-db.ts` always uses the PG client.
- Seed data: `tsx seed.ts` (demo admin `demo@yakhshiledger.com` / `demo123`); permissions come from `prisma/seed-permissions.ts`.

## Testing (vitest, `tests/`)
- `tests/setup.ts` runs `prisma db push --schema=prisma/schema.prisma --skip-generate`, then wipes all rows (FKs off) so every test file starts empty. `fileParallelism: false`, single fork. Test DB is `prisma/db/test-vitest.db` (vitest.config.ts overrides `DATABASE_URL` and fixes `JWT_SECRET`).
- Route tests call handlers directly with `new Request("http://localhost:3000/...")` — see `tests/helpers.ts` (`seedUsers()` returns `{ adminToken, userToken, managerToken, admin, employee }`; `buildRequest()`). Service tests use the real `db` + Prisma directly.
- Ledger/wallet tests must route through the domain services (e.g. `walletService.recomputeBalance`, `companyWalletService.apply`); raw `db.cashTransaction.create` alone leaves the derived balance stale.
- Some route handlers export `PUT`/`PATCH` differently than you'd expect (e.g. `expenses/[id]/route.ts` exports `PUT`, not `PATCH`) — check the file.

## Architecture & conventions
- Every API route guards with `requirePermission(request, "<module>:<action>")` from `src/lib/permissions.ts` (returns `{ user }` or a NextResponse). Permissions = role defaults + per-user DB overrides. Key modules: `expenses`, `employees`, `cashAdvance`, `wallets`, `reports`, `payroll` (`employees:payroll:*`), `settings`, `users`.
- UI gates permissions via `usePermissions()` from `src/hooks/use-permissions.ts`.
- Services (e.g. `wallet.service.ts`, `company-wallet.service.ts`, `hr.service.ts`) own money/ledger logic; API routes are thin wrappers. Client API wrappers live in `src/services/*-api.ts` / `api.ts`.
- Route handlers return `NextResponse.json({ success: true, data: ... })` / `{ success: false, error: ... }` with proper status codes.

## Money conventions
- Payroll/HR amounts (`*_Minor` fields on Payroll/PayrollLine, salary) are **integer minor units** (1 AFN = 100). Use `toMinor` / `fromMinor` / `formatMinor` from `src/lib/money.ts`. Never float-math money.
- Wallet balances are **Float major units**: `Wallet.balance` and `EmployeeCashAccount.currentBalance`. These are derived from ledger transactions, not authoritatively stored.
- Employee cash account balance = advances + salaryPayments + adjustments − returns − deductions − earnedGross + transfersIn − transfersOut (positive means employee owes the company). `Wallet.balance` = sum of `WalletTransaction.amount` (positive adds).
- `recalculateBalance` / `companyWalletService.apply` are the recompute paths. Ledger entries and their effect (balance write, wallet debit/credit) must happen in the same `db.$transaction`.

## Contractor module (construction contracting, Phases 1–6)
- Claim lifecycle: DRAFT → SUBMITTED → (VERIFIED / FINANCE_REVIEW optional) → approve posts the ledger **exactly once** (`postedAt` guard → 409, verified under concurrent double-approve). Approved/posted financial rows are never edited or deleted in place — reverse instead.
- Ledger signs: positive increases what the company owes the contractor. `RETENTION_HELD` is positive, `RETENTION_RELEASED` negative (cash out), `ADVANCE_DISBURSED` negative; `ADVANCE_RECOVERY` entries have **amount 0** — recovery only redirects cash via `claim.advanceRecoveryTotal` (FIFO, applied at approval). Claim outstanding = `netAmount − advanceRecoveryTotal − paidAmount`.
- Retention is snapshotted on the claim (`retentionPercent` / `retentionAmount`) at claim time and released in tranches, capped at the held amount.
- Scoping: every contractor-scoped route uses `buildAccessScope(user, "contractor")`; an out-of-scope ID must 404 (bulk actions filter IDs instead of erroring).
- Compliance gate (`contractor-compliance.service.ts`): suspended/blacklisted/archived status or **expired** blocking docs (NATIONAL_ID, BUSINESS_LICENSE) block payments with 403; docs expiring within 30 days only warn via `/api/contractors/[id]/compliance`. Payments carry idempotency keys; receiver/limit are enforced when authorizations exist.
- Reports (server-aggregated only — no money math in components): finance under `/api/contractors/reports/*` (statement [en + Dari/RTL PDF], payable-aging, retention, advance-recovery, deductions, claims-payments, contract-summary), ops under `/api/contractor-ops-reports/*` (utilization, downtime, project-cost) plus `/api/machinery/fuel-variance`. UI tabs: `src/components/reports/contractor-finance-reports-tab.tsx` and `contractor-ops-reports-tab.tsx`.
- Contract numbers `CON-#####` (and contractor numbers) come from the `Sequence` table (`src/lib/contract-number.ts`) — never reused. Approved contract variations increment `contractorContract.value`, so revised budget = base + approved variations.
- `tests/lib/schema-parity.test.ts` enforces lockstep of the two Prisma schemas — run `bun run db:generate` after any schema edit.
- Demo/pilot data: `bunx tsx scripts/seed-contractor-pilot.ts` (idempotent, honours DATABASE_URL).

## Workflow
- Commit only files related to the task. The working tree frequently carries unrelated in-progress changes (approvals page, settings page, backup utilities, fonts, `.gitignore`, `package.json`/`bun.lock`, `next-env.d.ts`) that must remain untouched and unstaged.
