import { POST as POST_CONTRACTOR } from "@/app/api/contractors/route";
import { POST as POST_CONTRACT } from "@/app/api/contracts/route";
import { POST as POST_RATE } from "@/app/api/contracts/[id]/rates/route";
import { POST as POST_TIMESHEET } from "@/app/api/timesheets/route";
import { POST as POST_CLAIM } from "@/app/api/contractor-claims/route";
import { GET as GET_CLAIM_DETAIL, POST as CLAIM_ACTION, PUT as CLAIM_PUT, DELETE as DELETE_CLAIM } from "@/app/api/contractor-claims/[id]/route";
import { POST as ADD_DEDUCTION, DELETE as DELETE_DEDUCTION } from "@/app/api/contractor-claims/[id]/deductions/route";
import { POST as POST_APPROVAL_ACTION } from "@/app/api/approvals/[entity]/[id]/route";
import { GET as GET_APPROVALS } from "@/app/api/approvals/route";
import { POST as POST_ADVANCE } from "@/app/api/contractor-advances/route";
import { POST as WRITE_OFF } from "@/app/api/contractor-advances/[id]/write-off/route";
import { POST as POST_PAYMENT, GET as GET_PAYMENTS } from "@/app/api/contractor-payments/route";
import { POST as ALLOCATE } from "@/app/api/contractor-payments/[id]/allocations/route";
import { POST as REVERSE_PAYMENT } from "@/app/api/contractor-payments/[id]/reverse/route";
import { GET as GET_LEDGER } from "@/app/api/contractors/[id]/ledger/route";
import { GET as GET_OUTSTANDING } from "@/app/api/contractors/[id]/outstanding/route";
import { db } from "@/lib/db";
import { seedUsers, buildRequest } from "../helpers";

let tokens: Awaited<ReturnType<typeof seedUsers>>;
let contractorId: string;
let machineryId: string;
let contractId: string;

/** Create + approve a timesheet of 8h on the shared contract. */
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

