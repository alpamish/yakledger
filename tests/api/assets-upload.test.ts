import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { seedUsers } from "../helpers";
import sharp from "sharp";
import { rm } from "fs/promises";
import path from "path";

import * as AssetUploadRoute from "@/app/api/assets/upload/route";

let tokens: Awaited<ReturnType<typeof seedUsers>>;

beforeAll(async () => {
  tokens = await seedUsers();
});

afterAll(async () => {
  await rm(path.join(process.cwd(), "public", "uploads", "assets"), {
    recursive: true,
    force: true,
  }).catch(() => {});
});

function uploadRequest(file: File, token: string): Request {
  const form = new FormData();
  form.append("file", file);
  return new Request("http://localhost:3000/api/assets/upload", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  }) as unknown as Request;
}

describe("Asset document upload", () => {
  it("uploads and compresses an image", async () => {
    const buffer = await sharp({
      create: { width: 2000, height: 2000, channels: 3, background: "red" },
    })
      .png()
      .toBuffer();
    const file = new File([buffer], "doc.png", { type: "image/png" });

    const res = await AssetUploadRoute.POST(uploadRequest(file, tokens.adminToken));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.path).toMatch(/^\/uploads\/assets\/asset-.*\.png$/);

    const saved = path.join(process.cwd(), "public", body.data.path);
    const meta = await sharp(saved).metadata();
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(1920);
  });

  it("uploads a PDF as-is", async () => {
    const file = new File(["%PDF-1.4 fake pdf"], "doc.pdf", { type: "application/pdf" });

    const res = await AssetUploadRoute.POST(uploadRequest(file, tokens.adminToken));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.path).toMatch(/^\/uploads\/assets\/asset-.*\.pdf$/);

    const saved = path.join(process.cwd(), "public", body.data.path);
    const contents = await (await import("fs/promises")).readFile(saved, "utf8");
    expect(contents).toContain("%PDF");
  });

  it("rejects invalid file types", async () => {
    const file = new File(["not a document"], "bad.txt", { type: "text/plain" });
    const res = await AssetUploadRoute.POST(uploadRequest(file, tokens.adminToken));
    expect(res.status).toBe(400);
  });

  it("rejects files over 10 MB", async () => {
    const buffer = Buffer.alloc(11 * 1024 * 1024);
    const file = new File([buffer], "huge.pdf", { type: "application/pdf" });
    const res = await AssetUploadRoute.POST(uploadRequest(file, tokens.adminToken));
    expect(res.status).toBe(400);
  });

  it("rejects unauthenticated requests", async () => {
    const file = new File(["x"], "doc.png", { type: "image/png" });
    const res = await AssetUploadRoute.POST(uploadRequest(file, "invalid-token"));
    expect(res.status).toBe(401);
  });
});
