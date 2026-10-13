import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission, type AuthUser } from "@/lib/permissions";
import { buildAccessScope, withScope } from "@/lib/access-control";
import { recordPayment, PaymentError } from "@/services/contractor-payment.service";

const createPaymentSchema = z.object({
  contractorId: z.string().min(1, "Contractor is required"),
  contractId: z.string().optional().nullable(),
  amount: z.number().positive("Amount must be positive"),
  paymentDate: z.string().min(1, "Payment date is required"),
  method: z.enum(["CASH", "BANK_TRANSFER", "CHEQUE"]).default("CASH"),
  walletId: z.string().optional().nullable(),
  authorizedById: z.string().optional().nullable(),
  notes: z.string().max(5000).nullish(),
});

async function paymentScope(user: AuthUser) {
  return { contractor: await buildAccessScope(user, "contractor") };
}

// GET /api/contractor-payments - list payments (scoped, filterable)
export async function GET(request: NextRequest) {
  try {
    const result = await requirePermission(request, "contractors:payments:view");
    if ("status" in result) return result;
    const user = result.user;

    const { searchParams } = new URL(request.url);
    const contractorId = searchParams.get("contractorId");
    const status = searchParams.get("status");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const pageSize = Math.min(
      200,
      Math.max(1, parseInt(searchParams.get("pageSize") || "50", 10) || 50)
    );

    const where: Record<string, unknown> = {};
    if (contractorId) where.contractorId = contractorId;
    if (status) where.status = status;

    const scope = await paymentScope(user);
    const scopedWhere = withScope(where, scope);

    const [total, payments] = await Promise.all([
      db.contractorPayment.count({ where: scopedWhere }),
      db.contractorPayment.findMany({
        where: scopedWhere,
        orderBy: { paymentDate: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          contractor: { select: { id: true, contractorName: true, contractorNumber: true } },
          allocations: {
            orderBy: { createdAt: "asc" },
            include: { claim: { select: { id: true, claimNumber: true, title: true } } },
          },
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        data: payments,
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    });
  } catch (error) {
    console.error("GET /api/contractor-payments error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/contractor-payments - record a payment (Expense + wallet + ledger)
// Retries may send an `Idempotency-Key` header; the same key returns the
// original payment instead of double-posting.
export async function POST(request: NextRequest) {
  try {
    const result = await requirePermission(request, "contractors:payments:create");
    if ("status" in result) return result;
    const user = result.user;

    const body = await request.json();
    const parsed = createPaymentSchema.safeParse(body);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
      return NextResponse.json({ success: false, error: errors.join(", ") }, { status: 400 });
    }
    const data = parsed.data;

    // The contractor must be visible to the caller.
    const scope = await buildAccessScope(user, "contractor");
    const contractor = await db.contractor.findFirst({
      where: withScope({ id: data.contractorId }, scope),
      select: { id: true },
    });
    if (!contractor) {
      return NextResponse.json({ success: false, error: "Contractor not found" }, { status: 404 });
    }

    const idempotencyKey = request.headers.get("Idempotency-Key") ?? null;

    const { payment, idempotent } = await recordPayment({
      contractorId: data.contractorId,
      contractId: data.contractId ?? null,
      amount: data.amount,
      paymentDate: new Date(data.paymentDate),
      method: data.method,
      walletId: data.walletId ?? null,
      authorizedById: data.authorizedById ?? null,
      notes: data.notes ?? null,
      idempotencyKey,
      userId: user.id,
    });

    return NextResponse.json(
      { success: true, data: payment, message: idempotent ? "Duplicate request: original payment returned" : undefined },
      { status: idempotent ? 200 : 201 }
    );
  } catch (error) {
    if (error instanceof PaymentError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error("POST /api/contractor-payments error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