beforeAll(async () => {
  tokens = await seedUsers();

  const conRes = await POST_CONTRACTOR(
    buildRequest("/api/contractors", {
      token: tokens.adminToken,
      method: "POST",
      body: {
        contractorName: "Financials Co",
        fatherName: "Father",
        phoneNumber: "0777777777",
        contractorType: "MACHINERY_CONTRACTOR",
        machinery: [
          { machineryName: "Excavator E1", machineryType: "EXCAVATOR", hourlyRate: 150, dailyRate: 0, monthlyRate: 0 },
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
        title: "Financials test contract",
        contractType: "MACHINERY_HIRE",
        value: 500000,
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        retentionPercent: 10,
        workHoursPerDay: 8,
      },
    })
  );
  const contractBody = await contractRes.json();
  expect(contractRes.status).toBe(201);
  contractId = contractBody.data.id;

  const rateRes = await POST_RATE(
    buildRequest(`/api/contracts/${contractId}/rates`, {
      token: tokens.adminToken,
      method: "POST",
      body: { label: "HOUR", rateType: "HOURLY", amount: 150, effectiveFrom: "2026-01-01", isDefault: true },
    }),
    { params: Promise.resolve({ id: contractId }) }
  );
  expect(rateRes.status).toBe(201);
});

async function createDraftClaim(timesheetIds: string[]): Promise<{ id: string; claimNumber: string }> {
  const res = await POST_CLAIM(
    buildRequest("/api/contractor-claims", {
      token: tokens.adminToken,
      method: "POST",
      body: { contractId, timesheetIds, title: "Test claim" },
    })
  );
  expect(res.status).toBe(201);
  const body = await res.json();
  return body.data;
}

describe("Claim creation and math", () => {
  it("builds a claim from approved timesheets with snapshot rates and retention", async () => {
    const tsIds = [await makeTimesheet("2026-02-01"), await makeTimesheet("2026-02-02")];
    const claim = await createDraftClaim(tsIds);

    const detail = await GET_CLAIM_DETAIL(
      buildRequest(`/api/contractor-claims/${claim.id}`, { token: tokens.adminToken }),
      { params: Promise.resolve({ id: claim.id }) }
    );
    const body = (await detail.json()).data;

    expect(body.claimNumber).toMatch(/^CLM-\d{5}$/);
    expect(body.grossAmount).toBe(2400); // 2 × 8h × 150
    expect(body.retentionPercent).toBe(10);
    expect(body.retentionAmount).toBe(240);
    expect(body.netAmount).toBe(2160); // 2400 − 240
    expect(body.lines).toHaveLength(2);
    expect(body.lines[0].rateAmount).toBe(150); // snapshot
    expect(body.status).toBe("DRAFT");
  });

  it("rejects an unapproved timesheet", async () => {
    // USER-created timesheets stay PENDING (non-admin).
    const res = await POST_TIMESHEET(
      buildRequest("/api/timesheets", {
        token: tokens.userToken,
        method: "POST",
        body: { contractorId, machineryId, contractId, date: "2026-02-05", totalHours: 8 },
      })
    );
    const ts = (await res.json()).data;

    const claimRes = await POST_CLAIM(
      buildRequest("/api/contractor-claims", {
        token: tokens.adminToken,
        method: "POST",
        body: { contractId, timesheetIds: [ts.id] },
      })
    );
    expect(claimRes.status).toBe(400);
    const err = await claimRes.json();
    expect(err.error).toContain("not approved");
  });

  it("rejects a timesheet from another contract", async () => {
    const tsId = await makeTimesheet("2026-02-06");
    const otherRes = await POST_CLAIM(
      buildRequest("/api/contractor-claims", {
        token: tokens.adminToken,
        method: "POST",
        body: { contractId, timesheetIds: [tsId], title: "Will fail" },
      })
    );
    expect(otherRes.status).toBe(201); // first claim succeeds

    // A second contract for the same contractor; its claim cannot reuse the timesheet.
    const c2 = await POST_CONTRACT(
      buildRequest("/api/contracts", {
        token: tokens.adminToken,
        method: "POST",
        body: { contractorId, title: "Second contract", startDate: "2026-01-01", contractType: "MACHINERY_HIRE" },
      })
    );
    const c2Body = (await c2.json()).data;

    const dupRes = await POST_CLAIM(
      buildRequest("/api/contractor-claims", {
        token: tokens.adminToken,
        method: "POST",
        body: { contractId: c2Body.id, timesheetIds: [tsId] },
      })
    );
    // Cross-contract timesheets are a validation error (400); a timesheet
    // already claimed on the same contract would be 409.
    expect(dupRes.status).toBe(400);
    expect((await dupRes.json()).error).toContain("different contract");
  });

  it("requires claims:create (USER gets 403)", async () => {
    const res = await POST_CLAIM(
      buildRequest("/api/contractor-claims", {
        token: tokens.userToken,
        method: "POST",
        body: { contractId, timesheetIds: ["x"] },
      })
    );
    expect(res.status).toBe(403);
  });
});

describe("Deductions", () => {
  let claimId: string;

  beforeAll(async () => {
    const claim = await createDraftClaim([await makeTimesheet("2026-03-01")]);
    claimId = claim.id;
  });

  it("adds a deduction and recomputes net", async () => {
    const res = await ADD_DEDUCTION(
      buildRequest(`/api/contractor-claims/${claimId}/deductions`, {
        token: tokens.adminToken,
        method: "POST",
        body: { type: "FUEL", description: "Fuel recovered", amount: 100 },
      }),
      { params: Promise.resolve({ id: claimId }) }
    );
    expect(res.status).toBe(201);
    const body = (await res.json()).data;
    expect(body.grossAmount).toBe(1200); // 8h × 150
    expect(body.retentionAmount).toBe(120);
    expect(body.deductionsTotal).toBe(100);
    expect(body.netAmount).toBe(980); // 1200 − 120 − 100
  });

  it("deletes a deduction and recomputes", async () => {
    const detail = await GET_CLAIM_DETAIL(
      buildRequest(`/api/contractor-claims/${claimId}`, { token: tokens.adminToken }),
      { params: Promise.resolve({ id: claimId }) }
    );
    const deduction = (await detail.json()).data.deductions[0];

    const res = await DELETE_DEDUCTION(
      buildRequest(`/api/contractor-claims/${claimId}/deductions?deductionId=${deduction.id}`, {
        token: tokens.adminToken,
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: claimId }) }
    );
    expect(res.status).toBe(200);
    const body = (await res.json()).data;
    expect(body.deductionsTotal).toBe(0);
    expect(body.netAmount).toBe(1080); // 1200 − 120
  });

  it("blocks deductions once submitted", async () => {
    await CLAIM_ACTION(
      buildRequest(`/api/contractor-claims/${claimId}`, {
        token: tokens.adminToken,
        method: "POST",
        body: { action: "submit" },
      }),
      { params: Promise.resolve({ id: claimId }) }
    );
    const res = await ADD_DEDUCTION(
      buildRequest(`/api/contractor-claims/${claimId}/deductions`, {
        token: tokens.adminToken,
        method: "POST",
        body: { type: "PENALTY", description: "Late", amount: 50 },
      }),
      { params: Promise.resolve({ id: claimId }) }
    );
    expect(res.status).toBe(409);
  });
});

