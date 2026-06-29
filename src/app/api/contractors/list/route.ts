import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

// GET /api/contractors/list - Simple contractor list for dropdowns/selects
export async function GET(request: NextRequest) {
  const result = await requirePermission(request, "contractors:view");
  if ("status" in result) return result;
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || undefined;

    const where: { status?: string } = {};
    if (status) {
      where.status = status;
    }

    const contractors = await db.contractor.findMany({
      where,
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
