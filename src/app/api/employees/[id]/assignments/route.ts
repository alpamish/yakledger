import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permissions";
import { buildAccessScope, withScope } from "@/lib/access-control";
import { db } from "@/lib/db";
import { assignmentSchema } from "@/lib/validations/hr";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await requirePermission(request, "employees:view");
  if ("status" in result) return result;

  try {
    const scope = await buildAccessScope(result.user, "employee");
    const employee = await db.employee.findFirst({
      where: withScope({ id }, scope),
      select: { id: true },
    });
    if (!employee)
      return NextResponse.json(
        { success: false, error: "Employee not found" },
        { status: 404 }
      );

    const assignments = await db.employeeProjectAssignment.findMany({
      where: { employeeId: id },
      orderBy: { startDate: "desc" },
      include: { createdBy: { select: { id: true, name: true } } },
    });
    return NextResponse.json({ success: true, data: assignments });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to fetch assignments" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await requirePermission(request, "employees:edit");
  if ("status" in result) return result;
  const user = result.user;

  try {
    const body = await request.json();
    const parsed = assignmentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      );
    }
    const d = parsed.data;
    const created = await db.employeeProjectAssignment.create({
      data: {
        employeeId: id,
        project: d.project,
        position: d.position,
        startDate: new Date(d.startDate),
        endDate: d.endDate ? new Date(d.endDate) : null,
        notes: d.notes,
        createdById: user.id,
      },
    });
    return NextResponse.json(
      { success: true, data: created, message: "Assignment created" },
      { status: 201 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Failed to create assignment" },
      { status: 400 }
    );
  }
}
