// Contractor compliance service (Phase 5).
//
// Payments are gated before any money row is created:
//   1. SUSPENDED / BLACKLISTED / ARCHIVED contractors cannot be paid at all.
//   2. An expired NATIONAL_ID / BUSINESS_LICENSE document row blocks payments
//      (no document rows → warning only, never a block — no data, no block).
//   3. Authorization enforcement: if the contractor has ANY live authorization
//      (not revoked, covering the payment date), the payment must match one —
//      same receiver, and amount within maxAmount when set. Contractors with
//      no authorizations pay exactly as before (no migration burden).
// On success the matched authorization is returned so the payment service can
// stamp it plus an immutable snapshot.
import { db } from "@/lib/db";
import { PAYMENT_BLOCKING_DOC_TYPES } from "@/types/contractor";

const MS_PER_DAY = 24 * 3600 * 1000;
const EXPIRY_WARNING_DAYS = 30;

export interface ComplianceActor {
  userId: string;
  userName: string;
}

export interface AuthorizationMatch {
  id: string;
  authorizationNumber: string;
  receiverName: string;
  validFrom: Date;
  validTo: Date | null;
  maxAmount: number | null;
}

export interface ComplianceCheck {
  allowed: boolean;
  reason: string | null;
  authorization: AuthorizationMatch | null;
}

function normalizeReceiver(name: string): string {
  return name.trim().toLowerCase();
}

function startOfDayUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Decide whether a payment to `contractorId` may proceed right now.
 * Called by recordPayment BEFORE any Expense/wallet rows are written.
 */
export async function checkPaymentAllowed(
  contractorId: string,
  amount: number,
  receiver: string | null,
  at: Date = new Date()
): Promise<ComplianceCheck> {
  const contractor = await db.contractor.findUnique({
    where: { id: contractorId },
    select: { id: true, contractorName: true, status: true },
  });
  if (!contractor) {
    return { allowed: false, reason: "Contractor not found", authorization: null };
  }

  // 1. Lifecycle status block.
  if (contractor.status === "SUSPENDED") {
    return {
      allowed: false,
      reason: "Contractor is suspended; reactivate before paying",
      authorization: null,
    };
  }
  if (contractor.status === "BLACKLISTED") {
    return {
      allowed: false,
      reason: "Contractor is blacklisted; payments are blocked",
      authorization: null,
    };
  }
  if (contractor.status === "ARCHIVED") {
    return {
      allowed: false,
      reason: "Contractor is archived; payments are blocked",
      authorization: null,
    };
  }

  // 2. Expired blocking documents (rows only — no rows, no block).
  const expiredDocs = await db.contractorDocument.findMany({
    where: {
      contractorId,
      docType: { in: PAYMENT_BLOCKING_DOC_TYPES },
      expiryDate: { lt: startOfDayUtc(at) },
    },
    select: { title: true, docType: true, expiryDate: true },
  });
  if (expiredDocs.length > 0) {
    const names = expiredDocs.map((d: { title: string }) => d.title).join(", ");
    return {
      allowed: false,
      reason: `Expired compliance document(s): ${names}. Renew before paying`,
      authorization: null,
    };
  }

  // 3. Authorization enforcement (only when live authorizations exist).
  const liveAuths = await db.paymentAuthorization.findMany({
    where: {
      contractorId,
      revokedAt: null,
      validFrom: { lte: at },
      OR: [{ validTo: null }, { validTo: { gte: startOfDayUtc(at) } }],
    },
    select: {
      id: true,
      authorizationNumber: true,
      receiverName: true,
      validFrom: true,
      validTo: true,
      maxAmount: true,
    },
  });
  if (liveAuths.length === 0) {
    return { allowed: true, reason: null, authorization: null };
  }

  const wanted = receiver ? normalizeReceiver(receiver) : null;
  const receiverMatches = liveAuths.filter(
    (a: { receiverName: string }) =>
      wanted != null && normalizeReceiver(a.receiverName) === wanted
  );
  if (receiverMatches.length === 0) {
    const names = liveAuths.map((a: { receiverName: string }) => a.receiverName).join(", ");
    return {
      allowed: false,
      reason: `Active payment authorization(s) exist but none covers receiver "${
        receiver ?? "unspecified"
      }" (authorized: ${names})`,
      authorization: null,
    };
  }

  const withinLimit = receiverMatches.find(
    (a: { maxAmount: number | null }) =>
      a.maxAmount == null || amount <= a.maxAmount + 1e-9
  );
  if (!withinLimit) {
    const limits = receiverMatches
      .map(
        (a: { authorizationNumber: string; maxAmount: number | null }) =>
          `${a.authorizationNumber} (limit ${a.maxAmount?.toLocaleString() ?? "—"} AFN)`
      )
      .join(", ");
    return {
      allowed: false,
      reason: `Amount ${amount.toLocaleString()} AFN exceeds the authorized limit: ${limits}`,
      authorization: null,
    };
  }

  return { allowed: true, reason: null, authorization: withinLimit };
}

