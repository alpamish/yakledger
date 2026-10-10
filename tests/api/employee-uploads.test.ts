import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db";
import { seedUsers } from "../helpers";
import sharp from "sharp";
import { rm } from "fs/promises";
import path from "path";

import type { NextRequest } from "next/server";

import * as DocumentUploadRoute from "@/app/api/employees/[id]/documents/upload/route";
import * as ContractUploadRoute from "@/app/api/employees/[id]/contracts/upload/route";

let tokens: Awaited<ReturnType<typeof seedUsers>>;
let employeeId: string;

beforeAll(async () => {
  tokens = await seedUsers();
  const emp = await db.employee.create({
    data: {
      fullName: "Upload Emp",
      fatherName: "F",
      phoneNumber: "0700000000",
      jobTitle: "Operator",
      department: "OPERATIONS",
      hireDate: new Date(),
      createdBy: tokens.admin.id,
    },
  });
  employeeId = emp.id;
});

afterAll(async () => {
  if (employeeId) {
    await rm(path.join(process.cwd(), "public", "uploads", "employees", employeeId), {
      recursive: true,
      force: true,
    }).catch(() => {});
  }
});

function uploadRequest(
  route: string,
  file: File,
  token: string
): NextRequest {
  const form = new FormData();
  form.append("file", file);
  return new Request(`http://localhost:3000${route}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  }) as unknown as NextRequest;
}

describe("Document upload", () => {
  it("uploads and compresses an image", async () => {
    const buffer = await sharp({
      create: { width: 100, height: 100, channels: 3, background: "red" },
    })
      .png()
      .toBuffer();
    const file = new File([new Uint8Array(buffer)], "id.png", { type: "image/png" });

    const res = await DocumentUploadRoute.POST(
      uploadRequest(`/api/employees/${employeeId}/documents/upload`, file, tokens.adminToken),
      { params: Promise.resolve({ id: employeeId }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.fileUrl).toContain(`/uploads/employees/${employeeId}/doc-`);
  });

  it("resizes oversized images to <= 1920px", async () => {
    const buffer = await sharp({
      create: { width: 2000, height: 2000, channels: 3, background: "blue" },
    })
      .png()
      .toBuffer();
    const file = new File([new Uint8Array(buffer)], "big.png", { type: "image/png" });

    const res = await DocumentUploadRoute.POST(
      uploadRequest(`/api/employees/${employeeId}/documents/upload`, file, tokens.adminToken),
      { params: Promise.resolve({ id: employeeId }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    const saved = path.join(process.cwd(), "public", body.data.fileUrl);
    const meta = await sharp(saved).metadata();
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(1920);
  });

  it("rejects invalid file types", async () => {
    const file = new File(["not an image"], "bad.txt", { type: "text/plain" });
    const res = await DocumentUploadRoute.POST(
      uploadRequest(`/api/employees/${employeeId}/documents/upload`, file, tokens.adminToken),
      { params: Promise.resolve({ id: employeeId }) }
    );
    expect(res.status).toBe(400);
  });

  it("rejects files over 10 MB", async () => {
    const buffer = Buffer.alloc(11 * 1024 * 1024);
    const file = new File([buffer], "huge.pdf", { type: "application/pdf" });
    const res = await DocumentUploadRoute.POST(
      uploadRequest(`/api/employees/${employeeId}/documents/upload`, file, tokens.adminToken),
      { params: Promise.resolve({ id: employeeId }) }
    );
    expect(res.status).toBe(400);
  });

  it("USER cannot upload documents", async () => {
    const buffer = await sharp({
      create: { width: 10, height: 10, channels: 3, background: "green" },
    })
      .png()
      .toBuffer();
    const file = new File([new Uint8Array(buffer)], "x.png", { type: "image/png" });
    const res = await DocumentUploadRoute.POST(
      uploadRequest(`/api/employees/${employeeId}/documents/upload`, file, tokens.userToken),
      { params: Promise.resolve({ id: employeeId }) }
    );
    expect(res.status).toBe(403);
  });
});

describe("Contract upload", () => {
  it("uploads a contract PDF", async () => {
    const buffer = Buffer.from("%PDF-1.4 fake pdf content");
    const file = new File([buffer], "contract.pdf", { type: "application/pdf" });

    const res = await ContractUploadRoute.POST(
      uploadRequest(`/api/employees/${employeeId}/contracts/upload`, file, tokens.adminToken),
      { params: Promise.resolve({ id: employeeId }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.fileUrl).toContain(`/uploads/employees/${employeeId}/contract-`);
  });

  it("rejects invalid file types for contracts", async () => {
    const file = new File(["bad"], "bad.exe", { type: "application/x-msdownload" });
    const res = await ContractUploadRoute.POST(
      uploadRequest(`/api/employees/${employeeId}/contracts/upload`, file, tokens.adminToken),
      { params: Promise.resolve({ id: employeeId }) }
    );
    expect(res.status).toBe(400);
  });
});
