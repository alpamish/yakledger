import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permissions";
import { buildAccessScope, withScope } from "@/lib/access-control";
import { db } from "@/lib/db";
import { documentSchema } from "@/lib/validations/hr";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await requirePermission(request, "employees:documents:view");
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

    const documents = await db.employeeDocument.findMany({
      where: { employeeId: id },
      orderBy: { createdAt: "desc" },
      include: { uploadedBy: { select: { id: true, name: true } } },
    });
    return NextResponse.json({ success: true, data: documents });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to fetch documents" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await requirePermission(request, "employees:documents:manage");
  if ("status" in result) return result;
  const user = result.user;

  try {
    const body = await request.json();
    const parsed = documentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      );
    }
    const d = parsed.data;
    const created = await db.$transaction(async (tx) => {
      const doc = await tx.employeeDocument.create({
        data: {
          employeeId: id,
          documentType: d.documentType,
          documentNumber: d.documentNumber,
          issueDate: d.issueDate ? new Date(d.issueDate) : null,
          expiryDate: d.expiryDate ? new Date(d.expiryDate) : null,
          fileUrl: d.fileUrl,
          notes: d.notes,
          uploadedById: user.id,
        },
      });
      await tx.employeeAuditEvent.create({
        data: {
          employeeId: id,
          action: "DOCUMENT_ADDED",
          field: "document",
          newValue: d.documentType,
          performedById: user.id,
        },
      });
      return doc;
    });
    return NextResponse.json(
      { success: true, data: created, message: "Document added" },
      { status: 201 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Failed to add document" },
      { status: 400 }
    );
  }
}
