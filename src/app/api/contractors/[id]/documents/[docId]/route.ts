import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { buildAccessScope, withScope } from "@/lib/access-control";
import { CONTRACTOR_DOCUMENT_TYPES } from "@/lib/validation/contractor";

const updateDocumentSchema = z.object({
  docType: z.enum(CONTRACTOR_DOCUMENT_TYPES).optional(),
  title: z.string().min(1).max(200).optional(),
  documentNumber: z.string().max(200).optional().nullable(),
  issueDate: z.string().optional().nullable(),
  expiryDate: z.string().optional().nullable(),
  fileUrl: z.string().max(1000).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
});

async function findDocument(
  id: string,
  docId: string,
  user: { id: string; role: string }
) {
  const scope = await buildAccessScope(user, "contractor");
  const contractor = await db.contractor.findFirst({
    where: withScope({ id }, scope),
    select: { id: true },
  });
  if (!contractor) return null;
  const document = await db.contractorDocument.findUnique({
    where: { id: docId },
    select: { id: true, contractorId: true, issueDate: true, expiryDate: true },
  });
  if (!document || document.contractorId !== id) return null;
  return document;
}

// PUT /api/contractors/[id]/documents/[docId]
// Editing an expiry date is how a contractor "renews" a document — the
// payment gate re-evaluates on the next payment, no approval needed.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  try {
    const result = await requirePermission(request, "contractors:edit");
    if ("status" in result) return result;
    const { id, docId } = await params;
    const document = await findDocument(id, docId, result.user);
    if (!document) {
      return NextResponse.json({ success: false, error: "Document not found" }, { status: 404 });
    }
    const body = await request.json();
    const parsed = updateDocumentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      );
    }
    const issueDate = parsed.data.issueDate
      ? new Date(parsed.data.issueDate)
      : document.issueDate;
    const expiryDate =
      parsed.data.expiryDate !== undefined
        ? parsed.data.expiryDate
          ? new Date(parsed.data.expiryDate)
          : null
        : document.expiryDate;
    if (issueDate && expiryDate && expiryDate < issueDate) {
      return NextResponse.json(
        { success: false, error: "Expiry date cannot be before issue date" },
        { status: 400 }
      );
    }
    const updated = await db.contractorDocument.update({
      where: { id: docId },
      data: {
        ...(parsed.data.docType ? { docType: parsed.data.docType } : {}),
        ...(parsed.data.title ? { title: parsed.data.title } : {}),
        ...(parsed.data.documentNumber !== undefined
          ? { documentNumber: parsed.data.documentNumber }
          : {}),
        ...(parsed.data.fileUrl !== undefined ? { fileUrl: parsed.data.fileUrl } : {}),
        ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes } : {}),
        issueDate,
        expiryDate,
      },
    });
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("PUT /api/contractors/[id]/documents/[docId] error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/contractors/[id]/documents/[docId]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  try {
    const result = await requirePermission(request, "contractors:edit");
    if ("status" in result) return result;
    const { id, docId } = await params;
    if (!(await findDocument(id, docId, result.user))) {
      return NextResponse.json({ success: false, error: "Document not found" }, { status: 404 });
    }
    await db.contractorDocument.delete({ where: { id: docId } });
    return NextResponse.json({ success: true, data: { id: docId } });
  } catch (error) {
    console.error("DELETE /api/contractors/[id]/documents/[docId] error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
