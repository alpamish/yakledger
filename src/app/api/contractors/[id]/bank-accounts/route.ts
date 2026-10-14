import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { buildAccessScope, withScope } from "@/lib/access-control";

const createAccountSchema = z.object({
  accountName: z.string().min(1, "Account name is required").max(200),
  accountNumber: z.string().min(1, "Account number is required").max(100),
  bankName: z.string().min(1, "Bank name is required").max(200),
  branch: z.string().max(200).optional().nullable(),
  isDefault: z.boolean().default(false),
  notes: z.string().max(5000).optional().nullable(),
});

async function findContractor(id: string, user: { id: string; role: string }) {
  const scope = await buildAccessScope(user, "contractor");
  return db.contractor.findFirst({
    where: withScope({ id }, scope),
    select: { id: true },
  });
}

// GET /api/contractors/[id]/bank-accounts
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await requirePermission(request, "contractors:view");
    if ("status" in result) return result;
    const { id } = await params;
    if (!(await findContractor(id, result.user))) {
      return NextResponse.json({ success: false, error: "Contractor not found" }, { status: 404 });
    }
    const accounts = await db.contractorBankAccount.findMany({
      where: { contractorId: id },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });
    return NextResponse.json({ success: true, data: accounts });
  } catch (error) {
    console.error("GET /api/contractors/[id]/bank-accounts error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/contractors/[id]/bank-accounts — CRUD is contractors:edit;
// verification is a separate authorize-gated step.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await requirePermission(request, "contractors:edit");
    if ("status" in result) return result;
    const { id } = await params;
    if (!(await findContractor(id, result.user))) {
      return NextResponse.json({ success: false, error: "Contractor not found" }, { status: 404 });
    }
    const body = await request.json();
    const parsed = createAccountSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      );
    }
    const account = await db.$transaction(async (tx: any) => {
      if (parsed.data.isDefault) {
        await tx.contractorBankAccount.updateMany({
          where: { contractorId: id, isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.contractorBankAccount.create({
        data: { ...parsed.data, contractorId: id, createdBy: result.user.id },
      });
    });
    return NextResponse.json({ success: true, data: account }, { status: 201 });
  } catch (error) {
    console.error("POST /api/contractors/[id]/bank-accounts error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
