import { GET as GET_STATEMENT } from "@/app/api/contractors/reports/statement/route";
import { GET as GET_AGING } from "@/app/api/contractors/reports/payable-aging/route";
import { GET as GET_RETENTION } from "@/app/api/contractors/reports/retention/route";
import { GET as GET_ADVANCE_RECOVERY } from "@/app/api/contractors/reports/advance-recovery/route";
import { GET as GET_DEDUCTIONS } from "@/app/api/contractors/reports/deductions/route";
import { GET as GET_CLAIMS_PAYMENTS } from "@/app/api/contractors/reports/claims-payments/route";
import { GET as GET_OUTSTANDING } from "@/app/api/contractors/[id]/outstanding/route";
import { POST as POST_CONTRACTOR } from "@/app/api/contractors/route";
import { POST as POST_CONTRACT } from "@/app/api/contracts/route";
import { POST as POST_RATE } from "@/app/api/contracts/[id]/rates/route";
import { POST as POST_TIMESHEET } from "@/app/api/timesheets/route";
import { POST as POST_CLAIM } from "@/app/api/contractor-claims/route";
import { POST as CLAIM_ACTION } from "@/app/api/contractor-claims/[id]/route";
import { POST as ADD_DEDUCTION } from "@/app/api/contractor-claims/[id]/deductions/route";
import { POST as POST_ADVANCE } from "@/app/api/contractor-advances/route";
import { POST as POST_PAYMENT } from "@/app/api/contractor-payments/route";
import { POST as ALLOCATE } from "@/app/api/contractor-payments/[id]/allocations/route";
import { db } from "@/lib/db";
import { generateToken } from "@/lib/auth";
import { seedUsers, buildRequest } from "../helpers";

let tokens: Awaited<ReturnType<typeof seedUsers>>;
let contractorId: string;
let machineryId: string;
let contractId: string;
let watcherToken = "";

/**
 * Seeded financial picture for the single in-scope contractor (all money via
 * the shared engine; the report tests only aggregate these rows):
 *
 *   Claim 1 (period 2026-01-15): 8h × 150 = 1200 gross, retention 10% = 120,
 *     FUEL deduction 100 → net 980, posted. Paid 300 (2026-04-01) → outstanding 680.
 *     Retention released 50 (2026-04-05).
 *   Advance (2026-02-01): 500 @ 25% recovery.
 *   Claim 2 (period 2026-03-15): gross 1200, retention 120, net 1080, posted.
 *     Advance recovery 270 (25% of net) → outstanding 810. Advance left 230.
 *
 *   Ledger balance (sum of amounts, per the claim-service convention where
 *   retention held is a positive liability and release is negative):
 *     980+120 +1080+120+0 −500 −300 −50 = 1450 owed to the contractor.
 *   Portfolio outstanding (cash still payable) = 680 + 810 = 1490.
 */
async function makeTimesheet(date: string): Promise<string> {
  const res = await POST_TIMESHEET(
    buildRequest("/api/timesheets", {
      token: tokens.adminToken,
      method: "POST",
      body: { contractorId, machineryId, contractId, rateLabel: "HOUR", date, totalHours: 8 },
    })
  );
  const body = await res.json();
  expect(res.status).toBe(201);
  return body.data.id;
}

async function createPostedClaim(date: string, deductions: { type: string; description: string; amount: number }[] = []) {
  const claimRes = await POST_CLAIM(
    buildRequest("/api/contractor-claims", {
      token: tokens.adminToken,
      method: "POST",
      body: { contractId, timesheetIds: [await makeTimesheet(date)], title: "Report claim" },
    })
  );
  expect(claimRes.status).toBe(201);
  const claim = (await claimRes.json()).data;

  for (const d of deductions) {
    const res = await ADD_DEDUCTION(
      buildRequest(`/api/contractor-claims/${claim.id}/deductions`, {
        token: tokens.adminToken,
        method: "POST",
        body: d,
      }),
      { params: Promise.resolve({ id: claim.id }) }
    );
    expect(res.status).toBe(201);
  }

  const submit = await CLAIM_ACTION(
    buildRequest(`/api/contractor-claims/${claim.id}`, { token: tokens.adminToken, method: "POST", body: { action: "submit" } }),
    { params: Promise.resolve({ id: claim.id }) }
  );
  expect(submit.status).toBe(200);
  const approve = await CLAIM_ACTION(
    buildRequest(`/api/contractor-claims/${claim.id}`, { token: tokens.adminToken, method: "POST", body: { action: "approve" } }),
    { params: Promise.resolve({ id: claim.id }) }
  );
  expect(approve.status).toBe(200);
  return claim as { id: string; claimNumber: string };
}

