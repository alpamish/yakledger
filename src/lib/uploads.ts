import { writeFile, mkdir } from "fs/promises";
import path from "path";
import sharp from "sharp";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
];

function isImage(type: string) {
  return type.startsWith("image/");
}

function isCompressibleImage(type: string) {
  return type === "image/jpeg" || type === "image/png" || type === "image/webp";
}

async function processUpload(
  file: File
): Promise<{ buffer: Buffer | Uint8Array; ext: string }> {
  if (!file.size) {
    throw new Error("No file provided");
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new Error("File size must be less than 10 MB");
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error("File type not allowed. Accepted: JPEG, PNG, WebP, GIF, PDF");
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  let outputBuffer: Buffer | Uint8Array = buffer;
  let ext = path.extname(file.name) || ".bin";

  if (isCompressibleImage(file.type)) {
    const resized = sharp(buffer).resize({
      width: 1920,
      height: 1920,
      fit: "inside",
      withoutEnlargement: true,
    });

    if (file.type === "image/png") {
      outputBuffer = await resized.png({ compressionLevel: 9 }).toBuffer();
      ext = ".png";
    } else {
      outputBuffer = await resized
        .jpeg({ quality: 80, mozjpeg: true })
        .toBuffer();
      ext = ".jpg";
    }
  } else if (file.type === "application/pdf") {
    ext = ".pdf";
  } else {
    // GIF or other allowed non-compressible image: keep original.
    ext = path.extname(file.name) || ".bin";
  }

  return { buffer: outputBuffer, ext };
}

/**
 * Save an employee-related file upload to disk, compressing images where
 * possible. Returns the public URL path.
 */
export async function saveEmployeeUpload(
  employeeId: string,
  file: File,
  prefix: string
): Promise<string> {
  const { buffer, ext } = await processUpload(file);

  const uploadsDir = path.join(
    process.cwd(),
    "public",
    "uploads",
    "employees",
    employeeId
  );
  await mkdir(uploadsDir, { recursive: true });

  const safePrefix = prefix.replace(/[^a-z0-9_-]/gi, "_").toLowerCase();
  const uniqueName = `${safePrefix}-${Date.now()}${ext}`;
  const filePath = path.join(uploadsDir, uniqueName);
  await writeFile(filePath, buffer);

  return `/uploads/employees/${employeeId}/${uniqueName}`;
}

/**
 * Save an asset document upload (image or PDF) to disk, compressing images
 * where possible. Returns the public URL path.
 */
export async function saveAssetUpload(
  file: File,
  prefix = "asset"
): Promise<string> {
  const { buffer, ext } = await processUpload(file);

  const uploadsDir = path.join(process.cwd(), "public", "uploads", "assets");
  await mkdir(uploadsDir, { recursive: true });

  const safePrefix = prefix.replace(/[^a-z0-9_-]/gi, "_").toLowerCase();
  const uniqueName = `${safePrefix}-${Date.now()}${ext}`;
  const filePath = path.join(uploadsDir, uniqueName);
  await writeFile(filePath, buffer);

  return `/uploads/assets/${uniqueName}`;
}
