// Phase 5 — Authorization & compliance: payment gating (status, document
// expiry, authorizations), lifecycle actions with reasons, compliance
// sub-resources, permission splits, scoping, and idempotency preservation.
import { POST as POST_CONTRACTOR } from "@/app/api/contractors/route";
import { DELETE as DELETE_CONTRACTOR } from "@/app/api/contractors/[id]/route";
import { GET as GET_COMPLIANCE } from "@/app/api/contractors/[id]/compliance/route";
import { POST as LIFECYCLE } from "@/app/api/contractors/[id]/lifecycle/route";
import { GET as GET_CONTACTS, POST as POST_CONTACT } from "@/app/api/contractors/[id]/contacts/route";
import {
  GET as GET_ACCOUNTS,
  POST as POST_ACCOUNT,
} from "@/app/api/contractors/[id]/bank-accounts/route";
import { POST as VERIFY_ACCOUNT } from "@/app/api/contractors/[id]/bank-accounts/[accountId]/verify/route";
import { GET as GET_DOCS, POST as POST_DOC } from "@/app/api/contractors/[id]/documents/route";
import { PUT as PUT_DOC } from "@/app/api/contractors/[id]/documents/[docId]/route";
import { GET as GET_AUTHS, POST as POST_AUTH } from "@/app/api/payment-authorizations/route";
import { POST as REVOKE_AUTH } from "@/app/api/payment-authorizations/[id]/revoke/route";
import { POST as POST_PAYMENT } from "@/app/api/contractor-payments/route";
import { db } from "@/lib/db";
import { hashPassword, generateToken } from "@/lib/auth";
import { seedUsers, buildRequest, TEST_MANAGER } from "../helpers";

let tokens: Awaited<ReturnType<typeof seedUsers>>;
let contractorA: string; // gets authorizations + payments; used for lifecycle
let contractorB: string; // document-expiry matrix

const p = (id: string) => ({ params: Promise.resolve({ id }) });

async function makeContractor(name: string): Promise<string> {
  const res = await POST_CONTRACTOR(
    buildRequest("/api/contractors", {
      token: tokens.adminToken,
      method: "POST",
      body: {
        contractorName: name,
        fatherName: "Father",
        phoneNumber: `07${Math.floor(Math.random() * 100000000)}`,
        contractorType: "LABOR_CONTRACTOR",
      },
    })
  );
  const body = await res.json();
  expect(res.status).toBe(201);
  return body.data.id;
}

function pay(
  token: string,
  contractorId: string,
  amount: number,
  extra: Record<string, unknown> = {},
  idem?: string
) {
  return POST_PAYMENT(
    buildRequest("/api/contractor-payments", {
      token,
      method: "POST",
      headers: idem ? { "Idempotency-Key": idem } : undefined,
      body: {
        contractorId,
        amount,
        paymentDate: "2026-09-10",
        method: "BANK_TRANSFER",
        ...extra,
      },
    })
  );
}

beforeAll(async () => {
  tokens = await seedUsers();
  contractorA = await makeContractor("Compliance A");
  contractorB = await makeContractor("Compliance B");
});

