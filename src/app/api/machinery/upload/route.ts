import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permissions";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import sharp from "sharp";
import { MACHINERY_DRIVER_ID_UPLOAD } from "@/lib/upload-config";

// POST /api/machinery/upload - Upload machinery driver ID images (front and/or back)
export async function POST(request: NextRequest) {
  try {
    const permResult = await requirePermission(request, "machinery:create");
    if ("status" in permResult) return permResult;

    const formData = await request.formData();
    const frontFile = formData.get("front") as File | null;
    const backFile = formData.get("back") as File | null;
    const machineryId = formData.get("machineryId") as string | null;

    if (!frontFile && !backFile) {
      return NextResponse.json(
        { success: false, error: "No file provided. Please provide front or back image." },
        { status: 400 }
      );
    }

    const result: { front?: string; back?: string; error?: string } = {};

    if (frontFile) {
      await validateFile(frontFile, "Front image");
      const frontPath = await saveImage(frontFile, machineryId, "front");
      result.front = frontPath;
    }

    if (backFile) {
      await validateFile(backFile, "Back image");
      const backPath = await saveImage(backFile, machineryId, "back");
      result.back = backPath;
    }

    return NextResponse.json({
      success: true,
      data: result,
      message: "Files uploaded successfully",
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to upload file";
    if (message.startsWith("Validation:")) {
      return NextResponse.json(
        { success: false, error: message.replace("Validation: ", "") },
        { status: 400 }
      );
    }
    console.error("Upload error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to upload file" },
      { status: 500 }
    );
  }
}

function validateFile(file: File, label: string): void {
  if (file.size > MACHINERY_DRIVER_ID_UPLOAD.maxSizeBytes) {
    throw new Error(`Validation: ${label} size must be less than 10MB`);
  }
  if (!MACHINERY_DRIVER_ID_UPLOAD.allowedTypes.includes(file.type as (typeof MACHINERY_DRIVER_ID_UPLOAD.allowedTypes)[number])) {
    throw new Error(`Validation: ${label} type not allowed. Only JPEG and PNG are accepted`);
  }
}

async function saveImage(file: File, machineryId: string | null, side: string): Promise<string> {
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  const processedBuffer = await sharp(buffer)
    .withMetadata()
    .resize(MACHINERY_DRIVER_ID_UPLOAD.maxWidth, MACHINERY_DRIVER_ID_UPLOAD.maxHeight, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: MACHINERY_DRIVER_ID_UPLOAD.jpegQuality })
    .toBuffer();

  let uploadsDir: string;
  if (machineryId) {
    uploadsDir = path.join(process.cwd(), "public", "uploads", "machinery", machineryId, "id", side);
  } else {
    uploadsDir = path.join(process.cwd(), "public", "uploads", "machinery", "temp", side);
  }

  await mkdir(uploadsDir, { recursive: true });

  const uniqueName = `id-${side}-${Date.now()}.jpg`;
  const filePath = path.join(uploadsDir, uniqueName);
  await writeFile(filePath, processedBuffer);

  let publicPath: string;
  if (machineryId) {
    publicPath = `/uploads/machinery/${machineryId}/id/${side}/${uniqueName}`;
  } else {
    publicPath = `/uploads/machinery/temp/${side}/${uniqueName}`;
  }

  return publicPath;
}