beforeAll(async () => {
  tokens = await seedUsers();

  const conRes = await POST_CONTRACTOR(
    buildRequest("/api/contractors", {
      token: tokens.adminToken,
      method: "POST",
      body: {
        contractorName: "Reports Co",
        fatherName: "Father",
        phoneNumber: "0777000000",
        contractorType: "MACHINERY_CONTRACTOR",
        machinery: [
          { machineryName: "Bulldozer B1", machineryType: "BULLDOZER", hourlyRate: 150, dailyRate: 0, monthlyRate: 0 },
        ],
      },
    })
  );
  const conBody = await conRes.json();
  expect(conRes.status).toBe(201);
  contractorId = conBody.data.id;
  const machinery = await db.machinery.findFirst({ where: { assignedContractorId: contractorId } });
  machineryId = machinery!.id;

  const contractRes = await POST_CONTRACT(
    buildRequest("/api/contracts", {
      token: tokens.adminToken,
      method: "POST",
      body: {
        contractorId,
        title: "Reports test contract",
        contractType: "MACHINERY_HIRE",
        value: 500000,
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        retentionPercent: 10,
        workHoursPerDay: 8,
      },
    })
  );
  expect(contractRes.status).toBe(201);
  contractId = (await contractRes.json()).data.id;

  const rateRes = await POST_RATE(
    buildRequest(`/api/contracts/${contractId}/rates`, {
      token: tokens.adminToken,
      method: "POST",
      body: { label: "HOUR", rateType: "HOURLY", amount: 150, effectiveFrom: "2026-01-01", isDefault: true },
    }),
    { params: Promise.resolve({ id: contractId }) }
  );
  expect(rateRes.status).toBe(201);

  // Claim 1: net 980 (deduction 100), retention 120.
  const claim1 = await createPostedClaim("2026-01-15", [
    { type: "FUEL", description: "Fuel recovered", amount: 100 },
  ]);

  // Advance BEFORE claim 2 so the FIFO recovery lands on it.
  const advRes = await POST_ADVANCE(
    buildRequest("/api/contractor-advances", {
      token: tokens.adminToken,
      method: "POST",
      body: { contractorId, amount: 500, date: "2026-02-01", recoveryPercent: 25 },
    })
  );
  expect(advRes.status).toBe(201);

  // Claim 2: net 1080; recovers 270 of the advance; outstanding 810.
  const claim2 = await createPostedClaim("2026-03-15");

  // Pay 300 against claim 1.
  const payRes = await POST_PAYMENT(
    buildRequest("/api/contractor-payments", {
      token: tokens.adminToken,
      method: "POST",
      body: { contractorId, amount: 300, paymentDate: "2026-04-01", method: "BANK_TRANSFER" },
    })
  );
  expect(payRes.status).toBe(201);
  const payment = (await payRes.json()).data;
  const alloc = await ALLOCATE(
    buildRequest(`/api/contractor-payments/${payment.id}/allocations`, {
      token: tokens.adminToken,
      method: "POST",
      body: { allocations: [{ claimId: claim1.id, amount: 300 }] },
    }),
    { params: Promise.resolve({ id: payment.id }) }
  );
  expect(alloc.status).toBe(201);

  // Release part of claim 1's retention.
  const release = await CLAIM_ACTION(
    buildRequest(`/api/contractor-claims/${claim1.id}`, {
      token: tokens.adminToken,
      method: "POST",
      body: { action: "releaseRetention", amount: 50, date: "2026-04-05", reason: "Partial release" },
    }),
    { params: Promise.resolve({ id: claim1.id }) }
  );
  expect(release.status).toBe(200);
  expect(claim2.id).toBeTruthy();

  // A WATCHER holds reports:view but no content:contractors → sees only
  // contractors they created (none), never the admin-created one.
  const watcher = await db.user.create({
    data: {
      id: "u_watcher_rep",
      email: "watcher@rep.test",
      name: "Watcher Rep",
      password: "x",
      role: "WATCHER",
    },
  });
  watcherToken = generateToken({ userId: watcher.id, email: watcher.email, role: watcher.role });
});

