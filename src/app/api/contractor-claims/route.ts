import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission, type AuthUser } from "@/lib/permissions";
import { buildAccessScope, withScope } from "@/lib/access-control";
import { createClaimFromTimesheets, ClaimError } from "@/services/contractor-claim.service";
import { z } from "zod";

const createClaimSchema = z.object({
  contractId: z.string().min(1, "Contract is required"),
  timesheetIds: z.array(z.string().min(1)).min(1, "Select at least one timesheet"),
  title: z.string().max(200).optional(),
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
  notes: z.string().max(5000).nullish(),
});

/** Claims are scoped through their contractor: anyone who can see the
 * contractor sees its claims, otherwise own-created only. */
async function claimScope(user: AuthUser) {
  const contractorScope = await buildAccessScope(user, "contractor");
  return { contractor: contractorScope };
}

// GET /api/contractor-claims - list claims (scoped, filterable)
export async function GET(request: NextRequest) {
  try {
    const result = await requirePermission(request, "contractors:claims:view");
    if ("status" in result) return result;
    const user = result.user;

    const { searchParams } = new URL(request.url);
    const contractorId = searchParams.get("contractorId");
    const contractId = searchParams.get("contractId");
    const status = searchParams.get("status");
    const search = searchParams.get("search");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const pageSize = Math.min(
      200,
      Math.max(1, parseInt(searchParams.get("pageSize") || "50", 10) || 50)
    );

    const where: Record<string, unknown> = {};
    if (contractorId) where.contractorId = contractorId;
    if (contractId) where.contractId = contractId;
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { claimNumber: { contains: search } },
        { title: { contains: search } },
        { contractor: { contractorName: { contains: search } } },
      ];
    }

    const scope = await claimScope(user);
    const scopedWhere = withScope(where, scope);

    const [total, claims] = await Promise.all([
      db.contractorClaim.count({ where: scopedWhere }),
      db.contractorClaim.findMany({
        where: scopedWhere,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          contractor: { select: { id: true, contractorName: true, contractorNumber: true } },
          contract: { select: { id: true, contractNumber: true, title: true } },
          creator: { select: { id: true, name: true } },
          _count: { select: { lines: true, deductions: true, allocations: true } },
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        data: claims,
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    });
  } catch (error) {
    console.error("GET /api/contractor-claims error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/contractor-claims - build a claim from approved timesheets
export async function POST(request: NextRequest) {
  try {
    const result = await requirePermission(request, "contractors:claims:create");
    if ("status" in result) return result;
    const user = result.user;

    const body = await request.json();
    const parsed = createClaimSchema.safeParse(body);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
      return NextResponse.json({ success: false, error: errors.join(", ") }, { status: 400 });
    }
    const data = parsed.data;

    const claim = await createClaimFromTimesheets({
      contractId: data.contractId,
      timesheetIds: data.timesheetIds,
      title: data.title,
      periodStart: data.periodStart ? new Date(data.periodStart) : undefined,
      periodEnd: data.periodEnd ? new Date(data.periodEnd) : undefined,
      notes: data.notes ?? null,
      userId: user.id,
    });

    return NextResponse.json({ success: true, data: claim }, { status: 201 });
  } catch (error) {
    if (error instanceof ClaimError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error("POST /api/contractor-claims error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
