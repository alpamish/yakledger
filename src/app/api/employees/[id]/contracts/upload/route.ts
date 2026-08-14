import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permissions";
import { saveEmployeeUpload } from "@/lib/uploads";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await requirePermission(request, "employees:contract:manage");
  if ("status" in result) return result;

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json(
        { success: false, error: "No file provided" },
        { status: 400 }
      );
    }

    const fileUrl = await saveEmployeeUpload(id, file, "contract");
    return NextResponse.json({
      success: true,
      data: { fileUrl },
      message: "Contract file uploaded",
    });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Failed to upload contract" },
      { status: 400 }
    );
  }
}
