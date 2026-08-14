import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permissions";
import { db } from "@/lib/db";
import { leaveTypeSchema } from "@/lib/validations/hr";

export async function GET(request: NextRequest) {
  const result = await requirePermission(request, "employees:leave:view");
  if ("status" in result) return result;
  try {
    const types = await db.employeeLeaveType.findMany({
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ success: true, data: types });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to fetch leave types" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const result = await requirePermission(request, "employees:leave:manage");
  if ("status" in result) return result;
  const user = result.user;
  try {
    const body = await request.json();
    const parsed = leaveTypeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      );
    }
    const d = parsed.data;
    const created = await db.employeeLeaveType.create({
      data: {
        name: d.name,
        description: d.description,
        isPaid: d.isPaid,
        defaultDays: d.defaultDays,
        isActive: d.isActive,
        createdById: user.id,
      },
    });
    return NextResponse.json(
      { success: true, data: created, message: "Leave type created" },
      { status: 201 }
    );
  } catch (e: any) {
    const msg =
      e?.code === "P2002" ? "Leave type already exists" : e?.message || "Failed";
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
