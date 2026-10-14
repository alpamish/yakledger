import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { buildAccessScope, withScope } from "@/lib/access-control";
import { CONTRACTOR_DOCUMENT_TYPES } from "@/lib/validation/contractor";

const createDocumentSchema = z.object({
  docType: z.enum(CONTRACTOR_DOCUMENT_TYPES, { message: "Document type is required" }),
  title: z.string().min(1, "Title is required").max(200),
  documentNumber: z.string().max(200).optional().nullable(),
  issueDate: z.string().optional().nullable(),
  expiryDate: z.string().optional().nullable(),
  fileUrl: z.string().max(1000).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
});

async function findContractor(id: string, user: { id: string; role: string }) {
  const scope = await buildAccessScope(user, "contractor");
  return db.contractor.findFirst({
    where: withScope({ id }, scope),
    select: { id: true },
  });
}

function parseDates(data: {
  issueDate?: string | null;
  expiryDate?: string | null;
}) {
  return {
    issueDate: data.issueDate ? new Date(data.issueDate) : null,
    expiryDate: data.expiryDate ? new Date(data.expiryDate) : null,
  };
}

// GET /api/contractors/[id]/documents
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await requirePermission(request, "contractors:view");
    if ("status" in result) return result;
    const { id } = await params;
    if (!(await findContractor(id, result.user))) {
      return NextResponse.json({ success: false, error: "Contractor not found" }, { status: 404 });
    }
    const documents = await db.contractorDocument.findMany({
      where: { contractorId: id },
      orderBy: [{ docType: "asc" }, { createdAt: "desc" }],
    });
    return NextResponse.json({ success: true, data: documents });
  } catch (error) {
    console.error("GET /api/contractors/[id]/documents error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/contractors/[id]/documents
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await requirePermission(request, "contractors:edit");
    if ("status" in result) return result;
    const { id } = await params;
    if (!(await findContractor(id, result.user))) {
      return NextResponse.json({ success: false, error: "Contractor not found" }, { status: 404 });
    }
    const body = await request.json();
    const parsed = createDocumentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      );
    }
    const dates = parseDates(parsed.data);
    if (dates.expiryDate && dates.issueDate && dates.expiryDate < dates.issueDate) {
      return NextResponse.json(
        { success: false, error: "Expiry date cannot be before issue date" },
        { status: 400 }
      );
    }
    const document = await db.contractorDocument.create({
      data: {
        docType: parsed.data.docType,
        title: parsed.data.title,
        documentNumber: parsed.data.documentNumber ?? null,
        fileUrl: parsed.data.fileUrl ?? null,
        notes: parsed.data.notes ?? null,
        ...dates,
        contractorId: id,
        createdBy: result.user.id,
      },
    });
    return NextResponse.json({ success: true, data: document }, { status: 201 });
  } catch (error) {
    console.error("POST /api/contractors/[id]/documents error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
