import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { buildAccessScope, withScope } from "@/lib/access-control";

const updateAccountSchema = z.object({
  accountName: z.string().min(1).max(200).optional(),
  accountNumber: z.string().min(1).max(100).optional(),
  bankName: z.string().min(1).max(200).optional(),
  branch: z.string().max(200).optional().nullable(),
  isDefault: z.boolean().optional(),
  notes: z.string().max(5000).optional().nullable(),
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

// PUT /api/contractors/[id]/bank-accounts/[accountId]
// Note: editing never flips isVerified — only the verify/unverify action does.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; accountId: string }> }
) {
  try {
    const result = await requirePermission(request, "contractors:edit");
    if ("status" in result) return result;
    const { id, accountId } = await params;
    if (!(await findAccount(id, accountId, result.user))) {
      return NextResponse.json(
        { success: false, error: "Bank account not found" },
        { status: 404 }
      );
    }
    const body = await request.json();
    const parsed = updateAccountSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      );
    }
    const updated = await db.$transaction(async (tx: any) => {
      if (parsed.data.isDefault === true) {
        await tx.contractorBankAccount.updateMany({
          where: { contractorId: id, isDefault: true, id: { not: accountId } },
          data: { isDefault: false },
        });
      }
      return tx.contractorBankAccount.update({
        where: { id: accountId },
        data: parsed.data,
      });
    });
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("PUT /api/contractors/[id]/bank-accounts/[accountId] error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/contractors/[id]/bank-accounts/[accountId]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; accountId: string }> }
) {
  try {
    const result = await requirePermission(request, "contractors:edit");
    if ("status" in result) return result;
    const { id, accountId } = await params;
    if (!(await findAccount(id, accountId, result.user))) {
      return NextResponse.json(
        { success: false, error: "Bank account not found" },
        { status: 404 }
      );
    }
    await db.contractorBankAccount.delete({ where: { id: accountId } });
    return NextResponse.json({ success: true, data: { id: accountId } });
  } catch (error) {
    console.error("DELETE /api/contractors/[id]/bank-accounts/[accountId] error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