describe("Payment authorization enforcement", () => {
  let authId: string;
  let authNumber: string;

  beforeAll(async () => {
    const res = await POST_AUTH(
      buildRequest("/api/payment-authorizations", {
        token: tokens.managerToken,
        method: "POST",
        body: {
          contractorId: contractorA,
          receiverName: "Hameed",
          validFrom: "2026-01-01",
          maxAmount: 10000,
        },
      })
    );
    const body = await res.json();
    expect(res.status).toBe(201);
    authId = body.data.id;
    authNumber = body.data.authorizationNumber;
    expect(authNumber).toMatch(/^AUTH-\d{5}$/);
  });

  it("rejects a receiver not covered by the authorization (403, nothing posted)", async () => {
    const res = await pay(tokens.adminToken, contractorA, 5000, {
      authorizedById: "Rahim",
    });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toContain("receiver");
    expect(
      await db.contractorPayment.count({ where: { contractorId: contractorA, amount: 5000 } })
    ).toBe(0);
  });

  it("rejects an amount over the authorized limit (403, no wallet/ledger/expense rows)", async () => {
    const res = await pay(tokens.adminToken, contractorA, 20000, {
      authorizedById: "Hameed",
    });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toContain("exceeds");
    expect(
      await db.contractorPayment.count({ where: { contractorId: contractorA, amount: 20000 } })
    ).toBe(0);
    expect(
      await db.expense.count({ where: { paidToContractorId: contractorA, amount: 20000 } })
    ).toBe(0);
    expect(
      await db.contractorLedgerEntry.count({
        where: { contractorId: contractorA, amount: -20000 },
      })
    ).toBe(0);
  });

  it("allows a matching receiver within the limit and stamps authorization + snapshot", async () => {
    const res = await pay(
      tokens.adminToken,
      contractorA,
      8000,
      { authorizedById: "Hameed" },
      "authz-ok-1"
    );
    expect(res.status).toBe(201);
    const payment = await db.contractorPayment.findFirst({
      where: { contractorId: contractorA, amount: 8000 },
    });
    expect(payment).not.toBeNull();
    expect(payment!.paymentAuthorizationId).toBe(authId);
    const snap = payment!.authorizationSnapshot as Record<string, unknown> | null;
    expect(snap).not.toBeNull();
    expect(snap!.authorizationNumber).toBe(authNumber);
    expect(snap!.receiverName).toBe("Hameed");
    expect(snap!.maxAmount).toBe(10000);
  });

  it("preserves idempotency: same key returns the original payment", async () => {
    const res = await pay(
      tokens.adminToken,
      contractorA,
      8000,
      { authorizedById: "Hameed" },
      "authz-ok-1"
    );
    expect(res.status).toBe(200);
    expect(
      await db.contractorPayment.count({ where: { contractorId: contractorA, amount: 8000 } })
    ).toBe(1);
  });

  it("a revoked authorization no longer enforces (SetNull history kept)", async () => {
    const revoke = await REVOKE_AUTH(
      buildRequest(`/api/payment-authorizations/${authId}/revoke`, {
        token: tokens.managerToken,
        method: "POST",
        body: { reason: "Person left the company" },
      }),
      p(authId)
    );
    expect(revoke.status).toBe(200);

    // History: the earlier payment keeps its snapshot and FK (SetNull only
    // fires on auth deletion, and revocation is not deletion).
    const original = await db.contractorPayment.findFirst({
      where: { contractorId: contractorA, amount: 8000 },
    });
    expect(original!.paymentAuthorizationId).toBe(authId);

    // Next payment: arbitrary receiver passes now.
    const res = await pay(tokens.adminToken, contractorA, 3000, {
      authorizedById: "AnyoneElse",
    });
    expect(res.status).toBe(201);
    const payment = await db.contractorPayment.findFirst({
      where: { contractorId: contractorA, amount: 3000 },
    });
    expect(payment!.paymentAuthorizationId).toBeNull();
    expect(payment!.authorizationSnapshot).toBeNull();
  });

  it("an expired (validTo in the past) authorization is not enforced", async () => {
    const create = await POST_AUTH(
      buildRequest("/api/payment-authorizations", {
        token: tokens.managerToken,
        method: "POST",
        body: {
          contractorId: contractorA,
          receiverName: "Sohrab",
          validFrom: "2026-01-01",
          validTo: "2026-02-28",
        },
      })
    );
    expect(create.status).toBe(201);
    const res = await pay(tokens.adminToken, contractorA, 500, {
      authorizedById: "SomeoneElse",
    });
    expect(res.status).toBe(201);
  });
});

