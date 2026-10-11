import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAnyPermission } from "@/lib/permissions";
import { buildAccessScope, withScope } from "@/lib/access-control";

// GET /api/contractors/list - Simple contractor list for dropdowns/selects
export async function GET(request: NextRequest) {
  const result = await requireAnyPermission(request, ["contractors:view", "content:contractors"]);
  if ("status" in result) return result;
  const user = result.user;
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || undefined;

    const where: { status?: string | { not: string } } = {};
    if (status) {
      where.status = status;
    } else {
      // Dropdowns should not offer archived contractors unless explicitly asked.
      where.status = { not: "ARCHIVED" };
    }

    const contractors = await db.contractor.findMany({
      where: withScope(where, await buildAccessScope(user, "contractor")),
      select: {
        id: true,
        contractorName: true,
        fatherName: true,
        contractorType: true,
        status: true,
      },
      orderBy: { contractorName: "asc" },
    });

    return NextResponse.json({
      success: true,
      data: contractors,
    });
  } catch (error) {
    console.error("Contractor list error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch contractor list" },
      { status: 500 }
    );
  }
}
