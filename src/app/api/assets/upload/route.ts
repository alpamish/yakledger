import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permissions";
import { saveAssetUpload } from "@/lib/uploads";

// POST /api/assets/upload - Upload an asset document (image or PDF)
export async function POST(request: NextRequest) {
  try {
    const result = await requirePermission(request, "assets:create");
    if ("status" in result) return result;

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json(
        { success: false, error: "No file provided" },
        { status: 400 }
      );
    }

    const fileUrl = await saveAssetUpload(file);
    return NextResponse.json({
      success: true,
      data: { path: fileUrl, originalName: file.name, size: file.size },
      message: "Document uploaded",
    });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Failed to upload document" },
      { status: 400 }
    );
  }
}
