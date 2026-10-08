import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permissions";
import {
  getProjectAllocations,
  setProjectAllocations,
} from "@/services/hr.service";
import { projectAllocationsSchema } from "@/lib/validations/hr";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await requirePermission(request, "employees:payroll:view");
  if ("status" in result) return result;

  try {
    const allocations = await getProjectAllocations(id);
    return NextResponse.json({ success: true, data: allocations });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Failed to load allocations" },
      { status: 400 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await requirePermission(request, "employees:payroll:manage");
  if ("status" in result) return result;

  try {
    const body = await request.json();
    const parsed = projectAllocationsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: parsed.error.issues[0]?.message || "Invalid input",
        },
        { status: 400 }
      );
    }

    const allocations = await setProjectAllocations(
      id,
      parsed.data.allocations,
      result.user.id
    );
    return NextResponse.json({ success: true, data: allocations });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Failed to save allocations" },
      { status: 400 }
    );
  }
}
