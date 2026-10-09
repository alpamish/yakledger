import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { buildListScope, withScope } from "@/lib/access-control";
import { loanService } from "@/services/loan.service";

const createLoanSchema = z.object({
  employeeId: z.string().min(1, "Employee is required"),
  principalMinor: z.number().int().positive("Loan amount must be positive"),
  issueDate: z.coerce.date(),
  dueDate: z.coerce.date().optional().nullable(),
  monthlyInstallmentMinor: z.number().int().positive().optional().nullable(),
  autoDeduct: z.boolean().optional(),
  note: z.string().optional().nullable(),
});

// GET /api/loans - list loans (filter by ?employeeId= / ?status=)
export async function GET(request: NextRequest) {
  try {
    const result = await requirePermission(request, "cashAdvance:view");
    if ("status" in result) return result;
    const user = result.user;

    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get("employeeId");
    const status = searchParams.get("status");

    const where: Record<string, unknown> = {};
    if (employeeId) where.employeeId = employeeId;
    if (status) where.status = status;

    const scope = await buildListScope(user, "loan");
    const scopedWhere = withScope(where, scope);

    const loans = await db.loan.findMany({
      where: scopedWhere,
      include: {
        employee: { select: { id: true, fullName: true, jobTitle: true, department: true } },
        createdBy: { select: { id: true, name: true } },
        _count: { select: { allocations: true, repayments: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: loans });
  } catch (error) {
    console.error("Get loans error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch loans" },
      { status: 500 }
    );
  }
}

// POST /api/loans - issue a loan (pending approval unless created by Admin)
export async function POST(request: NextRequest) {
  try {
    const result = await requirePermission(request, "cashAdvance:create");
    if ("status" in result) return result;
    const user = result.user;

    const body = await request.json();
    const parsed = createLoanSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      );
    }

    const loan = await loanService.create(parsed.data, user);
    return NextResponse.json(
      { success: true, data: loan, message: "Loan created successfully" },
      { status: 201 }
    );
  } catch (error) {
    console.error("Create loan error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to create loan" },
      { status: 500 }
    );
  }
}
