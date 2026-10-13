import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission, type AuthUser } from "@/lib/permissions";
import { buildAccessScope, withScope } from "@/lib/access-control";
import { createAdvance, AdvanceError } from "@/services/contractor-advance.service";

const createAdvanceSchema = z.object({
  contractorId: z.string().min(1, "Contractor is required"),
  contractId: z.string().optional().nullable(),
  amount: z.number().positive("Amount must be positive"),
  date: z.string().min(1, "Date is required"),
  recoveryPercent: z.number().min(0).max(100).nullable().nullish(),
  walletId: z.string().optional().nullable(),
  notes: z.string().max(5000).nullish(),
});

async function advanceScope(user: AuthUser) {
  return { contractor: await buildAccessScope(user, "contractor") };
}

// GET /api/contractor-advances - list advances (scoped, filterable)
export async function GET(request: NextRequest) {
  try {
    const result = await requirePermission(request, "contractors:advances:view");
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

    const scope = await advanceScope(user);
    const scopedWhere = withScope(where, scope);

    const [total, advances] = await Promise.all([
      db.contractorAdvance.count({ where: scopedWhere }),
      db.contractorAdvance.findMany({
        where: scopedWhere,
        orderBy: { date: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          contractor: { select: { id: true, contractorName: true, contractorNumber: true } },
          recoveries: { orderBy: { date: "asc" }, include: { claim: { select: { claimNumber: true } } } },
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        data: advances,
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    });
  } catch (error) {
    console.error("GET /api/contractor-advances error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/contractor-advances - disburse an advance
export async function POST(request: NextRequest) {
  try {
    const result = await requirePermission(request, "contractors:advances:create");
    if ("status" in result) return result;
    const user = result.user;

    const body = await request.json();
    const parsed = createAdvanceSchema.safeParse(body);
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

    const advance = await createAdvance({
      contractorId: data.contractorId,
      contractId: data.contractId ?? null,
      amount: data.amount,
      date: new Date(data.date),
      recoveryPercent: data.recoveryPercent ?? null,
      walletId: data.walletId ?? null,
      notes: data.notes ?? null,
      userId: user.id,
    });

    return NextResponse.json({ success: true, data: advance }, { status: 201 });
  } catch (error) {
    if (error instanceof AdvanceError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error("POST /api/contractor-advances error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
