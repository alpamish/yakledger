import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permissions";
import { buildAccessScope, withScope } from "@/lib/access-control";
import { db } from "@/lib/db";
import { toMinor } from "@/lib/money";
import { contractSchema } from "@/lib/validations/hr";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await requirePermission(request, "employees:contract:view");
  if ("status" in result) return result;
  const user = result.user;

  try {
    const scope = await buildAccessScope(user, "employee");
    const employee = await db.employee.findFirst({
      where: withScope({ id }, scope),
      select: { id: true },
    });
    if (!employee)
      return NextResponse.json(
        { success: false, error: "Employee not found" },
        { status: 404 }
      );

    const contracts = await db.employeeContract.findMany({
      where: { employeeId: id },
      orderBy: { startDate: "desc" },
      include: { createdBy: { select: { id: true, name: true } } },
    });
    return NextResponse.json({ success: true, data: contracts });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to fetch contracts" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await requirePermission(request, "employees:contract:manage");
  if ("status" in result) return result;
  const user = result.user;

  try {
    const body = await request.json();
    const parsed = contractSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      );
    }
    const d = parsed.data;

    const created = await db.$transaction(async (tx) => {
      const contract = await tx.employeeContract.create({
        data: {
          employeeId: id,
          contractNumber: d.contractNumber,
          contractType: d.contractType,
          startDate: new Date(d.startDate),
          endDate: d.endDate ? new Date(d.endDate) : null,
          salaryMinor: d.salaryMinor != null ? toMinor(d.salaryMinor) : 0,
          currency: d.currency,
          position: d.position,
          department: d.department,
          project: d.project,
          status: d.status,
          fileUrl: d.fileUrl,
          notes: d.notes,
          createdById: user.id,
        },
      });
      await tx.employeeAuditEvent.create({
        data: {
          employeeId: id,
          action: "CONTRACT_CREATED",
          field: "contract",
          newValue: d.contractNumber,
          performedById: user.id,
        },
      });
      return contract;
    });

    return NextResponse.json(
      { success: true, data: created, message: "Contract created" },
      { status: 201 }
    );
  } catch (e: any) {
    const msg =
      e?.code === "P2002"
        ? "Contract number already exists"
        : e?.message || "Failed to create contract";
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
