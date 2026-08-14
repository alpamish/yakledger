import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permissions";
import { buildAccessScope, withScope } from "@/lib/access-control";
import { db } from "@/lib/db";
import { leaveRequestSchema } from "@/lib/validations/hr";

function daysBetween(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)) + 1);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await requirePermission(request, "employees:leave:view");
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

    const leaves = await db.employeeLeave.findMany({
      where: { employeeId: id },
      orderBy: { startDate: "desc" },
      include: {
        leaveType: true,
        approvedBy: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json({ success: true, data: leaves });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to fetch leaves" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await requirePermission(request, "employees:leave:manage");
  if ("status" in result) return result;
  const user = result.user;

  try {
    const body = await request.json();
    const parsed = leaveRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      );
    }
    const d = parsed.data;
    const start = new Date(d.startDate);
    const end = new Date(d.endDate);
    const days = d.days ?? daysBetween(start, end);

    const created = await db.employeeLeave.create({
      data: {
        employeeId: id,
        leaveTypeId: d.leaveTypeId || null,
        startDate: start,
        endDate: end,
        days,
        reason: d.reason,
        status: "PENDING",
        createdById: user.id,
      },
    });
    return NextResponse.json(
      { success: true, data: created, message: "Leave request created" },
      { status: 201 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Failed to create leave" },
      { status: 400 }
    );
  }
}
