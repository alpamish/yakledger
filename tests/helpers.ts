import { NextRequest } from "next/server";
import { hashPassword, generateToken } from "@/lib/auth";
import { db } from "@/lib/db";

export const TEST_ADMIN = { id: "u_admin_api", email: "admin@api.test", role: "ADMIN" };
export const TEST_USER = { id: "u_user_api", email: "user@api.test", role: "USER" };
export const TEST_MANAGER = { id: "u_mgr_api", email: "mgr@api.test", role: "MANAGER" };

export type SeedResult = {
  adminToken: string;
  userToken: string;
  managerToken: string;
  admin: typeof TEST_ADMIN;
  employee: { id: string; fullName: string };
};

/** Seed users (admin/user/manager) + one employee owned by admin. */
export async function seedUsers(): Promise<SeedResult> {
  for (const u of [
    { ...TEST_ADMIN, name: "Admin API" },
    { ...TEST_USER, name: "User API" },
    { ...TEST_MANAGER, name: "Manager API" },
  ] as { id: string; email: string; role: string; name: string }[]) {
    const existing = await db.user.findUnique({ where: { id: u.id } });
    if (!existing) {
      await db.user.create({
        data: { id: u.id, email: u.email, name: u.name, password: await hashPassword(`${u.id}-pw`), role: u.role },
      });
    }
  }

  const employee = await db.employee.create({
    data: {
      fullName: "Test Employee",
      fatherName: "Emp",
      phoneNumber: "0700000000",
      jobTitle: "Operator",
      department: "OPERATIONS",
      hireDate: new Date(),
      createdBy: TEST_ADMIN.id,
    },
  });

  const mk = (u: { id: string; email: string; role: string }) =>
    generateToken({ userId: u.id, email: u.email, role: u.role });

  return {
    adminToken: mk(TEST_ADMIN),
    userToken: mk(TEST_USER),
    managerToken: mk(TEST_MANAGER),
    admin: TEST_ADMIN,
    employee: { id: employee.id, fullName: employee.fullName },
  };
}

export const TEST_JWT_SECRET = "vitest-test-secret";

interface BuildRequestOpts {
  token?: string;
  method?: string;
  headers?: HeadersInit;
  body?: unknown;
}

/** Build a NextRequest with optional Bearer auth. `body` is JSON-stringified. */
export function buildRequest(path: string, opts: BuildRequestOpts = {}): NextRequest {
  const { token, method = "GET", body, headers } = opts;
  const h = new Headers(headers);
  h.set("Content-Type", "application/json");
  if (token) h.set("Authorization", `Bearer ${token}`);
  const init: RequestInit = { method, headers: h, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) };
  return new Request(`http://localhost:3000${path}`, init) as unknown as NextRequest;
}