describe("Contractor statement report", () => {
  it("returns the full-history statement reconciling to the ledger", async () => {
    const res = await GET_STATEMENT(
      buildRequest(`/api/contractors/reports/statement?contractorId=${contractorId}`, { token: tokens.adminToken })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()).data;

    expect(body.contractorName).toBe("Reports Co");
    expect(body.openingBalance).toBe(0);
    // Ledger convention (see contractor-claim.service): CLAIM_POSTED posts the
    // net payable, RETENTION_HELD is a POSITIVE liability (owed, just later),
    // ADVANCE_RECOVERY is 0 by design (disbursement already reduced balance),
    // and RETENTION_RELEASED is negative (cash paid out removes the debt).
    // Balance = 980+120+0+1080+120−500−300−50 = 1450.
    expect(body.currentBalance).toBe(1450);
    expect(body.closingBalance).toBe(1450);
    expect(body.totalInPeriod).toBe(1450);
    // 8 entries: claim 1 posts 2 (posted + held), advance 1, claim 2 posts 3
    // (posted + held + recovery-0), payment 1, retention release 1.
    expect(body.lines).toHaveLength(8);

    expect(body.totalsByType.CLAIM_POSTED).toBe(2060); // 980 + 1080
    expect(body.totalsByType.RETENTION_HELD).toBe(240);
    expect(body.totalsByType.ADVANCE_DISBURSED).toBe(-500);
    expect(body.totalsByType.ADVANCE_RECOVERY).toBe(0);
    expect(body.totalsByType.PAYMENT).toBe(-300);
    expect(body.totalsByType.RETENTION_RELEASED).toBe(-50);

    // Lines run chronologically and the running balance closes correctly.
    expect(body.lines[0].type).toBe("ADVANCE_DISBURSED");
    expect(body.lines[0].occurredAt.startsWith("2026-02-01")).toBe(true);
    expect(body.lines[body.lines.length - 1].balanceAfter).toBe(1450);
  });

  it("windows the statement around explicit ledger dates", async () => {
    // Entries strictly before 2026-03-01: only the advance (−500).
    const res = await GET_STATEMENT(
      buildRequest(`/api/contractors/reports/statement?contractorId=${contractorId}&from=2026-03-01&to=2026-12-31`, {
        token: tokens.adminToken,
      })
    );
    const body = (await res.json()).data;
    expect(body.openingBalance).toBe(-500);
    // In window: payment −300, release −50, claim1 +980+120, claim2 +1080+120+0.
    expect(body.totalInPeriod).toBe(1950);
    expect(body.closingBalance).toBe(1450);
    expect(body.currentBalance).toBe(1450); // window never changes the live balance
  });

  it("validates the contractorId and scopes access", async () => {
    const missing = await GET_STATEMENT(
      buildRequest("/api/contractors/reports/statement", { token: tokens.adminToken })
    );
    expect(missing.status).toBe(400);

    const unknown = await GET_STATEMENT(
      buildRequest("/api/contractors/reports/statement?contractorId=nonexistent", { token: tokens.adminToken })
    );
    expect(unknown.status).toBe(404);
  });
});

describe("Payable aging report", () => {
  it("buckets outstanding posted claims by age at asOf", async () => {
    const res = await GET_AGING(
      buildRequest("/api/contractors/reports/payable-aging?asOf=2026-04-01", { token: tokens.adminToken })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()).data;

    // Claim 1: periodEnd 2026-01-15 → 76 days → 61-90, outstanding 680.
    // Claim 2: periodEnd 2026-03-15 → 17 days → 0-30, outstanding 810.
    expect(body.totals["61-90"]).toBe(680);
    expect(body.totals["0-30"]).toBe(810);
    expect(body.totals.current).toBe(0);
    expect(body.totals["90+"]).toBe(0);
    expect(body.grandTotal).toBe(1490);

    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].contractorId).toBe(contractorId);
    expect(body.rows[0].total).toBe(1490);
    expect(body.rows[0].claimCount).toBe(2);
  });

  it("reconciles with the per-contractor outstanding endpoint", async () => {
    const aging = await GET_AGING(
      buildRequest("/api/contractors/reports/payable-aging?asOf=2026-04-01", { token: tokens.adminToken })
    );
    const outstanding = await GET_OUTSTANDING(
      buildRequest(`/api/contractors/${contractorId}/outstanding`, { token: tokens.adminToken }),
      { params: Promise.resolve({ id: contractorId }) }
    );
    expect((await aging.json()).data.grandTotal).toBe((await outstanding.json()).data.totalOutstanding);
  });
});

describe("Retention report", () => {
  it("reports held, released, and still-withheld retention", async () => {
    const res = await GET_RETENTION(
      buildRequest("/api/contractors/reports/retention", { token: tokens.adminToken })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()).data;

    expect(body.totalHeld).toBe(240); // 120 + 120 snapshotted on the posted claims
    expect(body.totalReleased).toBe(50);
    expect(body.totalBalance).toBe(190);

    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].held).toBe(240);
    expect(body.rows[0].released).toBe(50);
    expect(body.rows[0].balance).toBe(190);
    expect(body.rows[0].claimCount).toBe(2);
  });
});

