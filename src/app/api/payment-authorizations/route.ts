import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { buildAccessScope, withScope } from "@/lib/access-control";
import { generateBusinessNumber, AUTHORIZATION_NUMBER } from "@/lib/business-number";

const createAuthorizationSchema = z.object({
  contractorId: z.string().min(1, "Contractor is required"),
  receiverName: z.string().min(1, "Receiver name is required").max(200),
  validFrom: z.string().min(1, "Valid-from date is required"),
  validTo: z.string().optional().nullable(),
  maxAmount: z.number().min(0).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
});

// GET /api/payment-authorizations?contractorId=&active=&page=&pageSize=
export async function GET(request: NextRequest) {
  try {
    const result = await requirePermission(request, "contractors:view");
    if ("status" in result) return result;
    const user = result.user;

    const { searchParams } = new URL(request.url);
    const contractorId = searchParams.get("contractorId") || undefined;
    const active = searchParams.get("active");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const pageSize = Math.min(
      200,
      Math.max(1, parseInt(searchParams.get("pageSize") || "50", 10) || 50)
    );

    const where: Record<string, unknown> = {};
    if (contractorId) where.contractorId = contractorId;
    if (active === "true") {
      const now = new Date();
      where.revokedAt = null;
      where.validFrom = { lte: now };
      where.OR = [{ validTo: null }, { validTo: { gte: now } }];
    } else if (active === "false") {
      where.OR = [{ revokedAt: { not: null } }, { validFrom: { gt: new Date() } }];
    }

    const scope = await buildAccessScope(user, "contractor");
    const scopedWhere = withScope(where, scope);

    const [total, authorizations] = await Promise.all([
      db.paymentAuthorization.count({ where: scopedWhere }),
      db.paymentAuthorization.findMany({
        where: scopedWhere,
        orderBy: [{ createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          contractor: { select: { id: true, contractorName: true, status: true } },
        },
      }),
    ]);
    return NextResponse.json({
      success: true,
      data: { total, page, pageSize, data: authorizations },
    });
  } catch (error) {
    console.error("GET /api/payment-authorizations error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/payment-authorizations — compliance act: contractors:authorize.
export async function POST(request: NextRequest) {
  try {
    const result = await requirePermission(request, "contractors:authorize");
    if ("status" in result) return result;
    const user = result.user;

    const body = await request.json();
    const parsed = createAuthorizationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      );
    }
    const data = parsed.data;

    const scope = await buildAccessScope(user, "contractor");
    const contractor = await db.contractor.findFirst({
      where: withScope({ id: data.contractorId }, scope),
      select: { id: true, contractorName: true },
    });
    if (!contractor) {
      return NextResponse.json(
        { success: false, error: "Contractor not found" },
        { status: 404 }
      );
    }

    const validFrom = new Date(data.validFrom);
    const validTo = data.validTo ? new Date(data.validTo) : null;
    if (validTo && validTo < validFrom) {
      return NextResponse.json(
        { success: false, error: "Valid-to date cannot be before valid-from" },
        { status: 400 }
      );
    }

    const authorization = await db.$transaction(async (tx: any) => {
      const authorizationNumber = await generateBusinessNumber(tx, AUTHORIZATION_NUMBER);
      return tx.paymentAuthorization.create({
        data: {
          authorizationNumber,
          contractorId: data.contractorId,
          receiverName: data.receiverName.trim(),
          validFrom,
          validTo,
          maxAmount: data.maxAmount ?? null,
          notes: data.notes ?? null,
          createdBy: user.id,
        },
      });
    });

    return NextResponse.json({ success: true, data: authorization }, { status: 201 });
  } catch (error) {
    console.error("POST /api/payment-authorizations error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
