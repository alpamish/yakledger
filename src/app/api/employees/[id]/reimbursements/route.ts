import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permissions";
import { buildAccessScope, withScope } from "@/lib/access-control";
import type { AuthUser } from "@/lib/permissions";
import { reimbursementSchema } from "@/lib/validations/hr";
import { db } from "@/lib/db";
import {
  listReimbursements,
  recordReimbursement,
} from "@/services/reimbursement.service";

async function findScopedEmployee(user: AuthUser, id: string) {
  const scope = await buildAccessScope(user, "employee");
  return db.employee.findFirst({
    where: withScope({ id }, scope),
    select: { id: true },
  });
}

/** List employee-paid expenses and their reimbursement state. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requirePermission(request, "expenses:view");
  if ("status" in result) return result;
  const { id } = await params;

  try {
    const employee = await findScopedEmployee(result.user, id);
    if (!employee) {
      return NextResponse.json(
        { success: false, error: "Employee not found" },
        { status: 404 }
      );
    }

    const url = new URL(request.url);
    const status = url.searchParams.get("status") as
      | "PENDING"
      | "APPROVED"
      | "REIMBURSED"
      | "REJECTED"
      | null;
    const data = await listReimbursements(id, status ? { status } : undefined);
    return NextResponse.json({ success: true, data });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Failed to load reimbursements" },
      { status: 500 }
    );
  }
}

/** Pay approved employee-paid expenses back to the employee. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requirePermission(request, "expenses:approve");
  if ("status" in result) return result;
  const user = result.user;
  const { id } = await params;

  try {
    const body = await request.json();
    const parsed = reimbursementSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || "Invalid input" },
        { status: 400 }
      );
    }

    const employee = await db.employee.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!employee) {
      return NextResponse.json(
        { success: false, error: "Employee not found" },
        { status: 404 }
      );
    }

    const data = await recordReimbursement({
      employeeId: id,
      expenseIds: parsed.data.expenseIds,
      paymentMethod: parsed.data.paymentMethod,
      walletId: parsed.data.walletId ?? null,
      paidById: user.id,
      note: parsed.data.note ?? null,
    });

    return NextResponse.json({ success: true, data });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Failed to record reimbursement" },
      { status: 400 }
    );
  }
}