/**
 * Aggregated compliance view for the profile Compliance tab: expired and
 * expiring blocking docs, unverified bank accounts, live authorizations, and
 * whether payments are currently blocked.
 */
export async function getComplianceStatus(
  contractorId: string,
  at: Date = new Date(),
  windowDays: number = EXPIRY_WARNING_DAYS
) {
  const contractor = await db.contractor.findUnique({
    where: { id: contractorId },
    select: { id: true, contractorName: true, status: true },
  });
  if (!contractor) return null;

  const today = startOfDayUtc(at);
  const horizon = new Date(today.getTime() + windowDays * MS_PER_DAY);

  const [docs, bankAccounts, activeAuths] = await Promise.all([
    db.contractorDocument.findMany({
      where: {
        contractorId,
        docType: { in: PAYMENT_BLOCKING_DOC_TYPES },
        // Prisma comparisons never match null, so this also excludes docs
        // without an expiry date.
        expiryDate: { lte: horizon },
      },
      orderBy: { expiryDate: "asc" },
    }),
    db.contractorBankAccount.count({
      where: { contractorId, isVerified: false },
    }),
    db.paymentAuthorization.count({
      where: {
        contractorId,
        revokedAt: null,
        validFrom: { lte: at },
        OR: [{ validTo: null }, { validTo: { gte: today } }],
      },
    }),
  ]);

  const expiredBlockingDocs = docs.filter(
    (d: { expiryDate: Date | null }) => d.expiryDate != null && new Date(d.expiryDate) < today
  );
  const expiringBlockingDocs = docs
    .filter(
      (d: { expiryDate: Date | null }) =>
        d.expiryDate != null &&
        new Date(d.expiryDate) >= today &&
        new Date(d.expiryDate) <= horizon
    )
    .map((d: { expiryDate: Date } & Record<string, unknown>) => ({
      ...(d as object),
      daysUntilExpiry: Math.round(
        (new Date(d.expiryDate).getTime() - today.getTime()) / MS_PER_DAY
      ),
    }));

  // Mirror the payment gate so the tab banner shows the same verdict.
  let blockedReason: string | null = null;
  if (contractor.status === "SUSPENDED") {
    blockedReason = "Contractor is suspended; reactivate before paying";
  } else if (contractor.status === "BLACKLISTED") {
    blockedReason = "Contractor is blacklisted; payments are blocked";
  } else if (contractor.status === "ARCHIVED") {
    blockedReason = "Contractor is archived; payments are blocked";
  } else if (expiredBlockingDocs.length > 0) {
    blockedReason = `Expired compliance document(s): ${expiredBlockingDocs
      .map((d: { title: string }) => d.title)
      .join(", ")}. Renew before paying`;
  }

  return {
    contractorId,
    contractorName: contractor.contractorName,
    status: contractor.status,
    expiredBlockingDocs,
    expiringBlockingDocs,
    unverifiedBankAccounts: bankAccounts,
    activeAuthorizations: activeAuths,
    paymentsBlocked: blockedReason != null,
    blockedReason,
  };
}
