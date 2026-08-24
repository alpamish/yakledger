import { GET, POST } from "@/app/api/backup/route";
import { db } from "@/lib/db";
import { seedUsers, TEST_ADMIN, buildRequest } from "../helpers";

const ADMIN_PW = `${TEST_ADMIN.id}-pw`;

let tokens: Awaited<ReturnType<typeof seedUsers>>;

beforeAll(async () => {
  tokens = await seedUsers();
});

describe("/api/backup — auth, password gate, restore", () => {
  it("GET as non-admin → 403", async () => {
    const res = await GET(buildRequest("/api/backup", { token: tokens.userToken }));
    expect(res.status).toBe(403);
  });

  it("POST restore without password → 400", async () => {
    const res = await POST(
      buildRequest("/api/backup", {
        token: tokens.adminToken,
        method: "POST",
        body: { action: "restore", file: "x.sqlite.gz" },
      })
    );
    expect(res.status).toBe(400);
  });

  it("POST restore with wrong password → 401", async () => {
    const res = await POST(
      buildRequest("/api/backup", {
        token: tokens.adminToken,
        method: "POST",
        body: { action: "restore", file: "x.sqlite.gz", password: "wrong-pw" },
      })
    );
    expect(res.status).toBe(401);
  });

  it("POST create → 200 with a verified manifest", async () => {
    const res = await POST(
      buildRequest("/api/backup", {
        token: tokens.adminToken,
        method: "POST",
        body: { action: "create" },
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.manifest.integrity).toBe("verified");
  });

  it("POST restore with correct password restores the live DB", async () => {
    // Baseline: back up the current (seeded) state.
    const base = await POST(
      buildRequest("/api/backup", {
        token: tokens.adminToken,
        method: "POST",
        body: { action: "create" },
      })
    );
    const baseName = (await base.json()).data.manifest.name as string;

    // Mutate the live DB after the baseline.
    await db.user.create({
      data: { id: "restore-temp", email: "rt@t.t", name: "RT", password: "x", role: "USER" },
    });
    expect(
      (await db.user.findUnique({ where: { id: "restore-temp" } }))?.id
    ).toBe("restore-temp");

    // Restore the baseline using the correct admin password.
    const res = await POST(
      buildRequest("/api/backup", {
        token: tokens.adminToken,
        method: "POST",
        body: { action: "restore", file: baseName, password: ADMIN_PW },
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.liveVerified.integrityCheck).toBe("ok");

    // The mutation is gone — the live DB reflects the restored baseline.
    expect(await db.user.findUnique({ where: { id: "restore-temp" } })).toBeNull();
  });
});