describe("Document expiry blocks payments", () => {
  const addDoc = (docType: string, title: string, expiryDate: string) =>
    POST_DOC(
      buildRequest(`/api/contractors/${contractorB}/documents`, {
        token: tokens.adminToken,
        method: "POST",
        body: { docType, title, expiryDate },
      }),
      p(contractorB)
    );

  it("expired non-blocking document types do not block", async () => {
    const insurance = await addDoc("INSURANCE", "Old insurance", "2020-01-01");
    expect(insurance.status).toBe(201);
    const res = await pay(tokens.adminToken, contractorB, 700);
    expect(res.status).toBe(201);
  });

  it("expired NATIONAL_ID blocks payments with a clear reason", async () => {
    const res2 = await addDoc("NATIONAL_ID", "National ID", "2020-01-01");
    expect(res2.status).toBe(201);

    const res = await pay(tokens.adminToken, contractorB, 701);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("National ID");
    expect(body.error).toContain("Expired");
    expect(
      await db.contractorPayment.count({ where: { contractorId: contractorB, amount: 701 } })
    ).toBe(0);
  });

  it("expired BUSINESS_LICENSE also blocks (both expired docs listed)", async () => {
    const res2 = await addDoc("BUSINESS_LICENSE", "Business License", "2020-01-01");
    expect(res2.status).toBe(201);
    const res = await pay(tokens.adminToken, contractorB, 702);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("National ID");
    expect(body.error).toContain("Business License");
  });

  it("renewing (editing expiry) unblocks payments", async () => {
    const docs = await db.contractorDocument.findMany({
      where: { contractorId: contractorB, docType: { in: ["NATIONAL_ID", "BUSINESS_LICENSE"] } },
    });
    for (const doc of docs) {
      const res = await PUT_DOC(
        buildRequest(`/api/contractors/${contractorB}/documents/${doc.id}`, {
          token: tokens.adminToken,
          method: "PUT",
          body: { expiryDate: "2027-06-30" },
        }),
        { params: Promise.resolve({ id: contractorB, docId: doc.id }) }
      );
      expect(res.status).toBe(200);
    }
    const res = await pay(tokens.adminToken, contractorB, 703);
    expect(res.status).toBe(201);
  });

  it("compliance GET mirrors the gate verdict", async () => {
    const res = await GET_COMPLIANCE(
      buildRequest(`/api/contractors/${contractorB}/compliance`, {
        token: tokens.adminToken,
      }),
      p(contractorB)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.paymentsBlocked).toBe(false);
    expect(body.data.expiredBlockingDocs).toHaveLength(0);
    // The expired insurance still shows as context but never blocks.
    expect(body.data.unverifiedBankAccounts).toBe(0);
  });
});

