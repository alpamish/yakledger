import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permissions";
import { buildAccessScope, withScope } from "@/lib/access-control";
import { db } from "@/lib/db";

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

    const events = await db.employeeAuditEvent.findMany({
      where: { employeeId: id },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { performedBy: { select: { id: true, name: true } } },
    });
    return NextResponse.json({ success: true, data: events });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to fetch audit events" },
      { status: 500 }
    );
  }
}
