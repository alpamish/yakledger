import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  const result = await requirePermission(request, "machinery:view");
  if ("status" in result) return result;
  try {
    const result = await db.machinery.findMany({
      select: { machineryType: true },
      distinct: ["machineryType"],
      orderBy: { machineryType: "asc" },
    });

    const types = result.map((r) => r.machineryType).filter(Boolean);

    return NextResponse.json({ success: true, data: types });
  } catch (error) {
    console.error("Get machinery types error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch machinery types" },
      { status: 500 }
    );
  }
}
