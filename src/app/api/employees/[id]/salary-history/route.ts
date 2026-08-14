import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permissions";
import { buildAccessScope, withScope } from "@/lib/access-control";
import {
  getSalaryHistory,
  createSalaryChange,
  getEmployeeSalaryAtDate,
} from "@/services/hr.service";
import { salaryChangeSchema } from "@/lib/validations/hr";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await requirePermission(request, "employees:salary:view");
  if ("status" in result) return result;
  const user = result.user;

  try {
    const scope = await buildAccessScope(user, "employee");
    const employee = await (
      await import("@/lib/db")
    ).db.employee.findFirst({
      where: withScope({ id }, scope),
      select: { id: true },
    });
    if (!employee) {
      return NextResponse.json(
        { success: false, error: "Employee not found" },
        { status: 404 }
      );
    }

    const history = await getSalaryHistory(id, "desc");
    const current = await getEmployeeSalaryAtDate(id, new Date());
    return NextResponse.json({
      success: true,
      data: { history, current },
    });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: "Failed to fetch salary history" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await requirePermission(request, "employees:salary:manage");
  if ("status" in result) return result;
  const user = result.user;

  try {
    const body = await request.json();
    const parsed = salaryChangeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      );
    }
    const created = await createSalaryChange({
      employeeId: id,
      amount: parsed.data.amount,
      currency: parsed.data.currency,
      effectiveFrom: parsed.data.effectiveFrom,
      reason: parsed.data.reason,
      notes: parsed.data.notes,
      performedById: user.id,
    });
    return NextResponse.json(
      { success: true, data: created, message: "Salary change recorded" },
      { status: 201 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Failed to create salary change" },
      { status: 400 }
    );
  }
}
