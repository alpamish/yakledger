import { describe, it, expect, afterAll } from "vitest";
import { mkdir, writeFile, rm } from "fs/promises";
import path from "path";

import { GET } from "@/app/uploads/[...path]/route";

const uploadsRoot = path.join(process.cwd(), "public", "uploads", "test-catchall");

afterAll(async () => {
  await rm(uploadsRoot, { recursive: true, force: true }).catch(() => {});
});

function getRequest(pathname: string): Request {
  return new Request(`http://localhost:3000${pathname}`, {
    method: "GET",
  });
}

async function callGet(pathname: string) {
  const segments = pathname.replace(/^\/uploads\/?/, "").split("/").filter(Boolean);
  return GET(getRequest(pathname), { params: Promise.resolve({ path: segments }) });
}

describe("GET /uploads/[...path] catch-all serving", () => {
  it("serves an existing uploaded file with the right content type", async () => {
    const dir = path.join(uploadsRoot, "id", "front");
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, "id-front-123.jpg");
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    await writeFile(file, buf);

    const res = await callGet(`/uploads/test-catchall/id/front/id-front-123.jpg`);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(Buffer.from(await res.arrayBuffer())).toEqual(buf);
  });

  it("returns 404 for a missing file", async () => {
    const res = await callGet(`/uploads/test-catchall/id/front/does-not-exist.jpg`);
    expect(res.status).toBe(404);
  });

  it("returns 404 for path traversal attempts", async () => {
    const res = await callGet(`/uploads/../../package.json`);
    expect(res.status).toBe(404);
  });

  it("returns 404 for an empty path", async () => {
    const res = await callGet(`/uploads`);
    expect(res.status).toBe(404);
  });
});