describe("Claim workflow + approvals integration (D3)", () => {
  let claimId: string;

  beforeAll(async () => {
    const claim = await createDraftClaim([await makeTimesheet("2026-04-01")]);
    claimId = claim.id;
    await CLAIM_ACTION(
      buildRequest(`/api/contractor-claims/${claimId}`, { token: tokens.adminToken, method: "POST", body: { action: "submit" } }),
      { params: Promise.resolve({ id: claimId }) }
    );
  });

  it("appears on the approvals queue once submitted", async () => {
    const res = await GET_APPROVALS(
      buildRequest(`/api/approvals?status=PENDING&entity=contractorClaim`, { token: tokens.adminToken })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    const found = body.data.items.find((i: { id: string }) => i.id === claimId);
    expect(found).toBeTruthy();
    expect(found.entity).toBe("contractorClaim");
    expect(body.data.counts.contractorClaim).toBeGreaterThan(0);
  });

  it("moves SUBMITTED → VERIFIED → FINANCE_REVIEW with guards", async () => {
    // Cannot verify before... actually SUBMITTED → VERIFIED is valid.
    const v = await CLAIM_ACTION(
      buildRequest(`/api/contractor-claims/${claimId}`, { token: tokens.adminToken, method: "POST", body: { action: "verify" } }),
      { params: Promise.resolve({ id: claimId }) }
    );
    expect(v.status).toBe(200);
    expect((await v.json()).data.status).toBe("VERIFIED");

    // Cannot submit a submitted claim (guard).
    const bad = await CLAIM_ACTION(
      buildRequest(`/api/contractor-claims/${claimId}`, { token: tokens.adminToken, method: "POST", body: { action: "submit" } }),
      { params: Promise.resolve({ id: claimId }) }
    );
    expect(bad.status).toBe(409);

    const f = await CLAIM_ACTION(
      buildRequest(`/api/contractor-claims/${claimId}`, { token: tokens.adminToken, method: "POST", body: { action: "financeReview" } }),
      { params: Promise.resolve({ id: claimId }) }
    );
    expect(f.status).toBe(200);
    expect((await f.json()).data.status).toBe("FINANCE_REVIEW");
  });

  it("approval through the queue posts the liability once", async () => {
    const res = await POST_APPROVAL_ACTION(
      buildRequest(`/api/approvals/contractorClaim/${claimId}`, {
        token: tokens.adminToken,
        method: "POST",
        body: { action: "approve" },
      }),
      { params: Promise.resolve({ entity: "contractorClaim", id: claimId }) }
    );
    expect(res.status).toBe(200);
    const claim = (await res.json()).data;
    expect(claim.status).toBe("POSTED");
    expect(claim.postedAt).toBeTruthy();

    // Ledger: CLAIM_POSTED + RETENTION_HELD.
    const entries = await db.contractorLedgerEntry.findMany({ where: { claimId } });
    const posted = entries.find((e) => e.type === "CLAIM_POSTED");
    const held = entries.find((e) => e.type === "RETENTION_HELD");
    expect(posted?.amount).toBe(1080); // 1200 − 120 retention
    expect(held?.amount).toBe(120);
  });

  it("rejects a second approval (liability posted exactly once)", async () => {
    const res = await POST_APPROVAL_ACTION(
      buildRequest(`/api/approvals/contractorClaim/${claimId}`, {
        token: tokens.adminToken,
        method: "POST",
        body: { action: "approve" },
      }),
      { params: Promise.resolve({ entity: "contractorClaim", id: claimId }) }
    );
    expect(res.status).toBe(409);
  });

  it("editing a posted claim is blocked", async () => {
    const res = await CLAIM_PUT(
      buildRequest(`/api/contractor-claims/${claimId}`, {
        token: tokens.adminToken,
        method: "PUT",
        body: { title: "Renamed" },
      }),
      { params: Promise.resolve({ id: claimId }) }
    );
    expect(res.status).toBe(409);
  });

  it("rejecting a claim marks it REJECTED", async () => {
    const claim = await createDraftClaim([await makeTimesheet("2026-04-10")]);
    await CLAIM_ACTION(
      buildRequest(`/api/contractor-claims/${claim.id}`, { token: tokens.adminToken, method: "POST", body: { action: "submit" } }),
      { params: Promise.resolve({ id: claim.id }) }
    );
    const res = await POST_APPROVAL_ACTION(
      buildRequest(`/api/approvals/contractorClaim/${claim.id}`, {
        token: tokens.adminToken,
        method: "POST",
        body: { action: "reject", note: "budget" },
      }),
      { params: Promise.resolve({ entity: "contractorClaim", id: claim.id }) }
    );
    expect(res.status).toBe(200);
    const body = (await res.json()).data;
    expect(body.status).toBe("REJECTED");
    // No ledger entries for a rejected claim.
    const entries = await db.contractorLedgerEntry.findMany({ where: { claimId: claim.id } });
    expect(entries).toHaveLength(0);
  });
});

describe("Advances", () => {
  it("disburses an advance and posts ADVANCE_DISBURSED", async () => {
    const res = await POST_ADVANCE(
      buildRequest("/api/contractor-advances", {
        token: tokens.adminToken,
        method: "POST",
        body: { contractorId, amount: 500, date: "2026-05-01", recoveryPercent: 25 },
      })
    );
    expect(res.status).toBe(201);
    const advance = (await res.json()).data;
    expect(advance.advanceNumber).toMatch(/^ADV-\d{5}$/);

    const entry = await db.contractorLedgerEntry.findFirst({ where: { advanceId: advance.id } });
    expect(entry?.type).toBe("ADVANCE_DISBURSED");
    expect(entry?.amount).toBe(-500);
  });

  it("recovers the advance FIFO when a claim is approved", async () => {
    const claim = await createDraftClaim([await makeTimesheet("2026-05-10")]); // net 1080
    await CLAIM_ACTION(
      buildRequest(`/api/contractor-claims/${claim.id}`, { token: tokens.adminToken, method: "POST", body: { action: "submit" } }),
      { params: Promise.resolve({ id: claim.id }) }
    );
    const res = await CLAIM_ACTION(
      buildRequest(`/api/contractor-claims/${claim.id}`, { token: tokens.adminToken, method: "POST", body: { action: "approve" } }),
      { params: Promise.resolve({ id: claim.id }) }
    );
    expect(res.status).toBe(200);
    const body = (await res.json()).data;
    // 25% of net 1080 = 270, capped at nothing → recovery 270.
    expect(body.advanceRecoveryTotal).toBe(270);

    const advance = await db.contractorAdvance.findFirst({
      where: { contractorId, recoveryPercent: 25 },
      orderBy: { date: "asc" },
    });
    expect(advance?.recoveredAmount).toBe(270);
    expect(advance?.status).toBe("PARTIALLY_RECOVERED");

    // Cash payable = net − recovery; a payment of that size fully closes the claim.
    const paymentRes = await POST_PAYMENT(
      buildRequest("/api/contractor-payments", {
        token: tokens.adminToken,
        method: "POST",
        body: { contractorId, amount: 810, paymentDate: "2026-05-15", method: "BANK_TRANSFER" },
      })
    );
    const payment = (await paymentRes.json()).data;
    const alloc = await ALLOCATE(
      buildRequest(`/api/contractor-payments/${payment.id}/allocations`, {
        token: tokens.adminToken,
        method: "POST",
        body: { allocations: [{ claimId: claim.id, amount: 810 }] },
      }),
      { params: Promise.resolve({ id: payment.id }) }
    );
    expect(alloc.status).toBe(201);
    const closedClaim = await db.contractorClaim.findUnique({ where: { id: claim.id } });
    expect(closedClaim?.status).toBe("PAID");
    expect(closedClaim?.paidAmount).toBe(810);
  });

  it("write-off forgives the remainder", async () => {
    const advance = await db.contractorAdvance.findFirst({
      where: { contractorId, status: "PARTIALLY_RECOVERED" },
    });
    const res = await WRITE_OFF(
      buildRequest(`/api/contractor-advances/${advance!.id}/write-off`, {
        token: tokens.adminToken,
        method: "POST",
        body: { reason: "Commercial settlement" },
      }),
      { params: Promise.resolve({ id: advance!.id }) }
    );
    expect(res.status).toBe(200);
    const body = (await res.json()).data;
    expect(body.status).toBe("WRITTEN_OFF");

    const entry = await db.contractorLedgerEntry.findFirst({
      where: { advanceId: advance!.id, type: "WRITE_OFF" },
    });
    expect(entry?.amount).toBe(230); // 500 − 270 recovered
  });

  it("requires advances:writeOff (USER gets 403)", async () => {
    const advance = await POST_ADVANCE(
      buildRequest("/api/contractor-advances", {
        token: tokens.adminToken,
        method: "POST",
        body: { contractorId, amount: 100, date: "2026-05-20" },
      })
    );
    const a = (await advance.json()).data;
    const res = await WRITE_OFF(
      buildRequest(`/api/contractor-advances/${a.id}/write-off`, {
        token: tokens.userToken,
        method: "POST",
        body: { reason: "nope" },
      }),
      { params: Promise.resolve({ id: a.id }) }
    );
    expect(res.status).toBe(403);
  });
});

describe("Payments", () => {
  let claimId: string;
  let claimOutstanding: number;

  beforeAll(async () => {
    const claim = await createDraftClaim([await makeTimesheet("2026-06-01")]); // net 1080
    claimId = claim.id;
    await CLAIM_ACTION(
      buildRequest(`/api/contractor-claims/${claimId}`, { token: tokens.adminToken, method: "POST", body: { action: "submit" } }),
      { params: Promise.resolve({ id: claim.id }) }
    );
    await CLAIM_ACTION(
      buildRequest(`/api/contractor-claims/${claimId}`, { token: tokens.adminToken, method: "POST", body: { action: "approve" } }),
      { params: Promise.resolve({ id: claimId }) }
    );
    claimOutstanding = 1080;
  });

  it("records a payment with an Expense cash-out row", async () => {
    const res = await POST_PAYMENT(
      buildRequest("/api/contractor-payments", {
        token: tokens.adminToken,
        method: "POST",
        body: { contractorId, amount: 300, paymentDate: "2026-06-10", method: "BANK_TRANSFER", notes: "partial" },
      })
    );
    expect(res.status).toBe(201);
    const payment = (await res.json()).data;
    expect(payment.paymentNumber).toMatch(/^PAY-\d{5}$/);
    expect(payment.expenseId).toBeTruthy();

    const expense = await db.expense.findUnique({ where: { id: payment.expenseId } });
    expect(expense?.paidToContractorId).toBe(contractorId);
    expect(expense?.amount).toBe(300);

    const entry = await db.contractorLedgerEntry.findFirst({ where: { paymentId: payment.id } });
    expect(entry?.type).toBe("PAYMENT");
    expect(entry?.amount).toBe(-300);
  });

  it("is idempotent for retried requests (same Idempotency-Key)", async () => {
    const key = "test-idem-key-1";
    const mk = () =>
      POST_PAYMENT(
        buildRequest("/api/contractor-payments", {
          token: tokens.adminToken,
          method: "POST",
          headers: { "Idempotency-Key": key },
          body: { contractorId, amount: 50, paymentDate: "2026-06-11", method: "BANK_TRANSFER" },
        })
      );
    const first = await mk();
    const second = await mk();
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    const p1 = (await first.json()).data;
    const p2 = (await second.json()).data;
    expect(p2.id).toBe(p1.id);

    // Only one payment row exists for that key.
    const count = await db.contractorPayment.count({ where: { idempotencyKey: key } });
    expect(count).toBe(1);
  });

  it("allocates across claims and guards the outstanding balance", async () => {
    const payments = await GET_PAYMENTS(
      buildRequest(`/api/contractor-payments?contractorId=${contractorId}`, { token: tokens.adminToken })
    );
    const list = (await payments.json()).data.data;
    const payment = list.find((p: { amount: number; allocations: unknown[] }) => p.amount === 300 && p.allocations.length === 0);

    // Over-allocation is rejected.
    const over = await ALLOCATE(
      buildRequest(`/api/contractor-payments/${payment.id}/allocations`, {
        token: tokens.adminToken,
        method: "POST",
        body: { allocations: [{ claimId, amount: 1000 }] },
      }),
      { params: Promise.resolve({ id: payment.id }) }
    );
    expect(over.status).toBe(400);

    // Valid partial allocation.
    const ok = await ALLOCATE(
      buildRequest(`/api/contractor-payments/${payment.id}/allocations`, {
        token: tokens.adminToken,
        method: "POST",
        body: { allocations: [{ claimId, amount: 300 }] },
      }),
      { params: Promise.resolve({ id: payment.id }) }
    );
    expect(ok.status).toBe(201);
    const claim = await db.contractorClaim.findUnique({ where: { id: claimId } });
    expect(claim?.paidAmount).toBe(300);
    expect(claim?.status).toBe("PARTIALLY_PAID");
    expect(claimOutstanding - 300).toBe(780);
  });

  it("reversing a payment unwinds allocations and the ledger", async () => {
    const payments = await GET_PAYMENTS(
      buildRequest(`/api/contractor-payments?contractorId=${contractorId}`, { token: tokens.adminToken })
    );
    const list = (await payments.json()).data.data;
    const payment = list.find((p: { amount: number; allocations: { claimId: string }[] }) =>
      p.amount === 300 && p.allocations.some((a) => a.claimId === claimId)
    );

    const res = await REVERSE_PAYMENT(
      buildRequest(`/api/contractor-payments/${payment.id}/reverse`, {
        token: tokens.adminToken,
        method: "POST",
        body: { reason: "bounced cheque" },
      }),
      { params: Promise.resolve({ id: payment.id }) }
    );
    expect(res.status).toBe(200);
    expect((await res.json()).data.status).toBe("REVERSED");

    const claim = await db.contractorClaim.findUnique({ where: { id: claimId } });
    expect(claim?.paidAmount).toBe(0);
    expect(claim?.status).toBe("POSTED");

    const reversal = await db.contractorLedgerEntry.findFirst({
      where: { paymentId: payment.id, type: "PAYMENT_REVERSAL" },
    });
    expect(reversal?.amount).toBe(300);
  });

  it("requires payments:reverse for reversal (USER gets 403)", async () => {
    const res = await POST_PAYMENT(
      buildRequest("/api/contractor-payments", {
        token: tokens.adminToken,
        method: "POST",
        body: { contractorId, amount: 10, paymentDate: "2026-06-20", method: "BANK_TRANSFER" },
      })
    );
    const payment = (await res.json()).data;
    const denied = await REVERSE_PAYMENT(
      buildRequest(`/api/contractor-payments/${payment.id}/reverse`, {
        token: tokens.userToken,
        method: "POST",
        body: { reason: "nope" },
      }),
      { params: Promise.resolve({ id: payment.id }) }
    );
    expect(denied.status).toBe(403);
  });
});

describe("Ledger, outstanding and claim reversal", () => {
  it("the statement balance equals the sum of all entries", async () => {
    const res = await GET_LEDGER(
      buildRequest(`/api/contractors/${contractorId}/ledger?pageSize=200`, { token: tokens.adminToken }),
      { params: Promise.resolve({ id: contractorId }) }
    );
    expect(res.status).toBe(200);
    const body = (await res.json()).data;

    const sum = await db.contractorLedgerEntry.aggregate({
      _sum: { amount: true },
      where: { contractorId },
    });
    expect(body.balance).toBe(Math.round((sum._sum.amount ?? 0) * 100) / 100);
    expect(body.data.length).toBeGreaterThan(0);
  });

  it("outstanding reflects net − recovery − paid per claim", async () => {
    const res = await GET_OUTSTANDING(
      buildRequest(`/api/contractors/${contractorId}/outstanding`, { token: tokens.adminToken }),
      { params: Promise.resolve({ id: contractorId }) }
    );
    expect(res.status).toBe(200);
    const body = (await res.json()).data;

    for (const row of body.claims) {
      expect(row.outstanding).toBe(
        Math.round((row.netAmount - row.advanceRecoveryTotal - row.paidAmount) * 100) / 100
      );
    }
    expect(body.totalOutstanding).toBe(
      Math.round(body.claims.reduce((s: number, r: { outstanding: number }) => s + r.outstanding, 0) * 100) / 100
    );
    // Aging buckets sum to the outstanding total.
    const bucketSum = body.aging.buckets.reduce((s: number, b: { amount: number }) => s + b.amount, 0);
    expect(Math.round(bucketSum * 100) / 100).toBe(body.totalOutstanding);
  });

  it("reverses a posted unpaid claim with compensating ledger entries", async () => {
    const claim = await createDraftClaim([await makeTimesheet("2026-07-01")]); // net 1080, retention 120
    await CLAIM_ACTION(
      buildRequest(`/api/contractor-claims/${claim.id}`, { token: tokens.adminToken, method: "POST", body: { action: "submit" } }),
      { params: Promise.resolve({ id: claim.id }) }
    );
    await CLAIM_ACTION(
      buildRequest(`/api/contractor-claims/${claim.id}`, { token: tokens.adminToken, method: "POST", body: { action: "approve" } }),
      { params: Promise.resolve({ id: claim.id }) }
    );

    const balanceBefore = await db.contractorLedgerEntry.aggregate({
      _sum: { amount: true },
      where: { contractorId },
    });

    const res = await CLAIM_ACTION(
      buildRequest(`/api/contractor-claims/${claim.id}`, {
        token: tokens.adminToken,
        method: "POST",
        body: { action: "reverse", reason: "duplicate claim" },
      }),
      { params: Promise.resolve({ id: claim.id }) }
    );
    expect(res.status).toBe(200);
    expect((await res.json()).data.status).toBe("VOID");

    const balanceAfter = await db.contractorLedgerEntry.aggregate({
      _sum: { amount: true },
      where: { contractorId },
    });
    // Reversal removes net + retention from the balance.
    expect(Math.round(((balanceAfter._sum.amount ?? 0) - (balanceBefore._sum.amount ?? 0)) * 100) / 100).toBe(-1200);
  });

  it("a claim with payments cannot be reversed", async () => {
    const claim = await createDraftClaim([await makeTimesheet("2026-07-10")]);
    await CLAIM_ACTION(
      buildRequest(`/api/contractor-claims/${claim.id}`, { token: tokens.adminToken, method: "POST", body: { action: "submit" } }),
      { params: Promise.resolve({ id: claim.id }) }
    );
    await CLAIM_ACTION(
      buildRequest(`/api/contractor-claims/${claim.id}`, { token: tokens.adminToken, method: "POST", body: { action: "approve" } }),
      { params: Promise.resolve({ id: claim.id }) }
    );

    const paymentRes = await POST_PAYMENT(
      buildRequest("/api/contractor-payments", {
        token: tokens.adminToken,
        method: "POST",
        body: { contractorId, amount: 200, paymentDate: "2026-07-15", method: "BANK_TRANSFER" },
      })
    );
    const payment = (await paymentRes.json()).data;
    await ALLOCATE(
      buildRequest(`/api/contractor-payments/${payment.id}/allocations`, {
        token: tokens.adminToken,
        method: "POST",
        body: { allocations: [{ claimId: claim.id, amount: 200 }] },
      }),
      { params: Promise.resolve({ id: payment.id }) }
    );

    const res = await CLAIM_ACTION(
      buildRequest(`/api/contractor-claims/${claim.id}`, {
        token: tokens.adminToken,
        method: "POST",
        body: { action: "reverse", reason: "should fail" },
      }),
      { params: Promise.resolve({ id: claim.id }) }
    );
    expect(res.status).toBe(409);
  });

  it("voids only unposted claims (draft delete)", async () => {
    const claim = await createDraftClaim([await makeTimesheet("2026-07-20")]);
    const res = await DELETE_CLAIM(
      buildRequest(`/api/contractor-claims/${claim.id}`, { token: tokens.adminToken, method: "DELETE" }),
      { params: Promise.resolve({ id: claim.id }) }
    );
    expect(res.status).toBe(200);
    expect((await res.json()).data.status).toBe("VOID");
  });
});
