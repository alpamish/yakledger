import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { buildAccessScope, withScope } from "@/lib/access-control";

export async function GET(request: NextRequest) {
  const permResult = await requirePermission(request, "machinery:view");
  if ("status" in permResult) return permResult;
  const user = permResult.user;
  try {
    const machines = await db.machinery.findMany({
      where: withScope({}, await buildAccessScope(user, "machinery")),
      select: { machineryType: true },
      distinct: ["machineryType"],
      orderBy: { machineryType: "asc" },
    });

    const types = machines.map((r) => r.machineryType).filter(Boolean);

    return NextResponse.json({ success: true, data: types });
  } catch (error) {
    console.error("Get machinery types error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch machinery types" },
      { status: 500 }
    );
  }
}
