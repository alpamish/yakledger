import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/permissions";
import { db } from "@/lib/db";
import { recordPayrollPayment } from "@/services/hr.service";
import { PAYROLL_PAYMENT_METHODS } from "@/lib/payroll-status";
import { fromMinor } from "@/lib/money";

const paymentSchema = z.object({
  // Integer minor units; omitted = pay whatever is still outstanding.
  amountMinor: z.number().int().positive().optional(),
  paymentMethod: z.enum(PAYROLL_PAYMENT_METHODS),
  walletId: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
  reference: z.string().optional().nullable(),
  evidenceUrl: z.string().optional().nullable(),
});

/**
 * POST /api/payroll/[id]/payments — record one (possibly partial) salary
 * payment against an approved payroll (Plan-payroll.pdf §2 action 6).
 * Each payment is a separate transaction and may use a different method.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await requirePermission(request, "employees:payroll:manage");
  if ("status" in result) return result;
  const user = result.user;

  try {
    const raw = await request.json().catch(() => ({}));
    const parsed = paymentSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      );
    }

    const payroll = await recordPayrollPayment(id, user.id, {
      amountMinor: parsed.data.amountMinor,
      paymentMethod: parsed.data.paymentMethod,
      walletId: parsed.data.walletId ?? undefined,
      note: parsed.data.note ?? undefined,
      reference: parsed.data.reference ?? undefined,
      evidenceUrl: parsed.data.evidenceUrl ?? undefined,
    });

    return NextResponse.json({
      success: true,
      data: payroll,
      message: "Payment recorded successfully",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to record payment";
    const status = /must be approved|already fully paid|exceeds|requires a wallet|Unsupported/.test(message)
      ? 400
      : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

/** GET /api/payroll/[id]/payments — the payment history of a payroll. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await requirePermission(request, "employees:payroll:view");
  if ("status" in result) return result;

  try {
    const payments = await db.payrollPayment.findMany({
      where: { payrollId: id },
      include: {
        wallet: { select: { id: true, name: true, currency: true } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { paidAt: "asc" },
    });

    const payroll = await db.payroll.findUnique({ where: { id } });
    if (!payroll) {
      return NextResponse.json({ success: false, error: "Payroll not found" }, { status: 404 });
    }

    const paidMinor = payments.reduce((s, p) => s + p.amountMinor, 0);
    return NextResponse.json({
      success: true,
      data: {
        payments,
        paidMinor,
        paid: fromMinor(paidMinor),
      },
    });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Failed to fetch payments" },
      { status: 500 }
    );
  }
}
