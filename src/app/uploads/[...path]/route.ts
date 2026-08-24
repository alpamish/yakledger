import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { readFile } from "fs/promises";

// GET /uploads/[...path] - Serve files uploaded at runtime.
//
// The Next.js standalone production server snapshots the public/ directory
// once at startup and only serves files present in that snapshot. Files
// uploaded after boot (machinery driver IDs, contractor/employee/asset IDs,
// expense attachments, ...) are written to process.cwd()/public/uploads but
// are not in the snapshot, so they 404. This route catches those requests and
// serves the files straight from disk.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path: segments } = await params;

    if (!segments || segments.length === 0) {
      return new NextResponse("Not Found", { status: 404 });
    }

    const uploadsRoot = path.join(process.cwd(), "public", "uploads");
    const relativePath = segments.join(path.sep);
    const filePath = path.resolve(uploadsRoot, relativePath);

    // Guard against path traversal: the resolved path must stay inside the
    // uploads root directory.
    if (filePath !== uploadsRoot && !filePath.startsWith(uploadsRoot + path.sep)) {
      return new NextResponse("Not Found", { status: 404 });
    }

    const buffer = await readFile(filePath);

    const ext = path.extname(filePath).toLowerCase();
    const contentType =
      ext === ".png"
        ? "image/png"
        : ext === ".jpg" || ext === ".jpeg"
          ? "image/jpeg"
          : ext === ".gif"
            ? "image/gif"
            : ext === ".webp"
              ? "image/webp"
              : ext === ".pdf"
                ? "application/pdf"
                : "application/octet-stream";

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse("Not Found", { status: 404 });
  }
}