import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission, type AuthUser } from "@/lib/permissions";
import { buildAccessScope, withScope } from "@/lib/access-control";
import { updateClaimSchema } from "@/lib/validation/claim";
import {
  ClaimError,
  updateClaimDraft,
  submitClaim,
  verifyClaim,
  financeReviewClaim,
  rejectClaim,
  voidClaim,
  approveAndPostClaim,
  reverseClaim,
  releaseRetention,
} from "@/services/contractor-claim.service";

type Params = { params: Promise<{ id: string }> };

async function claimScope(user: AuthUser) {
  return { contractor: await buildAccessScope(user, "contractor") };
}

async function findClaim(user: AuthUser, id: string) {
  const scope = await claimScope(user);
  return db.contractorClaim.findFirst({
    where: withScope({ id }, scope),
    include: {
      contractor: { select: { id: true, contractorName: true, contractorNumber: true } },
      contract: { select: { id: true, contractNumber: true, title: true, retentionPercent: true } },
      lines: { orderBy: { id: "asc" } },
      deductions: { orderBy: { createdAt: "desc" } },
      allocations: { orderBy: { createdAt: "desc" } },
      advanceRecoveries: { orderBy: { date: "asc" } },
      retentionReleases: { orderBy: { date: "asc" } },
      creator: { select: { id: true, name: true } },
    },
  });
}

const actionSchema = z.object({
  action: z.enum([
    "submit",
    "verify",
    "financeReview",
    "approve",
    "reject",
    "void",
    "reverse",
    "releaseRetention",
  ]),
  note: z.string().max(2000).nullish(),
  reason: z.string().max(2000).nullish(),
  amount: z.number().positive().optional(),
  date: z.string().optional(),
});

// GET /api/contractor-claims/[id] - full claim detail
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const result = await requirePermission(request, "contractors:claims:view");
    if ("status" in result) return result;
    const user = result.user;

    const { id } = await params;
    const claim = await findClaim(user, id);
    if (!claim) {
      return NextResponse.json({ success: false, error: "Claim not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: claim });
  } catch (error) {
    console.error("GET /api/contractor-claims/[id] error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

// PUT /api/contractor-claims/[id] - edit a draft claim (title/period/notes)
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const result = await requirePermission(request, "contractors:claims:edit");
    if ("status" in result) return result;
    const user = result.user;

    const { id } = await params;
    const existing = await findClaim(user, id);
    if (!existing) {
      return NextResponse.json({ success: false, error: "Claim not found" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = updateClaimSchema.safeParse(body);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
      return NextResponse.json({ success: false, error: errors.join(", ") }, { status: 400 });
    }

    const claim = await updateClaimDraft(id, parsed.data, user.id);
    return NextResponse.json({ success: true, data: claim });
  } catch (error) {
    if (error instanceof ClaimError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error("PUT /api/contractor-claims/[id] error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/contractor-claims/[id] - void a claim that never posted
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const result = await requirePermission(request, "contractors:claims:edit");
    if ("status" in result) return result;
    const user = result.user;

    const { id } = await params;
    const existing = await findClaim(user, id);
    if (!existing) {
      return NextResponse.json({ success: false, error: "Claim not found" }, { status: 404 });
    }

    const claim = await voidClaim(id, user.id);
    return NextResponse.json({ success: true, data: claim });
  } catch (error) {
    if (error instanceof ClaimError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error("DELETE /api/contractor-claims/[id] error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/contractor-claims/[id] - workflow transitions and money actions
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = actionSchema.safeParse(body);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
      return NextResponse.json({ success: false, error: errors.join(", ") }, { status: 400 });
    }
    const { action, note, reason, amount, date } = parsed.data;

    // Money/approval actions carry stronger permissions than draft edits.
    const permission =
      action === "approve" || action === "reverse" || action === "releaseRetention"
        ? "contractors:claims:approve"
        : action === "reject"
          ? "contractors:claims:approve"
          : "contractors:claims:edit";
    const result = await requirePermission(request, permission);
    if ("status" in result) return result;
    const user = result.user;

    const existing = await findClaim(user, id);
    if (!existing) {
      return NextResponse.json({ success: false, error: "Claim not found" }, { status: 404 });
    }

    let data: unknown;
    switch (action) {
      case "submit":
        data = await submitClaim(id, user.id);
        break;
      case "verify":
        data = await verifyClaim(id, user.id);
        break;
      case "financeReview":
        data = await financeReviewClaim(id, user.id);
        break;
      case "approve":
        data = await approveAndPostClaim(id, user.id, note ?? undefined);
        break;
      case "reject":
        data = await rejectClaim(id, user.id, note ?? undefined);
        break;
      case "void":
        data = await voidClaim(id, user.id);
        break;
      case "reverse":
        data = await reverseClaim(id, user.id, reason ?? note ?? "No reason given");
        break;
      case "releaseRetention":
        data = await releaseRetention({
          claimId: id,
          amount: amount ?? 0,
          date: date ? new Date(date) : new Date(),
          reason: reason ?? note ?? "Retention released",
          userId: user.id,
        });
        break;
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (error instanceof ClaimError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error("POST /api/contractor-claims/[id] error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