describe("Advance recovery report", () => {
  it("reports disbursed vs recovered vs outstanding", async () => {
    const res = await GET_ADVANCE_RECOVERY(
      buildRequest("/api/contractors/reports/advance-recovery", { token: tokens.adminToken })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()).data;

    expect(body.totalDisbursed).toBe(500);
    expect(body.totalRecovered).toBe(270);
    expect(body.totalWrittenOff).toBe(0);
    expect(body.totalOutstanding).toBe(230);

    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].outstanding).toBe(230);
  });
});

describe("Deductions report", () => {
  it("breaks deductions down by type per contractor", async () => {
    const res = await GET_DEDUCTIONS(
      buildRequest("/api/contractors/reports/deductions", { token: tokens.adminToken })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()).data;

    expect(body.grandTotal).toBe(100);
    expect(body.totalsByType.FUEL).toBe(100);

    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].byType.FUEL).toBe(100);
    expect(body.rows[0].total).toBe(100);
    expect(body.rows[0].deductionCount).toBe(1);
  });
});

describe("Claims & payments report", () => {
  it("summarises claims and payments per contractor", async () => {
    const res = await GET_CLAIMS_PAYMENTS(
      buildRequest("/api/contractors/reports/claims-payments", { token: tokens.adminToken })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()).data;

    expect(body.totals.claimCount).toBe(2);
    expect(body.totals.grossAmount).toBe(2400);
    expect(body.totals.retentionAmount).toBe(240);
    expect(body.totals.deductionsTotal).toBe(100);
    expect(body.totals.netAmount).toBe(2060); // 980 + 1080
    expect(body.totals.paidAmount).toBe(300);
    expect(body.totals.outstanding).toBe(1490); // 680 + 810
    expect(body.totals.paymentCount).toBe(1);
    expect(body.totals.paymentsTotal).toBe(300);
    expect(body.totals.reversedTotal).toBe(0);

    const row = body.rows.find((r: { contractorId: string }) => r.contractorId === contractorId);
    expect(row.netAmount).toBe(2060);
    expect(row.outstanding).toBe(1490);
  });

  it("nets the statement balance against the same components", async () => {
    // Claims net − payments − advances disbursed + recoveries/retention effects
    // must land on the live ledger balance (release adds back, held subtracts).
    const statement = await GET_STATEMENT(
      buildRequest(`/api/contractors/reports/statement?contractorId=${contractorId}`, { token: tokens.adminToken })
    );
    const s = (await statement.json()).data;
    expect(s.currentBalance).toBe(
      s.totalsByType.CLAIM_POSTED +
        s.totalsByType.RETENTION_HELD +
        s.totalsByType.RETENTION_RELEASED +
        s.totalsByType.ADVANCE_DISBURSED +
        s.totalsByType.ADVANCE_RECOVERY +
        s.totalsByType.PAYMENT
    );
  });
});

describe("Access control", () => {
  it("rejects unauthenticated requests", async () => {
    const aging = await GET_AGING(buildRequest("/api/contractors/reports/payable-aging"));
    expect(aging.status).toBe(401);

    const statement = await GET_STATEMENT(buildRequest("/api/contractors/reports/statement?contractorId=x"));
    expect(statement.status).toBe(401);
  });

  it("scopes a restricted WATCHER out of the admin's contractor", async () => {
    const aging = await GET_AGING(
      buildRequest("/api/contractors/reports/payable-aging?asOf=2026-04-01", { token: watcherToken })
    );
    expect(aging.status).toBe(200);
    const agingBody = (await aging.json()).data;
    expect(agingBody.rows).toHaveLength(0);
    expect(agingBody.grandTotal).toBe(0);

    const claims = await GET_CLAIMS_PAYMENTS(
      buildRequest("/api/contractors/reports/claims-payments", { token: watcherToken })
    );
    expect((await claims.json()).data.rows).toHaveLength(0);

    const statement = await GET_STATEMENT(
      buildRequest(`/api/contractors/reports/statement?contractorId=${contractorId}`, { token: watcherToken })
    );
    expect(statement.status).toBe(404);
  });

  it("lets a USER with reports:view read the scoped portfolio", async () => {
    const res = await GET_RETENTION(
      buildRequest("/api/contractors/reports/retention", { token: tokens.userToken })
    );
    // USER holds contractors:edit, which implies content:contractors — so the
    // full portfolio is in scope (unlike the WATCHER above).
    expect(res.status).toBe(200);
    const body = (await res.json()).data;
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].contractorId).toBe(contractorId);
  });
});
