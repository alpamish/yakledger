import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permissions";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

// POST /api/settings/upload-logo - Upload company logo
export async function POST(request: NextRequest) {
  try {
    const result = await requirePermission(request, "settings:edit");
    if ("status" in result) return result;
    const user = result.user;

    const formData = await request.formData();
    const file = formData.get("logo") as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: "No file provided" },
        { status: 400 }
      );
    }

    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { success: false, error: "File size must be less than 5MB" },
        { status: 400 }
      );
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: "File type not allowed. Accepted: JPEG, PNG, GIF, WebP, SVG" },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const fileExtension = path.extname(file.name) || ".png";
    const uniqueName = `logo-${Date.now()}${fileExtension}`;

    const uploadsDir = path.join(process.cwd(), "public", "uploads");
    await mkdir(uploadsDir, { recursive: true });

    const filePath = path.join(uploadsDir, uniqueName);
    await writeFile(filePath, buffer);

    const publicPath = `/uploads/${uniqueName}`;

    return NextResponse.json({
      success: true,
      data: { path: publicPath },
      message: "Logo uploaded successfully",
    });
  } catch (error) {
    console.error("Logo upload error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to upload logo" },
      { status: 500 }
    );
  }
}
