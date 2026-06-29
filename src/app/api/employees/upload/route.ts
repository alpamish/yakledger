import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permissions";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

// POST /api/employees/upload - Upload employee ID images (front and/or back)
export async function POST(request: NextRequest) {
  try {
    const permResult = await requirePermission(request, "employees:create");
    if ("status" in permResult) return permResult;
    const user = permResult.user;

    const formData = await request.formData();
    const frontFile = formData.get("front") as File | null;
    const backFile = formData.get("back") as File | null;
    const employeeId = formData.get("employeeId") as string | null;

    if (!frontFile && !backFile) {
      return NextResponse.json(
        { success: false, error: "No file provided. Please provide front or back image." },
        { status: 400 }
      );
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024;
    const allowedTypes = ["image/jpeg", "image/png"];

    const result: { path?: string; front?: string; back?: string; error?: string } = {};

    if (frontFile) {
      if (frontFile.size > maxSize) {
        return NextResponse.json(
          { success: false, error: "Front image size must be less than 10MB" },
          { status: 400 }
        );
      }
      if (!allowedTypes.includes(frontFile.type)) {
        return NextResponse.json(
          { success: false, error: "Front image type not allowed. Only JPEG and PNG are accepted" },
          { status: 400 }
        );
      }

      const frontPath = await saveImage(frontFile, employeeId, "front");
      result.front = frontPath;
    }

    if (backFile) {
      if (backFile.size > maxSize) {
        return NextResponse.json(
          { success: false, error: "Back image size must be less than 10MB" },
          { status: 400 }
        );
      }
      if (!allowedTypes.includes(backFile.type)) {
        return NextResponse.json(
          { success: false, error: "Back image type not allowed. Only JPEG and PNG are accepted" },
          { status: 400 }
        );
      }

      const backPath = await saveImage(backFile, employeeId, "back");
      result.back = backPath;
    }

    return NextResponse.json({
      success: true,
      data: result,
      message: "Files uploaded successfully",
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to upload file" },
      { status: 500 }
    );
  }
}

async function saveImage(file: File, employeeId: string | null, side: string): Promise<string> {
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  let uploadsDir: string;
  if (employeeId) {
    uploadsDir = path.join(process.cwd(), "public", "uploads", "employees", employeeId, "id", side);
  } else {
    uploadsDir = path.join(process.cwd(), "public", "uploads", "employees", "temp", side);
  }

  await mkdir(uploadsDir, { recursive: true });

  const ext = file.type === "image/png" ? ".png" : ".jpg";
  const uniqueName = `id-${side}-${Date.now()}${ext}`;
  const filePath = path.join(uploadsDir, uniqueName);
  await writeFile(filePath, buffer);

  let publicPath: string;
  if (employeeId) {
    publicPath = `/uploads/employees/${employeeId}/id/${side}/${uniqueName}`;
  } else {
    publicPath = `/uploads/employees/temp/${side}/${uniqueName}`;
  }

  return publicPath;
}