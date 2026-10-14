import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { buildAccessScope, withScope } from "@/lib/access-control";

const updateContactSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  role: z.string().max(200).optional().nullable(),
  phone: z.string().min(1).max(50).optional(),
  email: z.string().email().max(200).optional().nullable(),
  isPrimary: z.boolean().optional(),
  notes: z.string().max(5000).optional().nullable(),
});

async function findContact(id: string, contactId: string, user: { id: string; role: string }) {
  const scope = await buildAccessScope(user, "contractor");
  const contractor = await db.contractor.findFirst({
    where: withScope({ id }, scope),
    select: { id: true },
  });
  if (!contractor) return null;
  const contact = await db.contractorContact.findUnique({
    where: { id: contactId },
    select: { id: true, contractorId: true },
  });
  if (!contact || contact.contractorId !== id) return null;
  return contact;
}

// PUT /api/contractors/[id]/contacts/[contactId]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; contactId: string }> }
) {
  try {
    const result = await requirePermission(request, "contractors:edit");
    if ("status" in result) return result;
    const { id, contactId } = await params;
    if (!(await findContact(id, contactId, result.user))) {
      return NextResponse.json({ success: false, error: "Contact not found" }, { status: 404 });
    }
    const body = await request.json();
    const parsed = updateContactSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      );
    }
    const updated = await db.contractorContact.update({
      where: { id: contactId },
      data: parsed.data,
    });
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("PUT /api/contractors/[id]/contacts/[contactId] error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/contractors/[id]/contacts/[contactId]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; contactId: string }> }
) {
  try {
    const result = await requirePermission(request, "contractors:edit");
    if ("status" in result) return result;
    const { id, contactId } = await params;
    if (!(await findContact(id, contactId, result.user))) {
      return NextResponse.json({ success: false, error: "Contact not found" }, { status: 404 });
    }
    await db.contractorContact.delete({ where: { id: contactId } });
    return NextResponse.json({ success: true, data: { id: contactId } });
  } catch (error) {
    console.error("DELETE /api/contractors/[id]/contacts/[contactId] error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