describe("Lifecycle actions", () => {
  it("suspend requires a reason (400)", async () => {
    const res = await LIFECYCLE(
      buildRequest(`/api/contractors/${contractorA}/lifecycle`, {
        token: tokens.adminToken,
        method: "POST",
        body: { action: "suspend" },
      }),
      p(contractorA)
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("reason");
  });

  it("a USER cannot run lifecycle actions (403)", async () => {
    const res = await LIFECYCLE(
      buildRequest(`/api/contractors/${contractorA}/lifecycle`, {
        token: tokens.userToken,
        method: "POST",
        body: { action: "suspend", reason: "nope" },
      }),
      p(contractorA)
    );
    expect(res.status).toBe(403);
  });

  it("suspend stamps status, reason, and audit", async () => {
    const res = await LIFECYCLE(
      buildRequest(`/api/contractors/${contractorA}/lifecycle`, {
        token: tokens.adminToken,
        method: "POST",
        body: { action: "suspend", reason: "Site safety violations" },
      }),
      p(contractorA)
    );
    expect(res.status).toBe(200);
    const c = await db.contractor.findUnique({ where: { id: contractorA } });
    expect(c!.status).toBe("SUSPENDED");
    expect(c!.suspendedAt).not.toBeNull();
    expect(c!.suspendedReason).toBe("Site safety violations");
    expect(c!.statusChangedById).toBe(tokens.admin.id);

    const audit = await db.auditLog.findFirst({
      where: { entity: "Contractor", entityId: contractorA, action: "UPDATE" },
    });
    expect(audit).not.toBeNull();
    expect(audit!.details).toContain("Site safety violations");
  });

  it("payments are blocked while suspended", async () => {
    const res = await pay(tokens.adminToken, contractorA, 900);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toContain("suspended");
  });

  it("invalid transition: suspending a suspended contractor (400)", async () => {
    const res = await LIFECYCLE(
      buildRequest(`/api/contractors/${contractorA}/lifecycle`, {
        token: tokens.adminToken,
        method: "POST",
        body: { action: "suspend", reason: "again" },
      }),
      p(contractorA)
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("Cannot suspend");
  });

  it("blacklist from SUSPENDED, then payments stay blocked", async () => {
    const res = await LIFECYCLE(
      buildRequest(`/api/contractors/${contractorA}/lifecycle`, {
        token: tokens.adminToken,
        method: "POST",
        body: { action: "blacklist", reason: "Theft report filed" },
      }),
      p(contractorA)
    );
    expect(res.status).toBe(200);
    const c = await db.contractor.findUnique({ where: { id: contractorA } });
    expect(c!.status).toBe("BLACKLISTED");
    expect(c!.blacklistedAt).not.toBeNull();
    expect(c!.blacklistedReason).toBe("Theft report filed");

    const payRes = await pay(tokens.adminToken, contractorA, 901);
    expect(payRes.status).toBe(403);
    expect((await payRes.json()).error).toContain("blacklisted");
  });

  it("reactivate restores ACTIVE and clears lifecycle records", async () => {
    const res = await LIFECYCLE(
      buildRequest(`/api/contractors/${contractorA}/lifecycle`, {
        token: tokens.adminToken,
        method: "POST",
        body: { action: "reactivate" },
      }),
      p(contractorA)
    );
    expect(res.status).toBe(200);
    const c = await db.contractor.findUnique({ where: { id: contractorA } });
    expect(c!.status).toBe("ACTIVE");
    expect(c!.suspendedAt).toBeNull();
    expect(c!.suspendedReason).toBeNull();
    expect(c!.blacklistedAt).toBeNull();
    expect(c!.blacklistedReason).toBeNull();

    const payRes = await pay(tokens.adminToken, contractorA, 902);
    expect(payRes.status).toBe(201);
  });

  it("ARCHIVED contractors cannot be suspended", async () => {
    const contractorC = await makeContractor("Compliance C");
    await db.contractor.update({
      where: { id: contractorC },
      data: { status: "ARCHIVED" },
    });
    const res = await LIFECYCLE(
      buildRequest(`/api/contractors/${contractorC}/lifecycle`, {
        token: tokens.adminToken,
        method: "POST",
        body: { action: "suspend", reason: "attempt" },
      }),
      p(contractorC)
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("Cannot suspend");
  });
});

describe("Compliance sub-resources", () => {
  it("contacts CRUD basics (create + list, primary first)", async () => {
    const create = await POST_CONTACT(
      buildRequest(`/api/contractors/${contractorA}/contacts`, {
        token: tokens.adminToken,
        method: "POST",
        body: { name: "Naser", role: "Site manager", phone: "0712345678", isPrimary: true },
      }),
      p(contractorA)
    );
    expect(create.status).toBe(201);
    const list = await GET_CONTACTS(
      buildRequest(`/api/contractors/${contractorA}/contacts`, {
        token: tokens.adminToken,
      }),
      p(contractorA)
    );
    expect(list.status).toBe(200);
    const body = await list.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].isPrimary).toBe(true);
  });

  it("bank account verification is authorize-gated and audited", async () => {
    const create = await POST_ACCOUNT(
      buildRequest(`/api/contractors/${contractorA}/bank-accounts`, {
        token: tokens.adminToken,
        method: "POST",
        body: {
          accountName: "Naser Karimi",
          accountNumber: "0011223344",
          bankName: "Azizi Bank",
        },
      }),
      p(contractorA)
    );
    expect(create.status).toBe(201);
    const accountId = (await create.json()).data.id as string;

    // A plain USER cannot verify (contractors:authorize required).
    const denied = await VERIFY_ACCOUNT(
      buildRequest(
        `/api/contractors/${contractorA}/bank-accounts/${accountId}/verify`,
        { token: tokens.userToken, method: "POST", body: {} }
      ),
      { params: Promise.resolve({ id: contractorA, accountId }) }
    );
    expect(denied.status).toBe(403);

    const verify = await VERIFY_ACCOUNT(
      buildRequest(
        `/api/contractors/${contractorA}/bank-accounts/${accountId}/verify`,
        { token: tokens.managerToken, method: "POST", body: {} }
      ),
      { params: Promise.resolve({ id: contractorA, accountId }) }
    );
    expect(verify.status).toBe(200);
    const account = await db.contractorBankAccount.findUnique({ where: { id: accountId } });
    expect(account!.isVerified).toBe(true);
    expect(account!.verifiedById).toBe(TEST_MANAGER.id);

    const audit = await db.auditLog.findFirst({
      where: { entity: "ContractorBankAccount", entityId: accountId },
    });
    expect(audit).not.toBeNull();

    const list = await GET_ACCOUNTS(
      buildRequest(`/api/contractors/${contractorA}/bank-accounts`, {
        token: tokens.adminToken,
      }),
      p(contractorA)
    );
    expect(list.status).toBe(200);
    expect((await list.json()).data).toHaveLength(1);
  });

  it("a USER cannot create authorizations (403) but can read compliance (200)", async () => {
    const denied = await POST_AUTH(
      buildRequest("/api/payment-authorizations", {
        token: tokens.userToken,
        method: "POST",
        body: {
          contractorId: contractorA,
          receiverName: "X",
          validFrom: "2026-01-01",
        },
      })
    );
    expect(denied.status).toBe(403);

    const compliance = await GET_COMPLIANCE(
      buildRequest(`/api/contractors/${contractorA}/compliance`, {
        token: tokens.userToken,
      }),
      p(contractorA)
    );
    expect(compliance.status).toBe(200);
  });

  it("document validation: expiry before issue date is rejected", async () => {
    const res = await POST_DOC(
      buildRequest(`/api/contractors/${contractorA}/documents`, {
        token: tokens.adminToken,
        method: "POST",
        body: {
          docType: "TAX_CERTIFICATE",
          title: "Tax",
          issueDate: "2026-05-01",
          expiryDate: "2026-04-01",
        },
      }),
      p(contractorA)
    );
    expect(res.status).toBe(400);
  });

  it("authorization list filters by contractor", async () => {
    const res = await GET_AUTHS(
      buildRequest(`/api/payment-authorizations?contractorId=${contractorA}`, {
        token: tokens.adminToken,
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.data.length).toBeGreaterThanOrEqual(2);
  });
});

describe("Out-of-scope access returns 404", () => {
  let watcherToken: string;

  beforeAll(async () => {
    const watcher = await db.user.upsert({
      where: { email: "watcher@compliance.test" },
      update: {},
      create: {
        id: "u_watch_compliance",
        email: "watcher@compliance.test",
        name: "Watcher Compliance",
        password: await hashPassword("watcher-c-pw"),
        role: "WATCHER",
      },
    });
    watcherToken = generateToken({
      userId: watcher.id,
      email: watcher.email,
      role: watcher.role,
    });
  });

  it("compliance, lifecycle, contacts, and authorizations are invisible", async () => {
    // View routes: the watcher holds contractors:view, so the scope check is
    // what hides the contractor (404).
    const compliance = await GET_COMPLIANCE(
      buildRequest(`/api/contractors/${contractorA}/compliance`, { token: watcherToken }),
      p(contractorA)
    );
    expect(compliance.status).toBe(404);

    const contacts = await GET_CONTACTS(
      buildRequest(`/api/contractors/${contractorA}/contacts`, { token: watcherToken }),
      p(contractorA)
    );
    expect(contacts.status).toBe(404);

    // Write routes: the watcher lacks the required permission outright, so
    // the gate fires (403) before any scope exposure could happen.
    const lifecycle = await LIFECYCLE(
      buildRequest(`/api/contractors/${contractorA}/lifecycle`, {
        token: watcherToken,
        method: "POST",
        body: { action: "suspend", reason: "x" },
      }),
      p(contractorA)
    );
    expect(lifecycle.status).toBe(403);

    const auths = await POST_AUTH(
      buildRequest("/api/payment-authorizations", {
        token: watcherToken,
        method: "POST",
        body: { contractorId: contractorA, receiverName: "X", validFrom: "2026-01-01" },
      })
    );
    expect(auths.status).toBe(403);
  });
});

describe("Archive permission split (contractors:archive vs contractors:delete)", () => {
  let archiveOnlyToken: string;

  beforeAll(async () => {
    // A USER-role account with only contractors:archive granted on top.
    const perm = await db.permission.upsert({
      where: { name: "contractors:archive" },
      update: {},
      create: {
        name: "contractors:archive",
        label: "Archive Contractors",
        module: "contractors",
      },
    });
    const user = await db.user.upsert({
      where: { email: "archive-only@test" },
      update: {},
      create: {
        id: "u_archive_only",
        email: "archive-only@test",
        name: "Archive Only",
        password: await hashPassword("archive-only-pw"),
        role: "USER",
      },
    });
    await db.userPermission.upsert({
      where: {
        userId_permissionId: { userId: user.id, permissionId: perm.id },
      },
      update: { granted: true },
      create: { userId: user.id, permissionId: perm.id, granted: true },
    });
    archiveOnlyToken = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });
  });

  it("archive-only user archives a contractor that has financial history", async () => {
    // contractorB has payments and documents → must archive, never delete.
    const res = await DELETE_CONTRACTOR(
      buildRequest(`/api/contractors/${contractorB}`, {
        token: archiveOnlyToken,
        method: "DELETE",
      }),
      p(contractorB)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.archived).toBe(true);
    const c = await db.contractor.findUnique({ where: { id: contractorB } });
    expect(c).not.toBeNull();
    expect(c!.status).toBe("ARCHIVED");
  });

  it("archive-only user cannot hard-delete a clean contractor (403)", async () => {
    const cleanId = await makeContractor("Clean Target");
    const res = await DELETE_CONTRACTOR(
      buildRequest(`/api/contractors/${cleanId}`, {
        token: archiveOnlyToken,
        method: "DELETE",
      }),
      p(cleanId)
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error).toContain("contractors:delete");
    expect(await db.contractor.findUnique({ where: { id: cleanId } })).not.toBeNull();

    // Admin (has contractors:delete) can hard-delete the same clean contractor.
    const adminRes = await DELETE_CONTRACTOR(
      buildRequest(`/api/contractors/${cleanId}`, {
        token: tokens.adminToken,
        method: "DELETE",
      }),
      p(cleanId)
    );
    expect(adminRes.status).toBe(200);
    expect((await adminRes.json()).data.archived).toBe(false);
    expect(await db.contractor.findUnique({ where: { id: cleanId } })).toBeNull();
  });

  it("a contractor with payments is archived, not deleted (financial guard)", async () => {
    // contractorA has payments + authorizations → dirty under the extended
    // Phase 5 history counts.
    const res = await DELETE_CONTRACTOR(
      buildRequest(`/api/contractors/${contractorA}`, {
        token: tokens.adminToken,
        method: "DELETE",
      }),
      p(contractorA)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.archived).toBe(true);
    const c = await db.contractor.findUnique({ where: { id: contractorA } });
    expect(c!.status).toBe("ARCHIVED");
    // Financial history intact.
    expect(
      await db.contractorPayment.count({ where: { contractorId: contractorA } })
    ).toBeGreaterThanOrEqual(3);
  });
});
