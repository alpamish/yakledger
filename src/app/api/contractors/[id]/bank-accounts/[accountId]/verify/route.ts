import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { buildAccessScope, withScope } from "@/lib/access-control";

const verifySchema = z.object({
  // POST { verified: true } verifies (default); { verified: false } unverifies.
  verified: z.boolean().default(true),
});

async function findAccount(
  id: string,
  accountId: string,
  user: { id: string; role: string }
) {
  const scope = await buildAccessScope(user, "contractor");
  const contractor = await db.contractor.findFirst({
    where: withScope({ id }, scope),
    select: { id: true },
  });
  if (!contractor) return null;
  const account = await db.contractorBankAccount.findUnique({
    where: { id: accountId },
    select: { id: true, contractorId: true },
  });
  if (!account || account.contractorId !== id) return null;
  return account;
}

// POST /api/contractors/[id]/bank-accounts/[accountId]/verify
// Verification is a compliance act — contractors:authorize only.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; accountId: string }> }
) {
  try {
    const result = await requirePermission(request, "contractors:authorize");
    if ("status" in result) return result;
    const { id, accountId } = await params;
    if (!(await findAccount(id, accountId, result.user))) {
      return NextResponse.json(
        { success: false, error: "Bank account not found" },
        { status: 404 }
      );
    }
    const body = await request.json().catch(() => ({}));
    const parsed = verifySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      );
    }
    const now = new Date();
    const updated = await db.contractorBankAccount.update({
      where: { id: accountId },
      data: parsed.data.verified
        ? { isVerified: true, verifiedById: result.user.id, verifiedAt: now }
        : { isVerified: false, verifiedById: null, verifiedAt: null },
    });
    await db.auditLog.create({
      data: {
        action: "UPDATE",
        entity: "ContractorBankAccount",
        entityId: accountId,
        details: `${parsed.data.verified ? "Verified" : "Unverified"} bank account ${updated.accountNumber} (${updated.bankName})`,
        userId: result.user.id,
      },
    });
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("POST /api/contractors/[id]/bank-accounts/[accountId]/verify error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
