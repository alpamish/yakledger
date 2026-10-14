import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { buildAccessScope, withScope } from "@/lib/access-control";

const createContactSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  role: z.string().max(200).optional().nullable(),
  phone: z.string().min(1, "Phone is required").max(50),
  email: z.string().email().max(200).optional().nullable(),
  isPrimary: z.boolean().default(false),
  notes: z.string().max(5000).optional().nullable(),
});

async function findContractor(id: string, user: { id: string; role: string }) {
  const scope = await buildAccessScope(user, "contractor");
  return db.contractor.findFirst({
    where: withScope({ id }, scope),
    select: { id: true },
  });
}

// GET /api/contractors/[id]/contacts
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
    const contacts = await db.contractorContact.findMany({
      where: { contractorId: id },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    });
    return NextResponse.json({ success: true, data: contacts });
  } catch (error) {
    console.error("GET /api/contractors/[id]/contacts error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/contractors/[id]/contacts
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
    const parsed = createContactSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      );
    }
    const contact = await db.contractorContact.create({
      data: { ...parsed.data, contractorId: id, createdBy: result.user.id },
    });
    return NextResponse.json({ success: true, data: contact }, { status: 201 });
  } catch (error) {
    console.error("POST /api/contractors/[id]/contacts error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
